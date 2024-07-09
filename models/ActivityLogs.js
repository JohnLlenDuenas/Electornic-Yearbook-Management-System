const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  logId: { type: mongoose.Schema.Types.ObjectId, auto: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  details: { type: String, required: true }
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);