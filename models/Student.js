const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentNumber: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  iv: String,
  key: String,
  consentfilled: {
    type: Boolean,
    default: false
  },
  passwordChanged: {
    type: Boolean,
    default: false
  },
  accountType: String
});


const Student = mongoose.model('Student', studentSchema);
module.exports = Student;
