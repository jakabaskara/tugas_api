const bcrypt = require('bcryptjs');
const { connectDb } = require('../db');
const User = require('../models/User');
const config = require('../config');

async function main() {
  await connectDb();
  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  const user = await User.findOneAndUpdate(
    { username: config.adminUsername },
    { username: config.adminUsername, passwordHash, role: 'admin' },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('Admin ready:', user.username);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
