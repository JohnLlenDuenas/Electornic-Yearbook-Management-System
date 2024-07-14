const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentNumber: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  accountType: { type: String, required: true },
  iv: { type: String, required: true },
  key: { type: String, required: true },
  consentfilled: { type: Boolean, required: true,default: false },

});
const Student = mongoose.model('Student', studentSchema);
module.exports = Student;
