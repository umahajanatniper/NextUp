# Academic Activity Management App

A full-stack application for professors to monitor daily academic responsibilities:

- Letters and approval workflow
- Lecture schedule calendar tracking
- Meeting schedule calendar tracking
- Commitments tracker
- Talks planner with priorities

## Tech Stack

- Frontend: React
- Backend: Node.js + Express
- Database: SQLite
- Containerization: Docker + Docker Compose

## Project Structure

- `backend/` - REST API and SQLite database
- `frontend/` - React dashboard UI
- `docker-compose.yml` - local orchestration

## Quick Start (Single Command)

```bash
npm run setup
```

This installs all dependencies, builds the frontend, and starts the server on `http://localhost:5001`

## Run with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:5001/api

## Run without Docker

### Production Build (Recommended for testing)

```bash
# Install dependencies and build frontend
npm run install-all
npm run build

# Start the server with frontend served from built files
npm start
```

Server runs on: `http://localhost:5001`

### Development Mode (Frontend & Backend separately)

**Terminal 1 - Backend:**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm start
```

Frontend: http://localhost:3000
Backend API: http://localhost:5001/api

### Backend Email Setup (SMTP + IMAP)

1. Copy `backend/.env.example` to `backend/.env`.
2. Fill in SMTP and IMAP credentials.

Environment variables:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_SECURE`, `IMAP_USER`, `IMAP_PASS`

Email API endpoints:

- `GET /api/email/config` - check whether SMTP/IMAP is configured
- `POST /api/email/smtp/test` - verify SMTP connection
- `POST /api/email/smtp/send` - send a custom email
- `GET /api/email/imap/status` - inbox status (total/unseen)
- `GET /api/email/imap/messages?limit=10&unseenOnly=false` - latest inbox messages

Notes:

- Reminder emails reuse SMTP configuration.
- For Gmail/Outlook, use app passwords where required.

## Default Data Persistence

SQLite database is created at:

- `backend/academic_management.db`

This file stores all records persistently.
