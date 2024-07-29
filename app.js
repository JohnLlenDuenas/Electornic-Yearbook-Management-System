const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cron = require('node-cron');
const session = require('express-session');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const ConsentForm = require('./models/ConsentForm');
const ActivityLog = require('./models/ActivityLogs'); // Ensure this path is correct
const Yearbook = require('./models/Yearbooks');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


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
  cookie: { secure: process.env.NODE_ENV === 'production' } // Set secure to true if using https
}));

// Serve public static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to check if user is authenticated
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Middleware to ensure role-based access control
const ensureRole = (roles) => {
  return (req, res, next) => {
    if (req.session.user && roles.includes(req.session.user.accountType)) {
      return next();
    } else {
      logActivity(req.session.user ? req.session.user._id : null, `Unauthorized access attempt to ${req.originalUrl}`);
      res.status(403).send('Forbidden');
    }
  };
};

// Function to log activity
const logActivity = async (userId, action, details = '') => {
  const log = new ActivityLog({
    userId: userId,
    action: action,
    details: details
  });
  await log.save();
};

// Set up the cron job
// Set up the cron job
cron.schedule('*/10 * * * *', async () => { // Runs every 10 minutes
  try {
    // Fetch and update all yearbooks
    const yearbooks = await Yearbook.find();
    for (const yearbook of yearbooks) {
      const response = await axios.get(`http://localhost/wordpress/wp-json/wp/v2/yearbook/${yearbook.yearbookId}`);
      const yearbookData = response.data;

      await Yearbook.findOneAndUpdate(
        { yearbookId: yearbook.yearbookId },
        {
          title: yearbookData.title.rendered,
          content: yearbookData.content.rendered,
          status: yearbookData.status
        },
        { new: true }
      );
    }
    console.log('Yearbooks updated successfully');
  } catch (error) {
    console.error('Error updating yearbooks:', error);
  }
});


// Route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to serve login.html
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// API to check authentication status
app.get('/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ isAuthenticated: true, userRole: req.session.user.accountType });
  } else {
    res.json({ isAuthenticated: false });
  }
});

// Serve static files for authenticated users
app.use('/admin', checkAuthenticated, ensureRole(['admin']), express.static(path.join(__dirname, 'public', 'admin')));
app.use('/student', checkAuthenticated, ensureRole(['student']), express.static(path.join(__dirname, 'public', 'student')));
app.use('/committee', checkAuthenticated, ensureRole(['committee']), express.static(path.join(__dirname, 'public', 'committee')));
app.use('/consent', checkAuthenticated, ensureRole(['student']), express.static(path.join(__dirname, 'public', 'consent')));

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
      return res.status(400).json({ message: 'Consent form for this student already filled' });
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

    // Update the consentfilled field for the student
    student.consentfilled = true;
    await student.save();

    await logActivity(student._id, 'Consent fill', 'Consent form filled successfully');
    res.status(201).json({ message: 'Consent filled successfully' });
  } catch (error) {
    console.error("Error saving consent form:", error);
    await logActivity(null, 'Error saving consent form', error.message);
    res.status(500).json({ message: 'Error saving consent form' });
  }
});

app.post('/change-password', checkAuthenticated, async (req, res) => {
  const { newPassword } = req.body;

  try {
    const user = await Student.findOne({ studentNumber: req.session.user.studentNumber });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const iv = crypto.randomBytes(16);
    const encryptionKey = crypto.randomBytes(32);
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encryptedPassword = cipher.update(newPassword, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    user.password = encryptedPassword;
    user.iv = iv.toString('hex');
    user.key = encryptionKey.toString('hex');
    user.passwordChanged = true;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: 'Error changing password' });
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
    await logActivity(null, 'Error creating account', error.message);
    res.status(500).json({ message: 'Error creating account' });
  }
});

// Upload CSV route for batch account creation
app.post('/upload-csv', async (req, res) => {
  const accounts = req.body;

  try {
    for (const account of accounts) {
      const { studentNumber, email, password, accountType } = account;

      if (!password) {
        console.error("Missing password for account:", account);
        continue; // Skip this account and proceed with others
      }

      const iv = crypto.randomBytes(16);
      const encryptionKey = crypto.randomBytes(32);
      const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
      let encryptedPassword = cipher.update(password, 'utf8', 'hex');
      encryptedPassword += cipher.final('hex');

      const newUser = new Student({
        studentNumber,
        email,
        password: encryptedPassword,
        accountType,
        iv: iv.toString('hex'),
        key: encryptionKey.toString('hex'),
        consentfilled: false // Set consentfilled to false for all new accounts by default
      });

      await newUser.save();
      await logActivity(newUser._id, 'Account created', 'Account created successfully');
    }
    res.status(201).json({ message: 'Accounts created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'One or more accounts with this student number already exist' });
    } else {
      console.error("Error creating accounts:", error);
      res.status(500).json({ message: 'Error creating accounts' });
    }
  }
});

// Login route with activity logging
app.post('/loginroute', async (req, res) => {
  const { studentNumber, password } = req.body;

  try {
    const user = await Student.findOne({ studentNumber });

    if (!user) {
      await logActivity(null, 'Login failed', `Invalid number or password for ${studentNumber}`);
      return res.status(400).json({ message: 'Invalid number or password' });
    }

    const iv = Buffer.from(user.iv, 'hex');
    const key = Buffer.from(user.key, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
    decryptedPassword += decipher.final('utf8');

    if (decryptedPassword === password) {
      req.session.user = user;

      let redirectUrl = '';
      let action = '';

      if (user.accountType === 'student') {
        if (!user.passwordChanged) {
          redirectUrl = '../change_password/index.html';
          action = 'Student redirected to change password page';
        } else if (!user.consentfilled) {
          redirectUrl = '../consent/index.html';
          action = 'Student redirected to consent form';
        } else {
          redirectUrl = '../student/student_dashboard.html';
          action = 'Logged in as student';
        }
      } else if (user.accountType === 'admin') {
        redirectUrl = '../admin/index.html';
        action = 'Logged in as admin';
      } else if (user.accountType === 'committee') {
        redirectUrl = '../committee/index.html';
        action = 'Logged in as committee';
      }

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
app.get('/consentformfetch', checkAuthenticated, ensureRole(['admin', 'committee']), async (req, res) => {
  try {
    const consentForms = await ConsentForm.find();
    await logActivity(req.session.user ? req.session.user._id : null, 'Fetch consent form data');
    res.json(consentForms);
  } catch (err) {
    await logActivity(null, 'Error fetching consent forms', err.message);
    res.status(500).json({ error: 'Failed to fetch consent forms' });
  }
});

app.get('/yearbook/:id', async (req, res) => {
  try {
    const yearbookId = req.params.id;
    const response = await axios.get(`http://localhost/wordpress/wp-json/wp/v2/yearbook/${yearbookId}`);
    const yearbookData = response.data;

    console.log('Yearbook Data:', yearbookData);

    await Yearbook.findOneAndUpdate(
      { yearbookId: yearbookId },
      {
        title: yearbookData.title.rendered,
        content: yearbookData.content.rendered,
        status: yearbookData.status
      },
      { new: true }
    );

    console.log('Yearbook updated successfully');
    res.render('yearbook', { yearbook: yearbookData });
  } catch (error) {
    console.error('Error updating yearbook:', error);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
    res.status(500).json({ message: 'Error updating yearbook' });
  }
});



// Start the server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
