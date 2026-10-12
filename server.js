// SkillSwap Pakistan Backend Server
import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { connectDB, User, Message, Conversation } from './config/db.js';
import { seedDatabase, seedSampleReports } from './seeds/seedData.js';
import { syncITSkills } from './seeds/syncITSkills.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { JWT_SECRET } from './middleware/auth.js';

import authRoutes from './routes/auth.routes.js';
import profileRoutes from './routes/profile.routes.js';
import skillsRoutes from './routes/skills.routes.js';
import matchesRoutes from './routes/matches.routes.js';
import swapsRoutes from './routes/swaps.routes.js';
import chatRoutes from './routes/chat.routes.js';
import adminRoutes from './routes/admin.routes.js';
import reportRoutes from './routes/reports.routes.js';
import notificationRoutes from './routes/notifications.routes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const VOICE_UPLOADS_DIR = path.join(UPLOADS_DIR, 'voice');
const DOCS_UPLOADS_DIR = path.join(UPLOADS_DIR, 'documents');

if (!fs.existsSync(VOICE_UPLOADS_DIR)) {
  fs.mkdirSync(VOICE_UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(DOCS_UPLOADS_DIR)) {
  fs.mkdirSync(DOCS_UPLOADS_DIR, { recursive: true });
}

const app = express();
const server = http.createServer(app);

// Cross-Origin Resource Sharing & Security Headers
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Normalize redundant /api/api/ paths
app.use((req, res, next) => {
  if (req.url.startsWith('/api/api/')) {
    req.url = req.url.replace('/api/api/', '/api/');
  }
  next();
});

// Serve uploaded media (such as voice messages)
app.use('/uploads', express.static(UPLOADS_DIR));

// Apply general rate limiter
app.use('/api', generalLimiter);

// Socket.IO Setup
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Provide io instance to Express routes
app.set('io', io);

// Track online users: Map<userId, Set<socketId>>
const onlineUsers = new Map();

// JWT handshake authentication on socket connection
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      // Allow unauthenticated connection for public guest presence if needed
      return next();
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new Error('User not found'));
    }
    socket.userId = user._id.toString();
    socket.userName = user.name;
    socket.userRole = user.role;
    next();
  } catch (err) {
    console.warn('Socket authentication warning:', err.message);
    next(); // don't crash connection, proceed as guest
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;

  if (userId) {
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    // Join personal room for notifications
    socket.join(`user_${userId}`);

    // If administrator, join admin room for real-time report notifications
    if (socket.userRole === 'admin') {
      socket.join('admin_channel');
    }

    // Broadcast updated online presence
    io.emit('online_users_update', Array.from(onlineUsers.keys()));
  }

  // Explicit user identity registration for reliable notification room mapping
  socket.on('identify', async (clientUserId) => {
    if (clientUserId) {
      const uId = clientUserId.toString();
      socket.userId = uId;
      if (!onlineUsers.has(uId)) {
        onlineUsers.set(uId, new Set());
      }
      onlineUsers.get(uId).add(socket.id);
      socket.join(`user_${uId}`);

      try {
        const u = await User.findById(uId);
        if (u && u.role === 'admin') {
          socket.userRole = 'admin';
          socket.join('admin_channel');
        }
      } catch (err) {}

      io.emit('online_users_update', Array.from(onlineUsers.keys()));
    }
  });

  socket.on('join_admin_room', async () => {
    if (socket.userId) {
      try {
        const u = await User.findById(socket.userId);
        if (u && u.role === 'admin') {
          socket.join('admin_channel');
        }
      } catch (err) {}
    }
  });

  // Private conversation rooms - only allow joining if user is actually a participant
  socket.on('join_conversation', async (conversationId) => {
    if (conversationId && socket.userId) {
      try {
        const conv = await Conversation.findById(conversationId);
        if (conv) {
          const isParticipant = (conv.participants || []).some(
            p => String(p?._id || p) === String(socket.userId)
          );
          if (isParticipant) {
            socket.join(`conversation_${conversationId}`);
          }
        }
      } catch (e) {
        console.error('Socket join_conversation error:', e);
      }
    }
  });

  socket.on('leave_conversation', (conversationId) => {
    if (conversationId) {
      socket.leave(`conversation_${conversationId}`);
    }
  });

  // Typing indicators
  socket.on('typing_start', async ({ conversationId, userName }) => {
    if (conversationId && socket.userId) {
      socket.to(`conversation_${conversationId}`).emit('user_typing_start', {
        conversationId,
        userName: userName || socket.userName || 'Learner',
        userId: socket.userId
      });
    }
  });

  socket.on('typing_stop', ({ conversationId }) => {
    if (conversationId && socket.userId) {
      socket.to(`conversation_${conversationId}`).emit('user_typing_stop', {
        conversationId,
        userId: socket.userId
      });
    }
  });

  // Instant dual-action message delivery: simultaneous DB persistence & socket dispatch
  socket.on('send_message', async (data, callback) => {
    try {
      const { conversationId, content, attachments, messageType, voiceUrl, voiceDuration } = data;
      if (!socket.userId) {
        if (callback) callback({ success: false, message: 'Authentication required' });
        return;
      }

      const isVoice = messageType === 'voice' || Boolean(voiceUrl);
      const textContent = (content || (isVoice ? '🎤 Voice message' : '')).trim();

      if (!isVoice && !textContent) {
        if (callback) callback({ success: false, message: 'Empty message' });
        return;
      }

      const conv = await Conversation.findById(conversationId);
      if (!conv) {
        if (callback) callback({ success: false, message: 'Conversation not found' });
        return;
      }

      // Security check: must be a participant
      const isParticipant = (conv.participants || []).some(
        p => String(p?._id || p) === String(socket.userId)
      );
      if (!isParticipant) {
        if (callback) callback({ success: false, message: 'Access denied: You are not a participant' });
        return;
      }

      const message = await Message.create({
        conversation: conversationId,
        sender: socket.userId,
        content: textContent,
        messageType: isVoice ? 'voice' : 'text',
        voiceUrl: voiceUrl || '',
        voiceDuration: Number(voiceDuration) || 0,
        readBy: [socket.userId],
        attachments: attachments || []
      });

      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message._id,
        lastMessageAt: new Date()
      });

      const populatedMsg = await Message.findById(message._id).populate('sender', 'name email avatar headline');

      // 1. Dispatch to conversation room
      io.to(`conversation_${conversationId}`).emit('receive_message', populatedMsg);

      // 2. Dispatch notifications ONLY to other participants
      (conv.participants || []).forEach(p => {
        const pId = p?._id ? p._id.toString() : p?.toString();
        if (pId && pId !== socket.userId) {
          io.to(`user_${pId}`).emit('new_message_notification', {
            conversationId: conversationId.toString(),
            message: populatedMsg
          });
        }
      });

      if (callback) callback({ success: true, message: populatedMsg });
    } catch (err) {
      console.error('Socket send_message error:', err);
      if (callback) callback({ success: false, message: err.message });
    }
  });

  socket.on('disconnect', () => {
    if (userId && onlineUsers.has(userId)) {
      const socketSet = onlineUsers.get(userId);
      socketSet.delete(socket.id);
      if (socketSet.size === 0) {
        onlineUsers.delete(userId);
      }
      io.emit('online_users_update', Array.from(onlineUsers.keys()));
    }
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/skills', skillsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/swaps', swapsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'SkillSwap Pakistan',
    time: new Date().toISOString(),
    onlineUsersCount: onlineUsers.size
  });
});

// 404 handler for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: 'API endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  await seedDatabase();
  await seedSampleReports();
  await syncITSkills();

  // Remove automatic 5.0 rating for users who have not received peer ratings yet
  try {
    const { Profile } = await import('./config/db.js');
    await Profile.updateMany(
      { $or: [{ reviewCount: 0 }, { reviewCount: { $exists: false } }, { ratings: { $size: 0 } }] },
      { $set: { rating: 0, reviewCount: 0 } }
    );
  } catch (err) {
    // Non-blocking cleanup
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Fatal: Port ${PORT} is already in use by another application.`);
      console.error(`💡 Tip: Close any other app running on port ${PORT} or configure PORT in backend/.env`);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SkillSwap Pakistan Backend Server running on port ${PORT}`);
    console.log(`🌐 API ready at http://localhost:${PORT}/api`);
  });
}

startServer();
