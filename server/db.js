const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Missing Supabase credentials in server/.env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function throwDbError(error, fallback = 'Database error') {
  if (error) {
    const message = error.message || error.details || JSON.stringify(error);
    const err = new Error(message || fallback);
    err.status = 500;
    throw err;
  }
}

async function getProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  throwDbError(error);
  return data || [];
}

async function getStudents() {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'student').order('created_at', { ascending: false });
  throwDbError(error);
  return data || [];
}

async function getProfileById(id) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
  if (error && error.code !== 'PGRST116') throwDbError(error);
  return data || null;
}

async function getProfileByEmail(email) {
  const { data, error } = await supabase.from('profiles').select('*').ilike('email', email).single();
  if (error && error.code !== 'PGRST116') throwDbError(error);
  return data || null;
}

async function getProfilesByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select('*').in('id', ids);
  throwDbError(error);
  return data || [];
}

async function createProfile(profile) {
  const { data, error } = await supabase.from('profiles').insert([profile]).select().single();
  throwDbError(error);
  return data;
}

async function deleteProfileById(id) {
  const { data, error } = await supabase.from('profiles').delete().eq('id', id).select().single();
  throwDbError(error);
  return data || null;
}

async function updateProfile(id, attributes) {
  const { data, error } = await supabase.from('profiles').update(attributes).eq('id', id).select().single();
  throwDbError(error);
  return data;
}

async function incrementWarnings(id) {
  const profile = await getProfileById(id);
  if (!profile) return null;
  return updateProfile(id, { warnings: (profile.warnings || 0) + 1 });
}

async function toggleBan(id, isBanned) {
  return updateProfile(id, { is_banned: isBanned ? true : false });
}

async function updateRole(id, role) {
  return updateProfile(id, { role });
}

async function updateAvatar(id, avatarUrl) {
  return updateProfile(id, { avatar_url: avatarUrl });
}

async function getFacultyCodes() {
  const { data, error } = await supabase.from('faculty_codes').select('*').order('created_at', { ascending: false });
  throwDbError(error);
  return data || [];
}

