import express from 'express';
import mongoose from 'mongoose';
import { Profile, User, Skill } from '../config/db.js';
import { protect, optionalAuth } from '../middleware/auth.js';
import { broadcastPlatformStatistics } from '../utils/statisticsHelper.js';

const router = express.Router();

// @route   GET /api/profiles/me
// @desc    Get current user profile
router.get('/me', protect, async (req, res) => {
  try {
    let profile = await Profile.findOne({ user: req.user._id })
      .populate('user')
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill')
      .populate('ratings.rater', 'name avatar headline');

    if (!profile) {
      // Auto-create if missing
      profile = await Profile.create({
        user: req.user._id,
        bio: 'Skill enthusiast in Pakistan.',
        city: 'Karachi',
        learningMode: 'Both',
        rating: 0,
        reviewCount: 0,
        ratings: [],
        teachingSkills: [],
        learningSkills: []
      });
      profile = await Profile.findById(profile._id)
        .populate('user')
        .populate('teachingSkills.skill')
        .populate('learningSkills.skill')
        .populate('ratings.rater', 'name avatar headline');
    }

    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PUT /api/profiles/me
// @desc    Update current user profile (bio, city, learningMode, teachingSkills, learningSkills)
router.put('/me', protect, async (req, res) => {
  try {
    const {
      bio,
      city,
      learningMode,
      availability,
      teachingSkills,
      learningSkills,
      headline,
      name,
      avatar
    } = req.body;

    // Synchronize User model fields (name, headline, avatar)
    const userUpdates = {};
    if (name !== undefined) userUpdates.name = name.trim();
    if (headline !== undefined) userUpdates.headline = headline;
    if (avatar !== undefined) userUpdates.avatar = avatar;

    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(req.user._id, userUpdates);
    }

    // Helper to resolve skill identifier (ObjectId or name) to valid Skill._id
    const resolveSkillId = async (skillInput) => {
      if (!skillInput) return null;
      const str = String(skillInput).trim();
      if (mongoose.isValidObjectId(str)) {
        const foundById = await Skill.findById(str);
        if (foundById) return foundById._id;
      }
      let foundByName = await Skill.findOne({
        name: { $regex: new RegExp(`^${str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (foundByName) return foundByName._id;

      const created = await Skill.create({
        name: str,
        category: 'Software & Web Development'
      });
      return created._id;
    };

    let processedTeaching = undefined;
    if (teachingSkills !== undefined && Array.isArray(teachingSkills)) {
      processedTeaching = [];
      for (const item of teachingSkills) {
        const skillId = await resolveSkillId(item.skill);
        if (skillId) {
          processedTeaching.push({
            ...item,
            skill: skillId
          });
        }
      }
    }

    let processedLearning = undefined;
    if (learningSkills !== undefined && Array.isArray(learningSkills)) {
      processedLearning = [];
      for (const item of learningSkills) {
        const skillId = await resolveSkillId(item.skill);
        if (skillId) {
          processedLearning.push({
            ...item,
            skill: skillId
          });
        }
      }
    }

    let profile = await Profile.findOne({ user: req.user._id });
    if (!profile) {
      profile = await Profile.create({
        user: req.user._id,
        bio,
        city,
        learningMode,
        availability,
        teachingSkills: processedTeaching || [],
        learningSkills: processedLearning || []
      });
    } else {
      const updates = {};
      if (bio !== undefined) updates.bio = bio;
      if (city !== undefined) updates.city = city;
      if (learningMode !== undefined) updates.learningMode = learningMode;
      if (availability !== undefined) updates.availability = availability;
      if (processedTeaching !== undefined) updates.teachingSkills = processedTeaching;
      if (processedLearning !== undefined) updates.learningSkills = processedLearning;

      profile = await Profile.findByIdAndUpdate(profile._id, updates, { new: true });
    }

    const populated = await Profile.findById(profile._id)
      .populate('user')
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill')
      .populate('ratings.rater', 'name avatar headline');

    let safeUser = populated.user;
    if (safeUser?.toObject) {
      safeUser = safeUser.toObject();
    } else if (safeUser) {
      safeUser = { ...safeUser };
    }
    if (safeUser) delete safeUser.password;

    // Broadcast updated platform statistics (skills, cities, industries)
    broadcastPlatformStatistics(req.app.get('io'));

    res.json({ success: true, profile: populated, user: safeUser });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/profiles
// @desc    Get all profiles with filtering
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { city, learningMode, search, skillId } = req.query;
    const filter = {};

    if (city && city !== 'All') {
      filter.city = city;
    }
    if (learningMode && learningMode !== 'All') {
      filter.learningMode = learningMode;
    }

    let profiles = await Profile.find(filter)
      .populate('user')
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill')
      .populate('ratings.rater', 'name avatar headline')
      .sort({ rating: -1, completedSwapsCount: -1 });

    if (req.user) {
      // Exclude logged in user
      profiles = profiles.filter(p => {
        const uId = p.user?._id ? p.user._id.toString() : p.user?.toString();
        return uId !== req.user._id.toString();
      });
    }

    // Filter by skillId if provided
    if (skillId) {
      profiles = profiles.filter(p => {
        const teaches = (p.teachingSkills || []).some(ts => {
          const sId = ts.skill?._id ? ts.skill._id.toString() : ts.skill?.toString();
          return sId === skillId;
        });
        const learns = (p.learningSkills || []).some(ls => {
          const sId = ls.skill?._id ? ls.skill._id.toString() : ls.skill?.toString();
          return sId === skillId;
        });
        return teaches || learns;
      });
    }

    // Text search
    if (search && search.trim() !== '') {
      const q = search.toLowerCase();
      profiles = profiles.filter(p => {
        const name = p.user?.name?.toLowerCase() || '';
        const bio = p.bio?.toLowerCase() || '';
        const tSkills = (p.teachingSkills || []).map(ts => ts.skill?.name?.toLowerCase() || '').join(' ');
        const lSkills = (p.learningSkills || []).map(ls => ls.skill?.name?.toLowerCase() || '').join(' ');
        return name.includes(q) || bio.includes(q) || tSkills.includes(q) || lSkills.includes(q);
      });
    }

    res.json({ success: true, count: profiles.length, profiles });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/profiles/:userId
// @desc    Get profile by user ID or profile ID
router.get('/:userId', async (req, res) => {
  try {
    let query;
    // Check if valid ObjectId or try user first
    query = { user: req.params.userId };

    let profile = await Profile.findOne(query)
      .populate('user')
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill')
      .populate('ratings.rater', 'name avatar headline');

    if (!profile) {
      profile = await Profile.findById(req.params.userId)
        .populate('user')
        .populate('teachingSkills.skill')
        .populate('learningSkills.skill')
        .populate('ratings.rater', 'name avatar headline');
    }

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    res.json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/profiles/:userId/rate
// @desc    Rate another user's profile (1 to 5 stars) with optional feedback
router.post('/:userId/rate', protect, async (req, res) => {
  try {
    const targetUserId = String(req.params.userId);
    const currentUserId = String(req.user._id);

    // Prevent rating yourself
    if (targetUserId === currentUserId) {
      return res.status(400).json({ success: false, message: 'You cannot rate your own profile.' });
    }

    const { score, comment } = req.body;
    const numericScore = Math.round(Number(score));

    if (isNaN(numericScore) || numericScore < 1 || numericScore > 5) {
      return res.status(400).json({ success: false, message: 'Please provide a valid rating between 1 and 5 stars.' });
    }

    let profile = await Profile.findOne({ user: targetUserId });
    if (!profile) {
      profile = await Profile.findById(targetUserId);
    }

    if (!profile) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    // Ensure target profile user is not current user
    const profileUserId = String(profile.user?._id || profile.user);
    if (profileUserId === currentUserId) {
      return res.status(400).json({ success: false, message: 'You cannot rate your own profile.' });
    }

    if (!Array.isArray(profile.ratings)) {
      profile.ratings = [];
    }

    // Check if current user already rated
    const existingIndex = profile.ratings.findIndex(
      r => String(r.rater?._id || r.rater) === currentUserId
    );

    if (existingIndex >= 0) {
      profile.ratings[existingIndex].score = numericScore;
      if (comment !== undefined) {
        profile.ratings[existingIndex].comment = (comment || '').trim();
      }
      profile.ratings[existingIndex].createdAt = new Date();
    } else {
      profile.ratings.push({
        rater: req.user._id,
        score: numericScore,
        comment: (comment || '').trim(),
        createdAt: new Date()
      });
    }

    // Recalculate average rating & reviewCount
    const totalScore = profile.ratings.reduce((sum, r) => sum + r.score, 0);
    profile.rating = parseFloat((totalScore / profile.ratings.length).toFixed(1));
    profile.reviewCount = profile.ratings.length;

    await profile.save();

    const populated = await Profile.findById(profile._id)
      .populate('user')
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill')
      .populate('ratings.rater', 'name avatar headline');

    res.json({
      success: true,
      message: existingIndex >= 0 ? 'Your rating has been updated!' : 'Thank you! Your rating has been submitted.',
      profile: populated
    });
  } catch (error) {
    console.error('Rate profile error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error while submitting rating' });
  }
});

export default router;
