-- ============================================================
-- ScholarGrid — Complete Supabase Setup
-- Run this ENTIRE file in your Supabase SQL Editor (one time)
-- Go to: https://supabase.com/dashboard → Your Project → SQL Editor → New Query → Paste this → Run
-- ============================================================

-- =====================
-- 1. TABLES
-- =====================

-- Profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  full_name    text,
  avatar_url   text,
  role         text NOT NULL DEFAULT 'student' CHECK (role IN ('student','faculty','superadmin','admin')),
  about        text,
  points       integer NOT NULL DEFAULT 0,
  warnings     integer NOT NULL DEFAULT 0,
  is_banned    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_role         ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_points_desc  ON public.profiles(points DESC);

-- Groups
CREATE TABLE IF NOT EXISTS public.groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  description  text,
  join_code    text NOT NULL UNIQUE,
  created_by   uuid NOT NULL REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Group Members (many-to-many)
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id   uuid NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Messages (chat)
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES public.groups(id)   ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     text,
  file_url    text,
  file_name   text,
  file_type   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_group_time ON public.messages(group_id, created_at DESC);

-- Notes
CREATE TABLE IF NOT EXISTS public.notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  subject      text NOT NULL,
  file_url     text NOT NULL,
  file_name    text NOT NULL,
  file_type    text NOT NULL,
  file_size    bigint,
  is_flagged   boolean NOT NULL DEFAULT false,
  is_approved  boolean NOT NULL DEFAULT true,
  downloads    integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notes_subject    ON public.notes(subject);
CREATE INDEX IF NOT EXISTS idx_notes_uploader   ON public.notes(uploader_id);
CREATE INDEX IF NOT EXISTS idx_notes_flagged    ON public.notes(is_flagged);

-- Leaderboard Points (event log)
CREATE TABLE IF NOT EXISTS public.leaderboard_points (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  points        integer NOT NULL,
  reason        text NOT NULL CHECK (reason IN (
                  'note_upload','note_download','login_streak',
                  'admin_bonus','penalty')),
  reference_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_points_user_time ON public.leaderboard_points(user_id, created_at DESC);

-- Complaints
CREATE TABLE IF NOT EXISTS public.complaints (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text NOT NULL,
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open','in_progress','resolved','rejected')),
  admin_reply  text,
  resolved_by  uuid REFERENCES public.profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Faculty codes for role upgrades
CREATE TABLE IF NOT EXISTS public.faculty_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  created_by  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_used     boolean NOT NULL DEFAULT false,
  used_by     uuid REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faculty_codes_created_at ON public.faculty_codes(created_at DESC);

-- Note ratings for student uploads
CREATE TABLE IF NOT EXISTS public.note_ratings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     uuid NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating      integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_note_ratings_note_id ON public.note_ratings(note_id);


-- =====================
-- 2. TRIGGERS
-- =====================

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_complaints_updated_at ON public.complaints;
CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Award 10 points when a note is uploaded
CREATE OR REPLACE FUNCTION public.award_points_on_note_upload()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.leaderboard_points (user_id, points, reason, reference_id)
  VALUES (NEW.uploader_id, 10, 'note_upload', NEW.id);

  UPDATE public.profiles
  SET points = points + 10
  WHERE id = NEW.uploader_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_award_points_note_upload ON public.notes;
CREATE TRIGGER trg_award_points_note_upload
  AFTER INSERT ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.award_points_on_note_upload();


-- =====================
-- 3. ROW LEVEL SECURITY (RLS)
-- =====================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read profiles" ON public.profiles;
CREATE POLICY "Anyone can read profiles"      ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile"      ON public.profiles FOR UPDATE USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admin can update any profile" ON public.profiles;
CREATE POLICY "Admin can update any profile"  ON public.profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);

-- Groups
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members can read groups" ON public.groups;
CREATE POLICY "Members can read groups" ON public.groups FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.group_members WHERE group_id = id AND user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);
DROP POLICY IF EXISTS "Admins manage groups" ON public.groups;
CREATE POLICY "Admins manage groups" ON public.groups FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);

