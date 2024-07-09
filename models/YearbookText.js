const mongoose = require('mongoose');

const yearbookTextSchema = new mongoose.Schema({
    ybTextId: { type: mongoose.Schema.Types.ObjectId, auto: true },
    text: { type: String, required: true }
  });

const YearbookText = mongoose.model('YearbookText', yearbookTextSchema);

module.exports = YearbookText;