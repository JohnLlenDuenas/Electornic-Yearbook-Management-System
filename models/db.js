
const mongoose = require('mongoose');

let isConnected = null; 

async function connectToDatabase() {
  if (isConnected) {
    console.log("Using existing database connection");
    return mongoose;
  }

  console.log("Creating a new database connection");
  const db = await mongoose.connect('mongodb+srv://vercel-admin-user:johnllenvercel@cluster0.pgaelxg.mongodb.net/EYBMS_DB?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10, 
  });

  isConnected = db.connections[0].readyState;
  return mongoose;
}

module.exports = connectToDatabase;
