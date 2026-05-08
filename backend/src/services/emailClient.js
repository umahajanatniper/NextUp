const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');

const asBool = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
};

const getSmtpConfig = () => ({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: asBool(process.env.SMTP_SECURE, false),
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS,
  from: process.env.SMTP_FROM || process.env.SMTP_USER,
});

const getImapConfig = () => ({
  host: process.env.IMAP_HOST,
  port: parseInt(process.env.IMAP_PORT || '993', 10),
  secure: asBool(process.env.IMAP_SECURE, true),
  user: process.env.IMAP_USER,
  pass: process.env.IMAP_PASS,
});

const hasSmtpConfig = () => {
  const cfg = getSmtpConfig();
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass);
};

const hasImapConfig = () => {
  const cfg = getImapConfig();
  return Boolean(cfg.host && cfg.port && cfg.user && cfg.pass);
};

const createSmtpTransport = () => {
  const cfg = getSmtpConfig();
  if (!hasSmtpConfig()) {
    throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  }
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
};

const testSmtpConnection = async () => {
  const transport = createSmtpTransport();
  await transport.verify();
  return { ok: true };
};

const sendMailViaSmtp = async ({ to, subject, text, html }) => {
  if (!to) throw new Error('Recipient address is required.');
  if (!subject) throw new Error('Email subject is required.');

  const cfg = getSmtpConfig();
  const transport = createSmtpTransport();
  const result = await transport.sendMail({
    from: cfg.from,
    to,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
  };
};

const sendReminderEmail = async (reminder) => {
  if (!hasSmtpConfig() || !reminder.email) return { sent: false };

  const html = `<h2 style="color:#1c2e5a">${reminder.title}</h2><p>${reminder.description || ''}</p><hr/><small>NextUp Academic Tracker</small>`;

  const info = await sendMailViaSmtp({
    to: reminder.email,
    subject: `NextUp Reminder: ${reminder.title}`,
    html,
    text: `${reminder.title}\n\n${reminder.description || ''}\n\nNextUp Academic Tracker`,
  });

  return { sent: true, ...info };
};

const withImapClient = async (callback) => {
  if (!hasImapConfig()) {
    throw new Error('IMAP is not configured. Set IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS.');
  }

  const cfg = getImapConfig();
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.logout();
  }
};

const getImapStatus = async (mailbox = 'INBOX') => withImapClient(async (client) => {
  const status = await client.status(mailbox, { messages: true, unseen: true, uidNext: true });
  return {
    mailbox,
    messages: status.messages || 0,
    unseen: status.unseen || 0,
    uidNext: status.uidNext || null,
  };
});

const listImapMessages = async ({ mailbox = 'INBOX', limit = 10, unseenOnly = false }) => withImapClient(async (client) => {
  const lock = await client.getMailboxLock(mailbox);

  try {
    const status = await client.status(mailbox, { messages: true });
    const total = status.messages || 0;

    if (total === 0) {
      return { mailbox, total: 0, messages: [] };
    }

    let sequenceNumbers;
    if (unseenOnly) {
      sequenceNumbers = await client.search({ seen: false });
    } else {
      const start = Math.max(1, total - limit + 1);
      const end = total;
      sequenceNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    if (!sequenceNumbers.length) {
      return { mailbox, total, messages: [] };
    }

    const selected = sequenceNumbers.slice(-limit);
    const range = selected.length === 1
      ? `${selected[0]}`
      : `${selected[0]}:${selected[selected.length - 1]}`;

    const messages = [];
    for await (const msg of client.fetch(range, {
      uid: true,
      envelope: true,
      flags: true,
      internalDate: true,
    })) {
      const from = (msg.envelope?.from || []).map((item) => ({
        name: item.name || '',
        address: item.address || '',
      }));

      messages.push({
        uid: msg.uid,
        subject: msg.envelope?.subject || '',
        from,
        date: msg.internalDate ? new Date(msg.internalDate).toISOString() : null,
        seen: msg.flags?.has('\\Seen') || false,
      });
    }

    messages.sort((a, b) => {
      if (!a.date || !b.date) return 0;
      return new Date(b.date) - new Date(a.date);
    });

    return { mailbox, total, messages };
  } finally {
    lock.release();
  }
});

module.exports = {
  hasSmtpConfig,
  hasImapConfig,
  testSmtpConnection,
  sendMailViaSmtp,
  sendReminderEmail,
  getImapStatus,
  listImapMessages,
};
