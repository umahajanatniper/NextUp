const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  db.all('SELECT * FROM meetings ORDER BY date ASC, time ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const { title, with_whom, date, time, end_time, agenda, location, online_link } = req.body;
  db.run(
    'INSERT INTO meetings (title, with_whom, date, time, end_time, agenda, location, online_link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [title, with_whom || '', date, time, end_time || null, agenda || '', location || '', online_link || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Meeting scheduled' });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM meetings WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Meeting deleted' });
  });
});

module.exports = router;
