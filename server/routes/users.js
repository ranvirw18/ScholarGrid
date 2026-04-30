const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

function auth() { return (req, res, next) => req.app.locals.authenticateJWT(req, res, next); }
function superadmin() { return (req, res, next) => req.app.locals.requireSuperAdmin(req, res, next); }
function roles(r) { return (req, res, next) => req.app.locals.requireRoles(r)(req, res, next); }

// GET /api/users — all users (superadmin / faculty)
router.get('/', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const users = await req.app.locals.db.getProfiles();
    const sorted = [...users].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    res.json(sorted.map(mapUser));
  } catch (err) { console.error('Fetch users error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/users/students
router.get('/students', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const students = await req.app.locals.db.getStudents();
    res.json(students.map(mapUser));
  } catch (err) { console.error('Fetch students error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/users/:id
router.put('/:id', auth(), async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user.id !== id && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });

    const profile = await req.app.locals.db.getProfileById(id);
    if (!profile) return res.status(404).json({ error: 'User not found' });

    const { full_name, about, avatar_url, points } = req.body;
    const updateData = {};
    if (full_name !== undefined) updateData.full_name = full_name;
    if (about !== undefined) updateData.about = about;
    if (avatar_url !== undefined) updateData.avatar_url = avatar_url;
    if (points !== undefined && req.user.role === 'superadmin') updateData.points = points;

    if (Object.keys(updateData).length) {
      updateData.updated_at = new Date().toISOString();
      await req.app.locals.db.updateProfile(id, updateData);
    }

    res.json({ success: true });
  } catch (err) { console.error('Update user error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/users/:id/warn
router.put('/:id/warn', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    await req.app.locals.db.incrementWarnings(req.params.id);
    res.json({ success: true });
  } catch (err) { console.error('Warn error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/users/:id/ban
router.put('/:id/ban', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const isBanned = req.body.banned ? true : false;
    await req.app.locals.db.toggleBan(req.params.id, isBanned);
    res.json({ success: true });
  } catch (err) { console.error('Ban error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// PUT /api/users/:id/role
router.put('/:id/role', auth(), superadmin(), async (req, res) => {
  try {
    const { role } = req.body;
    if (!['student', 'faculty', 'superadmin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
    await req.app.locals.db.updateRole(req.params.id, role);
    res.json({ success: true });
  } catch (err) { console.error('Role error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/users/:id/avatar
router.post('/:id/avatar', auth(), (req, res, next) => {
  req.app.locals.upload.single('avatar')(req, res, next);
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    await req.app.locals.db.updateAvatar(req.params.id, avatarUrl);
    res.json({ avatar_url: avatarUrl });
  } catch (err) { console.error('Avatar error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/users/faculty-codes
router.get('/faculty-codes', auth(), superadmin(), async (req, res) => {
  try {
    const codes = await req.app.locals.db.getFacultyCodes();
    res.json(codes);
  } catch (err) { console.error('Codes error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/users/faculty-codes
router.post('/faculty-codes', auth(), superadmin(), async (req, res) => {
  try {
    const entry = await req.app.locals.db.createFacultyCode(req.user.id, `FAC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
    res.status(201).json(entry);
  } catch (err) { console.error('Gen code error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/users/faculty-codes/:id
router.delete('/faculty-codes/:id', auth(), superadmin(), async (req, res) => {
  try {
    await req.app.locals.db.deleteFacultyCode(req.params.id);
    res.json({ success: true });
  } catch (err) { console.error('Del code error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// POST /api/users/upgrade-faculty
router.post('/upgrade-faculty', auth(), async (req, res) => {
  try {
    const { faculty_code } = req.body;
    if (!faculty_code) return res.status(400).json({ error: 'Faculty code is required' });

    const redeemed = await req.app.locals.db.redeemFacultyCode(faculty_code, req.user.id);
    if (!redeemed) return res.status(400).json({ error: 'Invalid or already used faculty code' });

    res.json({ success: true, role: 'faculty' });
  } catch (err) { console.error('Upgrade error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

function mapUser(row) {
  const getTier = (pts) => { if (pts >= 3000) return 'Elite'; if (pts >= 2000) return 'Gold'; if (pts >= 1000) return 'Silver'; return 'Bronze'; };
  return {
    id: row.id,
    name: row.full_name || '',
    email: row.email,
    role: row.role,
    avatar: row.avatar_url,
    about: row.about || '',
    joinedAt: row.created_at ? row.created_at.split('T')[0] : '',
    score: row.points || 0,
    points: row.points || 0,
    tier: getTier(row.points || 0),
    uploads: 0,
    downloads: 0,
    warnings: row.warnings || 0,
    is_banned: row.is_banned ? true : false,
    status: row.is_banned ? 'Banned' : row.warnings > 0 ? 'Warned' : 'Active',
  };
}

module.exports = router;
