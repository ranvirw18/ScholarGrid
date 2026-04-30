const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

function auth() { return (req, res, next) => req.app.locals.authenticateJWT(req, res, next); }
function roles(r) { return (req, res, next) => req.app.locals.requireRoles(r)(req, res, next); }

// GET /api/groups
router.get('/', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const groups = await db.getGroupsForUser(req.user);
    const enriched = await Promise.all(groups.map(async (g) => {
      const [memberCount, lastMsg] = await Promise.all([
        db.getGroupMemberCount(g.id),
        db.getLatestMessageForGroup(g.id),
      ]);
      return mapGroup(g, memberCount, lastMsg);
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Fetch groups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/groups
router.post('/', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, description } = req.body;
    const joinCode = generateJoinCode();
    const group = await db.createGroup(name, description, req.user.id, joinCode);
    res.status(201).json(mapGroup(group, 1, null));
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.deleteGroupById(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/groups/join
router.post('/join', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { joinCode } = req.body;
    const group = await db.joinGroup(joinCode.trim().toUpperCase(), req.user.id);
    if (!group) return res.status(404).json({ error: 'Invalid join code. Group not found.' });
    res.json(group);
  } catch (err) {
    console.error('Join group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const prefixes = ['GRP', 'STD', 'DSC'];
  const pfx = prefixes[Math.floor(Math.random() * prefixes.length)];
  let code = '';
  for (let i = 0; i < 3; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return `${pfx}-2026-${code}`;
}

function mapGroup(g, memberCount, lastMsg) {
  return {
    id: g.id,
    name: g.name,
    description: g.description || '',
    joinCode: g.join_code,
    members: memberCount,
    createdBy: g.created_by,
    createdAt: g.created_at ? g.created_at.split('T')[0] : '',
    lastMessage: lastMsg?.content || 'No messages yet',
    lastMessageAt: lastMsg?.created_at || g.created_at,
  };
}

module.exports = router;
