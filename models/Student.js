const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentNumber: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  accountType: { type: String, required: true },
  iv: { type: String, required: true },
  key: { type: String, required: true }
});
const Photo = mongoose.model('Student', studentSchema);
module.exports = Photo;
