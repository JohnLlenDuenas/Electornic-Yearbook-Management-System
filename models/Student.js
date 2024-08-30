const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentNumber: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  iv: String, // Initialization vector for AES encryption
  key: String, // Optional: if you are using a unique key per user
  consentfilled: { type: Boolean, default: false },
  passwordChanged: { type: Boolean, default: false },
  accountType: String,
  birthday: { type: String, required: true } // Store birthday as YYYYMMDD
});

const Student = mongoose.model('Student', studentSchema);
module.exports = Student;