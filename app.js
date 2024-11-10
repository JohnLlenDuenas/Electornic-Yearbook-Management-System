const express = require('express');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cron = require('node-cron');
const bodyParser = require('body-parser');
const cheerio = require('cheerio');
const session = require('express-session');
const mongoose = require('mongoose');
const FormData = require('form-data');
const MongoStore = require('connect-mongo');
const { ObjectId } = mongoose.Types;
const Student = require('./models/Student');
const ConsentForm = require('./models/ConsentForm');
const ActivityLog = require('./models/ActivityLogs'); 
const Yearbook = require('./models/Yearbook');
const multer = require('multer');
const csvParser = require('csv-parser');
const mysql = require('mysql2/promise');
const fs = require('fs');
const sharp = require('sharp');
const cors = require('cors');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const corsOptions = {
  origin: 'https://eybms.infinityfreeapp.com/wordpress/', // Replace with your front-end domain
  methods: ['POST','GET'], // Allow only POST requests
  allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));  
  }
});

const upload = multer({ storage: storage });

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


app.use('/uploads', express.static('uploads'));


app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));





const uri = "mongodb+srv://johnllentv:johnllentv@cluster0.pgaelxg.mongodb.net/EYBMS_DB";

mongoose.connect(uri).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('Error connecting to MongoDB', err);
});


app.use(express.json());

app.use(session({
  secret: '3f8d9a7b6c2e1d4f5a8b9c7d6e2f1a3b',
  resave: false,
  saveUninitialized: true,
  store: MongoStore.create({ mongoUrl: 'mongodb+srv://johnllentv:johnllentv@cluster0.pgaelxg.mongodb.net/EYBMS_DB' }),
  rolling: true,
  cookie: {
    maxAge: 15 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
  }
}));


app.use(async (req, res, next) => {
  if (req.session.user) {
    await Student.findByIdAndUpdate(req.session.user._id, { lastActive: new Date() });
  }
  next();
});

const countOnlineUsers = async () => {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const result = await Student.aggregate([
    { $match: { lastActive: { $gte: fifteenMinutesAgo } } },
    { $group: { _id: "$accountType", count: { $sum: 1 } } }
  ]);

  const onlineUsers = { student: 0, committee: 0, admin: 0 };
  result.forEach(({ _id, count }) => {
    onlineUsers[_id] = count;
  });
  return onlineUsers;
};

app.use(express.static(path.join(__dirname, 'public')));