async function createFacultyCode(createdBy, code) {
  const entry = {
    code,
    created_by: createdBy,
    is_used: false,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('faculty_codes').insert([entry]).select().single();
  throwDbError(error);
  return data;
}

async function deleteFacultyCode(id) {
  const { error } = await supabase.from('faculty_codes').delete().eq('id', id);
  throwDbError(error);
  return true;
}

async function redeemFacultyCode(code, userId) {
  const { data: codeEntry, error: selectError } = await supabase.from('faculty_codes').select('*').eq('code', code).eq('is_used', false).single();
  if (selectError) {
    if (selectError.code === 'PGRST116') return null;
    throwDbError(selectError);
  }

  await supabase.from('faculty_codes').update({ is_used: true, used_by: userId }).eq('id', codeEntry.id);
  await updateRole(userId, 'faculty');
  return codeEntry;
}

async function getNotes(filters = {}) {
  const { subject, search, sortBy, limit } = filters;
  let query = supabase.from('notes').select('*');

  if (subject && subject !== 'All') query = query.eq('subject', subject);
  if (search) {
    const normalized = search.trim();
    query = query.or(`title.ilike.%${normalized}%,description.ilike.%${normalized}%`);
  }

  if (sortBy === 'downloads') query = query.order('downloads', { ascending: false });
  else query = query.order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  throwDbError(error);
  return data || [];
}

async function getNotesByUploaderId(uploaderId) {
  const { data, error } = await supabase.from('notes').select('*').eq('uploader_id', uploaderId).order('created_at', { ascending: false });
  throwDbError(error);
  return data || [];
}

async function getNoteById(noteId) {
  const { data, error } = await supabase.from('notes').select('*').eq('id', noteId).single();
  if (error && error.code !== 'PGRST116') throwDbError(error);
  return data || null;
}

async function createNote(note) {
  const { data, error } = await supabase.from('notes').insert([note]).select().single();
  throwDbError(error);
  return data;
}

async function deleteNoteById(noteId) {
  const { data, error } = await supabase.from('notes').delete().eq('id', noteId).select().single();
  throwDbError(error);
  return data || null;
}

async function updateNoteById(noteId, attributes) {
  const { data, error } = await supabase.from('notes').update(attributes).eq('id', noteId).select().single();
  throwDbError(error);
  return data;
}

async function getNoteRatingsByNoteIds(noteIds) {
  if (!Array.isArray(noteIds) || noteIds.length === 0) return [];
  const { data, error } = await supabase.from('note_ratings').select('*').in('note_id', noteIds);
  throwDbError(error);
  return data || [];
}

async function upsertNoteRating(noteId, userId, rating, review) {
  const entry = {
    note_id: noteId,
    user_id: userId,
    rating,
    review: review || null,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('note_ratings').upsert(entry, { onConflict: 'note_id,user_id' }).select().single();
  throwDbError(error);
  return data;
}

async function incrementNoteDownload(noteId, downloaderId) {
  const note = await getNoteById(noteId);
  if (!note) return null;

  const downloads = (note.downloads || 0) + 1;
  await updateNoteById(noteId, { downloads });

  if (note.uploader_id !== downloaderId) {
    const uploader = await getProfileById(note.uploader_id);
    if (uploader) {
      await updateProfile(note.uploader_id, { points: (uploader.points || 0) + 2 });
      const { error } = await supabase.from('leaderboard_points').insert([{ user_id: note.uploader_id, points: 2, reason: 'note_download', reference_id: note.id, created_at: new Date().toISOString() }]);
      throwDbError(error);
    }
  }

  return note;
}

async function getDistinctNoteSubjects() {
  const { data, error } = await supabase.from('notes').select('subject');
  throwDbError(error);
  return Array.from(new Set((data || []).map((row) => row.subject).filter(Boolean))).sort();
}

async function getMessagesByGroup(groupId, limit = 100) {
  let query = supabase.from('messages').select('*').eq('group_id', groupId).order('created_at', { ascending: true });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  throwDbError(error);
  return data || [];
}

async function createMessage(groupId, senderId, payload) {
  const message = {
    group_id: groupId,
    sender_id: senderId,
    content: payload.content || null,
    file_url: payload.file_url || null,
    file_name: payload.file_name || null,
    file_type: payload.file_type || null,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('messages').insert([message]).select().single();
  throwDbError(error);
  return data;
}

async function deleteMessageById(messageId) {
  const { data, error } = await supabase.from('messages').delete().eq('id', messageId).select().single();
  throwDbError(error);
  return data || null;
}

async function getGroupsForUser(user) {
  if (['superadmin', 'faculty'].includes(user.role)) {
    const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false });
    throwDbError(error);
    return data || [];
  }

  const { data: membership, error: membershipError } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
  throwDbError(membershipError);

  const groupIds = (membership || []).map((row) => row.group_id);
  if (groupIds.length === 0) return [];

  const { data, error } = await supabase.from('groups').select('*').in('id', groupIds).order('created_at', { ascending: false });
  throwDbError(error);
  return data || [];
}

async function createGroup(name, description, createdBy, joinCode) {
  const group = {
    name,
    description: description || '',
    join_code: joinCode,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('groups').insert([group]).select().single();
  throwDbError(error);

  const { error: membershipError } = await supabase.from('group_members').insert([{ group_id: data.id, user_id: createdBy, joined_at: new Date().toISOString() }]);
  throwDbError(membershipError);
  return data;
}

async function deleteGroupById(groupId) {
  const { data, error } = await supabase.from('groups').delete().eq('id', groupId).select().single();
  throwDbError(error);
  return data || null;
}

async function joinGroup(joinCode, userId) {
  const { data: group, error: groupError } = await supabase.from('groups').select('*').eq('join_code', joinCode).single();
  if (groupError) {
    if (groupError.code === 'PGRST116') return null;
    throwDbError(groupError);
  }

  const { data: existing, error: membershipError } = await supabase.from('group_members').select('*').eq('group_id', group.id).eq('user_id', userId).maybeSingle();
  if (membershipError) throwDbError(membershipError);
  if (existing) return group;

  const { error: insertError } = await supabase.from('group_members').insert([{ group_id: group.id, user_id, joined_at: new Date().toISOString() }]);
  throwDbError(insertError);
  return group;
}

async function getGroupMemberCount(groupId) {
  const { count, error } = await supabase.from('group_members').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
  throwDbError(error);
  return count || 0;
}

async function getLatestMessageForGroup(groupId) {
  const { data, error } = await supabase.from('messages').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throwDbError(error);
  return data || null;
}

async function getLeaderboard(limit = 50) {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'student').eq('is_banned', false).order('points', { ascending: false }).limit(limit);
  throwDbError(error);
  return data || [];
}

async function getLeaderboardHistory(userId) {
  const { data, error } = await supabase.from('leaderboard_points').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  throwDbError(error);
  return data || [];
}

async function addLeaderboardPoints(studentId, points, reason, referenceId) {
  const profile = await getProfileById(studentId);
  if (!profile) return null;
  await updateProfile(studentId, { points: (profile.points || 0) + points });
  const { data, error } = await supabase.from('leaderboard_points').insert([{ user_id: studentId, points, reason, reference_id: referenceId || null, created_at: new Date().toISOString() }]).select().single();
  throwDbError(error);
  return data;
}

async function getComplaintsForUser(user) {
  if (['superadmin', 'faculty'].includes(user.role)) {
    const { data, error } = await supabase.from('complaints').select('*').order('created_at', { ascending: false });
    throwDbError(error);
    return data || [];
  }

  const { data, error } = await supabase.from('complaints').select('*').eq('student_id', user.id).order('created_at', { ascending: false });
  throwDbError(error);
  return data || [];
}

async function createComplaint(studentId, title, description) {
  const complaint = {
    student_id: studentId,
    title,
    description,
    status: 'open',
    admin_reply: null,
    resolved_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('complaints').insert([complaint]).select().single();
  throwDbError(error);
  return data;
}

async function updateComplaint(id, payload) {
  const updateFields = {
    updated_at: new Date().toISOString(),
  };
  if (payload.status) updateFields.status = payload.status;
  if (payload.admin_reply !== undefined) updateFields.admin_reply = payload.admin_reply;
  if (payload.status === 'resolved') updateFields.resolved_by = payload.resolved_by || null;
  const { data, error } = await supabase.from('complaints').update(updateFields).eq('id', id).select().single();
  throwDbError(error);
  return data;
}

async function getAnalytics() {
  const [profilesResponse, notesResponse, complaintsResponse, groupsResponse] = await Promise.all([
    supabase.from('profiles').select('*'),
    supabase.from('notes').select('*'),
    supabase.from('complaints').select('*'),
    supabase.from('groups').select('*'),
  ]);

  throwDbError(profilesResponse.error);
  throwDbError(notesResponse.error);
  throwDbError(complaintsResponse.error);
  throwDbError(groupsResponse.error);

  const profilesData = profilesResponse.data || [];
  const notesData = notesResponse.data || [];
  const complaintsData = complaintsResponse.data || [];
  const groupsData = groupsResponse.data || [];
  const now = new Date();
  const monthlyUploads = [];
  const monthlyUsers = [];

  for (let i = 11; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    monthlyUploads.push(notesData.filter((n) => {
      const d = new Date(n.created_at);
      return d >= start && d < end;
    }).length);
    monthlyUsers.push(profilesData.filter((p) => {
      const d = new Date(p.created_at);
      return d >= start && d < end;
    }).length);
  }

  const subjectCounts = {};
  notesData.forEach((n) => {
    subjectCounts[n.subject] = (subjectCounts[n.subject] || 0) + 1;
  });

  const topSubjects = Object.entries(subjectCounts)
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalUsers: profilesData.length,
    totalNotes: notesData.length,
    totalDownloads: notesData.reduce((sum, n) => sum + (n.downloads || 0), 0),
    activeChats: groupsData.length,
    openComplaints: complaintsData.filter((c) => c.status === 'open').length,
    resolvedComplaints: complaintsData.filter((c) => c.status === 'resolved').length,
    monthlyUploads: monthlyUploads.length ? monthlyUploads : Array(12).fill(0),
    monthlyUsers: monthlyUsers.length ? monthlyUsers : Array(12).fill(0),
    topSubjects: topSubjects.length ? topSubjects : [{ subject: 'No data', count: 0 }],
  };
}

module.exports = {
  supabase,
  getProfiles,
  getStudents,
  getProfileById,
  getProfileByEmail,
  getProfilesByIds,
  createProfile,
  updateProfile,
  incrementWarnings,
  toggleBan,
  updateRole,
  updateAvatar,
  getFacultyCodes,
  createFacultyCode,
  deleteFacultyCode,
  redeemFacultyCode,
  getNotes,
  getNotesByUploaderId,
  getNoteById,
  createNote,
  deleteNoteById,
  updateNoteById,
  getNoteRatingsByNoteIds,
  upsertNoteRating,
  incrementNoteDownload,
  getDistinctNoteSubjects,
  getMessagesByGroup,
  createMessage,
  deleteMessageById,
  getGroupsForUser,
  createGroup,
  deleteGroupById,
  joinGroup,
  getGroupMemberCount,
  getLatestMessageForGroup,
  getLeaderboard,
  getLeaderboardHistory,
  addLeaderboardPoints,
  getComplaintsForUser,
  createComplaint,
  updateComplaint,
  getAnalytics,
  deleteProfileById,
};
