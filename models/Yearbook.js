const mongoose = require('mongoose');

const yearbookSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: false },
  status: { type: String, enum: ['published', 'pending'], default: 'pending' },
  views: { type: Number, default: 0 },
  lastViewed: { type: Date, default: Date.now },
  thumbnail: { type: String, required: false },
  consentDeadline: { type: Date } // New field for consent deadline
});

module.exports = mongoose.model('Yearbook', yearbookSchema);