const checkAuthenticated = (req, res, next) => {
  if (req.session.user) {
    if (Date.now() > req.session.cookie.expires) {
      req.session.destroy((err) => {
        if (err) return next(err);
        res.redirect('/login'); 
      });
    } else {
      next();
    }
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

  ActivityLog.find({}, (err, logs) => {
    if (err) {
      console.error('Error fetching logs:', err);
    } else {
      socket.emit('initialLogs', logs);
    }
  });

  cron.schedule('*/1 * * * *', async () => {
    try {
      const newLogs = await ActivityLog.find({ timestamp: { $gt: lastLogTimestamp } });

      if (newLogs.length > 0) {
        lastLogTimestamp = newLogs[newLogs.length - 1].timestamp;

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


async function logActivity(userId, action, details) {
  try {
    const objectId = ObjectId.isValid(userId) ? new ObjectId(userId) : userId;

    const log = new ActivityLog({
      userId: userId || null,
      action,
      details,
      timestamp: new Date(),
    });

    await log.save();
    console.log('Activity logged successfully');
  } catch (error) {
    console.error('Error logging activity:', error);
    throw error;
  }
}

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

app.get('/login', (req, res) => {
  res.render(path.join(__dirname, 'public', 'login'));
});

app.get('/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ isAuthenticated: true, userRole: req.session.user.accountType });
  } else {
    res.json({ isAuthenticated: false });
  }
});

app.use('/admin', checkAuthenticated, ensureRole(['admin']), express.static(path.join(__dirname, 'public', 'admin')));
app.use('/student', checkAuthenticated, ensureRole(['student']), express.static(path.join(__dirname, 'public', 'student')));
app.use('/committee', checkAuthenticated, ensureRole(['committee']), express.static(path.join(__dirname, 'public', 'committee')));
app.use('/consent', checkAuthenticated, ensureRole(['student']), express.static(path.join(__dirname, 'public', 'consent')));

function getCurrentDateTime() {
  const now = new Date();
  const date = now.toLocaleDateString();
  const time = now.toLocaleTimeString();
  return `${date} ${time}`;
}

app.use('/js', express.static(path.join(__dirname, 'public', 'assets', 'js')));
app.use('/js', express.static(path.join(__dirname, 'public', 'assets', 'js', 'stable')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));



app.post('/consent-fill', async (req, res) => {
  const dateTime = getCurrentDateTime();
  const { student_Number, student_Name, gradeSection, parentguardian_name, relationship, contactno, formStatus } = req.body;

  try {
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

    await consentFormData.save();

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

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
    decryptedPassword += decipher.final('utf8');

    if (decryptedPassword !== currentPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encryptedPassword = cipher.update(newPassword, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    await Student.findByIdAndUpdate(user._id, { password: encryptedPassword });

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.post('/create-account', upload.single('picture'), async (req, res) => {
  const { studentNumber, email, birthday, accountType } = req.body;
  const picturePath = req.file ? req.file.path : null;  // Save the file path

  try {
    const password = birthday.replace(/[-/]/g, '');
    const iv = crypto.randomBytes(16);
    const encryptionKey = crypto.randomBytes(32);
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encryptedPassword = cipher.update(password, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    const newUser = new Student({
      studentNumber,
      email,
      password: encryptedPassword,
      birthday,
      accountType,
      iv: iv.toString('hex'),
      key: encryptionKey.toString('hex'),
      consentfilled: false,
      passwordChanged: false,
      picture: picturePath  
    });

    await newUser.save();
    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    console.error('Error details:', error);
    res.status(500).json({ message: 'Error creating account' });
  }
});



app.post('/reset-password/:id', checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  const { id } = req.params;

  try {
    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const birthday = student.birthday;
    if (!birthday) {
      return res.status(400).json({ message: 'Birthday not found for this student' });
    }

    const formattedBirthday = birthday.replace(/[-/]/g, '');
    console.log('Student Key:', student.key);
    console.log('Student IV:', student.iv);

    if (!student.key || student.key.length !== 64) {
      return res.status(500).json({ message: 'Stored encryption key is invalid or corrupted' });
    }
    if (!student.iv || student.iv.length !== 32) { 
      return res.status(500).json({ message: 'Stored initialization vector (IV) is invalid or corrupted' });
    }
    const keyBuffer = Buffer.from(student.key, 'hex');
    const ivBuffer = Buffer.from(student.iv, 'hex');

    console.log('Key Buffer:', keyBuffer);
    console.log('IV Buffer:', ivBuffer);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, ivBuffer);
    let encrypted = cipher.update(formattedBirthday, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    console.log('Encrypted password:', encrypted);

    student.password = encrypted;
    student.passwordChanged = false;

    await student.save();
    await logActivity(student._id, 'Password reset successfully for student ID:' + id, 'Password reset successfully for student ID:' + id + ' successfully');
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
    const user = await Student.findOne({ studentNumber: req.session.user.studentNumber });

    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    const iv = Buffer.from(user.iv, 'hex');
    const key = Buffer.from(user.key, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
    decryptedPassword += decipher.final('utf8');

    if (decryptedPassword !== currentPassword) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const newIv = crypto.randomBytes(16);
    const newEncryptionKey = crypto.randomBytes(32);
    const cipher = crypto.createCipheriv('aes-256-cbc', newEncryptionKey, newIv);
    let encryptedPassword = cipher.update(newPassword, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    user.password = encryptedPassword;
    user.iv = newIv.toString('hex');
    user.key = newEncryptionKey.toString('hex');
    user.passwordChanged = true;

    await user.save();

    await logActivity(user._id, 'Changed Password', 'Password changed successfully');
    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ message: 'Error changing password' });
  }
});


app.post('/upload-csv', upload.fields([
  { name: 'csvFile', maxCount: 1 },
  { name: 'pictures', maxCount: 20 }
]), (req, res) => {
  const csvFilePath = path.join(__dirname, 'uploads', req.files['csvFile'][0].filename);

  const pictureFiles = req.files['pictures'];
  const picturePaths = {};
  if (pictureFiles) {
    pictureFiles.forEach(file => {
      const filePath = `uploads/pictures/${file.filename}`;
      picturePaths[file.originalname] = filePath;
    });
  }

  const accounts = [];
  
  fs.createReadStream(csvFilePath)
    .pipe(csvParser())
    .on('data', (row) => {
      const { studentNumber, email, birthday, accountType, picture } = row;

      const password = birthday.replace(/[-/]/g, '');
      
      const iv = crypto.randomBytes(16);
      const encryptionKey = crypto.randomBytes(32);
      const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
      let encryptedPassword = cipher.update(password, 'utf8', 'hex');
      encryptedPassword += cipher.final('hex');

      const picturePath = picture ? picturePaths[picture] || null : null;

      accounts.push({
        studentNumber,
        email,
        password: encryptedPassword,
        birthday,
        accountType,
        iv: iv.toString('hex'),
        key: encryptionKey.toString('hex'),
        consentfilled: false,
        passwordChanged: false,
        picture: picturePath  
      });
    })
    .on('end', async () => {
      try {
        for (const account of accounts) {
          const newUser = new Student(account);
          await newUser.save();
          await logActivity(newUser._id, 'Batch account created', 'Account created successfully');
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
      fs.unlinkSync(csvFilePath);
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

    const secret = speakeasy.generateSecret({ length: 20 });
    console.log("Generated secret for user:", secret.base32);

    const otpauthUrl = `otpauth://totp/E-Yearbook_MS:${user.studentNumber}?secret=${secret.base32}&issuer=ElectronicYearbookManagementSystem`;


    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
    console.log("Generated QR Code URL:", qrCodeUrl);

    user.twoFactorSecret = secret.base32;
    await user.save();
    console.log("Saved secret for user:", user.studentNumber, user.twoFactorSecret);

    res.render('setup-2fa', { qrCodeUrl });

  } catch (error) {
    console.error('Error setting up 2FA:', error);
    res.status(500).json({ message: 'Error setting up 2FA' });
  }
});

app.post('/verify-2fa', async (req, res) => {
  console.log('Request body:', req.body);
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
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token,
      window: 1
    });

    if (verified) {
      user.twoFactorEnabled = true;
      await user.save();

      await logActivity(user._id, '2FA setup successful', `Admin ${user.studentNumber}  2FA setup successful`);
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

app.post('/loginroute', cors(corsOptions), async (req, res) => {
  const { studentNumber, password, token } = req.body;

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
      if (user.accountType === 'admin' && user.twoFactorEnabled) {
        if (!token) {
          return res.status(200).json({ message: '2FA required' });
        }

        const verified = speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: 'base32',
          token: token,
          window: 1  
        });

        if (!verified) {
          return res.status(400).json({ message: 'Invalid 2FA token' });
        }
      }

      req.session.user = user;

      let redirectUrl = '';
      let action = '';

      if (user.accountType === 'student') {
        if (!user.passwordChanged) {
          redirectUrl = '../change_password/index.html';
          action = 'Student redirected to change password page';
          
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

app.post('/logout', cors(corsOptions), (req, res) => {
  
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }
    res.status(200).json({ message: 'Logout successful' });
  });
  
});

app.get('/consentformfetch', cors(corsOptions), checkAuthenticated, ensureRole(['admin', 'committee']), async (req, res) => {
  try {
    const consentForms = await ConsentForm.find();
    await logActivity(req.session.user ? req.session.user._id : null, 'Fetch consent form data');
    res.json(consentForms);
  } catch (err) {
    await logActivity(null, 'Error fetching consent forms', err.message);
    res.status(500).json({ error: 'Failed to fetch consent forms' });
  }
});

app.get('/students', cors(corsOptions), checkAuthenticated, ensureRole(['admin' , 'committee']), async (req, res) => {
  try {
    const students = await Student.find({ accountType: 'student' });
    res.json(students);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
  
});
app.get('/comittee', cors(corsOptions), checkAuthenticated, ensureRole(['admin','committee']), async (req, res) => {
  try {
    const comittee = await Student.find({ accountType: 'committee' });
    res.json(comittee);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/admin/yearbooks', cors(corsOptions), checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    yearbooks();
    const onlineUsers = await countOnlineUsers();
    const user = await Student.findById(req.session.user);
    const yearbook = await Yearbook.find();
    const mostViewedYearbooks = await Yearbook.find({ status: 'published' })
      .sort({ views: -1 })
      .limit(3);
    const publishedYearbooks = await Yearbook.find({ status: 'published' });
    const pendingYearbooks = await Yearbook.find({ status: 'pending' });
    const calendar = await Yearbook.find({ consentDeadline: { $exists: true } });

    const userId = req.session.user._id; 
    const accountType = req.session.user.accountType;

    const allowedActions = [
      'Logged in as committee',
      'Logged in as admin',
      'Yearbook Published',
      'Yearbook Pending',
      '2FA setup successful'
    ];

    let activityLogs = [];

    if (accountType === 'admin' || accountType === 'committee') {
      activityLogs = await ActivityLog.find({
        viewedBy: { $ne: userId },
        action: { $in: allowedActions }
      }).sort({ timestamp: -1 }).limit(5);

      await Promise.all(activityLogs.map(log => {
        if (!log.viewedBy) {
          log.viewedBy = [];
        }
        log.viewedBy.push(userId);
        return log.save();
      }));
    }

    res.render(path.join(__dirname, 'public', 'admin', 'index'), {
      activityLogs,
      publishedYearbooks,
      pendingYearbooks,
      onlineUsers,
      mostViewedYearbooks,
      user,
      yearbook,
      calendar
    });

  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});


app.get('/yearbook/:id', cors(corsOptions), async (req, res) => {
  try {
    const yearbookId = req.params.id;
    const url = `https://eybms.infinityfreeapp.com/wordpress/3d-flip-book/${yearbookId}/`;
    
    const yearbook = await Yearbook.findOne({ id: yearbookId });
    if (!yearbook) {
      return res.status(404).json({ message: 'Yearbook not found' });
    }
    yearbook.views += 1;
    yearbook.lastViewed = Date.now();
    await yearbook.save();
    const response = await axios.get(url);
    const html = response.data;

    const $ = cheerio.load(html);
    const bodyContent = $('body').html();

    res.render('yearbook', { bodyContent });

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

    const inactiveYearbooks = await Yearbook.find({
      lastViewed: { $lt: sixMonthsAgo },
      status: 'published'
    });

    inactiveYearbooks.forEach(async (yearbook) => {
      yearbook.status = 'pending';
      await yearbook.save();
      console.log(`Yearbook ${yearbook.title} has been unpublished due to inactivity.`);
    });
  } catch (error) {
    console.error('Error running cron job to unpublish inactive yearbooks:', error);
  }
});

app.post('/yearbook/:id/publish', cors(corsOptions), checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    const yearbookId = req.params.id;

    await Yearbook.findOneAndUpdate({ id: yearbookId }, { status: 'published' });

    await logActivity(yearbookId._id, 'Yearbook Published', `Yearbook ${yearbookId} published successfully`);

    res.redirect('/admin/yearbooks');
  } catch (error) {
    console.error('Error publishing yearbook:', error);
    res.status(500).json({ message: 'Error publishing yearbook' });
  }
});

app.post('/yearbook/:id/pending', cors(corsOptions), checkAuthenticated, ensureRole(['admin']), async (req, res) => {
  try {
    const yearbookId = req.params.id;
    await Yearbook.findOneAndUpdate({ id: yearbookId }, { status: 'pending' });
    await logActivity(yearbookId._id, 'Yearbook Pending', `Yearbook ${yearbookId} pending successfully`);

    res.redirect('/admin/yearbooks');
  } catch (error) {
    console.error('Error pending yearbook:', error);
    res.status(500).json({ message: 'Error pending yearbook' });
  }
});

app.get('/comittee/yearbooks', cors(corsOptions), checkAuthenticated, ensureRole(['committee']), async (req, res) => {
  try {

    yearbooks();
    const user = await Student.findById(req.session.user);
    const onlineUsers = await countOnlineUsers();
    const mostViewedYearbooks = await Yearbook.find({ status: 'published' })
    .sort({ views: -1 })
    .limit(3);
    
    const publishedYearbooks = await Yearbook.find({ status: 'published' });
    const pendingYearbooks = await Yearbook.find({ status: 'pending' });

    const userId = req.session.user._id;
    const accountType = req.session.user.accountType; 

    const allowedActions = [
      'Logged in as committee',
      'Yearbook Published',
      'Yearbook Pending'
    ];

    if (accountType === 'admin' || accountType === 'committee') {
      const activityLogs = await ActivityLog.find({
        viewedBy: { $ne: userId },
        action: { $in: allowedActions } 
      }).sort({ timestamp: -1 }).limit(5);

      await Promise.all(activityLogs.map(log => {
        if (!log.viewedBy) {
          log.viewedBy = [];
        }
        log.viewedBy.push(userId);
        return log.save();
      }));

      res.render(path.join(__dirname, 'public', 'comittee', 'index'), { activityLogs, publishedYearbooks, pendingYearbooks, onlineUsers, mostViewedYearbooks, user });
    } else {
      res.render(path.join(__dirname, 'public', 'comittee', 'index'), { activityLogs: [], publishedYearbooks, pendingYearbooks, onlineUsers, mostViewedYearbooks, user });
    }
  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});

app.get('/comitteeyearbook/:id', cors(corsOptions), checkAuthenticated, ensureRole(['committee']), async (req, res) => {
  try {
    const yearbookId = req.params.id;
    const url = 'https://eybms.infinityfreeapp.com/wordpress/wp-admin/edit.php?post_type=3d-flip-book';
    
    const yearbook = await Yearbook.findOne({ id: yearbookId });
    if (!yearbook) {
      return res.status(404).json({ message: 'Yearbook not found' });
    }
    yearbook.views += 1;
    yearbook.lastViewed = Date.now();
    await yearbook.save();

    const response = await axios.get(url, {
      headers: {
        Cookie: 'wordpress_logged_in_bbfa5b726c6b7a9cf3cda9370be3ee91=root%7C1729738427%7CfVkaxMbMFZHhLX7hkxBg2fwUCqs4xzbA64eEz0i2cnb%7C669838cbfedeb39f1e0d9423e8808823f1ebcb063bc486c6b195f4580a61c158; wordpress_bbfa5b726c6b7a9cf3cda9370be3ee91=root%7C1729738427%7CfVkaxMbMFZHhLX7hkxBg2fwUCqs4xzbA64eEz0i2cnb%7C11364a94f3548b33a5ad1ed5d269543a1892e153a93c2353e966b3da90e56437; connect.sid=s%3AymPR7RCCbnt3OYAo3U9NSul6EyawUrlK.NcBHT4eZ38mktYE00Ah5eJJWxzeod%2Bjocnx1WrnGV0I'
      }
    });
    const html = response.data;

    const $ = cheerio.load(html);

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

    res.send($.html());

    await logActivity(yearbookId._id, 'Admin View Yearbook', `Yearbook ${yearbookId} viewed successfully`);

  } catch (error) {
    console.error('Error fetching yearbook content:', error);
    res.status(500).json({ message: 'Error fetching yearbook' });
  }
});

app.get('/consent/students', cors(corsOptions), checkAuthenticated, ensureRole(['student']), async (req, res) => {
  const studentNumber = req.session.user.studentNumber; 
  res.render(path.join(__dirname, 'public', 'consent', 'index'), { studentNumber });
});

app.get('/consents/:studentNumber', cors(corsOptions), async (req, res) => {
  try {
    const consentForm = await ConsentForm.findOne({ student_Number: req.params.studentNumber });
    
    if (consentForm) {
      res.render(path.join(__dirname, 'public', 'consent-view', 'index'), { consentForm });
    } else {
      res.status(404).render(path.join(__dirname, 'public', 'consent-view', 'index'), { consentForm: null });
    }
  } catch (error) {
    console.error('Error fetching consent form:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/consent/:studentNumber', cors(corsOptions), async (req, res) => {
  try {
    const consentForm = await ConsentForm.findOne({ student_Number: req.params.studentNumber });
    if (consentForm) {
      res.json(consentForm);
    } else {
      res.status(404).json({ message: 'Consent form not found' });
    }
  } catch (error) {
    console.error('Error fetching consent form:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
app.get('/student/yearbooks', cors(corsOptions), checkAuthenticated, ensureRole(['student']), async (req, res) => {
  try {
    const onlineUsers = await countOnlineUsers();
    const studentId = req.session.user._id;
    const student = await Student.findById(studentId);
    const consentForm = await ConsentForm.findOne({ student_Number: student.studentNumber });
    const yearbook = await Yearbook.find();
    const calendar = await Yearbook.find({ consentDeadline: { $exists: true } });
    const stuNum = student.studentNumber;
    const response = await axios.get('https://eybms.infinityfreeapp.com/wordpress/wp-json/myplugin/v1/flipbooks');
    const yearbooks = response.data;

    for (const yearbook of yearbooks) {
      const existingYearbook = await Yearbook.findOne({ id: yearbook.id });
      if (!existingYearbook) {
        await Yearbook.create({ id: yearbook.id, title: yearbook.title, status: 'pending' });
      }
    }

    const mostViewedYearbooks = await Yearbook.find({ status: 'published' })
      .sort({ views: -1 })
      .limit(3);
    const publishedYearbooks = await Yearbook.find({ status: 'published' });
    const pendingYearbooks = await Yearbook.find({ status: 'pending' });
    
    let picturePath = null;
    if (student && student.picture) {
      picturePath = student.picture;
    }

    res.render(path.join(__dirname, 'public', 'student', 'index'), {
      publishedYearbooks,
      pendingYearbooks,
      mostViewedYearbooks,
      onlineUsers,
      consentStatus: student.consentfilled,
      formStatus: consentForm ? consentForm.form_Status : null,
      yearbook, 
      calendar,
      stuNum,
      picturePath
    });
  } catch (error) {
    console.error('Error fetching yearbooks:', error);
    res.status(500).json({ message: 'Error fetching yearbooks' });
  }
});

app.get('/student/get-picture', cors(corsOptions), checkAuthenticated, ensureRole(['student']), async (req, res) => {
  try {
    const studentId = req.session.user._id;
    const student = await Student.findById(studentId);
    
    if (student && student.picture) {
      res.json({ picturePath: student.picture });
    } else {
      res.json({ picturePath: null });
    }
  } catch (error) {
    console.error('Error fetching student picture:', error);
    res.status(500).json({ message: 'Error fetching student picture' });
  }
});

app.get('/studentyearbook/:id', async (req, res) => {
  try {
    const yearbookId = req.params.id;
    const url = `https://eybms.infinityfreeapp.com/wordpress/3d-flip-book/${yearbookId}/`;
    
    const response = await axios.get(url);
    const html = response.data;

    const $ = cheerio.load(html);

    const bodyContent = $('body').html();

    res.render('studentyearbook', { bodyContent });

    await logActivity(yearbookId._id, 'Student View Yearbook', `Yearbook ${yearbookId} viewed successfully`);

  } catch (error) {
    console.error('Error fetching yearbook content:', error);
    res.status(500).json({ message: 'Error fetching yearbook' });
  }
});

const connection  = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: null,
  database: 'yearbook_db',
});

const WORDPRESS_URL = 'https://eybms.infinityfreeapp.com/wordpress/wp-json/wp/v2/media';
const WORDPRESS_USERNAME = 'root';
const WORDPRESS_APPLICATION_PASSWORD = 'CPm7 FA4m G1L5 XOd1 1mdT Aysr';


cron.schedule('*/1 * 0-1 * * *', cors(corsOptions), async () => {
  try {
    const acceptedConsentForms = await ConsentForm.find({ form_Status: 'Accepted' });

    for (const consentForm of acceptedConsentForms) {
      const student = await Student.findOne({
        studentNumber: consentForm.student_Number,
        consentfilled: true,
        pictureUploaded: false
      });

      if (!student) continue;

      const placeholderImagePath = path.join(__dirname, student.picture.replace(/\\/g, '/'));
      const studentNumber = student.studentNumber;
      let imgBuffer;

      if (student.picture && student.picture.includes('base64,')) {
        const base64Image = student.picture.split('base64,')[1];
        imgBuffer = Buffer.from(base64Image, 'base64');
      } else {
        console.warn(`Using placeholder image for student ${studentNumber} due to missing or invalid picture data.`);
        imgBuffer = fs.readFileSync(placeholderImagePath);
      }

      if (imgBuffer.length < 1000) {
        console.error(`Buffer size too small for student ${studentNumber}. Skipping.`);
        continue;
      }

      const filePath = path.join(__dirname, `${studentNumber}.jpg`);
      try {
        await sharp(imgBuffer).toFormat('jpeg').toFile(filePath);
        console.log(`Image processed and saved for student ${studentNumber}`);

        const formData = new FormData();
        formData.append('file', fs.createReadStream(filePath), `${studentNumber}.jpg`);
        formData.append('title', `Student ${studentNumber}`);

        const auth = Buffer.from(`${WORDPRESS_USERNAME}:${WORDPRESS_APPLICATION_PASSWORD}`).toString('base64');

        const response = await axios.post(WORDPRESS_URL, formData, {
          headers: {
            'Authorization': `Basic ${auth}`,
            ...formData.getHeaders()
          }
        });

        await Student.updateOne(
          { _id: student._id },
          { $set: { pictureUploaded: true } }
        );


        setTimeout(() => {
          try {
            fs.unlinkSync(filePath);
            console.log(`Uploaded Picture of ${studentNumber}`);
          } catch (unlinkError) {
            console.error(`Failed to delete temporary file for student ${studentNumber}:`, unlinkError);
          }
        }, 500);
      } catch (uploadError) {
        console.error(`Failed to upload image for student ${studentNumber}:`, uploadError);
      }
    }
  } catch (error) {
    console.error('Error in cron job:', error);
  }
});


app.post('/submit-consent', cors(corsOptions), async (req, res) => {
  const { studentNumber, consentStatus } = req.body;

  try {
    const student = await Student.findOne({ studentNumber });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    if (consentStatus === 'agree' && student.picture) {
      const query = `INSERT INTO student_pictures (student_number, picture) VALUES (?, ?)`;
      connection.query(query, [student.studentNumber, student.picture], (err, result) => {
        if (err) {
          console.error('Error inserting picture into MySQL:', err);
          return res.status(500).json({ message: 'Error uploading picture to MySQL' });
        }

        student.consentfilled = true;
        student.save();

        res.status(200).json({ message: 'Consent submitted and picture uploaded successfully' });
      });
    } else {
      res.status(400).json({ message: 'Consent not agreed or no picture available' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error processing consent' });
  }
});

app.post('/set-deadline', cors(corsOptions), async (req, res) => {
  const { yearbookId, deadline } = req.body;
  try {
    const updatedYearbook = await Yearbook.findByIdAndUpdate(
      yearbookId,
      { consentDeadline: deadline },
      { new: true }
    );
    if (updatedYearbook) {
      res.status(200).json({ message: 'Deadline set successfully!' });
    } else {
      res.status(404).json({ message: 'Yearbook not found.' });
    }
  } catch (error) {
    console.error('Error setting deadline:', error);
    res.status(500).json({ message: 'Error setting deadline.' });
  }
});

async function fetchFlipbooks() {
  try {
    const response = await axios.get('https://eybms.infinityfreeapp.com/wordpress/wp-json/myplugin/v1/flipbooks', {
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching flipbooks:', error);
    return [];
  }
}

fetchFlipbooks().then(flipbooks => {
  console.log(flipbooks);
});

async function yearbooks() {
  const response = await axios.get('https://eybms.infinityfreeapp.com/wordpress/wp-json/myplugin/v1/flipbooks');
  const fetchedYearbooks = response.data;

  const existingYearbooks = await Yearbook.find({});

  const fetchedYearbookIds = new Set(fetchedYearbooks.map((yearbook) => parseInt(yearbook.id)));

  for (const existingYearbook of existingYearbooks) {
    if (!fetchedYearbookIds.has(parseInt(existingYearbook.id))) {
      await Yearbook.deleteOne({ id: existingYearbook.id });
    }
  }

  for (const yearbook of fetchedYearbooks) {
    const existing = await Yearbook.findOne({ id: yearbook.id });

    const result = await Yearbook.updateOne(
      { id: yearbook.id },
      {
        title: yearbook.title,
        thumbnail: yearbook.thumbnail,
      },
      { upsert: true } 
    );

    if (!existing) {
      await logActivity(null, 'Yearbook', `Yearbook ${yearbook.id} has been added successfully`);
    }
  }
}

app.listen(port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
