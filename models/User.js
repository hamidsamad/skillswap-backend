import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false
    },
    avatar: {
      type: String,
      default: ''
    },
    headline: {
      type: String,
      default: 'Skill Enthusiast from Pakistan',
      maxlength: 160
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'
    },
    isSuspended: {
      type: Boolean,
      default: false
    },
    suspensionReason: {
      type: String,
      default: ''
    },
    suspendedAt: {
      type: Date,
      default: null
    },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    },
    resetPasswordCode: {
      type: String,
      default: null,
      select: false
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
      select: false
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('User', userSchema);
