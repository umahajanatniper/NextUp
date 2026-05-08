const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  db.all('SELECT * FROM talks ORDER BY CASE priority WHEN "High" THEN 1 WHEN "Medium" THEN 2 ELSE 3 END, COALESCE(deadline_date, due_date) ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { title, topic, audience, due_date, deadline_date, start_time, end_time, priority, status, notes } = req.body;
  db.run(
    'INSERT INTO talks (title, topic, audience, due_date, deadline_date, start_time, end_time, priority, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [title, topic || '', audience || '', due_date || null, deadline_date || due_date || null, start_time || null, end_time || null, priority || 'Medium', status || 'To Do', notes || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Talk added' });
    }
  );
});

router.put('/:id', (req, res) => {
  const { title, topic, audience, due_date, deadline_date, start_time, end_time, priority, status, notes } = req.body;
  db.run(
    'UPDATE talks SET title = ?, topic = ?, audience = ?, due_date = ?, deadline_date = ?, start_time = ?, end_time = ?, priority = ?, status = ?, notes = ? WHERE id = ?',
    [title, topic, audience, due_date, deadline_date || due_date || null, start_time || null, end_time || null, priority, status, notes, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Talk updated' });
    }
  );
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  db.run('UPDATE talks SET status = ? WHERE id = ?', [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Status updated' });
  });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM talks WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Talk deleted' });
  });
});

module.exports = router;
