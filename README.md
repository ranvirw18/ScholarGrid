Checking the repository for any Supabase references before I give you the final README.

Searched for text `supabase`, 50 results

I found Supabase setup files and dependencies, so I’m checking the exact integration before finalizing the README text.

Read [](file:///c%3A/Users/indos/OneDrive/Desktop/scholargrid/package.json)

Read [](file:///c%3A/Users/indos/OneDrive/Desktop/scholargrid/src/lib/supabaseClient.js)

# 🎓 ScholarGrid

**ScholarGrid** is a premium college collaboration platform where students can share academic notes, communicate in real-time group chats, track their contributions on a leaderboard, and submit feedback — all within a beautifully designed, gamified interface.

---

## 🚀 Features

### 👩‍🎓 Student
- **Dashboard** — Personalized welcome, stats (uploads, downloads, points, rank), trending notes, and top contributors
- **Notes** — Upload, browse, search, filter, and download academic notes (PDF/DOCX/etc.) with subject tagging and star ratings
- **Chat** — Real-time group messaging via WebSockets; join groups using invite codes, share files in chat
- **Leaderboard** — Ranked list of top contributors with tier badges (Bronze → Silver → Gold → Elite)
- **Feedback** — Submit complaints or suggestions; track status of previous submissions
- **Profile** — Edit name/bio, upload avatar, view account stats, toggle dark/light mode, upgrade to Faculty

### 🛠️ Admin / Faculty (Management Panel)
- **Dashboard** — Platform-wide stats and activity overview
- **Users** — View, search, warn, ban, and manage all registered users
- **Groups** — Create and delete chat groups; auto-generated join codes
- **Notes Moderation** — Approve or reject uploaded notes before they go live
- **Complaints** — View and resolve student-submitted feedback/complaints
- **Analytics** — Charts for monthly uploads, user growth, top subjects, and platform health

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, React Router v6 |
| **Styling** | Tailwind CSS, Framer Motion |
| **Icons** | Lucide React |
| **Backend** | Node.js, Express.js |
| **Real-time** | WebSocket (`ws`) |
| **Auth** | JWT (JSON Web Tokens) + bcrypt |
| **Database** | In-memory JSON store (data.json) |
| **File Uploads** | Multer |
| **Optional / Legacy Supabase** | Supabase setup script available in supabase_setup.sql; .env may contain `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |

---

## 📦 Project Structure

```
scholargridddd/
├── server/                  # Node.js backend
│   ├── app.js               # Express server entry point
│   ├── db.js                # In-memory database + persistence logic
│   ├── data.json            # Persisted database (auto-generated)
│   └── routes/
│       ├── auth.js          # Login, signup, /me
│       ├── users.js         # User management
│       ├── notes.js         # Notes CRUD + file upload
│       ├── groups.js        # Group chat management
│       ├── messages.js      # Chat messages
│       ├── leaderboard.js   # Rankings
│       ├── complaints.js    # Feedback/complaints
│       └── analytics.js     # Admin analytics
│
└── src/                     # React frontend
    ├── context/
    │   ├── AuthContext.jsx  # Auth state (login, signup, logout, profile)
    │   └── ThemeContext.jsx # Dark/light mode
    ├── lib/
    │   ├── apiClient.js     # Main API client
    │   └── supabaseClient.js# Legacy Supabase stub
    ├── services/            # API client functions (one file per domain)
    ├── routes/
    │   ├── AppRouter.jsx    # Route definitions
    │   └── ProtectedRoute.jsx
    ├── pages/
    │   ├── auth/            # Login, Signup
    │   ├── student/         # Dashboard, Notes, Chat, Leaderboard, Feedback, Profile
    │   └── admin/           # AdminDashboard, Users, Groups, Notes, Complaints, Analytics
    └── components/
        └── layout/          # StudentLayout, AdminLayout
```

---

## ⚙️ Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or higher
- npm v9 or higher

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/ranvirw18/ScholarGrid.git
cd scholargridddd

# 2. Install frontend dependencies
npm install

# 3. Install backend dependencies
npm install --prefix server
```

### Running Locally

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend (Vite):** http://localhost:5173
- **Backend API:** http://localhost:3001

> The backend must be running for the frontend to function. The `npm run dev` command starts both automatically.

---

## 🔑 Default Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@gmail.com` | `superadmin123` |
| Student (test) | `student@test.com` | `student123` |

### Faculty Upgrade Code
Students can upgrade to faculty from their Profile page using the registration code:
```
FACULTY-2026
```

---

## 🌐 API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login |
| POST | `/api/auth/signup` | Public | Register |
| GET | `/api/auth/me` | JWT | Get current user |
| GET | `/api/notes` | JWT | List notes |
| POST | `/api/notes` | JWT | Upload a note |
| GET | `/api/leaderboard` | JWT | Get rankings |
| GET | `/api/groups` | JWT | List groups |
| POST | `/api/groups` | Faculty+ | Create group |
| POST | `/api/groups/join` | JWT | Join group by code |
| GET | `/api/messages/:groupId` | JWT | Get chat messages |
| POST | `/api/messages` | JWT | Send message |
| GET | `/api/complaints` | JWT | List complaints |
| POST | `/api/complaints` | JWT | Submit complaint |
| GET | `/api/analytics` | Faculty+ | Platform analytics |
| GET | `/api/health` | Public | Health check |

---

## 💾 Database

ScholarGrid uses a **lightweight in-memory database** backed by data.json. No SQL setup is required for the default local mode.

- Data is **automatically loaded** from `data.json` on server start
- Data is **saved back to disk** after every write operation
- The file is created automatically if it doesn't exist

### Optional Supabase Support
The repo includes supabase_setup.sql and a Supabase client stub. These are available for optional Supabase migration or future backend work, but the current running app uses the Express backend.

---

## 🔒 Roles & Permissions

| Role | Access |
|---|---|
| `student` | Student dashboard, notes, chat, leaderboard, feedback, profile |
| `faculty` | Full management panel (users, groups, notes moderation, complaints, analytics) |
| `superadmin` | All faculty permissions + user banning/deletion |

---

## 🛡️ Security Notes

- Passwords are hashed with **bcrypt** (10 salt rounds)
- All protected routes require a **JWT Bearer token** in the `Authorization` header
- Tokens are stored in `localStorage` and cleared on logout
- data.json contains hashed passwords — **do not share this file publicly**

---

## 📄 License

This project was built as a college collaboration platform. All rights reserved.
