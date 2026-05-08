const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// On Render, use the persistent disk mount; locally use the backend folder
const dbPath = process.env.DB_PATH ||
  (process.env.NODE_ENV === 'production'
    ? '/data/academic_management.db'
    : path.join(__dirname, '..', 'academic_management.db'));
const db = new sqlite3.Database(dbPath);

const initializeDatabase = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS letters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        send_to TEXT,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'Draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME,
        decided_at DATETIME
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS lectures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        course TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        end_time TEXT,
        duration INTEGER,
        venue TEXT,
        notes TEXT,
        recurrence TEXT DEFAULT 'None',
        repeat_from TEXT,
        repeat_to TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS meetings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        with_whom TEXT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        end_time TEXT,
        agenda TEXT,
        location TEXT,
        online_link TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS commitments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        status TEXT NOT NULL CHECK(status IN ('Pending', 'In Progress', 'Completed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS talks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        topic TEXT,
        audience TEXT,
        due_date TEXT,
        deadline_date TEXT,
        start_time TEXT,
        end_time TEXT,
        priority TEXT NOT NULL CHECK(priority IN ('High', 'Medium', 'Low')),
        status TEXT NOT NULL CHECK(status IN ('To Do', 'In Progress', 'Done')),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        remind_at TEXT NOT NULL,
        is_sent INTEGER NOT NULL DEFAULT 0,
        recurrence TEXT NOT NULL DEFAULT 'None',
        email TEXT,
        next_remind_at TEXT,
        related_type TEXT,
        related_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Migrate existing installs — ignore errors if columns already exist
    [
      "ALTER TABLE reminders ADD COLUMN recurrence TEXT DEFAULT 'None'",
      'ALTER TABLE reminders ADD COLUMN email TEXT',
      'ALTER TABLE reminders ADD COLUMN next_remind_at TEXT',
      'ALTER TABLE letters ADD COLUMN send_to TEXT',
      'ALTER TABLE letters ADD COLUMN description TEXT',
      'ALTER TABLE letters ADD COLUMN sent_at DATETIME',
      'ALTER TABLE letters ADD COLUMN decided_at DATETIME',
      "ALTER TABLE lectures ADD COLUMN recurrence TEXT DEFAULT 'None'",
      'ALTER TABLE lectures ADD COLUMN end_time TEXT',
      'ALTER TABLE lectures ADD COLUMN repeat_from TEXT',
      'ALTER TABLE lectures ADD COLUMN repeat_to TEXT',
      'ALTER TABLE meetings ADD COLUMN end_time TEXT',
      'ALTER TABLE meetings ADD COLUMN online_link TEXT',
      'ALTER TABLE talks ADD COLUMN deadline_date TEXT',
      'ALTER TABLE talks ADD COLUMN start_time TEXT',
      'ALTER TABLE talks ADD COLUMN end_time TEXT',
    ].forEach((sql) => db.run(sql, () => {}));
  });
};

module.exports = { db, initializeDatabase };
