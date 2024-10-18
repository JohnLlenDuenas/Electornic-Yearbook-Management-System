const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cron = require('node-cron');
const bodyParser = require('body-parser');
const cheerio = require('cheerio');
const session = require('express-session');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const Student = require('./models/Student');
const ConsentForm = require('./models/ConsentForm');
const ActivityLog = require('./models/ActivityLogs'); 
const Yearbook = require('./models/Yearbook');
const multer = require('multer');
const csvParser = require('csv-parser');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' });
const http = require('http');
const app = express();
const socketIo = require('socket.io');
const lastLogTimestamp = new Date();
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const server = http.createServer(app);
const io = require('socket.io')(server);

const port = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));



const onlineUsers = {
  student: 0,
  committee: 0,
  admin: 0
};
function emitOnlineUsers() {
  io.emit('updateOnlineUsers', onlineUsers);
}
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Whenever a user connects or disconnects, update online users
io.on('connection', (socket) => {
  // Logic to handle user connection and update `onlineUsers` object
  // e.g., when a student connects:
  onlineUsers.student++;
  emitOnlineUsers();

  socket.on('disconnect', () => {
      // Logic to update `onlineUsers` when a user disconnects
      onlineUsers.student--;
      emitOnlineUsers();
  });
});


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
async function logActivity(userId, action, details) {
  try {
    // Convert userId to ObjectId if it's not already one
    const objectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    // Assuming ActivityLog is your Mongoose model
    const log = new ActivityLog({
      userId: objectId, // Ensure this is correctly formatted as ObjectId
      action,
      details,
      timestamp: new Date(),
    });

    await log.save();
    console.log('Activity logged successfully');
  } catch (error) {
    console.error('Error logging activity:', error);
    throw error; // Rethrow the error if necessary for further handling
  }
}

// Route to serve index.html
app.get('/', (req, res) => {
  if(req.session.user==null){
    res.render(path.join(__dirname, 'public','index'));
  }else{
    if(req.session.user.accountType === 'admin'){
      res.redirect('/admin/yearbooks');
    }if(req.session.user.account === 'student'){  
      res.redirect('/student/yearbooks');
    }
    if(req.session.user.account ==='committee'){
      res.redirect('/comittee/yearbooks');
    }
  }
  

  console.log(req.session.user);
});

// Route to serve login.html
app.get('/login', (req, res) => {

  res.render(path.join(__dirname, 'public', 'login'));
  
  
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


app.get('/setup-2fa', async (req, res) => {
  const sessionUser = req.session.user;

  if (!sessionUser || sessionUser.accountType !== 'admin') {
    return res.status(403).send('Unauthorized access');
  }

  try {
    const user = await Student.findOne({ studentNumber: sessionUser.studentNumber });

    if (!user) {
      return res.status(404).send('User not found');
    }

    // Generate 2FA secret
    const secret = speakeasy.generateSecret({ length: 20 });
    console.log("Generated secret for user:", secret.base32);

    // Generate otpauth URL manually for QR code generation
    const otpauthUrl = `otpauth://totp/ElectronicYearbookManagementSystem:${user.studentNumber}?secret=${secret.base32}&issuer=ElectronicYearbookManagementSystem`;

    // Generate QR code for the secret
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
    console.log("Generated QR Code URL:", qrCodeUrl);

    // Save the secret in the user's record in the database (base32 encoding)
    user.twoFactorSecret = secret.base32;
    await user.save();
    console.log("Saved secret for user:", user.studentNumber, user.twoFactorSecret);

    // Render the setup page with the QR code
    res.render('setup-2fa', { qrCodeUrl });

  } catch (error) {
    console.error('Error setting up 2FA:', error);
    res.status(500).json({ message: 'Error setting up 2FA' });
  }
});

app.post('/verify-2fa', async (req, res) => {
  console.log('Request body:', req.body);  // Log entire body for debugging
  const { token } = req.body;
  const sessionUser = req.session.user;

  if (!sessionUser || sessionUser.accountType !== 'admin') {
    return res.status(403).send('Unauthorized access');
  }

  try {
    const user = await Student.findOne({ studentNumber: sessionUser.studentNumber });

    if (!user) {
      return res.status(404).send('User not found');
    }

    console.log("Stored secret for verification:", user.twoFactorSecret);

    const generatedToken = speakeasy.totp({
      secret: user.twoFactorSecret,
      encoding: 'base32'
    });
    console.log('Expected token:', generatedToken);
    console.log('Received token:', token);

    if (!token) {
      console.log("No token provided");
      return res.status(400).json({ message: 'Token is required' });
    }

    // Verify the provided TOTP token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token,
      window: 1
    });

    if (verified) {
      user.twoFactorEnabled = true;
      await user.save();

      console.log("2FA setup successful for user:", user.studentNumber);
      return res.status(200).json({ message: '2FA setup complete', redirectUrl: '/admin/yearbooks' });
    } else {
      console.log("Invalid 2FA token for user:", user.studentNumber);
      return res.status(400).json({ message: 'Invalid 2FA token', redirectUrl: '/admin/yearbooks' });
    }

  } catch (error) {
    console.error('Error verifying 2FA:', error);
    res.status(500).json({ message: 'Error verifying 2FA' });
  }
});




