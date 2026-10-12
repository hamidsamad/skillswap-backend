import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      }
    ],
    swapAgreement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SwapAgreement'
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// High-performance index for participant lookups & conversation sorting
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export default mongoose.model('Conversation', conversationSchema);
