import express from 'express';
import crypto from 'crypto';
import { Report, User } from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

const VALID_CATEGORIES = [
  'Fake or impersonation account',
  'Spam or unwanted content',
  'Harassment or abusive behavior',
  'Inappropriate content',
  'Fraud or scam',
  'False or misleading information',
  'Copyright or intellectual property concern',
  'Other'
];

function generateReportId() {
  const num = Math.floor(100000 + Math.random() * 900000);
  return `REP-${num}`;
}

// @route   POST /api/reports
// @desc    Submit a user report
// @access  Protected
router.post('/', protect, async (req, res) => {
  try {
    const {
      title,
      issueTitle,
      description,
      screenshot,
      reportedUserId,
      reportedContentId,
      reportedContentType = 'user',
      reportedContentSnapshot = null,
      category,
      reason,
      priority = 'Medium'
    } = req.body;

    // 1. Title validation (free text, no dropdown required)
    const finalTitle = (title || issueTitle || category || 'Issue Report').trim();
    if (!finalTitle) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an issue title'
      });
    }

    // 2. Description validation
    const trimmedDescription = (description || reason || '').trim();
    if (!trimmedDescription) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a description explaining your issue'
      });
    }
    if (trimmedDescription.length > 5000) {
      return res.status(400).json({
        success: false,
        message: 'Issue description cannot exceed 5000 characters'
      });
    }

    // 3. Validation: Prevent reporting oneself
    if (reportedUserId && String(reportedUserId) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot report your own account'
      });
    }

    // 4. Rate-limiting & duplicate abuse protection:
    // Check if the same reporter filed a pending report with identical title within the past 2 minutes
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const existingRecent = await Report.findOne({
      reporter: req.user._id,
      title: finalTitle,
      status: 'Pending',
      createdAt: { $gte: twoMinutesAgo }
    });

    if (existingRecent) {
      return res.status(429).json({
        success: false,
        message: 'A similar report was already submitted recently. Our moderation team is actively reviewing it.'
      });
    }

    // Verify reported user exists if ID is provided
    let verifiedReportedUser = null;
    if (reportedUserId) {
      verifiedReportedUser = await User.findById(reportedUserId);
      if (!verifiedReportedUser) {
        return res.status(404).json({
          success: false,
          message: 'The reported user account could not be found'
        });
      }
    }

    // Category defaults to title or category
    const finalCategory = category || finalTitle;

    // Calculate intelligent default priority if not custom specified
    let finalPriority = priority;
    if (!['Low', 'Medium', 'High', 'Urgent'].includes(finalPriority)) {
      finalPriority = 'Medium';
    }

    // Generate unique report ID with collision safety
    let uniqueId = generateReportId();
    let collisionCheck = await Report.findOne({ reportId: uniqueId });
    while (collisionCheck) {
      uniqueId = generateReportId();
      collisionCheck = await Report.findOne({ reportId: uniqueId });
    }

    // Create Report
    const newReport = await Report.create({
      reportId: uniqueId,
      reporter: req.user._id,
      reportedUser: verifiedReportedUser ? verifiedReportedUser._id : null,
      reportedContentId: reportedContentId ? String(reportedContentId) : null,
      reportedContentType: reportedContentType || 'user',
      reportedContentSnapshot: reportedContentSnapshot || null,
      title: finalTitle,
      description: trimmedDescription,
      reason: trimmedDescription,
      screenshot: screenshot || null,
      category: finalCategory,
      priority: finalPriority,
      status: 'Pending',
      adminNotes: [],
      history: [
        {
          action: 'Report Submitted',
          actor: req.user._id,
          actorName: req.user.name,
          details: `Issue reported: "${finalTitle}". Priority: ${finalPriority}.`,
          timestamp: new Date()
        }
      ]
    });

    // Populate for clean socket notification dispatch
    const populatedReport = await Report.findById(newReport._id)
      .populate('reporter', 'name email headline avatar')
      .populate('reportedUser', 'name email headline avatar isSuspended');

    // Real-Time Delivery to Admin Dashboard via Socket.io
    const io = req.app.get('io');
    if (io) {
      // 1. Broadcast to admin channel
      io.to('admin_channel').emit('new_report_notification', {
        report: populatedReport,
        reportId: uniqueId,
        title: finalTitle,
        description: trimmedDescription,
        category: finalCategory,
        priority: finalPriority,
        screenshot: screenshot || null,
        reportedName: verifiedReportedUser?.name || 'Content Item',
        reporterName: req.user.name,
        timestamp: new Date()
      });

      // 2. Also emit global admin alert event
      io.emit('admin_report_alert', {
        report: populatedReport,
        reportId: uniqueId,
        title: finalTitle,
        description: trimmedDescription,
        category: finalCategory,
        priority: finalPriority,
        reportedName: verifiedReportedUser?.name || 'Content Item'
      });
    }

    res.status(201).json({
      success: true,
      message: 'Your report has been securely submitted to our administration team for review.',
      report: {
        reportId: newReport.reportId,
        title: newReport.title,
        description: newReport.description,
        screenshot: newReport.screenshot,
        category: newReport.category,
        status: newReport.status,
        createdAt: newReport.createdAt
      }
    });
  } catch (error) {
    console.error('Report submission error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while submitting report'
    });
  }
});

// @route   GET /api/reports/my
// @desc    Get reports submitted by current logged-in user
// @access  Protected
router.get('/my', protect, async (req, res) => {
  try {
    const reports = await Report.find({ reporter: req.user._id })
      .sort({ createdAt: -1 })
      .populate('reportedUser', 'name avatar');

    // Redact internal admin notes and history from user view
    const safeReports = reports.map(r => ({
      _id: r._id,
      reportId: r.reportId,
      title: r.title || r.category,
      description: r.description || r.reason,
      screenshot: r.screenshot || null,
      category: r.category,
      reason: r.reason,
      status: r.status,
      priority: r.priority,
      reportedUser: r.reportedUser,
      createdAt: r.createdAt,
      resolution: r.status === 'Resolved' || r.status === 'RESOLVED' ? r.resolution?.actionTaken : null
    }));

    res.json({
      success: true,
      count: safeReports.length,
      reports: safeReports
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;
