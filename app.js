const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cron = require('node-cron');
const cheerio = require('cheerio');
const session = require('express-session');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const ConsentForm = require('./models/ConsentForm');
const ActivityLog = require('./models/ActivityLogs'); 
const Yearbook = require('./models/Yearbooks');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });
const http = require('http');
const app = express();
const socketIo = require('socket.io');
const lastLogTimestamp = new Date();

const server = http.createServer(app);
const io = require('socket.io')(server);

const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


const uri = "mongodb://localhost:27017/EYBMS_DB";

mongoose.connect(uri).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('Error connecting to MongoDB', err);
});


app.use(express.json());

app.use(session({
  secret: '3f8d9a7b6c2e1d4f5a8b9c7d6e2f1a3b', // Change this to a random string
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' } // Set secure to true if using https
}));

app.use(express.static(path.join(__dirname, 'public')));

const checkAuthenticated = (req, res, next) => {
  if (req.session.user) {
    next();
  } else {
    res.redirect('/login');
  }
};

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



cron.schedule('*/1 * * * *', async () => { // Runs every 10 minutes
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



io.on('connection', (socket) => {
  console.log('Client connected');

  // Send all existing logs when the client connects
  ActivityLog.find({}, (err, logs) => {
    if (err) {
      console.error('Error fetching logs:', err);
    } else {
      socket.emit('initialLogs', logs);
    }
  });

  // Cron job to check for new logs every minute
  cron.schedule('*/1 * * * *', async () => {
    try {
      // Fetch logs that were created after the last known timestamp
      const newLogs = await ActivityLog.find({ timestamp: { $gt: lastLogTimestamp } });

      // Update the last log timestamp to the most recent one
      if (newLogs.length > 0) {
        lastLogTimestamp = newLogs[newLogs.length - 1].timestamp;

        // Emit the new logs to the connected clients
        io.emit('newLog', newLogs);
      }
    } catch (err) {
      console.error('Error fetching new logs:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});


// Emit new logs after they are created
const logActivity = async (userId, action, details = '') => {
  const log = new ActivityLog({
    userId: userId,
    action: action,
    details: details,
    timestamp: new Date() // Make sure to include timestamp if needed
  });
  await log.save();

  // Emit the new log to all connected clients in real-time
  io.emit('newLog', log); // Emit to all connected clients
};

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

app.use('/js', express.static(path.join(__dirname, 'public', 'assets', 'js')));
app.use('/js', express.static(path.join(__dirname, 'public', 'assets', 'js', 'stable')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));


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
    res.status(201).json({ message: 'Consent filled successfully', redirectUrl: '/student/yearbooks' });
  } catch (error) {
    console.error("Error saving consent form:", error);
    await logActivity(null, 'Error saving consent form', error.message);
    res.status(500).json({ message: 'Error saving consent form' });
  }
});

app.post('/change-password-login', checkAuthenticated, async (req, res) => {
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
app.post('/change-password', checkAuthenticated, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await Student.findOne({ studentNumber: req.session.user.studentNumber });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const iv = Buffer.from(user.iv, 'hex');
    const key = Buffer.from(user.key, 'hex');

    // Decrypt current password
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
    decryptedPassword += decipher.final('utf8');

    if (decryptedPassword !== currentPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Encrypt new password
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encryptedPassword = cipher.update(newPassword, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    // Update password without triggering full validation
    await Student.findByIdAndUpdate(user._id, { password: encryptedPassword });

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



app.post('/create-account', async (req, res) => {
  const { studentNumber, email, birthday, accountType } = req.body; // Accept birthday from request

  try {
    // Convert the birthday to use as the default password
    const password = birthday.replace(/-/g, ''); // Use the birthday as the password (in YYYY-MM-DD format)
    const iv = crypto.randomBytes(16); // IV is 16 bytes
    const encryptionKey = crypto.randomBytes(32); // Key is 32 bytes (256 bits)

    // Encrypt the password (birthday)
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encryptedPassword = cipher.update(password, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    const consntf = false;

    // Create a new student document with the encrypted password, key, and IV
    const newUser = new Student({
      studentNumber,
      email,
      password: encryptedPassword,
      birthday: birthday, // Store birthday in YYYYMMDD format
      accountType,
      iv: iv.toString('hex'), // Store IV as hex string
      key: encryptionKey.toString('hex'), // Store key as hex string
      consentfilled: consntf,
      passwordChanged: false,
    });

    await newUser.save();
    await logActivity(newUser._id, 'Account created', 'Account created successfully');
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Error creating account:', error);
    await logActivity(null, 'Error creating account', error.message);
    res.status(500).json({ message: 'Error creating account' });
  }
});


app.post('/reset-password/:id', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    // Find the student by ID
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const birthday = student.birthday;
    if (!birthday) {
      return res.status(400).json({ message: 'Birthday not found for this student' });
    }

    // Log the key and IV to check if they're correct
    console.log('Student Key:', student.key);
    console.log('Student IV:', student.iv);

    // Validate the stored key and IV
    if (!student.key || student.key.length !== 64) { // Key must be 64 hex characters (32 bytes)
      return res.status(500).json({ message: 'Stored encryption key is invalid or corrupted' });
    }
    if (!student.iv || student.iv.length !== 32) { // IV must be 32 hex characters (16 bytes)
      return res.status(500).json({ message: 'Stored initialization vector (IV) is invalid or corrupted' });
    }

    // Convert the key and IV from hex to buffer
    const keyBuffer = Buffer.from(student.key, 'hex');
    const ivBuffer = Buffer.from(student.iv, 'hex');

    console.log('Key Buffer:', keyBuffer);
    console.log('IV Buffer:', ivBuffer);

    // Encrypt the birthday to use as the new password
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    let encrypted = cipher.update(birthday, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    console.log('Encrypted password:', encrypted);

    // Update the student's password and mark as not changed
    student.password = encrypted;
    student.passwordChanged = false;

    await student.save();
    await logActivity(student._id, 'Password reset successfully for student ID:'+id, 'Password reset successfully for student ID:'+id+'successfully');
    console.log('Password reset successfully for student ID:', id);
    res.status(200).json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: error.message });
  }
});

app.post('/change-password', checkAuthenticated, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    // Find the logged-in user based on session
    const user = await Student.findOne({ studentNumber: req.session.user.studentNumber });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    // Decrypt current password to verify
    const iv = Buffer.from(user.iv, 'hex');
    const key = Buffer.from(user.key, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
    decryptedPassword += decipher.final('utf8');

    if (decryptedPassword !== currentPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Encrypt the new password
    const newIv = crypto.randomBytes(16);
    const newEncryptionKey = crypto.randomBytes(32);
    const cipher = crypto.createCipheriv('aes-256-cbc', newEncryptionKey, newIv);
    let encryptedPassword = cipher.update(newPassword, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    // Update user's password
    user.password = encryptedPassword;
    user.iv = newIv.toString('hex');
    user.key = newEncryptionKey.toString('hex');
    user.passwordChanged = true;

    await user.save();

    // Log the activity
    await logActivity(user._id, 'Changed Password', 'Password changed successfully');
    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});


app.post('/upload-csv', upload.single('csvFile'), (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.file.filename);

  const accounts = [];
  
  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on('data', (row) => {
      const { studentNumber, email, birthday, accountType } = row;
      const plainPassword = birthday.replace(/-/g, '');
      
      const iv = crypto.randomBytes(16);
      const encryptionKey = crypto.randomBytes(32);
      const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
      let encryptedPassword = cipher.update(plainPassword, 'utf8', 'hex');
      encryptedPassword += cipher.final('hex');

      accounts.push({
        studentNumber,
        email,
        password: encryptedPassword,
        birthday,
        accountType,
        iv: iv.toString('hex'),
        key: encryptionKey.toString('hex'),
        consentfilled: false,
        passwordChanged: false
      });
    })
    .on('end', async () => {
      try {
        // Save all accounts
        for (const account of accounts) {
          const newUser = new Student(account);
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
      // Delete the temporary file after processing
      fs.unlinkSync(filePath);
    })
    .on('error', (error) => {
      console.error('Error reading CSV file:', error);
      res.status(500).json({ message: 'Error reading CSV file' });
    });
});


// Login route with activity logging
app.post('/loginroute', async (req, res) => {
  const { studentNumber, password } = req.body;

  try {
    const user = await Student.findOne({ studentNumber });

    if (!user) {
      await logActivity(null, 'Login failed', `Invalid number or password for ${studentNumber}`);
      return res.status(400).json({ message: 'Invalid student number or password' });
    }

    const iv = Buffer.from(user.iv, 'hex');
    const key = Buffer.from(user.key, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

    let decryptedPassword;
    try {
      decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
      decryptedPassword += decipher.final('utf8');
    } catch (err) {
      return res.status(400).json({ message: 'Failed to decrypt password' });
    }

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
          redirectUrl = '/student/yearbooks';
          action = 'Logged in as student';
        }
      } else if (user.accountType === 'admin') {
        redirectUrl = '/admin/yearbooks';
        action = 'Logged in as admin';
      } else if (user.accountType === 'committee') {
        redirectUrl = '../committee/index.html';
        action = 'Logged in as committee';
      }

      await logActivity(user._id, action, `User ${user.studentNumber} logged in as ${user.accountType}`);
      res.status(200).json({ message: 'Login successful', redirectUrl: redirectUrl });
    } else {
      await logActivity(user._id, 'Login failed', `User ${user.studentNumber} Invalid studentnumber or password`);
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

//list comitte and student
app.get('/students', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    const students = await Student.find({ accountType: 'student' });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
});
app.get('/comittee', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    const comittee = await Student.find({ accountType: 'admin' });
    res.json(comittee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


app.get('/admin/yearbooks', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    // Fetch yearbooks from WordPress
    const response = await axios.get('http://localhost/wordpress/wp-json/myplugin/v1/flipbooks');
    const yearbooks = response.data;

    // Render the yearbooks in the admin dashboard
    res.render(path.join(__dirname, 'public', 'admin', 'index'), { yearbooks });
  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});



app.get('/yearbook/:id', async (req, res) => {
  try {
    const yearbookId = req.params.id;
    const url = `http://localhost/wordpress/3d-flip-book/${yearbookId}/`;

    // Fetch the HTML content of the page
    const response = await axios.get(url);
    const html = response.data;

    // Load the HTML into Cheerio (which works like jQuery for server-side)
    const $ = cheerio.load(html);

    // Extract only the content of the <body> tag
    const bodyContent = $('body').html(); // Gets the inner HTML of the body tag

    // Render the EJS template with the body content
    res.render('yearbook', { bodyContent });

    // Optionally log the activity
    await logActivity(yearbookId._id, 'Admin View Yearbook', `Yearbook ${yearbookId} viewed successfully`);

  } catch (error) {
    console.error('Error fetching yearbook content:', error);
    res.status(500).json({ message: 'Error fetching yearbook' });
  }
});






//Fetch List Yb Student
app.get('/student/yearbooks', checkAuthenticated, ensureRole(['student']), async (req, res) => {
  try {
    const response = await axios.get('http://localhost/wordpress/wp-json/wp/v2/yearbook');
    const yearbooks = response.data;

    // Explicitly define the path to render the EJS template
    res.render(path.join(__dirname, 'public', 'student', 'index'), { yearbooks });
  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});
//
app.get('/studentyearbook/:id', async (req, res) => {
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
    res.render('studentyearbook', { yearbook: yearbookData });
    await logActivity(yearbookId._id, 'Student View Yearbook', `Yearbook ${yearbookId} viewed successfully`);
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

async function fetchFlipbooks() {
  try {
    const response = await axios.get('http://localhost/wordpress/wp-json/myplugin/v1/flipbooks', {
      withCredentials: true,
    });
    console.log('Flipbooks data:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching flipbooks:', error);
    return [];
  }
}

// Example of calling the function
fetchFlipbooks().then(flipbooks => {
  // Now you have the flipbooks data
  console.log(flipbooks);
});


app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
