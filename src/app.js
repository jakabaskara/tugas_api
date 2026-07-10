const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const config = require('./config');
const authRoutes = require('./routes/auth');
const materialsRoutes = require('./routes/materials');
const quizRoutes = require('./routes/quiz');
const adminRoutes = require('./routes/admin');
const { requireAuth, requireAdmin } = require('./middleware/auth');

function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: config.mongodbUri }),
    })
  );
  app.use(flash());
  app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    res.locals.messages = req.flash();
    next();
  });

  app.get('/health', (_req, res) => {
    res.send('ok');
  });

  app.use('/', authRoutes);
  app.use('/', materialsRoutes);
  app.use('/quiz', quizRoutes);
  app.use('/admin', requireAuth, requireAdmin, adminRoutes);

  return app;
}

module.exports = { createApp };
