const express = require('express');
const router = express.Router();
const { db } = require('../database');

// GET all letters
router.get('/', (req, res) => {
  db.all('SELECT * FROM letters ORDER BY created_at DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST — always creates as Draft
router.post('/', (req, res) => {
  const { title, send_to, description } = req.body;
  db.run(
    `INSERT INTO letters (title, send_to, description, status)
     VALUES (?, ?, ?, 'Draft')`,
    [title, send_to || '', description || ''],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, message: 'Letter created as Draft' });
    }
  );
});

// PUT /:id/send — Draft → Sent (timestamps sent_at)
router.put('/:id/send', (req, res) => {
  db.run(
    `UPDATE letters SET status = 'Sent', sent_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'Draft'`,
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(400).json({ error: 'Letter must be in Draft status to send' });
      res.json({ message: 'Letter marked as Sent' });
    }
  );
});

// PUT /:id/decide — Sent → Approved | Rejected (timestamps decided_at)
router.put('/:id/decide', (req, res) => {
  const { decision } = req.body;
  if (!['Approved', 'Rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be Approved or Rejected' });
  }
  db.run(
    `UPDATE letters SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'Sent'`,
    [decision, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(400).json({ error: 'Letter must be in Sent status to decide' });
      res.json({ message: `Letter marked as ${decision}` });
    }
  );
});

// DELETE
router.delete('/:id', (req, res) => {
  db.run('DELETE FROM letters WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Letter deleted' });
  });
});

module.exports = router;
