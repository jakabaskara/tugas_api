require('dotenv').config();

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tugas_api',
  sessionSecret: required('SESSION_SECRET'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  quizDurationMs: 10 * 60 * 1000,
  questionsPerMaterial: 100,
  questionsPerQuiz: 10,
  maxPdfChars: 60000,
};
