const mongoose = require('mongoose');

const accessControlSchema = new mongoose.Schema({
    accessId: { type: mongoose.Schema.Types.ObjectId, auto: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    yearbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Yearbook', required: true },
    permissionLevel: { type: String, required: true }
  });

const AccessControl = mongoose.model('AccessControl', accessControlSchema);

module.exports = AccessControl;