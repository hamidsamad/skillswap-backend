import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Conversation, Message, User, SwapAgreement } from '../config/db.js';
import { protect } from '../middleware/auth.js';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VOICE_DIR = path.join(__dirname, '..', 'uploads', 'voice');
const DOCS_DIR = path.join(__dirname, '..', 'uploads', 'documents');

if (!fs.existsSync(VOICE_DIR)) {
  fs.mkdirSync(VOICE_DIR, { recursive: true });
}
if (!fs.existsSync(DOCS_DIR)) {
  fs.mkdirSync(DOCS_DIR, { recursive: true });
}

const router = express.Router();

// @route   POST /api/chat/upload-file
// @desc    Upload documents, assignments, pictures, and other files (Cloudinary + local fallback)
router.post('/upload-file', protect, async (req, res) => {
  try {
    const { fileData, fileName, fileType, fileSize } = req.body;
    if (!fileData) {
      return res.status(400).json({ success: false, message: 'File data is required' });
    }

    const safeName = (fileName || 'document.pdf').replace(/[^a-zA-Z0-9._-]/g, '_');
    const sizeNum = Number(fileSize) || 0;
    const typeStr = fileType || 'application/octet-stream';
    const isImage = typeStr.startsWith('image/');

    // 1. Try Cloudinary if configured
    if (isCloudinaryConfigured) {
      try {
        console.log(`☁️ Uploading document/file (${safeName}) to Cloudinary...`);
        const result = await cloudinary.uploader.upload(fileData, {
          folder: 'skillswap/documents',
          resource_type: isImage ? 'image' : 'auto',
          public_id: `doc_${req.user._id}_${Date.now()}`
        });

        return res.json({
          success: true,
          file: {
            url: result.secure_url,
            name: safeName,
            fileType: typeStr,
            fileSize: result.bytes || sizeNum
          },
          provider: 'cloudinary'
        });
      } catch (cloudErr) {
        console.warn('⚠️ Cloudinary file upload issue, falling back to local storage:', cloudErr.message);
      }
    }

    // 2. Local File Storage Fallback
    console.log(`💾 Saving document/file (${safeName}) to local storage...`);
    let mimeType = typeStr;
    let base64Data = fileData;

    if (fileData.includes(';base64,')) {
      const parts = fileData.split(';base64,');
      mimeType = parts[0].replace(/^data:/, '');
      base64Data = parts[1];
    } else if (fileData.startsWith('data:')) {
      const commaIdx = fileData.indexOf(',');
      if (commaIdx !== -1) {
        mimeType = fileData.slice(5, commaIdx).split(';')[0];
        base64Data = fileData.slice(commaIdx + 1);
      }
    }

    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty file data' });
    }

    const ext = path.extname(safeName) || (isImage ? '.png' : '.bin');
    const baseWithoutExt = path.basename(safeName, ext);
    const uniqueFileName = `${baseWithoutExt}_${req.user._id}_${Date.now()}${ext}`;
    const filePath = path.join(DOCS_DIR, uniqueFileName);
    fs.writeFileSync(filePath, buffer);

    const localPath = `/uploads/documents/${uniqueFileName}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || '127.0.0.1:5000';
    const absoluteUrl = `${protocol}://${host}${localPath}`;

    return res.json({
      success: true,
      file: {
        url: absoluteUrl,
        localPath,
        name: safeName,
        fileType: mimeType || typeStr,
        fileSize: buffer.length || sizeNum
      },
      provider: 'local'
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ success: false, message: error.message || 'File upload failed' });
  }
});

