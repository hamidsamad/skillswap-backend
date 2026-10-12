import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient user is required'],
      index: true
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    senderName: {
      type: String,
      default: 'SkillSwap Administration'
    },
    type: {
      type: String,
      enum: ['report_under_review', 'report_status', 'report_resolved', 'message', 'swap', 'system'],
      default: 'report_under_review',
      index: true
    },
    title: {
      type: String,
      default: 'Report Under Review'
    },
    message: {
      type: String,
      required: [true, 'Notification message text is required']
    },
    reportId: {
      type: String,
      default: null,
      index: true
    },
    reportRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Report',
      default: null
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    },
    readAt: {
      type: Date,
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Notification', notificationSchema);