-- Group Members
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read own membership" ON public.group_members;
CREATE POLICY "Members read own membership" ON public.group_members FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Students join groups" ON public.group_members;
CREATE POLICY "Students join groups"        ON public.group_members FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage membership" ON public.group_members;
CREATE POLICY "Admins manage membership"    ON public.group_members FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Group members read messages" ON public.messages;
CREATE POLICY "Group members read messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.group_members WHERE group_id = messages.group_id AND user_id = auth.uid())
);
DROP POLICY IF EXISTS "Group members send messages" ON public.messages;
CREATE POLICY "Group members send messages" ON public.messages FOR INSERT WITH CHECK (
  sender_id = auth.uid() AND
  EXISTS (SELECT 1 FROM public.group_members WHERE group_id = messages.group_id AND user_id = auth.uid())
);
DROP POLICY IF EXISTS "Admins read all messages" ON public.messages;
CREATE POLICY "Admins read all messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);

-- Notes
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All users read approved notes" ON public.notes;
CREATE POLICY "All users read approved notes"  ON public.notes FOR SELECT USING (is_approved = true AND is_flagged = false);
DROP POLICY IF EXISTS "Students upload notes" ON public.notes;
CREATE POLICY "Students upload notes"          ON public.notes FOR INSERT WITH CHECK (uploader_id = auth.uid());
DROP POLICY IF EXISTS "Uploaders delete own notes" ON public.notes;
CREATE POLICY "Uploaders delete own notes"     ON public.notes FOR DELETE USING (uploader_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage all notes" ON public.notes;
CREATE POLICY "Admins manage all notes"        ON public.notes FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);

-- Leaderboard Points
ALTER TABLE public.leaderboard_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own points" ON public.leaderboard_points;
CREATE POLICY "Users read own points"   ON public.leaderboard_points FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Admins read all points" ON public.leaderboard_points;
CREATE POLICY "Admins read all points"  ON public.leaderboard_points FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);

-- Complaints
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Students read own complaints" ON public.complaints;
CREATE POLICY "Students read own complaints"  ON public.complaints FOR SELECT USING (student_id = auth.uid());
DROP POLICY IF EXISTS "Students create complaints" ON public.complaints;
CREATE POLICY "Students create complaints"    ON public.complaints FOR INSERT WITH CHECK (student_id = auth.uid());
DROP POLICY IF EXISTS "Admins manage complaints" ON public.complaints;
CREATE POLICY "Admins manage complaints"      ON public.complaints FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
);


-- =====================
-- 4. STORAGE BUCKETS
-- =====================

-- Avatars (public)
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'avatars' AND auth.role() = 'authenticated'
  );
DROP POLICY IF EXISTS "Owner uploads avatar" ON storage.objects;
CREATE POLICY "Owner uploads avatar"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
  );
DROP POLICY IF EXISTS "Owner deletes avatar" ON storage.objects;
CREATE POLICY "Owner deletes avatar"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Notes files (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('notes-files', 'notes-files', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Authenticated users download notes" ON storage.objects;
CREATE POLICY "Authenticated users download notes"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'notes-files' AND auth.role() = 'authenticated'
  );
DROP POLICY IF EXISTS "Owner uploads note file" ON storage.objects;
CREATE POLICY "Owner uploads note file"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'notes-files' AND auth.uid()::text = (storage.foldername(name))[1]
  );
DROP POLICY IF EXISTS "Owner or admin deletes note file" ON storage.objects;
CREATE POLICY "Owner or admin deletes note file"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'notes-files' AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin','faculty','admin'))
    )
  );

-- Chat files (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files', 'chat-files', false) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Group members download chat files" ON storage.objects;
CREATE POLICY "Group members download chat files"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'chat-files' AND auth.role() = 'authenticated'
  );
DROP POLICY IF EXISTS "Group members upload chat files" ON storage.objects;
CREATE POLICY "Group members upload chat files"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'chat-files' AND auth.role() = 'authenticated'
  );


-- =====================
-- 5. REALTIME
-- =====================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_publication pub ON pub.oid = rel.prpubid
    WHERE pub.pubname = 'supabase_realtime'
      AND rel.prrelid = 'public.messages'::regclass
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_publication pub ON pub.oid = rel.prpubid
    WHERE pub.pubname = 'supabase_realtime'
      AND rel.prrelid = 'public.complaints'::regclass
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel rel
    JOIN pg_publication pub ON pub.oid = rel.prpubid
    WHERE pub.pubname = 'supabase_realtime'
      AND rel.prrelid = 'public.profiles'::regclass
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;


-- ============================================================
-- DONE! Your database is ready.
-- Now go to your .env file and add your Supabase URL + anon key.
-- ============================================================
