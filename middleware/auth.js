import jwt from 'jsonwebtoken';
import { User } from '../config/db.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'skillswap_super_secret_pk_2026';

export async function protect(req, res, next) {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found for this token' });
    }

    if (user.isSuspended) {
      return res.status(403).json({
        success: false,
        isSuspended: true,
        message: `Your account has been suspended by administration.${user.suspensionReason ? ` Reason: ${user.suspensionReason}` : ''}`
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid or expired' });
  }
}

export async function optionalAuth(req, res, next) {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user) {
        req.user = user;
      }
    } catch (e) {
      // Ignore invalid token for optional auth
    }
  }
  next();
}
