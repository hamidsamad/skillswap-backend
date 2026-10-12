import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { User, Profile, Skill, SwapAgreement } from '../config/db.js';
import { protect, JWT_SECRET } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { OAuth2Client } from 'google-auth-library';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

function generateToken(id) {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
}

function getSafeUser(user) {
  if (!user) return null;
  const safe = user.toObject ? user.toObject() : { ...user };
  delete safe.password;
  return safe;
}

// @route   POST /api/auth/register
// @desc    Register a new user & create initial profile
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, city, learningMode, headline, bio, avatar } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide name, email, and password' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists with this email' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'user',
      headline: headline || 'Skill Enthusiast from Pakistan',
      avatar: avatar || ''
    });

    const profile = await Profile.create({
      user: user._id,
      bio: bio || 'Excited to barter skills and learn with the Pakistani community!',
      city: city || 'Lahore',
      learningMode: learningMode || 'Both',
      availability: 'Evenings & Weekends (PKT)',
      rating: 0,
      reviewCount: 0,
      ratings: [],
      teachingSkills: [],
      learningSkills: []
    });

    const token = generateToken(user._id);

    const safeUser = getSafeUser(user);

    res.status(201).json({
      success: true,
      token,
      user: safeUser,
      profile
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'An account with this email already exists' });
    }
    res.status(500).json({ success: false, message: error.message || 'Server error during registration' });
  }
});

// @route   POST /api/auth/login
// @desc    Authenticate user & get token
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        isSuspended: true,
        message: `Your account has been suspended by administration.${user.suspensionReason ? ` Reason: ${user.suspensionReason}` : ''}`
      });
    }

    // Update lastActiveAt
    await User.findByIdAndUpdate(user._id, { lastActiveAt: new Date() });

    let profile = null;
    try {
      profile = await Profile.findOne({ user: user._id })
        .populate('teachingSkills.skill')
        .populate('learningSkills.skill')
        .populate('ratings.rater', 'name avatar headline');
    } catch (profErr) {
      console.warn('Profile populate fallback during login:', profErr.message);
      profile = await Profile.findOne({ user: user._id });
    }

    const token = generateToken(user._id);

    const safeUser = getSafeUser(user);

    res.json({
      success: true,
      token,
      user: safeUser,
      profile
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error during login' });
  }
});

