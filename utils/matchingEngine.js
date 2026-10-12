/**
 * Deterministic Matching Engine for SkillSwap Pakistan
 * 
 * Rules:
 * - Base Mutual Match: 100% (User A teaches what User B wants AND User B teaches what User A wants)
 * - Base One-Way Match: 50% (User A teaches what User B wants OR User B teaches what User A wants)
 * - Same-City Bonus: +5% (e.g. both Karachi, both Lahore)
 * - Synchronous Mode Bonus: +5% (e.g. both support Online, or both Physical, or either is 'Both')
 * - Clamping: Capped at 100%, minimum 0%
 * - Sorted descending by total score, prioritizing mutual barter loops
 */

export function calculateCompatibility({
  currentUserProfile,
  targetProfile,
  guestWants = [], // skill IDs or names if guest
  guestOffers = [], // skill IDs or names if guest
  searchedSkill = '',
  searchedQuery = ''
}) {
  let youCanLearnFromThem = [];
  let theyCanLearnFromYou = [];

  // Determine user's wants and offers
  const userWants = currentUserProfile
    ? (currentUserProfile.learningSkills || []).map(s => {
        const id = s.skill?._id ? s.skill._id.toString() : s.skill?.toString();
        const name = s.skill?.name || '';
        return { id, name, priority: s.priority, notes: s.notes };
      })
    : guestWants.map(w => (typeof w === 'object' ? { id: w.id || w._id, name: w.name } : { id: w, name: w }));

  const userOffers = currentUserProfile
    ? (currentUserProfile.teachingSkills || []).map(s => {
        const id = s.skill?._id ? s.skill._id.toString() : s.skill?.toString();
        const name = s.skill?.name || '';
        return { id, name, level: s.level, experienceYears: s.experienceYears, description: s.description };
      })
    : guestOffers.map(o => (typeof o === 'object' ? { id: o.id || o._id, name: o.name } : { id: o, name: o }));

  // Target wants and offers
  const targetOffers = (targetProfile.teachingSkills || []).map(s => {
    const id = s.skill?._id ? s.skill._id.toString() : s.skill?.toString();
    const name = s.skill?.name || '';
    return { id, name, level: s.level, experienceYears: s.experienceYears, description: s.description };
  });

  const targetWants = (targetProfile.learningSkills || []).map(s => {
    const id = s.skill?._id ? s.skill._id.toString() : s.skill?.toString();
    const name = s.skill?.name || '';
    return { id, name, priority: s.priority, notes: s.notes };
  });

  // 1. Calculate Intersection: What you can learn from them (they teach what you want)
  userWants.forEach(want => {
    const match = targetOffers.find(
      tOffer =>
        (tOffer.id && want.id && tOffer.id === want.id) ||
        (tOffer.name && want.name && tOffer.name.toLowerCase() === want.name.toLowerCase())
    );
    if (match) {
      youCanLearnFromThem.push({
        skillId: match.id,
        skillName: match.name,
        level: match.level,
        experienceYears: match.experienceYears,
        userPriority: want.priority
      });
    }
  });

  // 2. Calculate Intersection: What they can learn from you (you teach what they want)
  userOffers.forEach(offer => {
    const match = targetWants.find(
      tWant =>
        (tWant.id && offer.id && tWant.id === offer.id) ||
        (tWant.name && offer.name && tWant.name.toLowerCase() === offer.name.toLowerCase())
    );
    if (match) {
      theyCanLearnFromYou.push({
        skillId: offer.id,
        skillName: offer.name,
        level: offer.level,
        experienceYears: offer.experienceYears,
        targetPriority: match.priority
      });
    }
  });

  // 3. If user is explicitly searching or filtering by a skill, check if target offers it
  const activeSearch = (searchedSkill && searchedSkill !== 'All' ? searchedSkill : searchedQuery || '').toLowerCase().trim();
  if (activeSearch) {
    targetOffers.forEach(offer => {
      if (offer.name && (offer.name.toLowerCase().includes(activeSearch) || activeSearch.includes(offer.name.toLowerCase()))) {
        if (!youCanLearnFromThem.some(m => m.skillName.toLowerCase() === offer.name.toLowerCase())) {
          youCanLearnFromThem.push({
            skillName: offer.name,
            level: offer.level || 'Intermediate',
            experienceYears: offer.experienceYears || 1,
            targetPriority: 'High'
          });
        }
      }
    });
  }

  const canLearn = youCanLearnFromThem.length > 0;
  const canTeach = theyCanLearnFromYou.length > 0;

  // Determine Base Score
  let baseScore = 0;
  let isMutual = false;
  let matchType = 'None';

  if (canLearn && canTeach) {
    baseScore = 100;
    isMutual = true;
    matchType = 'Mutual Barter';
  } else if (canLearn || canTeach) {
    baseScore = 50;
    isMutual = false;
    matchType = canLearn ? 'You Learn (One-Way)' : 'You Teach (One-Way)';
  } else {
    baseScore = 0;
    matchType = 'No Direct Match';
  }

  // Same-City Bonus (+5%)
  const userCity = currentUserProfile?.city || '';
  const targetCity = targetProfile?.city || '';
  const sameCity = Boolean(userCity && targetCity && userCity.toLowerCase() === targetCity.toLowerCase());
  const cityBonus = sameCity ? 5 : 0;

  // Synchronous Mode Bonus (+5%)
  const userMode = currentUserProfile?.learningMode || 'Both';
  const targetMode = targetProfile?.learningMode || 'Both';
  const modeOverlap =
    userMode === 'Both' ||
    targetMode === 'Both' ||
    userMode.toLowerCase() === targetMode.toLowerCase();
  const modeBonus = modeOverlap ? 5 : 0;

  // Total Score Calculation & Clamping
  let rawScore = baseScore + cityBonus + modeBonus;
  if (baseScore === 0) {
    // If no skill overlap, score remains 0 so unrelated users aren't falsely ranked high
    rawScore = 0;
  }
  const totalScore = Math.min(100, Math.max(0, rawScore));

  return {
    totalScore,
    baseScore,
    isMutual,
    matchType,
    bonuses: {
      sameCity: { active: sameCity, bonus: cityBonus, city: targetCity },
      modeOverlap: { active: modeOverlap, bonus: modeBonus, userMode, targetMode }
    },
    matchingSkills: {
      youCanLearnFromThem,
      theyCanLearnFromYou
    }
  };
}

