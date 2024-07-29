const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentNumber: String,
  email: String,
  password: String,
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
