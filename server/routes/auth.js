const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function createAuthClient() {
  const authKey = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !authKey) return null;
  return createClient(SUPABASE_URL, authKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, email, password, role } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existing = await db.getProfileByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const userRole = role || 'student';
    const now = new Date().toISOString();

    const { data: signupData, error: signupError } = await db.supabase.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name || '',
        role: userRole,
      },
    });

    if (signupError) {
      return res.status(400).json({ error: signupError.message || 'Unable to create account' });
    }

    const authUser = signupData?.user;
    if (!authUser?.id) {
      return res.status(500).json({ error: 'Supabase did not return a user id' });
    }

    const id = authUser.id;
    const profile = {
      id,
      email: normalizedEmail,
      full_name: name || '',
      role: userRole,
      about: '',
      avatar_url: null,
      points: 0,
      warnings: 0,
      is_banned: false,
      created_at: now,
      updated_at: now,
    };

    let createdProfile;
    try {
      createdProfile = await db.createProfile(profile);
    } catch (profileCreateErr) {
      // If DB trigger already inserted profile on auth signup, reconcile fields instead.
      const existingProfile = await db.getProfileById(id);
      if (!existingProfile) throw profileCreateErr;
      createdProfile = await db.updateProfile(id, {
        email: normalizedEmail,
        full_name: name || '',
        role: userRole,
        updated_at: now,
      });
    }

    if (userRole === 'faculty') {
      const { faculty_code } = req.body;
      if (!faculty_code) {
        await db.deleteProfileById(id);
        await db.supabase.auth.admin.deleteUser(id);
        return res.status(400).json({ error: 'Faculty code is required for faculty registration' });
      }

      const redeemed = await db.redeemFacultyCode(faculty_code, id);
      if (!redeemed) {
        await db.deleteProfileById(id);
        await db.supabase.auth.admin.deleteUser(id);
        return res.status(400).json({ error: 'Invalid or already used faculty code' });
      }
    }

    const token = jwt.sign({ id, role: createdProfile.role }, req.app.locals.JWT_SECRET, { expiresIn: '7d' });
    const notes = await db.getNotesByUploaderId(createdProfile.id);

    res.status(201).json({ token, user: mapProfile(createdProfile, notes) });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { email, password } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const authClient = createAuthClient();
    if (!authClient) {
      return res.status(500).json({ error: 'Supabase auth is not configured on server' });
    }

    let signIn = await authClient.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    // Legacy bridge: if old profile exists with bcrypt hash but no auth user, create auth user on-demand.
    if (signIn.error && /(invalid login credentials|email not confirmed)/i.test(signIn.error.message || '')) {
      const legacyProfile = await db.getProfileByEmail(normalizedEmail);
      if (legacyProfile?.password_hash) {
        const validLegacyPassword = await bcrypt.compare(password, legacyProfile.password_hash);
        if (validLegacyPassword) {
          const createLegacyAuth = await db.supabase.auth.admin.createUser({
            id: legacyProfile.id,
            email: normalizedEmail,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: legacyProfile.full_name || '',
              role: legacyProfile.role || 'student',
            },
          });

          if (!createLegacyAuth.error || /already registered/i.test(createLegacyAuth.error.message || '')) {
            signIn = await authClient.auth.signInWithPassword({
              email: normalizedEmail,
              password,
            });
          }
        }
      }
    }

    if (signIn.error || !signIn.data?.user?.id) {
      console.warn('Login failed for', normalizedEmail, signIn.error?.message || signIn.error);
      if (/invalid api key|apikey/i.test(signIn.error?.message || '')) {
        return res.status(500).json({ error: 'Supabase auth key is invalid on server' });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const authUser = signIn.data.user;
    let profile = await db.getProfileById(authUser.id);
    if (!profile) {
      const metadata = authUser.user_metadata || {};
      profile = await db.createProfile({
        id: authUser.id,
        email: authUser.email || normalizedEmail,
        full_name: metadata.full_name || '',
        role: metadata.role || 'student',
        about: '',
        avatar_url: null,
        points: 0,
        warnings: 0,
        is_banned: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    if (profile.is_banned) {
      return res.status(403).json({ error: 'Your account has been banned' });
    }

    const token = jwt.sign({ id: profile.id, role: profile.role }, req.app.locals.JWT_SECRET, { expiresIn: '7d' });
    const notes = await db.getNotesByUploaderId(profile.id);

    res.json({ token, user: mapProfile(profile, notes) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', (req, res, next) => req.app.locals.authenticateJWT(req, res, next), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const profile = await db.getProfileById(req.user.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    const notes = await db.getNotesByUploaderId(profile.id);
    res.json({ user: mapProfile(profile, notes) });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function mapProfile(row, notes = []) {
  const getTier = (pts) => {
    if (pts >= 3000) return 'Elite';
    if (pts >= 2000) return 'Gold';
    if (pts >= 1000) return 'Silver';
    return 'Bronze';
  };

  const userUploads = notes.filter((n) => n.uploader_id === row.id);
  const uploadsCount = userUploads.length;
  const downloadsCount = userUploads.reduce((sum, n) => sum + (n.downloads || 0), 0);

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
    uploads: uploadsCount,
    downloads: downloadsCount,
    warnings: row.warnings || 0,
    is_banned: row.is_banned ? true : false,
  };
}

module.exports = router;
