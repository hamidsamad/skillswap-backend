import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      default: '',
      trim: true
    },
    messageType: {
      type: String,
      enum: ['text', 'voice', 'file'],
      default: 'text'
    },
    voiceUrl: {
      type: String,
      default: ''
    },
    voiceDuration: {
      type: Number,
      default: 0
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    attachments: [
      {
        name: String,
        url: String,
        fileType: String,
        fileSize: Number
      }
    ]
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Message', messageSchema);
