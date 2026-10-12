import mongoose from 'mongoose';
import { createModelAdapter, store } from './dbAdapter.js';
import UserModel from '../models/User.js';
import ProfileModel from '../models/Profile.js';
import SkillModel from '../models/Skill.js';
import SwapAgreementModel from '../models/SwapAgreement.js';
import ConversationModel from '../models/Conversation.js';
import MessageModel from '../models/Message.js';
import ReportModel from '../models/Report.js';
import AuditLogModel from '../models/AuditLog.js';
import NotificationModel from '../models/Notification.js';

export const dbState = {
  isConnected: false
};

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillswap_pk';
  try {
    // Connect to MongoDB Atlas or local with sufficient timeout
    await mongoose.connect(uri, {
      dbName: 'skillswap_pk',
      serverSelectionTimeoutMS: 8000
    });
    dbState.isConnected = true;
    console.log('✅ Connected to MongoDB at:', uri.includes('@') ? uri.split('@')[1] : uri);
  } catch (err) {
    dbState.isConnected = false;
    console.warn('⚠️ MongoDB connection note:', err.message);
    console.log('ℹ️ Running on SkillSwap High-Performance JSON/Memory Data Store.');
    console.log('📦 Data persistence file: backend/data/skillswap_db.json');
  }
}

// Transparent model proxies: if Mongoose is connected, use Mongoose; otherwise use adapter
const UserAdapter = createModelAdapter('users');
const ProfileAdapter = createModelAdapter('profiles');
const SkillAdapter = createModelAdapter('skills');
const SwapAgreementAdapter = createModelAdapter('swapAgreements');
const ConversationAdapter = createModelAdapter('conversations');
const MessageAdapter = createModelAdapter('messages');
const ReportAdapter = createModelAdapter('reports');
const AuditLogAdapter = createModelAdapter('auditLogs');
const NotificationAdapter = createModelAdapter('notifications');

function makeModelProxy(MongooseModel, adapter) {
  return new Proxy(MongooseModel, {
    get(target, prop) {
      if (dbState.isConnected) {
        return target[prop];
      }
      if (prop in adapter) {
        return adapter[prop];
      }
      return target[prop];
    }
  });
}

export const User = makeModelProxy(UserModel, UserAdapter);
export const Profile = makeModelProxy(ProfileModel, ProfileAdapter);
export const Skill = makeModelProxy(SkillModel, SkillAdapter);
export const SwapAgreement = makeModelProxy(SwapAgreementModel, SwapAgreementAdapter);
export const Conversation = makeModelProxy(ConversationModel, ConversationAdapter);
export const Message = makeModelProxy(MessageModel, MessageAdapter);
export const Report = makeModelProxy(ReportModel, ReportAdapter);
export const AuditLog = makeModelProxy(AuditLogModel, AuditLogAdapter);
export const Notification = makeModelProxy(NotificationModel, NotificationAdapter);

export function getIsMongooseConnected() {
  return dbState.isConnected;
}