export function rankMatches({ currentUserProfile, targetProfiles = [], guestWants = [], guestOffers = [], filters = {} }) {
  const { city, learningMode, category, minMatchPercentage = 0, search = '', skill = '' } = filters;

  const results = [];

  for (const profile of targetProfiles) {
    // Prevent matching user with themselves
    if (
      currentUserProfile &&
      profile.user?._id &&
      currentUserProfile.user?._id &&
      profile.user._id.toString() === currentUserProfile.user._id.toString()
    ) {
      continue;
    }

    // Apply basic filter criteria if specified
    if (city && city !== 'All' && profile.city !== city) {
      continue;
    }

    if (learningMode && learningMode !== 'All') {
      if (learningMode !== 'Both' && profile.learningMode !== 'Both' && profile.learningMode !== learningMode) {
        continue;
      }
    }

    // 1. Specific Skill Dropdown Filter
    if (skill && skill !== 'All' && skill.trim() !== '') {
      const qSkill = skill.toLowerCase().trim();
      const rawWords = qSkill.replace(/[^a-z0-9+#]/g, ' ').split(/\s+/).filter(w => w.length >= 3);
      const stopWords = new Set(['and', 'the', 'for', 'with', 'stack', 'app', 'web']);
      const skillKeywords = rawWords.filter(w => !stopWords.has(w));
      const matchTerms = skillKeywords.length > 0 ? skillKeywords : [qSkill];

      const checkField = (text) => {
        if (!text) return false;
        const lower = text.toLowerCase();
        if (lower.includes(qSkill) || qSkill.includes(lower)) return true;
        return matchTerms.some(term => lower.includes(term));
      };

      const hasTeaching = (profile.teachingSkills || []).some(s => {
        const name = s.skill?.name || (typeof s.skill === 'string' ? s.skill : '');
        const desc = s.description || '';
        return checkField(name) || checkField(desc);
      });

      const hasLearning = (profile.learningSkills || []).some(s => {
        const name = s.skill?.name || (typeof s.skill === 'string' ? s.skill : '');
        const notes = s.notes || '';
        return checkField(name) || checkField(notes);
      });

      const hasHeadline = checkField(profile.user?.headline || profile.headline || '');
      const hasBio = checkField(profile.bio || '');

      if (!hasTeaching && !hasLearning && !hasHeadline && !hasBio) {
        continue;
      }
    }

    // 2. Keyword Search Filter (searches skill name, headline, user name, bio, city)
    if (search && search.trim() !== '') {
      const q = search.toLowerCase().trim();
      const userName = (profile.user?.name || '').toLowerCase();
      const userHeadline = (profile.user?.headline || profile.headline || '').toLowerCase();
      const userBio = (profile.bio || '').toLowerCase();
      const userCity = (profile.city || '').toLowerCase();

      const teachesSkills = (profile.teachingSkills || []).map(s => {
        const name = s.skill?.name || (typeof s.skill === 'string' ? s.skill : '');
        const desc = s.description || '';
        return `${name} ${desc}`.toLowerCase();
      }).join(' ');

      const learnsSkills = (profile.learningSkills || []).map(s => {
        const name = s.skill?.name || (typeof s.skill === 'string' ? s.skill : '');
        const notes = s.notes || '';
        return `${name} ${notes}`.toLowerCase();
      }).join(' ');

      const matchesSearch =
        userName.includes(q) ||
        userHeadline.includes(q) ||
        userBio.includes(q) ||
        userCity.includes(q) ||
        teachesSkills.includes(q) ||
        learnsSkills.includes(q);

      if (!matchesSearch) {
        continue;
      }
    }

    // Category filter
    if (category && category !== 'All') {
      const hasCategory =
        (profile.teachingSkills || []).some(s => s.skill?.category === category) ||
        (profile.learningSkills || []).some(s => s.skill?.category === category);
      if (!hasCategory) continue;
    }

    const compatibility = calculateCompatibility({
      currentUserProfile,
      targetProfile: profile,
      guestWants,
      guestOffers,
      searchedSkill: skill,
      searchedQuery: search
    });

    if (compatibility.totalScore >= Number(minMatchPercentage)) {
      results.push({
        profile,
        compatibility
      });
    }
  }

  // Sort descending: mutual matches first, then highest total score, then rating
  results.sort((a, b) => {
    if (a.compatibility.isMutual !== b.compatibility.isMutual) {
      return a.compatibility.isMutual ? -1 : 1;
    }
    if (b.compatibility.totalScore !== a.compatibility.totalScore) {
      return b.compatibility.totalScore - a.compatibility.totalScore;
    }
    return (b.profile.rating || 0) - (a.profile.rating || 0);
  });

  return results;
}
