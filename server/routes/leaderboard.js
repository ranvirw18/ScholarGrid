const express = require('express');
const router = express.Router();

function auth() { return (req, res, next) => req.app.locals.authenticateJWT(req, res, next); }
function roles(r) { return (req, res, next) => req.app.locals.requireRoles(r)(req, res, next); }

const getTier = (pts) => {
  if (pts >= 3000) return 'Elite';
  if (pts >= 2000) return 'Gold';
  if (pts >= 1000) return 'Silver';
  return 'Bronze';
};

// GET /api/leaderboard
router.get('/', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = parseInt(req.query.limit, 10) || 50;
    const students = await db.getLeaderboard(limit);

    const leaderboard = students.map((row, i) => ({
      id: row.id,
      name: row.full_name || 'Unknown',
      avatar: row.avatar_url,
      score: row.points || 0,
      points: row.points || 0,
      role: row.role,
      about: row.about || '',
      tier: getTier(row.points || 0),
      rank: i + 1,
      uploads: 0,
      downloads: 0,
      joinedAt: row.created_at ? row.created_at.split('T')[0] : '',
    }));

    res.json(leaderboard);
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/leaderboard/:userId/history
router.get('/:userId/history', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const history = await db.getLeaderboardHistory(req.params.userId);
    res.json(history);
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/leaderboard/points
router.post('/points', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { studentId, points, reason } = req.body;
    if (!studentId || points === undefined || !reason) return res.status(400).json({ error: 'Missing required fields' });

    const dbReason = points > 0 ? 'admin_bonus' : 'penalty';
    const result = await db.addLeaderboardPoints(studentId, points, dbReason, req.user.id);
    if (!result) return res.status(404).json({ error: 'Student not found' });

    res.json({ success: true, id: result.id, points });
  } catch (err) {
    console.error('Points error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
