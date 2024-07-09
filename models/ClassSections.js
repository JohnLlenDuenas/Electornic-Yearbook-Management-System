const mongoose = require('mongoose');

const classSectionSchema = new mongoose.Schema({
    classSectionId: { type: mongoose.Schema.Types.ObjectId, auto: true },
    yearbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Yearbook', required: true },
    className: { type: String, required: true },
    advisorName: { type: String, required: true },
    studentCount: { type: Number, required: true },
    studentClassList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }]
  });

const ClassSection = mongoose.model('ClassSection', classSectionSchema);

module.exports = ClassSection;