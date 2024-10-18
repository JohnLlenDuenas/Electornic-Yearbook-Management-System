const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentNumber: { type: String, required: true },
  email: { type: String, required: true },
  password: { type: String, required: true },
  iv: String,
  key: String,
  consentfilled: { type: Boolean, default: false },
  passwordChanged: { type: Boolean, default: false },
  accountType: { type: String, required: true },  // Admin, student, etc.
  birthday: { 
    type: String, 
    required: function() {
      // Require birthday only for non-admin users
      return this.accountType !== 'admin'; 
    } 
  },
  twoFactorSecret: String, // Store the TOTP secret
  twoFactorEnabled: { type: Boolean, default: false } // Flag for 2FA
});

const Student = mongoose.model('Student', studentSchema);
module.exports = Student;
