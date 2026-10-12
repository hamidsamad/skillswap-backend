import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    dueDate: {
      type: Date
    }
  },
  { _id: true }
);

const swapAgreementSchema = new mongoose.Schema(
  {
    proposer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    offeredSkill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true
    },
    requestedSkill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true
    },
    durationWeeks: {
      type: Number,
      default: 4,
      min: 1,
      max: 24
    },
    sessionsPerWeek: {
      type: Number,
      default: 2,
      min: 1,
      max: 7
    },
    sessionDurationMinutes: {
      type: Number,
      default: 60,
      min: 15,
      max: 180
    },
    learningMode: {
      type: String,
      enum: ['Online', 'Physical', 'Both'],
      default: 'Online'
    },
    venue: {
      type: String,
      default: 'Google Meet / Zoom'
    },
    terms: {
      type: String,
      default: 'Mutual commitment of 1 hour weekly exchange. No commercial fee.'
    },
    initialMessage: {
      type: String,
      default: 'Salam! I would love to exchange skills with you on SkillSwap PK.'
    },
    status: {
      type: String,
      enum: ['Pending', 'Accepted', 'Declined', 'Completed', 'Cancelled'],
      default: 'Pending',
      index: true
    },
    milestones: [milestoneSchema]
  },
  {
    timestamps: true
  }
);

export default mongoose.model('SwapAgreement', swapAgreementSchema);
