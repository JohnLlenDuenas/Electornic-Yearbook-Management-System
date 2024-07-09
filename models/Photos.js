const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
    photoId: { type: mongoose.Schema.Types.ObjectId, auto: true },
    sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSection', required: true },
    filePath: { type: String, required: true },
    caption: { type: String, required: true }
  });

  const Photo = mongoose.model('Photo', photoSchema);
  
  module.exports = Photo;
  