// Login route with activity logging
app.post('/loginroute', async (req, res) => {
  const { studentNumber, password, token } = req.body;

  try {
    const user = await Student.findOne({ studentNumber });

    if (!user) {
      await logActivity(null, 'Login failed', `Invalid number or password for ${studentNumber}`);
      return res.status(400).json({ message: 'Invalid student number or password' });
    }

    // Decrypt the stored password
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
      // **2FA Logic for Admins**
      if (user.accountType === 'admin' && user.twoFactorEnabled) {
        // If the token is not provided, inform the client that it's required
        if (!token) {
          return res.status(200).json({ message: '2FA required' });
        }

        // Verify the provided TOTP token
        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: token,
          window: 1  
        });

        // Handle invalid token
        if (!verified) {
          return res.status(400).json({ message: 'Invalid 2FA token' });
        }
      }

      // If 2FA check passed (or not needed), proceed to login
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
        yearbooks();
      } else if (user.accountType === 'admin') {
        redirectUrl = '/admin/yearbooks';
        action = 'Logged in as admin';
        yearbooks();
      } else if (user.accountType === 'committee') {
        redirectUrl = '/comittee/yearbooks';
        action = 'Logged in as committee';
        yearbooks();
      }

      // Log activity and return success
      await logActivity(user._id, action, `User ${user.studentNumber} logged in as ${user.accountType}`);
      return res.status(200).json({ message: 'Login successful', redirectUrl: redirectUrl });
    } else {
      await logActivity(user._id, 'Login failed', `User ${user.studentNumber} Invalid student number or password`);
      return res.status(400).json({ message: 'Invalid student number or password' });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    await logActivity(null, 'Error logging in', error.message);
    return res.status(500).json({ message: 'Error logging in' });
  }
});








// Logout route
app.post('/logout', (req, res) => {
  if (req.session.user) {
    const accountType = req.session.user.accountType;

    // Decrease the count for the appropriate accountType
    if (accountType === 'student') {
      onlineUsers.student = Math.max(0, onlineUsers.student - 1);
    } else if (accountType === 'committee') {
      onlineUsers.committee = Math.max(0, onlineUsers.committee - 1);
    } else if (accountType === 'admin') {
      onlineUsers.admin = Math.max(0, onlineUsers.admin - 1);
    }

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Error logging out' });
      }
      res.status(200).json({ message: 'Logout successful' });
    });
  } else {
    res.status(400).json({ message: 'No user logged in' });
  }
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
    const comittee = await Student.find({ accountType: 'comittee' });
    res.json(comittee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

//admin part
app.get('/admin/yearbooks', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    yearbooks();
    const user = await Student.findById(req.session.user);
    const mostViewedYearbooks = await Yearbook.find({ status: 'published' })
      .sort({ views: -1 }) // Sort by views in descending order
      .limit(3); // Limit to 3 yearbooks

    const publishedYearbooks = await Yearbook.find({ status: 'published' });
    const pendingYearbooks = await Yearbook.find({ status: 'pending' });

    // Pass onlineUsers to the template
    res.render(path.join(__dirname, 'public', 'admin', 'index'), { publishedYearbooks, pendingYearbooks, onlineUsers,mostViewedYearbooks,user  });
  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});



