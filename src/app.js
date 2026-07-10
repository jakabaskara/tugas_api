const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const config = require('./config');

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
    })
  );
  app.use(flash());

  app.get('/health', (_req, res) => {
    res.send('ok');
  });

  return app;
}

module.exports = { createApp };
