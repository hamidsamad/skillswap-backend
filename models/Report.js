import mongoose from 'mongoose';

const reportNoteSchema = new mongoose.Schema({
  note: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String,
    default: 'Administrator'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const reportHistorySchema = new mongoose.Schema({
  action: {
    type: String,
    required: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actorName: {
    type: String,
    default: 'System'
  },
  details: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const reportSchema = new mongoose.Schema(
  {
    reportId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Reporter user ID is required'],
      index: true
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    reportedContentId: {
      type: String,
      default: null
    },
    reportedContentType: {
      type: String,
      enum: ['user', 'profile', 'message', 'swap_agreement', 'skill', 'other'],
      default: 'user'
    },
    reportedContentSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    title: {
      type: String,
      trim: true,
      default: ''
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    screenshot: {
      type: String,
      default: null
    },
    category: {
      type: String,
      default: 'General Issue',
      index: true
    },
    reason: {
      type: String,
      default: '',
      trim: true,
      maxlength: 3000
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
      index: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Under Review', 'In Progress', 'IN_PROGRESS', 'Resolved', 'RESOLVED', 'Rejected'],
      default: 'Pending',
      index: true
    },
    assignedAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    adminNotes: [reportNoteSchema],
    resolution: {
      actionTaken: {
        type: String,
        default: ''
      },
      details: {
        type: String,
        default: ''
      },
      resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      resolvedAt: {
        type: Date,
        default: null
      }
    },
    rejectionReason: {
      type: String,
      default: ''
    },
    history: [reportHistorySchema]
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Report', reportSchema);
