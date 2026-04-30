-- ============================================================
-- ScholarGrid — MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS scholargrid;
USE scholargrid;

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  avatar_url VARCHAR(255),
  role ENUM('superadmin','faculty','student') NOT NULL DEFAULT 'student',
  about TEXT,
  points INT NOT NULL DEFAULT 0,
  warnings INT NOT NULL DEFAULT 0,
  is_banned BOOLEAN NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_points_desc ON profiles(points DESC);

-- Faculty Codes
CREATE TABLE IF NOT EXISTS faculty_codes (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  created_by VARCHAR(36) NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT 0,
  used_by VARCHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (used_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- Groups
CREATE TABLE IF NOT EXISTS `groups` (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  join_code VARCHAR(20) NOT NULL UNIQUE,
  created_by VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Group Members
CREATE TABLE IF NOT EXISTS group_members (
  group_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(36) PRIMARY KEY,
  group_id VARCHAR(36) NOT NULL,
  sender_id VARCHAR(36) NOT NULL,
  content TEXT,
  file_url VARCHAR(255),
  file_name VARCHAR(255),
  file_type VARCHAR(100),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE
);
CREATE INDEX idx_messages_group_time ON messages(group_id, created_at DESC);

-- Notes
CREATE TABLE IF NOT EXISTS notes (
  id VARCHAR(36) PRIMARY KEY,
  uploader_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  subject VARCHAR(255) NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_size BIGINT,
  is_flagged BOOLEAN NOT NULL DEFAULT 0,
  is_approved BOOLEAN NOT NULL DEFAULT 1,
  downloads INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploader_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Note Ratings
CREATE TABLE IF NOT EXISTS note_ratings (
  id VARCHAR(36) PRIMARY KEY,
  note_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE (note_id, user_id)
);

-- Leaderboard Points
CREATE TABLE IF NOT EXISTS leaderboard_points (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  points INT NOT NULL,
  reason ENUM('note_upload','note_download','login_streak','admin_bonus','penalty') NOT NULL,
  reference_id VARCHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- Complaints
CREATE TABLE IF NOT EXISTS complaints (
  id VARCHAR(36) PRIMARY KEY,
  student_id VARCHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('open','in_progress','resolved','rejected') NOT NULL DEFAULT 'open',
  admin_reply TEXT,
  resolved_by VARCHAR(36),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL
);

-- ============================================================
-- Trigger: Award 10 points on note upload
-- ============================================================
DELIMITER //

CREATE TRIGGER trg_award_points_note_upload
AFTER INSERT ON notes
FOR EACH ROW
BEGIN
  INSERT INTO leaderboard_points (id, user_id, points, reason, reference_id)
  VALUES (UUID(), NEW.uploader_id, 10, 'note_upload', NEW.id);

  UPDATE profiles
  SET points = points + 10
  WHERE id = NEW.uploader_id;
END;
//

DELIMITER ;

-- ============================================================
-- Seed Data
-- ============================================================

-- Superadmin user (password: admin123)
INSERT INTO profiles (id, email, password_hash, full_name, role, about, points) VALUES
('a0000000-0000-0000-0000-000000000001', 'admin@scholargrid.com', '$2a$10$AzYeWD1rs8oHqjXB/rjnNuhIJlhTnfRdP48hv9FpmoOAN3m/dZ3Wq', 'Super Admin User', 'superadmin', 'Platform administrator', 0);

-- Faculty user (password: faculty123)
INSERT INTO profiles (id, email, password_hash, full_name, role, about, points) VALUES
('f0000000-0000-0000-0000-000000000001', 'faculty@scholargrid.com', '$2a$10$P/G3U1T2c.MJCB/rNo2mQedRSWXoOqSWYcYBOWn9/hZBTLKbP6IdW', 'Faculty User', 'faculty', 'Computer Science Professor', 0);

-- Student users (password: student123)
INSERT INTO profiles (id, email, password_hash, full_name, role, about, points) VALUES
('s0000000-0000-0000-0000-000000000001', 'alice@student.com', '$2a$10$fqiqZVWRgD9dYUviOYdgEOFkKk7/2vH71ncObJOIUTuv/ZYGD0Rrm', 'Alice Johnson', 'student', 'Computer Science major', 150),
('s0000000-0000-0000-0000-000000000002', 'bob@student.com', '$2a$10$fqiqZVWRgD9dYUviOYdgEOFkKk7/2vH71ncObJOIUTuv/ZYGD0Rrm', 'Bob Smith', 'student', 'Mathematics enthusiast', 230),
('s0000000-0000-0000-0000-000000000003', 'carol@student.com', '$2a$10$fqiqZVWRgD9dYUviOYdgEOFkKk7/2vH71ncObJOIUTuv/ZYGD0Rrm', 'Carol Williams', 'student', 'Physics student', 310),
('s0000000-0000-0000-0000-000000000004', 'dave@student.com', '$2a$10$fqiqZVWRgD9dYUviOYdgEOFkKk7/2vH71ncObJOIUTuv/ZYGD0Rrm', 'Dave Brown', 'student', 'Engineering student', 80),
('s0000000-0000-0000-0000-000000000005', 'eve@student.com', '$2a$10$fqiqZVWRgD9dYUviOYdgEOFkKk7/2vH71ncObJOIUTuv/ZYGD0Rrm', 'Eve Davis', 'student', 'Biology researcher', 420);

-- Groups
INSERT INTO `groups` (id, name, description, join_code, created_by) VALUES
('g0000000-0000-0000-0000-000000000001', 'CS Study Group', 'Computer Science discussions and help', 'GRP-2026-CS1', 'a0000000-0000-0000-0000-000000000001'),
('g0000000-0000-0000-0000-000000000002', 'Math Warriors', 'Advanced mathematics study group', 'STD-2026-MTH', 'a0000000-0000-0000-0000-000000000001'),
('g0000000-0000-0000-0000-000000000003', 'Physics Lab', 'Physics experiments and theory', 'DSC-2026-PHY', 'a0000000-0000-0000-0000-000000000001');

-- Group Members
INSERT INTO group_members (group_id, user_id) VALUES
('g0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
('g0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001'),
('g0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000002'),
('g0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000002'),
('g0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000003'),
('g0000000-0000-0000-0000-000000000003', 's0000000-0000-0000-0000-000000000003'),
('g0000000-0000-0000-0000-000000000003', 's0000000-0000-0000-0000-000000000004'),
('g0000000-0000-0000-0000-000000000003', 's0000000-0000-0000-0000-000000000005');

-- Messages
INSERT INTO messages (id, group_id, sender_id, content) VALUES
(UUID(), 'g0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', 'Hey everyone! Ready for the algorithms exam?'),
(UUID(), 'g0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000002', 'Yes! I uploaded my notes on graph traversal.'),
(UUID(), 'g0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000002', 'Can someone explain eigenvalues?'),
(UUID(), 'g0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000003', 'Sure! Think of them as the scaling factors of a matrix transformation.'),
(UUID(), 'g0000000-0000-0000-0000-000000000003', 's0000000-0000-0000-0000-000000000004', 'Lab report due Friday, anyone started?');

-- Notes (inserted WITHOUT trigger firing — we insert points manually for seed data)
-- We need to disable the trigger temporarily OR insert points manually
INSERT INTO notes (id, uploader_id, title, description, subject, file_url, file_name, file_type, file_size, downloads) VALUES
('n0000000-0000-0000-0000-000000000001', 's0000000-0000-0000-0000-000000000001', 'Data Structures Complete Guide', 'Comprehensive notes on arrays, trees, graphs, and hash tables', 'Computer Science', '/uploads/notes/sample-ds.pdf', 'data-structures.pdf', 'application/pdf', 2048000, 45),
('n0000000-0000-0000-0000-000000000002', 's0000000-0000-0000-0000-000000000002', 'Linear Algebra Cheat Sheet', 'Quick reference for matrices, determinants, and eigenvalues', 'Mathematics', '/uploads/notes/sample-la.pdf', 'linear-algebra.pdf', 'application/pdf', 1024000, 32),
('n0000000-0000-0000-0000-000000000003', 's0000000-0000-0000-0000-000000000003', 'Quantum Mechanics Basics', 'Introduction to wave-particle duality and Schrodinger equation', 'Physics', '/uploads/notes/sample-qm.pdf', 'quantum-mechanics.pdf', 'application/pdf', 3072000, 28),
('n0000000-0000-0000-0000-000000000004', 's0000000-0000-0000-0000-000000000005', 'Cell Biology Notes', 'Detailed notes on cell structure, organelles, and processes', 'Biology', '/uploads/notes/sample-bio.pdf', 'cell-biology.pdf', 'application/pdf', 1536000, 19),
('n0000000-0000-0000-0000-000000000005', 's0000000-0000-0000-0000-000000000001', 'Algorithm Design Patterns', 'Dynamic programming, greedy, divide and conquer patterns', 'Computer Science', '/uploads/notes/sample-algo.pdf', 'algorithms.pdf', 'application/pdf', 2560000, 55);

-- Complaints
INSERT INTO complaints (id, student_id, title, description, status) VALUES
(UUID(), 's0000000-0000-0000-0000-000000000001', 'Cannot download notes', 'Getting a 404 error when trying to download uploaded notes', 'open'),
(UUID(), 's0000000-0000-0000-0000-000000000004', 'Incorrect points calculation', 'My points were not updated after uploading 3 notes', 'in_progress');
