const { connectDb } = require('./db');
const { createApp } = require('./app');
const config = require('./config');

async function main() {
  await connectDb();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Listening on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
