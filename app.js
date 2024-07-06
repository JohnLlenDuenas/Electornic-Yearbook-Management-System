const express = require('express');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const { MongoClient } = require('mongodb');

const app = express();
const port = 3000;

// MongoDB connection string
const uri = "mongodb://localhost:27017";
const client = new MongoClient(uri);

// Encryption key and IV
const encryptionKey = '3f8d9a7b6c2e1d4f5a8b9c7d6e2f1a3b'; // Must be 32 bytes (256 bits)
const iv = 'A1B2C3D4E5F6G7H8'; // Initialization vector

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

// Function to create unique index on studentNumber
const createUniqueStudentNumberIndex = async () => {
  try {
    await client.connect();
    const database = client.db('EYBMS_DB');
    const users = database.collection('users');
    await users.createIndex({ studentNumber: 1 }, { unique: true });
    console.log("Unique index created on studentNumber");
  } catch (error) {
    console.error("Error creating unique index on studentNumber:", error);
  } finally {
    await client.close();
  }
};

// Call createUniqueStudentNumberIndex function to create the unique index
createUniqueStudentNumberIndex();

// Create account route
app.post('/create-account', async (req, res) => {
  const { studentNumber, email, password, accountType } = req.body;

  try {
    // Encrypt the password
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
    let encryptedPassword = cipher.update(password, 'utf8', 'hex');
    encryptedPassword += cipher.final('hex');

    // Connect to MongoDB
    await client.connect();
    const database = client.db('EYBMS_DB');
    const users = database.collection('users');

    // Insert the new user
    const newUser = {
      studentNumber,
      email,
      password: encryptedPassword,
      accountType,
      iv: iv.toString('hex')
    };

    await users.insertOne(newUser);

    res.status(201).json({ message: 'Account created successfully' });
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ message: 'Account with this student number already exists' });
    } else {
      console.error("Error creating account:", error);
      res.status(500).json({ message: 'Error creating account' });
    }
  } finally {
    await client.close();
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { studentNumber, password } = req.body;

  try {
    // Connect to MongoDB
    await client.connect();
    const database = client.db('EYBMS_DB');
    const users = database.collection('users');

    // Find user by student number
    const user = await users.findOne({ studentNumber });

    if (!user) {
      return res.status(400).json({ message: 'Invalid student number or password' });
    }

    // Use the stored IV for decryption
    const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, iv);
    let decryptedPassword = decipher.update(user.password, 'hex', 'utf8');
    decryptedPassword += decipher.final('utf8');

    if (decryptedPassword === password) {
      req.session.user = user; // Store user information in session

      let redirectUrl = '';
      if (user.accountType === 'student') {
        redirectUrl = 'consent/index.html';
      } else if (user.accountType === 'admin') {
        redirectUrl = 'admin/index.html';
      }

      res.status(200).json({ message: 'Login successful', redirectUrl: redirectUrl });
    } else {
      res.status(400).json({ message: 'Invalid student number or password' });
    }
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: 'Error logging in' });
  } finally {
    await client.close();
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

// Start the server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
