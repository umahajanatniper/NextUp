const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  db.all('SELECT * FROM commitments ORDER BY due_date ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { title, description, due_date, status } = req.body;
  db.run(
    'INSERT INTO commitments (title, description, due_date, status) VALUES (?, ?, ?, ?)',
    [title, description || '', due_date || null, status || 'Pending'],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Commitment created' });
    }
  );
});

router.put('/:id', (req, res) => {
  const { title, description, due_date, status } = req.body;
  db.run(
    'UPDATE commitments SET title = ?, description = ?, due_date = ?, status = ? WHERE id = ?',
    [title, description, due_date, status, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Commitment updated' });
    }
  );
});

router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  db.run('UPDATE commitments SET status = ? WHERE id = ?', [status, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Status updated' });
  });
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM commitments WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Commitment deleted' });
  });
});

module.exports = router;
