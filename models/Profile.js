import mongoose from 'mongoose';

import { PAKISTANI_CITIES } from '../config/pakistanCities.js';

export { PAKISTANI_CITIES };

const teachingSkillSchema = new mongoose.Schema(
  {
    skill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true
    },
    level: {
      type: String,
      enum: ['Beginner', 'Intermediate', 'Expert'],
      default: 'Intermediate'
    },
    experienceYears: {
      type: Number,
      default: 1,
      min: 0,
      max: 50
    },
    description: {
      type: String,
      default: ''
    }
  },
  { _id: true }
);

const learningSkillSchema = new mongoose.Schema(
  {
    skill: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Skill',
      required: true
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'High'
    },
    notes: {
      type: String,
      default: ''
    }
  },
  { _id: true }
);

const userRatingSchema = new mongoose.Schema(
  {
    rater: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    score: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      default: '',
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    bio: {
      type: String,
      default: 'Passionate about sharing skills and learning together in Pakistan.',
      maxlength: 1000
    },
    city: {
      type: String,
      enum: PAKISTANI_CITIES,
      default: 'Lahore'
    },
    learningMode: {
      type: String,
      enum: ['Online', 'Physical', 'Both'],
      default: 'Both'
    },
    availability: {
      type: String,
      default: 'Weekends & Evenings (PKT)'
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5.0
    },
    reviewCount: {
      type: Number,
      default: 0
    },
    ratings: [userRatingSchema],
    completedSwapsCount: {
      type: Number,
      default: 0
    },
    teachingSkills: [teachingSkillSchema],
    learningSkills: [learningSkillSchema]
  },
  {
    timestamps: true
  }
);

export default mongoose.model('Profile', profileSchema);
