const express = require('express');
const router = express.Router();
const { db } = require('../database');

router.get('/', (req, res) => {
  db.all('SELECT * FROM lectures ORDER BY date ASC, time ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

router.post('/', (req, res) => {
  const {
    title,
    course,
    date,
    time,
    end_time,
    duration,
    venue,
    notes,
    recurrence,
    repeat_from,
    repeat_to,
  } = req.body;
  db.run(
    `INSERT INTO lectures
      (title, course, date, time, end_time, duration, venue, notes, recurrence, repeat_from, repeat_to)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      course || '',
      date,
      time,
      end_time || null,
      duration || 60,
      venue || '',
      notes || '',
      recurrence || 'None',
      repeat_from || null,
      repeat_to || null,
    ],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Lecture scheduled' });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run('DELETE FROM lectures WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Lecture deleted' });
  });
});

module.exports = router;
