const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/materials', requireAuth, (_req, res) => res.send('materials ok'));

module.exports = router;
