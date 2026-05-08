const express = require('express');
const router = express.Router();

const {
  hasSmtpConfig,
  hasImapConfig,
  testSmtpConnection,
  sendMailViaSmtp,
  getImapStatus,
  listImapMessages,
} = require('../services/emailClient');

router.get('/config', (req, res) => {
  res.json({
    smtpConfigured: hasSmtpConfig(),
    imapConfigured: hasImapConfig(),
  });
});

router.post('/smtp/test', async (req, res) => {
  try {
    await testSmtpConnection();
    res.json({ message: 'SMTP connection is valid.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/smtp/send', async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;
    const result = await sendMailViaSmtp({ to, subject, text, html });
    res.status(201).json({ message: 'Email sent.', ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/imap/status', async (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const status = await getImapStatus(mailbox);
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/imap/messages', async (req, res) => {
  try {
    const mailbox = req.query.mailbox || 'INBOX';
    const limit = parseInt(req.query.limit || '10', 10);
    const unseenOnly = String(req.query.unseenOnly || 'false').toLowerCase() === 'true';

    const payload = await listImapMessages({ mailbox, limit: Math.max(1, Math.min(limit, 50)), unseenOnly });
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