// @route   POST /api/auth/google
// @desc    Authenticate or register user using genuine verified Google OAuth identity
router.post('/google', authLimiter, async (req, res) => {
  try {
    const { credential, access_token, accessToken } = req.body;
    const token = credential || access_token || accessToken;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Google authentication credential or access token is required'
      });
    }

    let googlePayload = null;

    // Case 1: Google ID token (credential) passed
    if (credential) {
      const clientId = process.env.GOOGLE_CLIENT_ID;

      try {
        if (clientId) {
          const client = new OAuth2Client(clientId);
          const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: clientId
          });
          googlePayload = ticket.getPayload();
        } else {
          // If server GOOGLE_CLIENT_ID is not yet configured, verify signature directly with Google tokeninfo API
          const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
          if (!verifyRes.ok) {
            throw new Error('Google tokeninfo service rejected the token');
          }
          googlePayload = await verifyRes.json();
        }
      } catch (verifyErr) {
        console.error('Google ID token verification failed:', verifyErr.message);
        return res.status(401).json({
          success: false,
          message: 'Google ID token verification failed. The token is invalid or has expired.'
        });
      }
    }
    // Case 2: Google OAuth access token passed
    else {
      try {
        const clientId = process.env.GOOGLE_CLIENT_ID;

        // Verify token validity with Google tokeninfo
        const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
        if (!tokenInfoRes.ok) {
          const errData = await tokenInfoRes.text();
          console.error('Google tokeninfo check failed:', errData);
          return res.status(401).json({
            success: false,
            message: 'Invalid Google access token or token has expired.'
          });
        }
        const tokenInfo = await tokenInfoRes.json();

        // Enforce audience match if backend GOOGLE_CLIENT_ID is configured
        if (clientId && tokenInfo.aud && tokenInfo.aud !== clientId) {
          console.error(`Token audience mismatch: expected ${clientId}, got ${tokenInfo.aud}`);
          return res.status(403).json({
            success: false,
            message: 'Google token was not issued for this application Client ID.'
          });
        }

        // Fetch verified user profile from Google UserInfo
        const googleUserRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (!googleUserRes.ok) {
          const errData = await googleUserRes.text();
          console.error('Google userinfo fetch failed:', errData);
          return res.status(401).json({
            success: false,
            message: 'Invalid Google access token or token has expired.'
          });
        }

        googlePayload = await googleUserRes.json();
      } catch (fetchErr) {
        console.error('Error contacting Google identity services:', fetchErr.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to verify Google access token with Google identity services.'
        });
      }
    }

    if (!googlePayload || !googlePayload.email) {
      return res.status(400).json({
        success: false,
        message: 'Unable to retrieve verified email from Google identity'
      });
    }

    // Verify email_verified status strictly
    const isEmailVerified = googlePayload.email_verified === true || googlePayload.email_verified === 'true';
    if (!isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Your Google email address is not verified by Google. Please verify your Google email before signing in.'
      });
    }

    const googleId = googlePayload.sub;
    const email = googlePayload.email.toLowerCase().trim();
    const name = googlePayload.name || email.split('@')[0];
    const picture = googlePayload.picture || '';

    // Step 1: Look for existing user by googleId or email
    let user = await User.findOne({ googleId });
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        // Link googleId to existing user account safely without duplicating
        const updates = { googleId };
        if (!user.avatar && picture) {
          updates.avatar = picture;
        }
        await User.findByIdAndUpdate(user._id, updates);
        user = await User.findById(user._id);
      }
    }

    // Step 2: If user does not exist, create a real account in the database
    let isNewUser = false;
    if (!user) {
      isNewUser = true;
      user = await User.create({
        name: name.trim(),
        email,
        googleId,
        authProvider: 'google',
        role: 'user', // Always standard user by default; never elevated based on email
        avatar: picture,
        headline: 'Skill Enthusiast from Pakistan'
      });

      await Profile.create({
        user: user._id,
        bio: 'Excited to barter skills and learn with the Pakistani community!',
        city: 'Lahore',
        learningMode: 'Both',
        availability: 'Evenings & Weekends (PKT)',
        rating: 0,
        reviewCount: 0,
        ratings: [],
        teachingSkills: [],
        learningSkills: []
      });
    }

    // Step 3: Check account status (e.g., suspension)
    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        isSuspended: true,
        message: `Your account has been suspended by administration.${user.suspensionReason ? ` Reason: ${user.suspensionReason}` : ''}`
      });
    }

    // Step 4: Update lastActiveAt
    await User.findByIdAndUpdate(user._id, { lastActiveAt: new Date() });

    // Step 5: Fetch profile
    let profile = null;
    try {
      profile = await Profile.findOne({ user: user._id })
        .populate('teachingSkills.skill')
        .populate('learningSkills.skill')
        .populate('ratings.rater', 'name avatar headline');
    } catch (profErr) {
      profile = await Profile.findOne({ user: user._id });
    }

    // Step 6: Issue application's normal JWT token
    const tokenPayload = generateToken(user._id);
    const safeUser = getSafeUser(user);

    res.json({
      success: true,
      token: tokenPayload,
      user: safeUser,
      profile,
      isNewUser
    });
  } catch (error) {
    console.error('Google authentication server error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during Google authentication'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current logged in user & profile
router.get('/me', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id })
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill')
      .populate('ratings.rater', 'name avatar headline');

    const safeUser = getSafeUser(req.user);

    res.json({
      success: true,
      user: safeUser,
      profile
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update basic user details (name, headline, avatar)
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, headline, avatar } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (headline !== undefined) updates.headline = headline;
    if (avatar !== undefined) updates.avatar = avatar;

    if (headline !== undefined) {
      await Profile.findOneAndUpdate({ user: req.user._id }, { headline });
    }

    let updatedUser = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    if (updatedUser?.toObject) {
      updatedUser = updatedUser.toObject();
    } else {
      updatedUser = { ...updatedUser };
    }
    delete updatedUser.password;

    res.json({ success: true, user: updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/auth/demo-login
// @desc    Instant 1-click login for test personas
router.post('/demo-login', async (req, res) => {
  try {
    const { role } = req.body; // 'admin', 'ali', 'fatima', 'zainab', 'bilal'
    let email = 'ali.khan@skillswap.pk';

    if (role === 'admin') email = 'admin@skillswap.pk';
    else if (role === 'fatima') email = 'fatima.noor@skillswap.pk';
    else if (role === 'zainab') email = 'zainab.ahmed@skillswap.pk';
    else if (role === 'bilal') email = 'bilal.tariq@skillswap.pk';

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: `Demo user ${email} not found. Please run seed.` });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        isSuspended: true,
        message: `This demo account has been suspended by administration.${user.suspensionReason ? ` Reason: ${user.suspensionReason}` : ''}`
      });
    }

    await User.findByIdAndUpdate(user._id, { lastActiveAt: new Date() });

    const profile = await Profile.findOne({ user: user._id })
      .populate('teachingSkills.skill')
      .populate('learningSkills.skill')
      .populate('ratings.rater', 'name avatar headline');

    const token = generateToken(user._id);

    const safeUser = getSafeUser(user);

    res.json({
      success: true,
      token,
      user: safeUser,
      profile
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error during demo login' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Generate password reset code & send via email (or return for dev preview)
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Please provide an email address' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this email address'
      });
    }

    // Generate secure 6-digit numeric OTP code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await User.findByIdAndUpdate(user._id, {
      resetPasswordCode: resetCode,
      resetPasswordExpires: resetExpires
    });

    console.log(`🔑 [SkillSwap Auth] Password reset code for ${cleanEmail}: ${resetCode} (Valid for 15 mins)`);

    res.json({
      success: true,
      message: 'Password reset code generated successfully. Please check your email or use the preview code to proceed.',
      email: cleanEmail,
      resetCode // Included for instant testing and preview
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error while generating reset code' });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Verify reset code and update password
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, verification code, and new password'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail }).select('+password +resetPasswordCode +resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    if (!user.resetPasswordCode || !user.resetPasswordExpires) {
      return res.status(400).json({
        success: false,
        message: 'No pending reset request found. Please request a new code.'
      });
    }

    // Check expiration
    if (new Date(user.resetPasswordExpires) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Reset code has expired. Please request a new code.'
      });
    }

    // Check code match (trimmed string comparison)
    if (String(user.resetPasswordCode).trim() !== String(resetCode).trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification code. Please check and try again.'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password and clear reset code
    await User.findByIdAndUpdate(user._id, {
      password: hashedPassword,
      resetPasswordCode: null,
      resetPasswordExpires: null,
      lastActiveAt: new Date()
    });

    console.log(`✅ [SkillSwap Auth] Password reset successful for user: ${cleanEmail}`);

    res.json({
      success: true,
      message: 'Your password has been reset successfully! You can now sign in with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error while resetting password' });
  }
});

