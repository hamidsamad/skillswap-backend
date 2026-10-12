import express from 'express';
import { SwapAgreement, Conversation, Message, User, Profile } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { broadcastPlatformStatistics } from '../utils/statisticsHelper.js';

const router = express.Router();

// @route   POST /api/swaps
// @desc    Propose a new swap agreement
router.post('/', protect, async (req, res) => {
  try {
    const {
      recipientId,
      offeredSkillId,
      requestedSkillId,
      durationWeeks = 4,
      sessionsPerWeek = 2,
      sessionDurationMinutes = 60,
      learningMode = 'Online',
      venue = 'Google Meet / Zoom',
      terms = 'Mutual 1-on-1 skill barter without fees.',
      initialMessage = 'Salam! I would love to barter skills with you on SkillSwap PK.'
    } = req.body;

    if (!recipientId || !offeredSkillId || !requestedSkillId) {
      return res.status(400).json({
        success: false,
        message: 'Recipient, offered skill, and requested skill are required'
      });
    }

    if (recipientId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot propose a swap to yourself'
      });
    }

    // Default milestones based on duration
    const weeks = Math.max(1, Number(durationWeeks) || 4);
    const defaultMilestones = [];
    for (let i = 1; i <= Math.min(weeks, 4); i++) {
      defaultMilestones.push({
        title: `Milestone ${i}: Week ${i} Learning Exchange & Practice`,
        completed: false,
        dueDate: new Date(Date.now() + i * 7 * 24 * 60 * 60 * 1000)
      });
    }

    const swap = await SwapAgreement.create({
      proposer: req.user._id,
      recipient: recipientId,
      offeredSkill: offeredSkillId,
      requestedSkill: requestedSkillId,
      durationWeeks: weeks,
      sessionsPerWeek: Number(sessionsPerWeek) || 2,
      sessionDurationMinutes: Number(sessionDurationMinutes) || 60,
      learningMode,
      venue,
      terms,
      initialMessage,
      status: 'Pending',
      milestones: defaultMilestones
    });

    // Check or create conversation between both users
    let conv = await Conversation.findOne({
      participants: { $all: [req.user._id, recipientId] }
    });

    if (!conv) {
      conv = await Conversation.create({
        participants: [req.user._id, recipientId],
        swapAgreement: swap._id,
        lastMessageAt: new Date()
      });
    } else {
      await Conversation.findByIdAndUpdate(conv._id, {
        swapAgreement: swap._id,
        lastMessageAt: new Date()
      });
    }

    // Create initial message
    const msg = await Message.create({
      conversation: conv._id,
      sender: req.user._id,
      content: initialMessage || 'Salam! I have proposed a new skill swap with you.',
      readBy: [req.user._id]
    });

    await Conversation.findByIdAndUpdate(conv._id, { lastMessage: msg._id });

    const populatedSwap = await SwapAgreement.findById(swap._id)
      .populate('proposer')
      .populate('recipient')
      .populate('offeredSkill')
      .populate('requestedSkill');

    res.status(201).json({
      success: true,
      swap: populatedSwap,
      conversationId: conv._id
    });
  } catch (error) {
    console.error('Swap proposal error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error proposing swap' });
  }
});

// @route   GET /api/swaps
// @desc    Get current user's swaps (as proposer or recipient), filtered by status
router.get('/', protect, async (req, res) => {
  try {
    const { status } = req.query;
    const userId = req.user._id;

    let swaps = await SwapAgreement.find({
      $or: [{ proposer: userId }, { recipient: userId }]
    })
      .populate('proposer')
      .populate('recipient')
      .populate('offeredSkill')
      .populate('requestedSkill')
      .sort({ createdAt: -1 });

    if (status && status !== 'All') {
      if (status === 'Active') {
        swaps = swaps.filter(s => s.status === 'Accepted');
      } else {
        swaps = swaps.filter(s => s.status.toLowerCase() === status.toLowerCase());
      }
    }

    res.json({
      success: true,
      count: swaps.length,
      swaps
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/swaps/:id
// @desc    Get swap agreement details
router.get('/:id', protect, async (req, res) => {
  try {
    const swap = await SwapAgreement.findById(req.params.id)
      .populate('proposer')
      .populate('recipient')
      .populate('offeredSkill')
      .populate('requestedSkill');

    if (!swap) {
      return res.status(404).json({ success: false, message: 'Swap agreement not found' });
    }

    res.json({ success: true, swap });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PATCH /api/swaps/:id/status
// @desc    Update swap status ('Accepted', 'Declined', 'Completed', 'Cancelled')
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Accepted', 'Declined', 'Completed', 'Cancelled'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid swap status' });
    }

    const swap = await SwapAgreement.findById(req.params.id);
    if (!swap) {
      return res.status(404).json({ success: false, message: 'Swap agreement not found' });
    }

    const userIdStr = req.user._id.toString();
    const proposerIdStr = (swap.proposer?._id || swap.proposer).toString();
    const recipientIdStr = (swap.recipient?._id || swap.recipient).toString();

    // Verify permission: only recipient can accept/decline; either can cancel/complete
    if (status === 'Accepted' || status === 'Declined') {
      if (userIdStr !== recipientIdStr) {
        return res.status(403).json({ success: false, message: 'Only the recipient can accept or decline this proposal' });
      }
    } else {
      if (userIdStr !== proposerIdStr && userIdStr !== recipientIdStr) {
        return res.status(403).json({ success: false, message: 'You are not a participant in this swap' });
      }
    }

    await SwapAgreement.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    const updated = await SwapAgreement.findById(req.params.id)
      .populate('proposer')
      .populate('recipient')
      .populate('offeredSkill')
      .populate('requestedSkill');

    // If completed, increment completedSwapsCount for both users' profiles
    if (status === 'Completed') {
      await Profile.updateOne({ user: proposerIdStr }, { $inc: { completedSwapsCount: 1 } });
      await Profile.updateOne({ user: recipientIdStr }, { $inc: { completedSwapsCount: 1 } });
    }

    // Broadcast updated platform statistics (successful swaps)
    broadcastPlatformStatistics(req.app.get('io'));

    res.json({ success: true, swap: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PATCH /api/swaps/:id/milestones/:milestoneId
// @desc    Toggle milestone completed state
router.patch('/:id/milestones/:milestoneId', protect, async (req, res) => {
  try {
    const swap = await SwapAgreement.findById(req.params.id);
    if (!swap) {
      return res.status(404).json({ success: false, message: 'Swap agreement not found' });
    }

    const milestones = swap.milestones || [];
    const milestone = milestones.find(m => String(m._id) === String(req.params.milestoneId));
    if (!milestone) {
      return res.status(404).json({ success: false, message: 'Milestone not found' });
    }

    milestone.completed = !milestone.completed;

    await SwapAgreement.findByIdAndUpdate(
      req.params.id,
      { milestones },
      { new: true }
    );

    const updated = await SwapAgreement.findById(req.params.id)
      .populate('proposer')
      .populate('recipient')
      .populate('offeredSkill')
      .populate('requestedSkill');

    res.json({ success: true, swap: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;
