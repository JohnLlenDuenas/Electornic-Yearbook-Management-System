const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const ConsentForm = require('./models/ConsentForm');

const app = express();
const port = 3000;

const parentDirectory = process.env.PARENT_DIRECTORY || 'parent-directory';


// MongoDB connection string
const uri = "mongodb://localhost:27017/EYBMS_DB";

// Connect to MongoDB using Mongoose
mongoose.connect(uri).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('Error connecting to MongoDB', err);
});



// Middleware to parse JSON
app.use(express.json());

// Session middleware
app.use(session({
  secret: '3f8d9a7b6c2e1d4f5a8b9c7d6e2f1a3b', // Change this to a random string
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set secure to true if using https
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to check if user is authenticated
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/');
  }
};

// Route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for protected pages (example)
app.get('/dashboard', checkAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});


function getCurrentDateTime() {
  const now = new Date();
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString();
  return `${date} ${time}`;
}

//consent fill route
app.post('/consent-fill', async (req, res) => {
  const dateTime = getCurrentDateTime();
  const { student_Number, student_Name, gradeSection, parentguardian_name, relationship, contactno, formStatus } = req.body;

  try {
    // Check if student exists
    const student = await Student.findOne({ studentNumber: student_Number });
    if (!student) {
      return res.status(400).json({ message: 'Student not found' });
    }

    const existingConsentForm = await ConsentForm.findOne({ student_Number });
    if (existingConsentForm) {
      return res.status(400).json({ message: 'Consent form for this student already exists' });
    }

    // Create a new consent form document
    const consentFormData = new ConsentForm({
      student_Number,
      student_Name,
      gradeSection: gradeSection,
      parentGuardian_Name: parentguardian_name,
      relationship,
      contactNo: contactno,
      form_Status: formStatus,
      date_and_Time_Filled: dateTime
    });

    // Save the consent form to the database
    await consentFormData.save();

    res.status(201).json({ message: 'Consent filled successfully' });
  } catch (error) {
    console.error("Error saving consent form:", error);
    res.status(500).json({ message: 'Error saving consent form' });
  }
});



// Create account route
app.post('/create-account', async (req, res) => {
  const { studentNumber, email, password, accountType } = req.body;

  try {
    // Encrypt the password
    const iv = crypto.randomBytes(16); // Initialization vector
    const encryptionKey = crypto.randomBytes(32); // Must be 32 bytes (256 bits)
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encryptedPassword = cipher.update(password, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    // Create a new user document
    const newUser = new Student({
      studentNumber,
      email,
      password: encryptedPassword,
      accountType,
      iv: iv.toString('hex'), // Ensure this matches the schema field name
      key: encryptionKey.toString('hex') // Ensure this matches the schema field name
    });
    await newUser.save();
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Account with this student number already exists' });
    } else {
      console.error("Error creating account:", error);
      res.status(500).json({ message: 'Error creating account' });
    }
  }
});


// Login route
app.post('/loginroute', async (req, res) => {
  const { studentNumber, password } = req.body;

  try {
    // Find user by student number
    const user = await Student.findOne({ studentNumber });

    if (!user) {
      return res.status(400).json({ message: 'Invalid student number or password' });
    }

    // Use the stored IV and key for decryption
    const iv = Buffer.from(user.iv, 'hex'); // Convert stored hex string back to buffer
    const key = Buffer.from(user.key, 'hex'); // Convert stored hex string back to buffer
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
    decryptedPassword += decipher.final('utf8');

    if (decryptedPassword === password) {
      req.session.user = user; // Store user information in session

      let redirectUrl = '';
      if (user.accountType === 'student') {
        redirectUrl = '../consent/index.html';
      } else if (user.accountType === 'admin') {
        redirectUrl = '../admin/index.html';
      }

      res.status(200).json({ message: 'Login successful', redirectUrl:redirectUrl });
    } else {
      res.status(400).json({ message: 'Invalid student number or password' });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: 'Error logging in' });
  }
});


// Logout route
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.status(200).json({ message: 'Logout successful' });
    redirectUrl = '/index.html';
  });
});

//fetch consent form data
app.get('/consentformfetch', async (req, res) => {
  try {
      const consentForms = await ConsentForm.find();
      res.json(consentForms);
  } catch (err) {
      res.status(500).json({ error: 'Failed to fetch consent forms' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
