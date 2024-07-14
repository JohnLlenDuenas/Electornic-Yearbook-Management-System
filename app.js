const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const ConsentForm = require('./models/ConsentForm');
const ActivityLog = require('./models/ActivityLogs'); // Ensure this path is correct

const app = express();
const port = 3000;

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

// Middleware to ensure role
function ensureRole(role) {
  return (req, res, next) => {
    if (req.session.user && req.session.user.accountType === role) {
      return next();
    } else {
      logActivity(req.session.user ? req.session.user._id : null, `Unauthorized access attempt to ${req.originalUrl}`);
      res.status(403).send('Forbidden');
    }
  };
}

// Function to log activity
const logActivity = async (userId, action, details = '') => {
  const log = new ActivityLog({
    userId: userId,
    action: action,
    details: details
  });
  await log.save();
};

// Route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route for protected pages based on roles
app.get('/consent/index.html', checkAuthenticated, ensureRole('student'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'consent', 'index.html'));
});

app.get('/admin/index.html', checkAuthenticated, ensureRole('admin'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/committee/index.html', checkAuthenticated, ensureRole('committee'), (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'committee', 'index.html'));
});

app.get('/dashboard', checkAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Utility function to get current date and time
function getCurrentDateTime() {
  const now = new Date();
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString();
  return `${date} ${time}`;
}

// Consent fill route
app.post('/consent-fill', async (req, res) => {
  const dateTime = getCurrentDateTime();
  const { student_Number, student_Name, gradeSection, parentguardian_name, relationship, contactno, formStatus } = req.body;

  try {
    // Check if student exists
    const student = await Student.findOne({ studentNumber: student_Number });
    if (!student) {
      await logActivity(null, 'Consent fill failed', `Student ${student_Number} not found`);
      return res.status(400).json({ message: 'Student not found' });
    }

    const existingConsentForm = await ConsentForm.findOne({ student_Number });
    if (existingConsentForm) {
      await logActivity(student._id, 'Consent fill failed', 'Consent form already exists');
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
    await logActivity(student._id, 'Consent fill', 'Consent form filled successfully');
    res.status(201).json({ message: 'Consent filled successfully' });
  } catch (error) {
    console.error("Error saving consent form:", error);
    await logActivity(null, 'Error saving consent form', error.message);
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
    const consntf = false;


    // Create a new user document
    const newUser = new Student({
      studentNumber,
      email,
      password: encryptedPassword,
      accountType,
      iv: iv.toString('hex'), // Ensure this matches the schema field name
      key: encryptionKey.toString('hex'), // Ensure this matches the schema field name
      consentfilled: consntf
    });
    await newUser.save();
    await logActivity(newUser._id, 'Account created', 'Account created successfully');
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      await logActivity(null, 'Account creation failed', 'Account with this student number already exists');
      res.status(400).json({ message: 'Account with this student number already exists' });
    } else {
      console.error("Error creating account:", error);
      await logActivity(null, 'Error creating account', error.message);
      res.status(500).json({ message: 'Error creating account' });
    }
  }
});

// Upload CSV route for batch account creation
app.post('/upload-csv', async (req, res) => {
  const accounts = req.body;

  try {
    for (const account of accounts) {
      const { studentNumber, email, password, accountType, consentfilled } = account;

      if (!password) {
        console.error(`Missing password for student number: ${studentNumber}`);
        res.status(400).json({ message: `Missing password for student number: ${studentNumber}` });
        return;
      }

      const iv = crypto.randomBytes(16);
      const encryptionKey = crypto.randomBytes(32);
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
        key: encryptionKey.toString('hex'), // Ensure this matches the schema field name
        consentfilled
      });

      await newUser.save();
      await logActivity(newUser._id, 'Batch account created', `Account created successfully for ${studentNumber}`);
    }
    res.status(201).json({ message: 'Accounts created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      await logActivity(null, 'Batch account creation failed', 'One or more accounts with this student number already exist');
      res.status(400).json({ message: 'One or more accounts with this student number already exist' });
    } else {
      console.error("Error creating accounts:", error);
      await logActivity(null, 'Error creating accounts', error.message);
      res.status(500).json({ message: 'Error creating accounts' });
    }
  }
});


// Login route with activity logging
app.post('/loginroute', async (req, res) => {
  const { studentNumber, password } = req.body;

  try {
    // Find user by student number
    const user = await Student.findOne({ studentNumber });

    if (!user) {
      await logActivity(null, 'Login failed', `Invalid number or password for ${studentNumber}`);
      return res.status(400).json({ message: 'Invalid number or password' });
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
      let action = '';

      if (user.accountType === 'student') {
        if (user.consentfilled) {
          redirectUrl = '../student/index.html';
          action = 'Logged in as student';
        } else {
          setTimeout(() => {
            redirectUrl = '../consent/index.html';
          }, 2000);
          action = 'Student redirected to consent form';
        }
      } else if (user.accountType === 'admin') {
        redirectUrl = '../admin/index.html';
        action = 'Logged in as admin';
      } else if (user.accountType === 'committee') {
        redirectUrl = '../committee/index.html';
        action = 'Logged in as committee';
      }

      // Log the login attempt
      await logActivity(user._id, action, `User ${user.studentNumber} logged in as ${user.accountType}`);

      res.status(200).json({ message: 'Login successful', redirectUrl: redirectUrl });
    } else {
      await logActivity(user._id, 'Login failed', 'Invalid password');
      res.status(400).json({ message: 'Invalid student number or password' });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    await logActivity(null, 'Error logging in', error.message);
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
  });
});

// Fetch consent form data
app.get('/consentformfetch', async (req, res) => {
  try {
    const consentForms = await ConsentForm.find();
    await logActivity(req.session.user ? req.session.user._id : null, 'Fetch consent form data');
    res.json(consentForms);
  } catch (err) {
    await logActivity(null, 'Error fetching consent forms', err.message);
    res.status(500).json({ error: 'Failed to fetch consent forms' });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
