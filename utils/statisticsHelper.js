import { User, Profile, Skill, SwapAgreement } from '../config/db.js';

/**
 * calculatePlatformStatistics
 * Dynamically calculates the 5 core platform statistics directly from the database:
 * 1. activeMembers: Actual number of registered non-suspended users
 * 2. successfulSwaps: Actual number of completed swap agreements
 * 3. availableSkills: Total unique skills currently offered in user profiles (teachingSkills)
 * 4. majorCities: Total unique cities represented by registered user profiles
 * 5. industriesAvailable: Total unique industries (categories) represented in user profiles
 */
export async function calculatePlatformStatistics() {
  try {
    // 1. Active registered members (excluding suspended accounts)
    const activeMembersCount = await User.countDocuments({ isSuspended: { $ne: true } });

    // 2. Successful completed skill exchanges
    const completedSwapsCount = await SwapAgreement.countDocuments({ status: 'Completed' });

    // 3. Load skills lookup for category and name normalization
    const allSkills = await Skill.find();
    const skillMap = new Map();
    allSkills.forEach(s => {
      const id = String(s._id || s.id);
      skillMap.set(id, {
        name: (s.name || '').trim(),
        category: (s.category || '').trim()
      });
    });

    // 4. Retrieve all profiles to calculate offered skills, cities, and industries
    const allProfiles = await Profile.find().populate('user', 'isSuspended');

    const uniqueOfferedSkills = new Set();
    const uniqueCities = new Set();
    const uniqueIndustries = new Set();

    allProfiles.forEach(p => {
      // Exclude suspended users from active representation if user object is populated
      if (p.user && p.user.isSuspended) {
        return;
      }

      // Major Cities: Normalize (trim and lower-case to prevent duplicates)
      if (p.city && typeof p.city === 'string') {
        const cleanCity = p.city.trim();
        if (cleanCity && cleanCity !== 'Select City' && cleanCity !== 'Unknown') {
          uniqueCities.add(cleanCity.toLowerCase());
        }
      }

      // Offered Skills (teachingSkills) & Industries represented
      (p.teachingSkills || []).forEach(ts => {
        if (!ts) return;
        const skillId = String(ts.skill?._id || ts.skill || '');
        const skillObj = skillMap.get(skillId) || (ts.skill && typeof ts.skill === 'object' ? ts.skill : null);

        if (skillObj) {
          const normalizedName = (skillObj.name || '').trim().toLowerCase();
          if (normalizedName) {
            uniqueOfferedSkills.add(normalizedName);
          }

          const normalizedCategory = (skillObj.category || '').trim().toLowerCase();
          if (normalizedCategory) {
            uniqueIndustries.add(normalizedCategory);
          }
        } else if (skillId) {
          uniqueOfferedSkills.add(skillId);
        }
      });

      // Also include categories from learning skills represented in user profiles
      (p.learningSkills || []).forEach(ls => {
        if (!ls) return;
        const skillId = String(ls.skill?._id || ls.skill || '');
        const skillObj = skillMap.get(skillId) || (ls.skill && typeof ls.skill === 'object' ? ls.skill : null);
        if (skillObj && skillObj.category) {
          const normalizedCategory = skillObj.category.trim().toLowerCase();
          if (normalizedCategory) {
            uniqueIndustries.add(normalizedCategory);
          }
        }
      });
    });

    // In case no skills are offered yet, fall back gracefully to catalog skills
    const availableSkillsCount = uniqueOfferedSkills.size > 0 
      ? uniqueOfferedSkills.size 
      : (allSkills.length > 0 ? allSkills.length : 0);

    // In case no industries are represented yet, fall back gracefully to skill categories
    let industriesCount = uniqueIndustries.size;
    if (industriesCount === 0 && allSkills.length > 0) {
      const catalogCategories = new Set(allSkills.map(s => (s.category || '').trim().toLowerCase()).filter(Boolean));
      industriesCount = catalogCategories.size;
    }

    return {
      activeMembers: activeMembersCount,
      successfulSwaps: completedSwapsCount,
      availableSkills: availableSkillsCount,
      majorCities: uniqueCities.size,
      industriesAvailable: industriesCount,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error calculating platform statistics:', error);
    throw error;
  }
}

/**
 * broadcastPlatformStatistics
 * Broadcasts updated statistics to all connected Socket.IO clients
 */
export async function broadcastPlatformStatistics(io) {
  if (!io) return;
  try {
    const stats = await calculatePlatformStatistics();
    io.emit('statistics_updated', stats);
  } catch (err) {
    console.warn('Failed to broadcast statistics update:', err.message);
  }
}
