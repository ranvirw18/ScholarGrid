const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

function auth() { return (req, res, next) => req.app.locals.authenticateJWT(req, res, next); }
function superadmin() { return (req, res, next) => req.app.locals.requireSuperAdmin(req, res, next); }

// GET /api/complaints
router.get('/', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const complaints = await db.getComplaintsForUser(req.user);
    const studentIds = [...new Set(complaints.map((c) => c.student_id))];
    const students = await db.getProfilesByIds(studentIds);
    const studentMap = new Map(students.map((s) => [s.id, s.full_name]));

    const enriched = complaints.map((c) => mapComplaint({ ...c, student_name: studentMap.get(c.student_id) }));
    res.json(enriched);
  } catch (err) {
    console.error('Complaints error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/complaints
router.post('/', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { title, description } = req.body;
    const complaint = await db.createComplaint(req.user.id, title, description);
    const student = await db.getProfileById(req.user.id);
    res.status(201).json(mapComplaint({ ...complaint, student_name: student?.full_name }));
  } catch (err) {
    console.error('Create complaint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/complaints/:id
router.put('/:id', auth(), superadmin(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { status, adminReply } = req.body;
    const updatePayload = { status, admin_reply: adminReply };
    if (status === 'resolved') updatePayload.resolved_by = req.user.id;
    const complaint = await db.updateComplaint(req.params.id, updatePayload);
    if (!complaint) return res.status(404).json({ error: 'Not found' });
    const student = await db.getProfileById(complaint.student_id);
    res.json(mapComplaint({ ...complaint, student_name: student?.full_name }));
  } catch (err) {
    console.error('Update complaint error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapComplaint(row) {
  const statusMap = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', rejected: 'Closed' };
  return {
    id: row.id,
    userId: row.student_id,
    userName: row.student_name || 'Unknown',
    category: 'General',
    title: row.title,
    description: row.description,
    status: statusMap[row.status] || row.status,
    priority: 'Medium',
    createdAt: row.created_at,
    resolvedAt: row.status === 'resolved' ? row.updated_at : null,
    adminResponse: row.admin_reply,
  };
}

module.exports = router;
