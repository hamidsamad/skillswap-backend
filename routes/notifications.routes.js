import express from 'express';
import { Notification } from '../config/db.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Apply auth protection to all notification routes
router.use(protect);

// @route   GET /api/notifications
// @desc    Retrieve persistent notifications for current logged-in user
// @access  Protected
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch notifications belonging to this user, sorted newest first
    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    res.json({
      success: true,
      count: notifications.length,
      unreadCount,
      notifications
    });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while fetching notifications'
    });
  }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark a specific notification as read
// @access  Protected
router.patch('/:id/read', async (req, res) => {
  try {
    const notif = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id
    });

    if (!notif) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or access denied'
      });
    }

    const updated = await Notification.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      },
      { new: true }
    );

    res.json({
      success: true,
      notification: updated
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while updating notification'
    });
  }
});

// @route   PATCH /api/notifications/read-all
// @desc    Mark all unread notifications for current user as read
// @access  Protected
router.patch('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      {
        $set: {
          isRead: true,
          readAt: new Date()
        }
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while marking all as read'
    });
  }
});

export default router;
