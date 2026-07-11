function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Silakan login dulu');
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    req.flash('error', 'Akses admin saja');
    return res.redirect('/');
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