// @route   DELETE /api/auth/delete-account
// @desc    Permanently delete currently authenticated user's account and personal data
router.delete('/delete-account', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your current password to confirm account deletion'
      });
    }

    // Verify user exists and fetch password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Account not found or already deleted'
      });
    }

    // Verify password confirmation
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Incorrect password. Account deletion aborted for security.'
      });
    }

    const userEmail = user.email;

    // 1. Delete user profile
    await Profile.findOneAndDelete({ user: userId });

    // 2. Remove user's ratings from other members' profiles
    await Profile.updateMany(
      {},
      { $pull: { ratings: { rater: userId } } }
    );

    // 3. Handle Swap Agreements involving this user: cancel active/pending agreements
    await SwapAgreement.updateMany(
      {
        $or: [{ proposer: userId }, { recipient: userId }],
        status: { $in: ['Active', 'Pending'] }
      },
      { status: 'Cancelled' }
    );

    // 4. Clean up local voice & document files for this user if any exist
    try {
      const uploadsBase = path.join(__dirname, '..', 'uploads');
      const voiceDir = path.join(uploadsBase, 'voice');
      const docsDir = path.join(uploadsBase, 'documents');

      [voiceDir, docsDir].forEach(dir => {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          files.forEach(f => {
            if (f.includes(String(userId))) {
              try {
                fs.unlinkSync(path.join(dir, f));
              } catch (_) {}
            }
          });
        }
      });
    } catch (fileErr) {
      console.warn('File cleanup note during account deletion:', fileErr.message);
    }

    // 5. Permanently delete the user document
    await User.findByIdAndDelete(userId);

    console.log(`🗑️ [SkillSwap Auth] Account permanently deleted for user: ${userEmail} (ID: ${userId})`);

    res.json({
      success: true,
      message: 'Your SkillSwap Pakistan account and personal data have been permanently deleted.'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error while deleting account'
    });
  }
});

export default router;
