const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

function auth() { return (req, res, next) => req.app.locals.authenticateJWT(req, res, next); }
function roles(r) { return (req, res, next) => req.app.locals.requireRoles(r)(req, res, next); }

// GET /api/notes
router.get('/', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { subject, search, sortBy, limit } = req.query;
    const notes = await db.getNotes({ subject, search, sortBy, limit: limit ? parseInt(limit, 10) : undefined });

    const noteIds = notes.map((n) => n.id);
    const uploaderIds = [...new Set(notes.map((n) => n.uploader_id))];
    const [profiles, ratings] = await Promise.all([
      db.getProfilesByIds(uploaderIds),
      db.getNoteRatingsByNoteIds(noteIds),
    ]);

    const profileMap = new Map(profiles.map((p) => [p.id, p]));
    const ratingsByNote = ratings.reduce((acc, r) => {
      acc[r.note_id] = acc[r.note_id] || [];
      acc[r.note_id].push(r);
      return acc;
    }, {});

    const enriched = notes.map((note) => {
      const uploader = profileMap.get(note.uploader_id);
      const noteRatings = ratingsByNote[note.id] || [];
      const avgRating = noteRatings.length > 0 ? noteRatings.reduce((sum, item) => sum + item.rating, 0) / noteRatings.length : 0;
      return {
        ...note,
        uploader_name: uploader?.full_name || 'Unknown',
        uploader_avatar: uploader?.avatar_url,
        avg_rating: avgRating,
        rating_count: noteRatings.length,
      };
    });

    let sorted = enriched;
    if (sortBy === 'downloads') sorted = enriched.sort((a, b) => b.downloads - a.downloads);
    else if (sortBy === 'rating') sorted = enriched.sort((a, b) => b.avg_rating - a.avg_rating);
    else sorted = enriched.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(sorted.map(mapNote));
  } catch (err) {
    console.error('Fetch notes error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/subjects
router.get('/subjects', auth(), async (req, res) => {
  try {
    const subjects = await req.app.locals.db.getDistinctNoteSubjects();
    res.json(subjects);
  } catch (err) {
    console.error('Subjects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes
router.post('/', auth(), (req, res, next) => {
  req.app.locals.upload.single('note')(req, res, next);
}, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const noteId = uuidv4();
    const { title, description, subject } = req.body;
    const now = new Date().toISOString();

    const note = {
      id: noteId,
      uploader_id: req.user.id,
      title,
      description: description || '',
      subject: subject || 'General',
      file_url: req.file ? `/uploads/notes/${req.file.filename}` : 'pending',
      file_name: req.file ? req.file.originalname : 'unknown',
      file_type: req.file ? req.file.mimetype : 'application/octet-stream',
      file_size: req.file ? req.file.size : 0,
      is_flagged: false,
      is_approved: true,
      downloads: 0,
      created_at: now,
    };

    const created = await db.createNote(note);
    const uploader = await db.getProfileById(req.user.id);

    res.status(201).json(mapNote({
      ...created,
      uploader_name: uploader?.full_name || 'Unknown',
      uploader_avatar: uploader?.avatar_url,
      avg_rating: 0,
      rating_count: 0,
    }));
  } catch (err) {
    console.error('Upload note error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', auth(), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const note = await db.getNoteById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (note.uploader_id !== req.user.id && !['superadmin', 'faculty'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await db.deleteNoteById(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notes/:id/flag
router.put('/:id/flag', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const flagged = req.body.flagged ? true : false;
    await req.app.locals.db.updateNoteById(req.params.id, { is_flagged: flagged });
    res.json({ success: true });
  } catch (err) {
    console.error('Flag error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notes/:id/approve
router.put('/:id/approve', auth(), roles(['superadmin', 'faculty']), async (req, res) => {
  try {
    const approved = req.body.approved ? true : false;
    await req.app.locals.db.updateNoteById(req.params.id, { is_approved: approved });
    res.json({ success: true });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notes/:id/rate
router.post('/:id/rate', auth(), async (req, res) => {
  try {
    const { rating, review } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: 'Rating must be 1-5' });
    await req.app.locals.db.upsertNoteRating(req.params.id, req.user.id, rating, review);
    res.json({ success: true });
  } catch (err) {
    console.error('Rate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notes/:id/download
router.get('/:id/download', auth(), async (req, res) => {
  try {
    const note = await req.app.locals.db.incrementNoteDownload(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    return res.json({ success: true, fileUrl: note.file_url });
  } catch (err) {
    console.error('Download metadata error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapNote(row) {
  const getFileTypeLabel = (mt) => {
    if (!mt) return 'FILE';
    if (mt.includes('pdf')) return 'PDF';
    if (mt.includes('word') || mt.includes('document')) return 'DOC';
    if (mt.includes('presentation')) return 'PPT';
    if (mt.includes('image')) return 'IMG';
    if (mt.includes('text')) return 'TXT';
    return 'FILE';
  };

  const formatFileSize = (b) => {
    if (!b) return '0 B';
    const s = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(1)} ${s[i]}`;
  };

  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    subject: row.subject,
    tags: row.subject ? [row.subject] : [],
    uploaderId: row.uploader_id,
    uploaderName: row.uploader_name || 'Unknown',
    createdAt: row.created_at ? row.created_at.split('T')[0] : '',
    fileType: getFileTypeLabel(row.file_type),
    fileSize: formatFileSize(row.file_size),
    fileUrl: row.file_url,
    fileName: row.file_name,
    downloads: row.downloads || 0,
    rating: row.avg_rating ? parseFloat(row.avg_rating) : 0,
    totalRatings: row.rating_count || 0,
    isFlagged: row.is_flagged ? true : false,
    isApproved: row.is_approved ? true : false,
    modStatus: row.is_flagged ? 'Flagged' : 'Approved',
  };
}

module.exports = router;