app.get('/yearbook/:id', async (req, res) => {
  try {
    const yearbookId = req.params.id;
    const url = `http://localhost/wordpress/3d-flip-book/${yearbookId}/`;
    
    const yearbook = await Yearbook.findOne({ id: yearbookId });
    if (!yearbook) {
      return res.status(404).json({ message: 'Yearbook not found' });
    }
    yearbook.views += 1;
    yearbook.lastViewed = Date.now();
    await yearbook.save();
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


cron.schedule('0 0 * * *', async () => {
  try {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Find yearbooks that haven't been viewed in over 6 months and are still published
    const inactiveYearbooks = await Yearbook.find({
      lastViewed: { $lt: sixMonthsAgo },
      status: 'published'
    });

    // Unpublish these yearbooks by setting their status to 'pending'
    inactiveYearbooks.forEach(async (yearbook) => {
      yearbook.status = 'pending';
      await yearbook.save();
      console.log(`Yearbook ${yearbook.title} has been unpublished due to inactivity.`);
    });
  } catch (error) {
    console.error('Error running cron job to unpublish inactive yearbooks:', error);
  }
});



// Publish a yearbook by changing its status to 'published'
app.post('/yearbook/:id/publish', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    const yearbookId = req.params.id;

    // Update the yearbook status to 'published'
    await Yearbook.findOneAndUpdate({ id: yearbookId }, { status: 'published' });

    // Optionally log the activity
    await logActivity(yearbookId._id, 'Yearbook Published', `Yearbook ${yearbookId} published successfully`);

    res.redirect('/admin/yearbooks'); // Redirect back to the yearbooks page
  } catch (error) {
    console.error('Error publishing yearbook:', error);
    res.status(500).json({ message: 'Error publishing yearbook' });
  }
});

app.post('/yearbook/:id/pending', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    const yearbookId = req.params.id;

    // Update the yearbook status to 'published'
    await Yearbook.findOneAndUpdate({ id: yearbookId }, { status: 'pending' });

    // Optionally log the activity
    await logActivity(yearbookId._id, 'Yearbook Pending', `Yearbook ${yearbookId} pending successfully`);

    res.redirect('/admin/yearbooks'); // Redirect back to the yearbooks page
  } catch (error) {
    console.error('Error pending yearbook:', error);
    res.status(500).json({ message: 'Error pending yearbook' });
  }
});


//comittee part

app.get('/comittee/yearbooks', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    // Fetch yearbooks from WordPress
    const response = await axios.get('http://localhost/wordpress/wp-json/myplugin/v1/flipbooks');
    const yearbooks = response.data;

    // Save yearbooks to MongoDB
    for (const yearbook of yearbooks) {
      // Check if the yearbook already exists in the database
      const existingYearbook = await Yearbook.findOne({ id: yearbook.id });

      if (!existingYearbook) {
        // Save new yearbook to MongoDB
        await Yearbook.create({
          id: yearbook.id,
          title: yearbook.title,
          status: 'pending', // Default status
        });
      }
    }
    const mostViewedYearbooks = await Yearbook.find({ status: 'published' })
    .sort({ views: -1 }) // Sort by views in descending order
    .limit(3); // Limit to 3 yearbooks
    
    // Fetch all yearbooks from MongoDB, grouped by status
    const publishedYearbooks = await Yearbook.find({ status: 'published' });
    const pendingYearbooks = await Yearbook.find({ status: 'pending' });

    // Render the admin dashboard with published and pending yearbooks
    res.render(path.join(__dirname, 'public', 'comittee', 'index'), { publishedYearbooks, pendingYearbooks,mostViewedYearbooks, onlineUsers });
  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});
// for comittee fetch yearbooks

