const mongoose = require('mongoose');

const consentFormSchema = new mongoose.Schema({
    student_Number: { type: String, required: true, ref: 'Student' },
    student_Name: { type: String, required: true,unique: true},
    gradeSection: { type: String, required: true },
    parentGuardian_Name: { type: String, required: true },
    relationship: { type: String, required: true },
    contactNo: { type: String, required: true },
    form_Status: { type: String, required: true },
    date_and_Time_Filled: { type: String, required: true }
});

const ConsentForm = mongoose.model('ConsentForm', consentFormSchema);

module.exports = ConsentForm;
