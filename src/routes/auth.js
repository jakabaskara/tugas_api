const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

router.get('/register', (_req, res) => {
  res.render('auth/register');
});

router.post('/register', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      req.flash('error', 'Username dan password wajib diisi');
      return res.redirect('/register');
    }

    if (await User.findOne({ username })) {
      req.flash('error', 'Username sudah digunakan');
      return res.redirect('/register');
    }

    const user = await new User({
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role: 'user',
    }).save();

    req.session.user = { id: user._id.toString(), username: user.username, role: user.role };
    res.redirect('/materials');
  } catch (err) {
    if (err.code === 11000) {
      req.flash('error', 'Username sudah digunakan');
      return res.redirect('/register');
    }
    next(err);
  }
});

router.get('/login', (_req, res) => {
  res.render('auth/login');
});

router.post('/login', async (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      req.flash('error', 'Username atau password salah');
      return res.redirect('/login');
    }

    req.session.user = { id: user._id.toString(), username: user.username, role: user.role };
    res.redirect(user.role === 'admin' ? '/admin/materials' : '/materials');
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
