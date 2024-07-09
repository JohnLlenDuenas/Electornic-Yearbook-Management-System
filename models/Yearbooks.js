const mongoose = require('mongoose');

const yearbookSchema = new mongoose.Schema({
    yearbookId: { type: mongoose.Schema.Types.ObjectId, auto: true },
    title: { type: String, required: true },
    schoolYear: { type: String, required: true },
    createdDate: { type: Date, default: Date.now },
    publishedDate: { type: Date },
    status: { type: String, required: true }
  });

const Yearbook = mongoose.model('Yearbook', yearbookSchema);
module.exports = Yearbook;