const express = require('express');
const { requireAuth } = require('../middleware/auth');
const Material = require('../models/Material');

const router = express.Router();

router.get('/materials', requireAuth, async (_req, res, next) => {
  try {
    const materials = await Material.find({ status: 'ready' }).sort({ createdAt: -1 });
    res.render('materials/index', { materials });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
