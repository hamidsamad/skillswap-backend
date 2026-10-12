import rateLimit from 'express-rate-limit';

const isDevOrLocal = (req) => {
  return (
    process.env.NODE_ENV !== 'production' ||
    req.ip === '127.0.0.1' ||
    req.ip === '::1' ||
    req.ip === '::ffff:127.0.0.1' ||
    req.headers['x-forwarded-for'] === '127.0.0.1'
  );
};

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000, // high limit for real-time rich application
  skip: isDevOrLocal,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again in a few minutes.'
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // generous allowance for testing, demo accounts, and registrations
  skip: isDevOrLocal,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.'
  }
});