app.get('/comitteeyearbook/:id', async (req, res) => {
  try {
    const yearbookId = req.params.id;
    const url = 'http://localhost/wordpress/wp-admin/edit.php?post_type=3d-flip-book';
    
    const yearbook = await Yearbook.findOne({ id: yearbookId });
    if (!yearbook) {
      return res.status(404).json({ message: 'Yearbook not found' });
    }
    yearbook.views += 1;
    yearbook.lastViewed = Date.now();
    await yearbook.save();

    // Fetch the HTML content of the WordPress page
    const response = await axios.get(url, {
      headers: {
        Cookie: 'wordpress_logged_in_bbfa5b726c6b7a9cf3cda9370be3ee91=root%7C1729738427%7CfVkaxMbMFZHhLX7hkxBg2fwUCqs4xzbA64eEz0i2cnb%7C669838cbfedeb39f1e0d9423e8808823f1ebcb063bc486c6b195f4580a61c158; wordpress_bbfa5b726c6b7a9cf3cda9370be3ee91=root%7C1729738427%7CfVkaxMbMFZHhLX7hkxBg2fwUCqs4xzbA64eEz0i2cnb%7C11364a94f3548b33a5ad1ed5d269543a1892e153a93c2353e966b3da90e56437; connect.sid=s%3AymPR7RCCbnt3OYAo3U9NSul6EyawUrlK.NcBHT4eZ38mktYE00Ah5eJJWxzeod%2Bjocnx1WrnGV0I'
      }
    });
    const html = response.data;

    // Load the full HTML content into Cheerio
    const $ = cheerio.load(html);

    // Fix relative URLs for assets (CSS, JS, images)
    $('link[rel="stylesheet"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('/')) {
        $(el).attr('href', `http://localhost${href}`);
      }
    });
    
    $('script').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('/')) {
        $(el).attr('src', `http://localhost${src}`);
      }
    });

    $('img').each((i, el) => {
      const src = $(el).attr('src');
      if (src && src.startsWith('/')) {
        $(el).attr('src', `http://localhost${src}`);
      }
    });

    // Render the full page (includes head, body, and scripts)
    res.send($.html());

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
    // Fetch yearbooks from WordPress
    const response = await axios.get('http://localhost/wordpress/wp-json/myplugin/v1/flipbooks');
    const yearbooks = response.data;

    // Save yearbooks to MongoDB
    for (const yearbook of yearbooks) {
      // Check if the yearbook already exists in the database
      const existingYearbook = await Yearbook.findOne({ id: yearbook.id });

      if (!existingYearbook) {
        // Save new yearbook to MongoDB
        await Yearbook.create({
          id: yearbook.id,
          title: yearbook.title,
          status: 'pending', // Default status
        });
      }
    }
    const mostViewedYearbooks = await Yearbook.find({ status: 'published' })
    .sort({ views: -1 }) // Sort by views in descending order
    .limit(3); // Limit to 3 yearbooks

    // Fetch all yearbooks from MongoDB, grouped by status
    const publishedYearbooks = await Yearbook.find({ status: 'published' });
    const pendingYearbooks = await Yearbook.find({ status: 'pending' });

    // Render the admin dashboard with published and pending yearbooks
    res.render(path.join(__dirname, 'public', 'student', 'index'), { publishedYearbooks, pendingYearbooks,mostViewedYearbooks, onlineUsers  });
  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});
//
app.get('/studentyearbook/:id', async (req, res) => {
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
    res.render('studentyearbook', { bodyContent });

    // Optionally log the activity
    await logActivity(yearbookId._id, 'Student View Yearbook', `Yearbook ${yearbookId} viewed successfully`);

  } catch (error) {
    console.error('Error fetching yearbook content:', error);
    res.status(500).json({ message: 'Error fetching yearbook' });
  }
});

async function fetchFlipbooks() {
  try {
    const response = await axios.get('http://localhost/wordpress/wp-json/myplugin/v1/flipbooks', {
      withCredentials: true,
    });
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

async function yearbooks(){
  // Fetch all yearbooks from the API
const response = await axios.get('http://localhost/wordpress/wp-json/myplugin/v1/flipbooks');
const fetchedYearbooks = response.data;

// Fetch all yearbooks currently in the database
const existingYearbooks = await Yearbook.find({});

// Create a set of fetched yearbook IDs for easy lookup
const fetchedYearbookIds = new Set(fetchedYearbooks.map((yearbook) => yearbook.id));

// Remove yearbooks from the database that are not in the fetched data
for (const existingYearbook of existingYearbooks) {
  if (!fetchedYearbookIds.has(existingYearbook.id)) {
    // If the yearbook is not in the fetched list, remove it from the database
    await Yearbook.deleteOne({ id: existingYearbook.id });
  }
}

// Add new yearbooks from the fetched data that do not exist in the database
for (const yearbook of fetchedYearbooks) {
  const existingYearbook = await Yearbook.findOne({ id: yearbook.id });

  if (!existingYearbook) {
    // If the yearbook doesn't exist in the database, create it
    await Yearbook.create({
      id: yearbook.id,
      title: yearbook.title,
      status: 'pending',
      thumbnail: yearbook.thumbnail,
    });
  }
}

};

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
