import express from 'express';
import { User, Profile, Skill, SwapAgreement, Report, AuditLog, Notification } from '../config/db.js';
import { broadcastPlatformStatistics } from '../utils/statisticsHelper.js';
import { protect } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

// Apply admin protection to all routes
router.use(protect, requireAdmin);

// Helper for persistent user notification when admin reviews report
async function sendReportUnderReviewNotification(req, report) {
  try {
    const reporterId = report.reporter?._id || report.reporter;
    if (!reporterId) return null;

    // Check if notification already created for this report to prevent duplicates
    const existing = await Notification.findOne({
      recipient: reporterId,
      reportId: report.reportId,
      type: 'report_under_review'
    });

    if (existing) {
      return existing;
    }

    const notificationMessage =
      'Your report is now under review. The admin has received your report and is looking into the issue.';

    const newNotif = await Notification.create({
      recipient: reporterId,
      sender: req.user._id,
      senderName: 'SkillSwap Administration',
      type: 'report_under_review',
      title: 'Report Under Review',
      message: notificationMessage,
      reportId: report.reportId,
      reportRef: report._id,
      isRead: false,
      metadata: {
        category: report.category,
        priority: report.priority,
        reportedName: report.reportedUser?.name || 'Reported Member'
      }
    });

    // Real-Time Socket Delivery to User Room
    const io = req.app.get('io');
    if (io) {
      const rIdStr = String(reporterId);
      io.to(`user_${rIdStr}`).emit('new_user_notification', newNotif);
      io.to(`user_${rIdStr}`).emit('report_status_update', {
        reportId: report.reportId,
        status: 'Under Review',
        message: notificationMessage,
        notification: newNotif
      });
    }

    return newNotif;
  } catch (err) {
    console.error('Failed to dispatch user report notification:', err.message);
    return null;
  }
}

// Helper for persistent user notification when admin resolves report
async function sendReportResolvedNotification(req, report, resolutionAction = '') {
  try {
    const reporterId = report.reporter?._id || report.reporter;
    if (!reporterId) return null;

    // Check if resolved notification already created for this report to prevent duplicates
    const existing = await Notification.findOne({
      recipient: reporterId,
      reportId: report.reportId,
      type: 'report_resolved'
    });

    if (existing) {
      return existing;
    }

    const notificationMessage =
      `Your report #${report.reportId} has been resolved. The issue you reported has been fixed by our administration team.`;

    const newNotif = await Notification.create({
      recipient: reporterId,
      sender: req.user._id,
      senderName: 'SkillSwap Administration',
      type: 'report_resolved',
      title: 'Report Resolved',
      message: notificationMessage,
      reportId: report.reportId,
      reportRef: report._id,
      isRead: false,
      metadata: {
        category: report.category,
        title: report.title,
        actionTaken: resolutionAction || 'Issue Fixed',
        resolvedAt: new Date()
      }
    });

    // Real-Time Socket Delivery to User Room
    const io = req.app.get('io');
    if (io) {
      const rIdStr = String(reporterId);
      io.to(`user_${rIdStr}`).emit('new_user_notification', newNotif);
      io.to(`user_${rIdStr}`).emit('report_status_update', {
        reportId: report.reportId,
        status: 'Resolved',
        message: notificationMessage,
        notification: newNotif
      });
    }

    return newNotif;
  } catch (err) {
    console.error('Failed to dispatch user report resolved notification:', err.message);
    return null;
  }
}

// Helper for persistent audit logging
async function logAdminAction(req, action, targetType, targetId, details, metadata = {}) {
  try {
    await AuditLog.create({
      adminId: req.user._id,
      adminName: req.user.name,
      adminEmail: req.user.email || '',
      action,
      targetType,
      targetId: String(targetId || ''),
      details: details || '',
      metadata,
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
    });
  } catch (err) {
    console.error('AuditLog creation note:', err.message);
  }
}

