const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

function auth() { return (req, res, next) => req.app.locals.authenticateJWT(req, res, next); }

// GET /api/messages/:groupId
router.get('/:groupId', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId } = req.params;
    const limit = parseInt(req.query.limit, 10) || 100;

    const msgs = await db.getMessagesByGroup(groupId, limit);
    const senderIds = [...new Set(msgs.map((m) => m.sender_id))];
    const senders = await db.getProfilesByIds(senderIds);
    const senderMap = new Map(senders.map((s) => [s.id, s]));

    const enriched = msgs.map((m) => {
      const sender = senderMap.get(m.sender_id);
      return mapMessage({ ...m, sender_name: sender?.full_name, sender_avatar: sender?.avatar_url });
    });

    res.json(enriched);
  } catch (err) {
    console.error('Fetch messages error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/messages/:groupId
router.post('/:groupId', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId } = req.params;
    const { content } = req.body;
    const msg = await db.createMessage(groupId, req.user.id, { content });
    const sender = await db.getProfileById(req.user.id);
    const mapped = mapMessage({ ...msg, sender_name: sender?.full_name, sender_avatar: sender?.avatar_url });
    req.app.locals.broadcastToRoom(groupId, mapped);
    res.status(201).json(mapped);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/messages/:groupId/file
router.post('/:groupId/file', auth(), (req, res, next) => {
  req.app.locals.upload.single('chatFile')(req, res, next);
}, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { groupId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const fileUrl = `/uploads/chat/${req.file.filename}`;
    const msg = await db.createMessage(groupId, req.user.id, {
      content: null,
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_type: req.file.mimetype,
    });

    const sender = await db.getProfileById(req.user.id);
    const mapped = mapMessage({ ...msg, sender_name: sender?.full_name, sender_avatar: sender?.avatar_url });
    req.app.locals.broadcastToRoom(groupId, mapped);
    res.status(201).json(mapped);
  } catch (err) {
    console.error('File message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/messages/:id
router.delete('/:id', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const msg = await db.deleteMessageById(req.params.id);
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    if (msg.sender_id !== req.user.id && !['superadmin', 'faculty'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.app.locals.broadcastToRoom(msg.group_id, { id: msg.id, deleted: true });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapMessage(row) {
  return {
    id: row.id,
    groupId: row.group_id,
    senderId: row.sender_id,
    senderName: row.sender_name || 'Unknown',
    content: row.file_name || row.content || '',
    timestamp: row.created_at,
    type: row.file_url ? 'file' : 'text',
    fileUrl: row.file_url || null,
    fileName: row.file_name || null,
    fileType: row.file_type || null,
    fileSize: '',
  };
}

module.exports = router;