// @route   POST /api/chat/upload-voice
// @desc    Upload recorded voice message using Cloudinary (with local storage fallback)
router.post('/upload-voice', protect, async (req, res) => {
  try {
    const { audio, duration } = req.body;
    if (!audio) {
      return res.status(400).json({ success: false, message: 'Audio data is required' });
    }

    const durationNum = parseFloat(duration) || 0;

    // 1. If Cloudinary is configured, attempt upload to Cloudinary
    if (isCloudinaryConfigured) {
      try {
        console.log('☁️ Uploading voice recording to Cloudinary...');
        const result = await cloudinary.uploader.upload(audio, {
          resource_type: 'video', // Cloudinary processes audio recordings under video
          folder: 'skillswap/voice_messages',
          public_id: `voice_${req.user._id}_${Date.now()}`
        });

        return res.json({
          success: true,
          voiceUrl: result.secure_url,
          voiceDuration: result.duration || durationNum,
          provider: 'cloudinary'
        });
      } catch (cloudErr) {
        console.warn('⚠️ Cloudinary upload issue, falling back to local file storage:', cloudErr.message);
      }
    }

    // 2. Local File Storage Fallback (if Cloudinary not configured or network unreachable)
    console.log('💾 Saving voice recording to local storage...');
    if (audio.startsWith('http://') || audio.startsWith('https://')) {
      return res.json({
        success: true,
        voiceUrl: audio,
        voiceDuration: durationNum,
        provider: 'direct'
      });
    }

    let mimeType = 'audio/webm';
    let base64Data = audio;

    if (audio.includes(';base64,')) {
      const parts = audio.split(';base64,');
      mimeType = parts[0].replace(/^data:/, '');
      base64Data = parts[1];
    } else if (audio.startsWith('data:')) {
      const commaIdx = audio.indexOf(',');
      if (commaIdx !== -1) {
        mimeType = audio.slice(5, commaIdx).split(';')[0];
        base64Data = audio.slice(commaIdx + 1);
      }
    }

    const buffer = Buffer.from(base64Data, 'base64');
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid or empty audio data' });
    }
    
    let ext = 'webm';
    if (mimeType.includes('mp4') || mimeType.includes('m4a')) ext = 'mp4';
    else if (mimeType.includes('ogg')) ext = 'ogg';
    else if (mimeType.includes('wav')) ext = 'wav';
    else if (mimeType.includes('mpeg') || mimeType.includes('mp3')) ext = 'mp3';

    const filename = `voice_${req.user._id}_${Date.now()}.${ext}`;
    const filePath = path.join(VOICE_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.get('host') || '127.0.0.1:5000';
    const absoluteUrl = `${protocol}://${host}/uploads/voice/${filename}`;

    // For recordings under 2.5MB (~2-3 minutes), data URI provides 100% permanence in MongoDB Atlas,
    // immunity to Render container wipes on sleep/restart, and instant cross-origin playback on Vercel.
    const isSmallAudio = audio.startsWith('data:audio') && base64Data.length < 2500000;
    const finalVoiceUrl = isSmallAudio ? audio : absoluteUrl;

    return res.json({
      success: true,
      voiceUrl: finalVoiceUrl,
      fileUrl: absoluteUrl,
      voiceDuration: durationNum,
      provider: isSmallAudio ? 'data_uri' : 'local'
    });
  } catch (error) {
    console.error('Upload voice error:', error);
    res.status(500).json({ success: false, message: error.message || 'Voice upload failed' });
  }
});

// @route   GET /api/chat/unread-count
// @desc    Get total unread message count across all conversations for current user
router.get('/unread-count', protect, async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Find all conversations where current user is a participant
    const userConversations = await Conversation.find({
      participants: currentUserId
    }).distinct('_id');

    if (!userConversations || userConversations.length === 0) {
      return res.json({ success: true, unreadCount: 0, byConversation: {} });
    }

    const unreadStats = await Message.aggregate([
      {
        $match: {
          conversation: { $in: userConversations },
          sender: { $ne: currentUserId },
          readBy: { $ne: currentUserId }
        }
      },
      {
        $group: {
          _id: '$conversation',
          count: { $sum: 1 }
        }
      }
    ]);

    const byConversation = {};
    let totalUnread = 0;
    unreadStats.forEach((item) => {
      const cId = item._id.toString();
      byConversation[cId] = item.count;
      totalUnread += item.count;
    });

    res.json({ success: true, unreadCount: totalUnread, byConversation });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ success: false, unreadCount: 0, message: error.message || 'Server error' });
  }
});

