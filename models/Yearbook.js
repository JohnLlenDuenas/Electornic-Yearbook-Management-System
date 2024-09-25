// models/Yearbook.js
const mongoose = require('mongoose');

const yearbookSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // WordPress yearbook ID
  title: { type: String, required: false },
  status: { type: String, enum: ['published', 'pending'], default: 'pending' }, // Status field
});

module.exports = mongoose.model('Yearbook', yearbookSchema);
