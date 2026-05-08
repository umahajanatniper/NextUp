require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { initializeDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const { requireAuth } = require('./middleware/auth');
const lettersRoutes = require('./routes/letters');
const lecturesRoutes = require('./routes/lectures');
const meetingsRoutes = require('./routes/meetings');
const commitmentsRoutes = require('./routes/commitments');
const talksRoutes = require('./routes/talks');
const notesRoutes = require('./routes/notes');
const remindersRoutes = require('./routes/reminders');
const emailRoutes = require('./routes/email');
const { sendReminderEmail } = require('./services/emailClient');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(bodyParser.json());

// Serve static files from frontend build
const frontendBuildPath = path.join(__dirname, '../../frontend/build');
app.use(express.static(frontendBuildPath));

initializeDatabase();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Academic Management API is running' });
});

// Public auth routes (no JWT required)
app.use('/api/auth', authRoutes);

// All other API routes are protected
app.use('/api/letters', requireAuth, lettersRoutes);
app.use('/api/lectures', requireAuth, lecturesRoutes);
app.use('/api/meetings', requireAuth, meetingsRoutes);
app.use('/api/commitments', requireAuth, commitmentsRoutes);
app.use('/api/talks', requireAuth, talksRoutes);
app.use('/api/notes', requireAuth, notesRoutes);
app.use('/api/reminders', requireAuth, remindersRoutes);
app.use('/api/email', requireAuth, emailRoutes);

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'));
});
const { db: schedulerDb } = require('./database');

const calcNextDate = (remind_at, recurrence) => {
  const d = new Date(remind_at);
  if (isNaN(d.getTime())) return null; // Invalid date
  if (recurrence === 'Daily') d.setDate(d.getDate() + 1);
  else if (recurrence === 'Weekly') d.setDate(d.getDate() + 7);
  else if (recurrence === 'Monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 16);
};

setInterval(() => {
  const now = new Date().toISOString().slice(0, 16);
  schedulerDb.all(
    'SELECT * FROM reminders WHERE is_sent = 0 AND remind_at <= ?',
    [now],
    (err, rows) => {
      if (err) return;
      rows.forEach((reminder) => {
        sendReminderEmail(reminder).catch((emailErr) => {
          console.error('Reminder email error:', emailErr.message);
        });
        if (reminder.recurrence && reminder.recurrence !== 'None') {
          const next = calcNextDate(reminder.remind_at, reminder.recurrence);
          if (next) {
            schedulerDb.run(
              'UPDATE reminders SET remind_at = ?, next_remind_at = ?, is_sent = 0 WHERE id = ?',
              [next, next, reminder.id]
            );
          } else {
            schedulerDb.run('UPDATE reminders SET is_sent = 1 WHERE id = ?', [reminder.id]);
          }
        } else {
          schedulerDb.run('UPDATE reminders SET is_sent = 1 WHERE id = ?', [reminder.id]);
        }
      });
    }
  );
}, 60000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
