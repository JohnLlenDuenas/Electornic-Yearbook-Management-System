const mongoose = require('mongoose');

const studentListSchema = new mongoose.Schema({
    studentNo: { type: String, required: true },
    studentName: { type: String, required: true }
  });
const StudentList = mongoose.model('StudentList', studentListSchema);

module.exports = StudentList;