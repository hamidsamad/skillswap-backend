import express from 'express';
import { Profile, Skill, User } from '../config/db.js';
import { optionalAuth, protect } from '../middleware/auth.js';
import { rankMatches, calculateCompatibility } from '../utils/matchingEngine.js';

const router = express.Router();

// @route   GET /api/matches
// @desc    Get ranked matches for logged in user or guest exploration
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      city,
      learningMode,
      category,
      minMatchPercentage = 0,
      search = '',
      skill = '',
      guestWants, // JSON string or comma-separated
      guestOffers // JSON string or comma-separated
    } = req.query;

    let currentUserProfile = null;
    if (req.user) {
      currentUserProfile = await Profile.findOne({ user: req.user._id })
        .populate('user')
        .populate('teachingSkills.skill')
        .populate('learningSkills.skill');
    }

    // Parse guest wants and offers if not authenticated or overriding
    let parsedGuestWants = [];
    let parsedGuestOffers = [];

    if (guestWants) {
      try {
        parsedGuestWants = JSON.parse(guestWants);
      } catch (e) {
        parsedGuestWants = guestWants.split(',').map(s => s.trim());
      }
    }
    if (guestOffers) {
      try {
        parsedGuestOffers = JSON.parse(guestOffers);
      } catch (e) {
        parsedGuestOffers = guestOffers.split(',').map(s => s.trim());
      }
    }

    // Fetch all profiles
    const allProfiles = await Profile.find({})
      .populate('user')
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill');

    const matches = rankMatches({
      currentUserProfile,
      targetProfiles: allProfiles,
      guestWants: parsedGuestWants,
      guestOffers: parsedGuestOffers,
      filters: {
        city,
        learningMode,
        category,
        minMatchPercentage,
        search,
        skill
      }
    });

    res.json({
      success: true,
      count: matches.length,
      isAuthenticated: Boolean(req.user),
      matches
    });
  } catch (error) {
    console.error('Matches error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error calculating matches' });
  }
});

// @route   GET /api/matches/analyze/:targetUserId
// @desc    Get detailed algorithmic breakdown for a specific user match
router.get('/analyze/:targetUserId', optionalAuth, async (req, res) => {
  try {
    const targetProfile = await Profile.findOne({ user: req.params.targetUserId })
      .populate('user')
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill');

    if (!targetProfile) {
      return res.status(404).json({ success: false, message: 'Target profile not found' });
    }

    let currentUserProfile = null;
    if (req.user) {
      currentUserProfile = await Profile.findOne({ user: req.user._id })
        .populate('user')
        .populate('teachingSkills.skill')
        .populate('learningSkills.skill');
    }

    const { guestWants, guestOffers } = req.query;
    let parsedGuestWants = [];
    let parsedGuestOffers = [];
    if (guestWants) {
      try { parsedGuestWants = JSON.parse(guestWants); } catch (e) { parsedGuestWants = guestWants.split(','); }
    }
    if (guestOffers) {
      try { parsedGuestOffers = JSON.parse(guestOffers); } catch (e) { parsedGuestOffers = guestOffers.split(','); }
    }

    const compatibility = calculateCompatibility({
      currentUserProfile,
      targetProfile,
      guestWants: parsedGuestWants,
      guestOffers: parsedGuestOffers
    });

    res.json({
      success: true,
      targetProfile,
      compatibility
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;
