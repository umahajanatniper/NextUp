const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  db.all('SELECT * FROM reminders ORDER BY remind_at ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { title, description, remind_at, recurrence, email, related_type, related_id } = req.body;
  db.run(
    'INSERT INTO reminders (title, description, remind_at, recurrence, email, related_type, related_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, description || '', remind_at, recurrence || 'None', email || null, related_type || null, related_id || null],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Reminder created' });
    }
  );
});

router.put('/:id', (req, res) => {
  const { title, description, remind_at, is_sent, recurrence, email, related_type, related_id } = req.body;
  db.run(
    'UPDATE reminders SET title = ?, description = ?, remind_at = ?, is_sent = ?, recurrence = ?, email = ?, related_type = ?, related_id = ? WHERE id = ?',
    [title, description || '', remind_at, is_sent ? 1 : 0, recurrence || 'None', email || null, related_type || null, related_id || null, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Reminder updated' });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM reminders WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Reminder deleted' });
  });
});

module.exports = router;
