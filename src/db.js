const mongoose = require('mongoose');
const config = require('./config');

async function connectDb() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongodbUri);
  return mongoose.connection;
}

module.exports = { connectDb };
