const express = require('express');
const Attempt = require('../models/Attempt');

const router = express.Router();

router.get('/me', async (req, res, next) => {
  try {
    const attempts = await Attempt.find({
      userId: req.session.user.id,
      status: 'submitted',
    })
      .populate('materialId', 'title')
      .sort({ submittedAt: -1 });

    res.render('reports/me', { attempts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