// @route   GET /api/chat/conversations
// @desc    Get current user's conversations strictly with per-conversation unread counts
router.get('/conversations', protect, async (req, res) => {
  try {
    const currentUserId = req.user._id.toString();

    // Query strictly for conversations where current user is a participant
    let conversations = await Conversation.find({
      participants: req.user._id
    })
      .populate('participants', 'name email avatar headline lastActiveAt role')
      .populate('swapAgreement')
      .populate('lastMessage')
      .sort({ lastMessageAt: -1 });

    // Secondary strict validation: ensure current user is definitely in participants
    conversations = (conversations || []).filter(c => {
      const isParticipant = (c.participants || []).some(p => {
        const pId = p?._id ? p._id.toString() : p?.toString();
        return pId === currentUserId;
      });
      return isParticipant;
    });

    // Calculate unread count per conversation for the current user
    const convIds = conversations.map(c => c._id);
    const unreadStats = await Message.aggregate([
      {
        $match: {
          conversation: { $in: convIds },
          sender: { $ne: req.user._id },
          readBy: { $ne: req.user._id }
        }
      },
      {
        $group: {
          _id: '$conversation',
          count: { $sum: 1 }
        }
      }
    ]);

    const unreadMap = {};
    let totalUnread = 0;
    unreadStats.forEach(stat => {
      const cId = stat._id.toString();
      unreadMap[cId] = stat.count;
      totalUnread += stat.count;
    });

    const enrichedConversations = conversations.map(c => {
      const cObj = c.toObject ? c.toObject() : { ...c };
      cObj.unreadCount = unreadMap[c._id.toString()] || 0;
      if (Array.isArray(cObj.participants)) {
        cObj.participants = cObj.participants.map(p => p || {
          _id: 'deleted',
          name: 'Deleted Member',
          headline: 'Account closed',
          avatar: '',
          role: 'user'
        });
      }
      return cObj;
    });

    res.json({
      success: true,
      count: enrichedConversations.length,
      unreadCount: totalUnread,
      conversations: enrichedConversations
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/chat/conversations/:id/read
// @desc    Mark all messages in a conversation as read by current user
router.post('/conversations/:id/read', protect, async (req, res) => {
  try {
    const convId = req.params.id;
    const currentUserId = req.user._id;

    await Message.updateMany(
      {
        conversation: convId,
        readBy: { $ne: currentUserId }
      },
      {
        $addToSet: { readBy: currentUserId }
      }
    );

    // Recalculate remaining total unread for user
    const userConversations = await Conversation.find({
      participants: currentUserId
    }).distinct('_id');

    const totalUnread = await Message.countDocuments({
      conversation: { $in: userConversations },
      sender: { $ne: currentUserId },
      readBy: { $ne: currentUserId }
    });

    res.json({ success: true, unreadCount: totalUnread, conversationId: convId });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/chat/conversations/:id/messages
// @desc    Get messages for a conversation (restricted to participants)
router.get('/conversations/:id/messages', protect, async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const currentUserId = req.user._id.toString();

    // Access control: verify user is a participant
    const isParticipant = (conv.participants || []).some(
      p => String(p?._id || p) === currentUserId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You are not a participant in this conversation.'
      });
    }

    const messages = await Message.find({ conversation: req.params.id })
      .populate('sender', 'name email avatar headline')
      .sort({ createdAt: 1 });

    // Atomically mark messages as read by current user
    await Message.updateMany(
      {
        conversation: req.params.id,
        readBy: { $ne: req.user._id }
      },
      {
        $addToSet: { readBy: req.user._id }
      }
    );

    res.json({ success: true, count: messages.length, messages });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/chat/conversations/:id/messages
// @desc    Send a message (text, voice, or files/documents, restricted to participants)
router.post('/conversations/:id/messages', protect, async (req, res) => {
  try {
    const { content, attachments, messageType, voiceUrl, voiceDuration } = req.body;
    const isVoice = messageType === 'voice' || Boolean(voiceUrl);
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

    let defaultContent = '';
    if (isVoice) {
      defaultContent = '🎤 Voice message';
    } else if (hasAttachments) {
      const isImg = attachments.some(a => a?.fileType?.startsWith('image/'));
      defaultContent = isImg
        ? (attachments.length > 1 ? `🖼️ ${attachments.length} Images` : `🖼️ Image: ${attachments[0]?.name || 'Photo'}`)
        : (attachments.length > 1 ? `📎 ${attachments.length} Documents` : `📎 ${attachments[0]?.name || 'Document'}`);
    }

    const textContent = (content || defaultContent).trim();

    if (!isVoice && !hasAttachments && !textContent) {
      return res.status(400).json({ success: false, message: 'Message content or attachment is required' });
    }

    const conv = await Conversation.findById(req.params.id);
    if (!conv) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const currentUserId = req.user._id.toString();

    // Access control: verify user is a participant
    const isParticipant = (conv.participants || []).some(
      p => String(p?._id || p) === currentUserId
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You cannot send messages to this conversation.'
      });
    }

    const finalMessageType = isVoice ? 'voice' : (hasAttachments ? 'file' : 'text');

    const message = await Message.create({
      conversation: conv._id,
      sender: req.user._id,
      content: textContent,
      messageType: finalMessageType,
      voiceUrl: voiceUrl || '',
      voiceDuration: Number(voiceDuration) || 0,
      readBy: [req.user._id],
      attachments: attachments || []
    });

    await Conversation.findByIdAndUpdate(conv._id, {
      lastMessage: message._id,
      lastMessageAt: new Date()
    });

    const populatedMsg = await Message.findById(message._id).populate('sender', 'name email avatar headline');

    // If socket.io is attached to app, emit real-time message event
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation_${conv._id}`).emit('receive_message', populatedMsg);
      // Dispatch notification ONLY to the other participant(s)
      (conv.participants || []).forEach(p => {
        const pId = p?._id ? p._id.toString() : p?.toString();
        if (pId && pId !== currentUserId) {
          io.to(`user_${pId}`).emit('new_message_notification', {
            conversationId: conv._id.toString(),
            message: populatedMsg
          });
        }
      });
    }

    res.status(201).json({ success: true, message: populatedMsg });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/chat/find-or-create & POST /api/chat/conversations
// @desc    Get or create 1-on-1 conversation with another user
router.post(['/find-or-create', '/conversations'], protect, async (req, res) => {
  try {
    const { recipientId, swapAgreementId } = req.body;
    if (!recipientId) {
      return res.status(400).json({ success: false, message: 'Recipient ID is required' });
    }

    const currentUserId = req.user._id.toString();
    const targetUserId = recipientId.toString();

    if (currentUserId === targetUserId) {
      return res.status(400).json({ success: false, message: 'Cannot start a conversation with yourself' });
    }

    // Find conversation containing both current user and recipient
    let conv = await Conversation.findOne({
      participants: { $all: [req.user._id, recipientId] }
    })
      .populate('participants', 'name email avatar headline lastActiveAt role')
      .populate('swapAgreement')
      .populate('lastMessage');

    if (!conv) {
      conv = await Conversation.create({
        participants: [req.user._id, recipientId],
        swapAgreement: swapAgreementId || null,
        lastMessageAt: new Date()
      });
      conv = await Conversation.findById(conv._id)
        .populate('participants', 'name email avatar headline lastActiveAt role')
        .populate('swapAgreement')
        .populate('lastMessage');
    }

    res.json({ success: true, conversation: conv });
  } catch (error) {
    console.error('Find or create conversation error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;
