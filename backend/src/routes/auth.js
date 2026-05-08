const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { db } = require('../database');
const { sendMailViaSmtp } = require('../services/emailClient');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const APP_URL = process.env.APP_URL || 'http://localhost:5001';

// ── Setup (first-run: create admin account) ─────────────────────────────────
router.post('/setup', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  db.get('SELECT id FROM users LIMIT 1', (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (row) return res.status(403).json({ error: 'App is already set up.' });

    const hash = bcrypt.hashSync(password, 12);
    db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email.toLowerCase().trim(), hash], function (e) {
      if (e) return res.status(500).json({ error: 'Could not create user.' });
      res.json({ ok: true });
    });
  });
});

// ── Check if setup is needed ─────────────────────────────────────────────────
router.get('/status', (req, res) => {
  db.get('SELECT id FROM users LIMIT 1', (err, row) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    res.json({ setup: !!row });
  });
});

// ── Login ────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, email: user.email });
  });
});

// ── Forgot password ──────────────────────────────────────────────────────────
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required.' });

  db.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()], (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error.' });
    // Always respond ok to avoid email enumeration
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Invalidate old tokens for this user
    db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id], () => {
      db.run(
        'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
        [user.id, token, expires],
        (insertErr) => {
          if (insertErr) return res.status(500).json({ error: 'Could not create reset token.' });

          const resetLink = `${APP_URL}/reset-password?token=${token}`;
          sendMailViaSmtp({
            to: user.email,
            subject: 'Password Reset – Academic Management',
            html: `
              <p>Hello,</p>
              <p>You requested a password reset. Click the link below (valid for 1 hour):</p>
              <p><a href="${resetLink}">${resetLink}</a></p>
              <p>If you did not request this, you can safely ignore this email.</p>
            `,
            text: `Reset your password: ${resetLink}`,
          }).catch((mailErr) => console.error('Reset email error:', mailErr.message));

          res.json({ ok: true });
        }
      );
    });
  });
});

// ── Reset password ───────────────────────────────────────────────────────────
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const now = new Date().toISOString();
  db.get(
    'SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0 AND expires_at > ?',
    [token, now],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error.' });
      if (!row) return res.status(400).json({ error: 'Invalid or expired reset link.' });

      const hash = bcrypt.hashSync(password, 12);
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, row.user_id], (updateErr) => {
        if (updateErr) return res.status(500).json({ error: 'Could not update password.' });
        db.run('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [row.id]);
        res.json({ ok: true });
      });
    }
  );
});

module.exports = router;