// @route   GET /api/admin/stats
// @desc    Get complete platform & report metrics
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const suspendedUsers = await User.countDocuments({ isSuspended: true });
    const activeUsers = Math.max(0, totalUsers - suspendedUsers);

    const totalSkills = await Skill.countDocuments();
    const allSwaps = await SwapAgreement.find({});

    const totalSwaps = allSwaps.length;
    const activeSwaps = allSwaps.filter(s => s.status === 'Accepted').length;
    const pendingSwaps = allSwaps.filter(s => s.status === 'Pending').length;
    const completedSwaps = allSwaps.filter(s => s.status === 'Completed').length;
    const declinedSwaps = allSwaps.filter(s => s.status === 'Declined' || s.status === 'Cancelled').length;

    const completionRate =
      totalSwaps > 0 ? Math.round((completedSwaps / totalSwaps) * 100) : 0;

    // Report metrics
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: 'Pending' });
    const underReviewReports = await Report.countDocuments({ status: 'Under Review' });
    const resolvedReports = await Report.countDocuments({ status: 'Resolved' });
    const rejectedReports = await Report.countDocuments({ status: 'Rejected' });

    // Category breakdown
    const allReportsList = await Report.find({});
    const categoryDistribution = {};
    const priorityDistribution = { Urgent: 0, High: 0, Medium: 0, Low: 0 };

    allReportsList.forEach(r => {
      const cat = r.category || 'Other';
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
      const prio = r.priority || 'Medium';
      priorityDistribution[prio] = (priorityDistribution[prio] || 0) + 1;
    });

    // Recent reports (up to 5)
    const recentReports = await Report.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('reporter', 'name email avatar')
      .populate('reportedUser', 'name email avatar isSuspended');

    // Recent user activities (recent 6 users)
    const recentUsers = await User.find({})
      .sort({ createdAt: -1 })
      .limit(6)
      .select('name email avatar role isSuspended createdAt lastActiveAt headline');

    // City distribution
    const profiles = await Profile.find({});
    const cityDistribution = {};
    profiles.forEach(p => {
      const c = p.city || 'Other';
      cityDistribution[c] = (cityDistribution[c] || 0) + 1;
    });

    res.json({
      success: true,
      stats: {
        totalUsers,
        activeUsers,
        suspendedUsers,
        totalSkills,
        totalSwaps,
        activeSwaps,
        pendingSwaps,
        completedSwaps,
        declinedSwaps,
        completionRate,
        cityDistribution,
        // Report Dashboard Metrics
        totalReports,
        pendingReports,
        underReviewReports,
        resolvedReports,
        rejectedReports,
        categoryDistribution,
        priorityDistribution,
        recentReports,
        recentUsers
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/admin/reports/stats
// @desc    Dedicated endpoint for real-time report counters & charts
router.get('/reports/stats', async (req, res) => {
  try {
    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: 'Pending' });
    const underReviewReports = await Report.countDocuments({ status: 'Under Review' });
    const resolvedReports = await Report.countDocuments({ status: 'Resolved' });
    const rejectedReports = await Report.countDocuments({ status: 'Rejected' });

    const totalUsers = await User.countDocuments();
    const suspendedUsers = await User.countDocuments({ isSuspended: true });

    const allReportsList = await Report.find({});
    const categoryDistribution = {};
    const priorityDistribution = { Urgent: 0, High: 0, Medium: 0, Low: 0 };

    allReportsList.forEach(r => {
      const cat = r.category || 'Other';
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
      const prio = r.priority || 'Medium';
      priorityDistribution[prio] = (priorityDistribution[prio] || 0) + 1;
    });

    res.json({
      success: true,
      stats: {
        totalReports,
        pendingReports,
        underReviewReports,
        resolvedReports,
        rejectedReports,
        totalUsers,
        suspendedUsers,
        categoryDistribution,
        priorityDistribution
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/admin/reports
// @desc    Retrieve paginated reports with search, filters, and sorting
router.get('/reports', async (req, res) => {
  try {
    const {
      status,
      category,
      priority,
      search,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = -1
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const filter = {};

    if (status && status !== 'All' && status.toLowerCase() !== 'all') {
      const s = status.trim().toLowerCase();
      if (s === 'pending') filter.status = { $in: ['Pending', 'pending'] };
      else if (s === 'under review' || s === 'under_review' || s === 'in progress' || s === 'in_progress') {
        filter.status = { $in: ['Under Review', 'under review', 'under_review', 'In Progress', 'IN_PROGRESS', 'in progress'] };
      } else if (s === 'resolved') {
        filter.status = { $in: ['Resolved', 'resolved', 'RESOLVED'] };
      } else if (s === 'rejected') {
        filter.status = { $in: ['Rejected', 'rejected'] };
      } else {
        filter.status = status;
      }
    }
    if (category && category !== 'All' && category.toLowerCase() !== 'all') {
      filter.category = category;
    }
    if (priority && priority !== 'All' && priority.toLowerCase() !== 'all') {
      filter.priority = priority;
    }

    // Retrieve all reports matching status/category/priority
    let reports = await Report.find(filter)
      .populate('reporter', 'name email headline avatar')
      .populate('reportedUser', 'name email headline avatar isSuspended suspensionReason')
      .populate('assignedAdmin', 'name email')
      .populate('adminNotes.author', 'name email');

    // Apply text search on reportId, title, description, reason, reporter, or reportedUser
    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      reports = reports.filter(r => {
        const matchId = (r.reportId || '').toLowerCase().includes(term);
        const matchTitle = (r.title || '').toLowerCase().includes(term);
        const matchDescription = (r.description || '').toLowerCase().includes(term);
        const matchReason = (r.reason || '').toLowerCase().includes(term);
        const matchReporterName = (r.reporter?.name || '').toLowerCase().includes(term);
        const matchReporterEmail = (r.reporter?.email || '').toLowerCase().includes(term);
        const matchReportedName = (r.reportedUser?.name || '').toLowerCase().includes(term);
        const matchReportedEmail = (r.reportedUser?.email || '').toLowerCase().includes(term);
        const matchCategory = (r.category || '').toLowerCase().includes(term);

        return (
          matchId ||
          matchTitle ||
          matchDescription ||
          matchReason ||
          matchReporterName ||
          matchReporterEmail ||
          matchReportedName ||
          matchReportedEmail ||
          matchCategory
        );
      });
    }

    const totalCount = reports.length;

    // Sorting
    const order = Number(sortOrder) === 1 ? 1 : -1;
    reports.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];

      if (sortBy === 'priority') {
        const weight = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
        valA = weight[a.priority] || 0;
        valB = weight[b.priority] || 0;
      }

      if (valA < valB) return order === -1 ? 1 : -1;
      if (valA > valB) return order === -1 ? -1 : 1;
      return 0;
    });

    // Pagination
    const paginated = reports.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    // Accurate real-time status counts across the entire database
    const allCount = await Report.countDocuments();
    const pendingCount = await Report.countDocuments({ status: { $in: ['Pending', 'pending'] } });
    const underReviewCount = await Report.countDocuments({ status: { $in: ['Under Review', 'under review', 'under_review', 'In Progress', 'IN_PROGRESS', 'in progress'] } });
    const resolvedCount = await Report.countDocuments({ status: { $in: ['Resolved', 'resolved', 'RESOLVED'] } });
    const rejectedCount = await Report.countDocuments({ status: { $in: ['Rejected', 'rejected'] } });

    res.json({
      success: true,
      reports: paginated,
      totalCount,
      page: pageNum,
      totalPages,
      limit: limitNum,
      pendingCount,
      counts: {
        all: allCount,
        pending: pendingCount,
        underReview: underReviewCount,
        resolved: resolvedCount,
        rejected: rejectedCount
      }
    });
  } catch (error) {
    console.error('Admin get reports error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/admin/reports/:id
// @desc    Retrieve full details of a specific report
router.get('/reports/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('reporter', 'name email headline avatar createdAt')
      .populate('reportedUser', 'name email headline avatar isSuspended suspensionReason role createdAt')
      .populate('assignedAdmin', 'name email')
      .populate('adminNotes.author', 'name email')
      .populate('resolution.resolvedBy', 'name email');

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    // Record audit event for opening report if this admin has not opened it yet
    const alreadyLoggedOpen = (report.history || []).some(
      h => h.action === 'Report Opened by Admin' && String(h.actor?._id || h.actor) === String(req.user._id)
    );

    if (!alreadyLoggedOpen) {
      await Report.findByIdAndUpdate(report._id, {
        $push: {
          history: {
            action: 'Report Opened by Admin',
            actor: req.user._id,
            actorName: req.user.name,
            details: `Administrator ${req.user.name} opened report ${report.reportId} for review.`,
            timestamp: new Date()
          }
        }
      });
      await logAdminAction(
        req,
        'REPORT_OPENED',
        'Report',
        report.reportId,
        `Opened report ${report.reportId} for initial review`
      );
    }

    // If report is in Pending status, transition to Under Review as admin opens it
    if (report.status === 'Pending') {
      report.status = 'Under Review';
      await Report.findByIdAndUpdate(report._id, {
        $set: { status: 'Under Review' },
        $push: {
          history: {
            action: 'Status Changed to Under Review',
            actor: req.user._id,
            actorName: req.user.name,
            details: `Status moved to "Under Review" upon admin opening report for triage.`,
            timestamp: new Date()
          }
        }
      });

      const io = req.app.get('io');
      if (io) {
        io.emit('report_updated', {
          reportId: report.reportId,
          id: report._id,
          status: 'Under Review',
          updatedBy: req.user.name,
          timestamp: new Date()
        });
      }
    }

    // Automatically send notification to the user who submitted the report
    await sendReportUnderReviewNotification(req, report);

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PATCH /api/admin/reports/:id/status
// @desc    Update report status (Under Review, Resolved, Rejected, etc.)
router.patch('/reports/:id/status', async (req, res) => {
  try {
    let { status, resolutionAction, resolutionDetails, rejectionReason } = req.body;
    
    // Normalize status values
    if (status === 'IN_PROGRESS' || status === 'in_progress') status = 'In Progress';
    if (status === 'RESOLVED' || status === 'resolved') status = 'Resolved';

    const validStatuses = ['Pending', 'Under Review', 'In Progress', 'IN_PROGRESS', 'Resolved', 'RESOLVED', 'Rejected'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const previousStatus = report.status;
    const updates = { status };

    if (status === 'Resolved' || status === 'RESOLVED') {
      updates.resolution = {
        actionTaken: resolutionAction || 'Marked as Resolved',
        details: resolutionDetails || '',
        resolvedBy: req.user._id,
        resolvedAt: new Date()
      };
    } else if (status === 'Rejected') {
      updates.rejectionReason = rejectionReason || 'Reviewed: No platform policy violation found';
    }

    const historyDetail =
      (status === 'Resolved' || status === 'RESOLVED')
        ? `Status changed from "${previousStatus}" to "Resolved". Action: ${resolutionAction || 'None'}. Notes: ${resolutionDetails || 'None'}`
        : status === 'Rejected'
        ? `Status changed from "${previousStatus}" to "Rejected". Reason: ${rejectionReason || 'No violation'}`
        : `Status updated from "${previousStatus}" to "${status}".`;

    const updated = await Report.findByIdAndUpdate(
      req.params.id,
      {
        $set: updates,
        $push: {
          history: {
            action: `Status Changed to ${status}`,
            actor: req.user._id,
            actorName: req.user.name,
            details: historyDetail,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    )
      .populate('reporter', 'name email avatar')
      .populate('reportedUser', 'name email avatar isSuspended')
      .populate('assignedAdmin', 'name email');

    // Create Audit Log
    await logAdminAction(
      req,
      `REPORT_STATUS_${status.toUpperCase().replace(/\s+/g, '_')}`,
      'Report',
      report.reportId,
      `Updated report status to "${status}". ${historyDetail}`,
      { previousStatus, newStatus: status, resolutionAction }
    );

    // If status is Under Review or In Progress, notify reporter
    if (status === 'Under Review' || status === 'In Progress' || status === 'IN_PROGRESS') {
      await sendReportUnderReviewNotification(req, updated || report);
    }

    // If status is Resolved, notify reporter
    if (status === 'Resolved' || status === 'RESOLVED') {
      await sendReportResolvedNotification(req, updated || report, resolutionAction);
    }

    // Socket.io real-time broadcast
    const io = req.app.get('io');
    if (io) {
      io.emit('report_updated', {
        reportId: report.reportId,
        id: report._id,
        status,
        updatedBy: req.user.name,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: `Report status successfully updated to ${status}`,
      report: updated
    });
  } catch (error) {
    console.error('Update report status error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/admin/reports/:id/notes
// @desc    Add internal administrative note to a report
router.post('/reports/:id/notes', async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, message: 'Administrative note text is required' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const newNote = {
      note: note.trim(),
      author: req.user._id,
      authorName: req.user.name,
      createdAt: new Date()
    };

    const updated = await Report.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          adminNotes: newNote,
          history: {
            action: 'Internal Note Added',
            actor: req.user._id,
            actorName: req.user.name,
            details: `Note added by ${req.user.name}: "${note.trim().substring(0, 80)}${note.length > 80 ? '...' : ''}"`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    )
      .populate('reporter', 'name email avatar')
      .populate('reportedUser', 'name email avatar isSuspended')
      .populate('assignedAdmin', 'name email')
      .populate('adminNotes.author', 'name email');

    await logAdminAction(
      req,
      'REPORT_NOTE_ADDED',
      'Report',
      report.reportId,
      `Internal administrative note added by ${req.user.name}`
    );

    // Socket broadcast
    const io = req.app.get('io');
    if (io) {
      io.emit('report_updated', {
        reportId: report.reportId,
        id: report._id,
        action: 'note_added',
        updatedBy: req.user.name
      });
    }

    res.json({
      success: true,
      message: 'Internal note successfully appended',
      adminNotes: updated.adminNotes,
      history: updated.history
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PATCH /api/admin/reports/:id/assign
// @desc    Assign a report to a designated administrator
router.patch('/reports/:id/assign', async (req, res) => {
  try {
    const { adminId } = req.body;

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    let targetAdmin = null;
    if (adminId) {
      targetAdmin = await User.findById(adminId);
      if (!targetAdmin || targetAdmin.role !== 'admin') {
        return res.status(400).json({ success: false, message: 'Assigned user must be an active administrator' });
      }
    }

    const assignedName = targetAdmin ? targetAdmin.name : 'Unassigned';

    const updated = await Report.findByIdAndUpdate(
      req.params.id,
      {
        $set: { assignedAdmin: targetAdmin ? targetAdmin._id : null },
        $push: {
          history: {
            action: 'Report Assigned',
            actor: req.user._id,
            actorName: req.user.name,
            details: `Report assigned to ${assignedName} by ${req.user.name}.`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    )
      .populate('reporter', 'name email avatar')
      .populate('reportedUser', 'name email avatar isSuspended')
      .populate('assignedAdmin', 'name email');

    await logAdminAction(
      req,
      'REPORT_ASSIGNED',
      'Report',
      report.reportId,
      `Report assigned to ${assignedName}`
    );

    res.json({
      success: true,
      message: `Report assigned to ${assignedName}`,
      report: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PATCH /api/admin/reports/:id/priority
// @desc    Update / escalate priority of a report
router.patch('/reports/:id/priority', async (req, res) => {
  try {
    const { priority } = req.body;
    if (!['Low', 'Medium', 'High', 'Urgent'].includes(priority)) {
      return res.status(400).json({ success: false, message: 'Invalid priority level' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const previousPriority = report.priority;

    const updated = await Report.findByIdAndUpdate(
      req.params.id,
      {
        $set: { priority },
        $push: {
          history: {
            action: 'Priority Escalated',
            actor: req.user._id,
            actorName: req.user.name,
            details: `Priority changed from ${previousPriority} to ${priority} by ${req.user.name}.`,
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    await logAdminAction(
      req,
      'REPORT_PRIORITY_UPDATED',
      'Report',
      report.reportId,
      `Priority changed from ${previousPriority} to ${priority}`
    );

    res.json({
      success: true,
      message: `Priority updated to ${priority}`,
      report: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PATCH /api/admin/users/:id/suspend
// @desc    Suspend or reactivate user account with safeguards and audit trail
router.patch('/users/:id/suspend', async (req, res) => {
  try {
    const { suspend, reason } = req.body;
    const isSuspending = Boolean(suspend);

    // Safeguard 1: Admin cannot suspend themselves
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'Security Safeguard: You cannot suspend your own administrative account'
      });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Safeguard 2: Require reason when suspending
    if (isSuspending && (!reason || reason.trim().length < 5)) {
      return res.status(400).json({
        success: false,
        message: 'A detailed suspension reason (at least 5 characters) is required for moderation records'
      });
    }

    const updates = {
      isSuspended: isSuspending,
      suspensionReason: isSuspending ? reason.trim() : '',
      suspendedAt: isSuspending ? new Date() : null,
      suspendedBy: isSuspending ? req.user._id : null
    };

    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    const safeUser = updated?.toObject ? updated.toObject() : { ...updated };
    delete safeUser.password;

    // Create Audit Log
    const auditAction = isSuspending ? 'USER_SUSPENDED' : 'USER_REACTIVATED';
    const auditDetails = isSuspending
      ? `Suspended account "${targetUser.name}" (${targetUser.email}). Reason: "${reason.trim()}"`
      : `Reactivated account "${targetUser.name}" (${targetUser.email}).`;

    await logAdminAction(req, auditAction, 'User', targetUser._id, auditDetails, {
      userId: targetUser._id,
      userEmail: targetUser.email,
      reason: isSuspending ? reason.trim() : ''
    });

    // If there is an active report against this user, append moderation action to its history
    const linkedReports = await Report.find({ reportedUser: targetUser._id });
    for (const lr of linkedReports) {
      await Report.findByIdAndUpdate(lr._id, {
        $push: {
          history: {
            action: isSuspending ? 'Moderation Action Taken: Account Suspended' : 'Moderation Action: Account Reactivated',
            actor: req.user._id,
            actorName: req.user.name,
            details: auditDetails,
            timestamp: new Date()
          }
        }
      });
    }

    // Real-Time Socket Disconnect: If user is suspended, notify and close their active sockets
    const io = req.app.get('io');
    if (io) {
      io.to(`user_${targetUser._id}`).emit('account_suspended_alert', {
        reason: isSuspending ? reason.trim() : ''
      });
    }

    // Broadcast updated platform statistics (active members count)
    broadcastPlatformStatistics(req.app.get('io'));

    res.json({
      success: true,
      message: isSuspending
        ? `User account "${targetUser.name}" has been suspended.`
        : `User account "${targetUser.name}" has been reactivated.`,
      user: safeUser
    });
  } catch (error) {
    console.error('User suspension error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/admin/users
// @desc    List all users with their full profile details, skills, status, and report statistics
router.get('/users', async (req, res) => {
  try {
    const { status, role, search } = req.query;

    const [users, profiles, reports, allSkills] = await Promise.all([
      User.find({}).sort({ createdAt: -1 }),
      Profile.find({})
        .populate('teachingSkills.skill')
        .populate('learningSkills.skill'),
      Report.find({}),
      Skill.find({})
    ]);

    // Build skill lookup map for fast resolution
    const skillMap = {};
    allSkills.forEach(s => {
      const sobj = s?.toObject ? s.toObject() : (s?._doc ? { ...s._doc } : { ...s });
      skillMap[String(sobj._id)] = sobj;
    });

    // Aggregate report statistics per user (reports submitted and reports filed against)
    const reportsSubmittedMap = {};
    const reportsAgainstMap = {};
    reports.forEach(r => {
      if (r.reporter) {
        const repId = String(r.reporter?._id || r.reporter);
        reportsSubmittedMap[repId] = (reportsSubmittedMap[repId] || 0) + 1;
      }
      if (r.reportedUser) {
        const reportedId = String(r.reportedUser?._id || r.reportedUser);
        reportsAgainstMap[reportedId] = (reportsAgainstMap[reportedId] || 0) + 1;
      }
    });

    let combined = users.map(u => {
      const raw = u._doc ? { ...u._doc } : (u?.toObject ? u.toObject() : { ...u });
      delete raw.password;
      delete raw.resetPasswordCode;
      delete raw.resetPasswordExpires;
      delete raw.$__;
      delete raw.$isNew;

      const profileDoc = profiles.find(p => {
        const pUser = (p._doc ? p._doc.user : p.user);
        const pUserId = pUser?._id || pUser;
        return String(pUserId) === String(raw._id);
      });

      const pRaw = profileDoc
        ? (profileDoc._doc ? { ...profileDoc._doc } : (profileDoc.toObject ? profileDoc.toObject() : { ...profileDoc }))
        : null;

      let cleanProfile = null;
      if (pRaw) {
        // Ensure teaching skills have full skill objects
        const populatedTeachingSkills = (pRaw.teachingSkills || []).map(ts => {
          const sObj = (ts.skill && typeof ts.skill === 'object' && ts.skill.name)
            ? ts.skill
            : (skillMap[String(ts.skill?._id || ts.skill)] || { name: 'Skill', category: 'General' });
          return {
            _id: ts._id,
            skill: sObj,
            level: ts.level || 'Intermediate',
            experienceYears: ts.experienceYears ?? 1,
            description: ts.description || ''
          };
        });

        // Ensure learning skills have full skill objects
        const populatedLearningSkills = (pRaw.learningSkills || []).map(ls => {
          const sObj = (ls.skill && typeof ls.skill === 'object' && ls.skill.name)
            ? ls.skill
            : (skillMap[String(ls.skill?._id || ls.skill)] || { name: 'Skill', category: 'General' });
          return {
            _id: ls._id,
            skill: sObj,
            priority: ls.priority || 'High',
            notes: ls.notes || ''
          };
        });

        cleanProfile = {
          _id: pRaw._id,
          user: String(pRaw.user?._id || pRaw.user),
          city: pRaw.city || 'Pakistan',
          bio: pRaw.bio || '',
          learningMode: pRaw.learningMode || 'Both',
          availability: pRaw.availability || 'Weekends & Evenings (PKT)',
          rating: pRaw.rating ?? 0,
          reviewCount: pRaw.reviewCount ?? 0,
          completedSwapsCount: pRaw.completedSwapsCount ?? 0,
          teachingSkills: populatedTeachingSkills,
          learningSkills: populatedLearningSkills,
          createdAt: pRaw.createdAt,
          updatedAt: pRaw.updatedAt
        };
      }

      const submittedCount = reportsSubmittedMap[String(raw._id)] || 0;
      const againstCount = reportsAgainstMap[String(raw._id)] || 0;

      return {
        _id: String(raw._id),
        name: raw.name || 'Member',
        email: raw.email || '',
        avatar: raw.avatar || '',
        headline: raw.headline || 'Skill Enthusiast from Pakistan',
        role: raw.role || 'user',
        isSuspended: Boolean(raw.isSuspended),
        suspensionReason: raw.suspensionReason || '',
        suspendedAt: raw.suspendedAt || null,
        suspendedBy: raw.suspendedBy || null,
        lastActiveAt: raw.lastActiveAt || raw.updatedAt || raw.createdAt || new Date(),
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
        reportsSubmittedCount: submittedCount,
        reportsAgainstCount: againstCount,
        profile: cleanProfile
      };
    });

    // Filtering
    if (status === 'suspended') {
      combined = combined.filter(u => u.isSuspended);
    } else if (status === 'active') {
      combined = combined.filter(u => !u.isSuspended);
    }

    if (role && role !== 'All') {
      combined = combined.filter(u => u.role === role);
    }

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      combined = combined.filter(u =>
        (u.name || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.profile?.city || '').toLowerCase().includes(term) ||
        (u.headline || '').toLowerCase().includes(term) ||
        (u.profile?.teachingSkills || []).some(ts => (ts.skill?.name || '').toLowerCase().includes(term)) ||
        (u.profile?.learningSkills || []).some(ls => (ls.skill?.name || '').toLowerCase().includes(term))
      );
    }

    res.json({ success: true, count: combined.length, users: combined });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/admin/users/:id
// @desc    Retrieve full user dossier including detailed profile, skills, account info, and reports breakdown
router.get('/users/:id', async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const raw = targetUser._doc ? { ...targetUser._doc } : (targetUser.toObject ? targetUser.toObject() : { ...targetUser });
    delete raw.password;
    delete raw.resetPasswordCode;
    delete raw.resetPasswordExpires;
    delete raw.$__;
    delete raw.$isNew;

    // Load profile
    const profileDoc = await Profile.findOne({ user: targetUser._id })
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill');

    const allSkills = await Skill.find({});
    const skillMap = {};
    allSkills.forEach(s => {
      const sobj = s?.toObject ? s.toObject() : (s?._doc ? { ...s._doc } : { ...s });
      skillMap[String(sobj._id)] = sobj;
    });

    const pRaw = profileDoc
      ? (profileDoc._doc ? { ...profileDoc._doc } : (profileDoc.toObject ? profileDoc.toObject() : { ...profileDoc }))
      : null;

    let cleanProfile = null;
    if (pRaw) {
      const populatedTeachingSkills = (pRaw.teachingSkills || []).map(ts => {
        const sObj = (ts.skill && typeof ts.skill === 'object' && ts.skill.name)
          ? ts.skill
          : (skillMap[String(ts.skill?._id || ts.skill)] || { name: 'Skill', category: 'General' });
        return {
          _id: ts._id,
          skill: sObj,
          level: ts.level || 'Intermediate',
          experienceYears: ts.experienceYears ?? 1,
          description: ts.description || ''
        };
      });

      const populatedLearningSkills = (pRaw.learningSkills || []).map(ls => {
        const sObj = (ls.skill && typeof ls.skill === 'object' && ls.skill.name)
          ? ls.skill
          : (skillMap[String(ls.skill?._id || ls.skill)] || { name: 'Skill', category: 'General' });
        return {
          _id: ls._id,
          skill: sObj,
          priority: ls.priority || 'High',
          notes: ls.notes || ''
        };
      });

      cleanProfile = {
        _id: pRaw._id,
        user: String(pRaw.user?._id || pRaw.user),
        city: pRaw.city || 'Pakistan',
        bio: pRaw.bio || '',
        learningMode: pRaw.learningMode || 'Both',
        availability: pRaw.availability || 'Weekends & Evenings (PKT)',
        rating: pRaw.rating ?? 0,
        reviewCount: pRaw.reviewCount ?? 0,
        completedSwapsCount: pRaw.completedSwapsCount ?? 0,
        teachingSkills: populatedTeachingSkills,
        learningSkills: populatedLearningSkills,
        createdAt: pRaw.createdAt,
        updatedAt: pRaw.updatedAt
      };
    }

    // Fetch reports submitted by this user
    const submittedReports = await Report.find({ reporter: targetUser._id })
      .populate('reportedUser', 'name email avatar isSuspended')
      .populate('assignedAdmin', 'name email')
      .sort({ createdAt: -1 });

    // Fetch reports filed against this user
    const reportsAgainst = await Report.find({ reportedUser: targetUser._id })
      .populate('reporter', 'name email avatar')
      .populate('assignedAdmin', 'name email')
      .sort({ createdAt: -1 });

    // Calculate report statistics
    const reportStats = {
      totalSubmitted: submittedReports.length,
      pendingSubmitted: submittedReports.filter(r => ['Pending', 'pending'].includes(r.status)).length,
      underReviewSubmitted: submittedReports.filter(r =>
        ['Under Review', 'under review', 'under_review', 'In Progress', 'IN_PROGRESS', 'in progress'].includes(r.status)
      ).length,
      resolvedSubmitted: submittedReports.filter(r => ['Resolved', 'resolved', 'RESOLVED'].includes(r.status)).length,
      rejectedSubmitted: submittedReports.filter(r => ['Rejected', 'rejected'].includes(r.status)).length,
      totalAgainst: reportsAgainst.length,
      pendingAgainst: reportsAgainst.filter(r => ['Pending', 'pending'].includes(r.status)).length,
      resolvedAgainst: reportsAgainst.filter(r => ['Resolved', 'resolved', 'RESOLVED'].includes(r.status)).length
    };

    // Fetch swap agreements stats for additional context
    const swaps = await SwapAgreement.find({
      $or: [{ proposer: targetUser._id }, { recipient: targetUser._id }]
    });
    const swapStats = {
      total: swaps.length,
      completed: swaps.filter(s => s.status === 'Completed').length,
      active: swaps.filter(s => s.status === 'Accepted').length,
      pending: swaps.filter(s => s.status === 'Pending').length
    };

    const cleanUser = {
      _id: String(raw._id),
      name: raw.name || 'Member',
      email: raw.email || '',
      avatar: raw.avatar || '',
      headline: raw.headline || 'Skill Enthusiast from Pakistan',
      role: raw.role || 'user',
      isSuspended: Boolean(raw.isSuspended),
      suspensionReason: raw.suspensionReason || '',
      suspendedAt: raw.suspendedAt || null,
      suspendedBy: raw.suspendedBy || null,
      lastActiveAt: raw.lastActiveAt || raw.updatedAt || raw.createdAt || new Date(),
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      reportsSubmittedCount: reportStats.totalSubmitted,
      reportsAgainstCount: reportStats.totalAgainst,
      profile: cleanProfile,
      reportStats,
      swapStats,
      submittedReports,
      reportsAgainst
    };

    res.json({
      success: true,
      user: cleanUser
    });
  } catch (error) {
    console.error('Fetch user details error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PATCH /api/admin/users/:id/role
// @desc    Update a user's role with security safeguards
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role value' });
    }

    // Safeguard: Admin cannot demote themselves to prevent accidental lockout
    if (String(req.params.id) === String(req.user._id) && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Security Safeguard: You cannot demote your own administrator account'
      });
    }

    const updated = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await logAdminAction(
      req,
      'USER_ROLE_CHANGED',
      'User',
      updated._id,
      `Changed role of "${updated.name}" (${updated.email}) to "${role}"`
    );

    const safe = updated?.toObject ? updated.toObject() : { ...updated };
    delete safe.password;

    res.json({ success: true, user: safe });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/admin/administrators
// @desc    Get list of administrators for assignment dropdown
router.get('/administrators', async (req, res) => {
  try {
    const admins = await User.find({ role: 'admin' }).select('name email avatar headline');
    res.json({ success: true, administrators: admins });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/admin/audit-logs
// @desc    Retrieve persistent administrative audit trail
router.get('/audit-logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    let logs = await AuditLog.find({}).sort({ createdAt: -1 });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      logs = logs.filter(l =>
        (l.action || '').toLowerCase().includes(term) ||
        (l.adminName || '').toLowerCase().includes(term) ||
        (l.adminEmail || '').toLowerCase().includes(term) ||
        (l.details || '').toLowerCase().includes(term) ||
        (l.targetId || '').toLowerCase().includes(term)
      );
    }

    const totalCount = logs.length;
    const paginated = logs.slice(skip, skip + limitNum);
    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    res.json({
      success: true,
      logs: paginated,
      totalCount,
      page: pageNum,
      totalPages
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;
