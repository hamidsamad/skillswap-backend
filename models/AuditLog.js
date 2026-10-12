import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    adminName: {
      type: String,
      required: true
    },
    adminEmail: {
      type: String,
      default: ''
    },
    action: {
      type: String,
      required: true,
      index: true
    },
    targetType: {
      type: String,
      enum: ['Report', 'User', 'Skill', 'SwapAgreement', 'Message', 'System'],
      required: true,
      index: true
    },
    targetId: {
      type: String,
      default: ''
    },
    details: {
      type: String,
      default: ''
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

export default mongoose.model('AuditLog', auditLogSchema);
