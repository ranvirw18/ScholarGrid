const express = require('express');
const router = express.Router();

function auth() { return (req, res, next) => req.app.locals.authenticateJWT(req, res, next); }
function roles(r) { return (req, res, next) => req.app.locals.requireRoles(r)(req, res, next); }

// GET /api/analytics
router.get('/', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const analytics = await db.getAnalytics();
    res.json(analytics);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
