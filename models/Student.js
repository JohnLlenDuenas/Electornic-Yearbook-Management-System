const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentNumber: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  iv: String,
  key: String,
  consentfilled: { type: Boolean, default: false },
  passwordChanged: { type: Boolean, default: false },
  accountType: { type: String, required: true },
  birthday: { 
    type: String, 
    required: function() {
      return this.accountType !== 'admin'; 
    } 
  },
  picture: { type: String }, 
  twoFactorSecret: String,
  lastActive: { type: Date, default: Date.now },
  twoFactorEnabled: { type: Boolean, default: false },
  pictureUploaded: { type: Boolean, default: false }
});

const Student = mongoose.model('Student', studentSchema);
module.exports = Student;
