import express from 'express';
import { calculatePlatformStatistics } from '../utils/statisticsHelper.js';

const router = express.Router();

// @route   GET /api/statistics
// @desc    Get real-time dynamic platform statistics directly calculated from database
// @access  Public
router.get('/', async (req, res) => {
  try {
    const stats = await calculatePlatformStatistics();
    res.json({
      success: true,
      statistics: stats,
      // Spread top-level keys for maximum client flexibility
      activeMembers: stats.activeMembers,
      successfulSwaps: stats.successfulSwaps,
      availableSkills: stats.availableSkills,
      majorCities: stats.majorCities,
      industriesAvailable: stats.industriesAvailable,
      updatedAt: stats.updatedAt
    });
  } catch (error) {
    console.error('Error fetching platform statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate platform statistics',
      error: error.message
    });
  }
});

export default router;
