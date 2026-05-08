import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const TIME_OPTIONS = Array.from({ length: 48 }, (_, idx) => {
  const h = String(Math.floor(idx / 2)).padStart(2, '0');
  const m = idx % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

const getMinutesBetween = (from, to) => {
  if (!from || !to) return 60;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const start = fh * 60 + fm;
  const end = th * 60 + tm;
  return end > start ? end - start : 60;
};

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const renderInlineMarkdown = (text) => {
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/`(.+?)`/g, '<code>$1</code>');
  out = out.replace(/\[(.+?)\]\((https?:\/\/[^\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return out;
};

const markdownToHtml = (md) => {
  const lines = md.split('\n');
  let html = '';
  let inList = false;

  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  lines.forEach((raw) => {
    const line = raw.trimEnd();

    if (!line.trim()) {
      closeList();
      html += '<br />';
      return;
    }

    if (line.startsWith('### ')) {
      closeList();
      html += `<h3>${renderInlineMarkdown(line.slice(4))}</h3>`;
      return;
    }

    if (line.startsWith('## ')) {
      closeList();
      html += `<h2>${renderInlineMarkdown(line.slice(3))}</h2>`;
      return;
    }

    if (line.startsWith('# ')) {
      closeList();
      html += `<h1>${renderInlineMarkdown(line.slice(2))}</h1>`;
      return;
    }

    if (line.startsWith('- ')) {
      if (!inList) {
        html += '<ul>';
        inList = true;
      }
      html += `<li>${renderInlineMarkdown(line.slice(2))}</li>`;
      return;
    }

    closeList();
    html += `<p>${renderInlineMarkdown(line)}</p>`;
  });

  closeList();
  return html;
};

/* ─── constants ─────────────────────────────────────────────── */
const emptyForms = {
  letter:     { title: '', send_to: '', description: '' },
  lecture:    {
    title: '', course: '', date_from: '', time_from: '09:00', time_to: '10:00',
    venue: '', recurrence: 'None', repeat_from: '', repeat_to: '',
  },
  meeting:    {
    title: '', with_whom: '', date_from: '', time_from: '10:00', time_to: '11:00',
    location: '', online_link: '',
  },
  task:       {
    title: '', description: '', subtasks: '', deadline_date: '', priority: 'Medium', status: 'To Do',
  },
  note:       { title: '', content: '' },
};

const EVENT_COLORS = {
  lecture:    '#1a4f8a',
  meeting:    '#2475b0',
  task:       '#1a7a48',
};

const EVENT_COLORS_RGB = {
  lecture:    '26, 79, 138',
  meeting:    '36, 117, 176',
  task:       '26, 122, 72',
};

const FILTER_LABELS = {
  lecture:    'Lectures',
  meeting:    'Meetings',
  task:       'Tasks',
};

const CALENDAR_FILTERS = ['lecture', 'meeting', 'task'];

const TABS = [
  { id: 'calendar',    label: 'Calendar'    },
  { id: 'letters',     label: 'Letters'     },
  { id: 'lectures',    label: 'Lectures'    },
  { id: 'meetings',    label: 'Meetings'    },
  { id: 'tasks',       label: 'Tasks'       },
  { id: 'notes',       label: 'Notes'       },

];

const locales = { 'en-US': enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });

/* ─── App ────────────────────────────────────────────────────── */
const fmtTs = (ts) => {
  if (!ts) return '';
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)
    ? `${ts.replace(' ', 'T')}Z`
    : ts;
  const d = new Date(normalized);
  return `${d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })} ${d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })}`;
};

function App() {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [authToken, setAuthToken]     = useState(() => localStorage.getItem('auth_token'));
  const [authScreen, setAuthScreen]   = useState('login'); // 'login' | 'forgot' | 'reset' | 'setup'
  const [authEmail, setAuthEmail]     = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authNewPassword, setAuthNewPassword] = useState('');
  const [authMsg, setAuthMsg]         = useState({ text: '', error: false });
  const [authLoading, setAuthLoading] = useState(false);
  const resetToken = new URLSearchParams(window.location.search).get('token');

  // Check setup status and decide initial screen
  useEffect(() => {
    if (authToken) return; // already logged in
    if (resetToken) { setAuthScreen('reset'); return; }
    api.get('/auth/status').then(r => {
      setAuthScreen(r.data.setup ? 'login' : 'setup');
    }).catch(() => setAuthScreen('login'));
  }, []); // eslint-disable-line

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true); setAuthMsg({ text: '', error: false });
    try {
      const r = await api.post('/auth/login', { email: authEmail, password: authPassword });
      localStorage.setItem('auth_token', r.data.token);
      setAuthToken(r.data.token);
    } catch (err) {
      setAuthMsg({ text: err.response?.data?.error || 'Login failed.', error: true });
    } finally { setAuthLoading(false); }
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    setAuthLoading(true); setAuthMsg({ text: '', error: false });
    try {
      await api.post('/auth/setup', { email: authEmail, password: authPassword });
      setAuthMsg({ text: 'Account created! Please log in.', error: false });
      setAuthScreen('login'); setAuthPassword('');
    } catch (err) {
      setAuthMsg({ text: err.response?.data?.error || 'Setup failed.', error: true });
    } finally { setAuthLoading(false); }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setAuthLoading(true); setAuthMsg({ text: '', error: false });
    try {
      await api.post('/auth/forgot-password', { email: authEmail });
      setAuthMsg({ text: 'If that email is registered, a reset link has been sent.', error: false });
    } catch {
      setAuthMsg({ text: 'Something went wrong. Try again.', error: true });
    } finally { setAuthLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setAuthLoading(true); setAuthMsg({ text: '', error: false });
    try {
      await api.post('/auth/reset-password', { token: resetToken, password: authNewPassword });
      setAuthMsg({ text: 'Password updated! You can now log in.', error: false });
      window.history.replaceState({}, '', '/');
      setTimeout(() => setAuthScreen('login'), 1500);
    } catch (err) {
      setAuthMsg({ text: err.response?.data?.error || 'Reset failed.', error: true });
    } finally { setAuthLoading(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setAuthToken(null);
    setAuthScreen('login');
    setAuthEmail(''); setAuthPassword('');
    setAuthMsg({ text: '', error: false });
  };

  const [data, setData] = useState({
    letters: [], lectures: [], meetings: [], tasks: [], notes: [],
  });
  const [forms, setForms]           = useState(emptyForms);
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('calendar');
  const [calendarView, setCalendarView] = useState('month');
  const [filters, setFilters]       = useState({ lecture: true, meeting: true, task: true });
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null);
  const [noteEditingId, setNoteEditingId] = useState(null);

  /* ── data loading ── */
  const loadAll = async () => {
    setLoading(true);
    try {
      const [letters, lectures, meetings, tasks, notes] = await Promise.all([
        api.get('/letters'),
        api.get('/lectures'),
        api.get('/meetings'),
        api.get('/talks'),        // backend table stays "talks"
        api.get('/notes'),
      ]);
      setData({
        letters: letters.data,
        lectures: lectures.data,
        meetings: meetings.data,
        tasks: tasks.data,
        notes: notes.data,
      });
    } catch (err) {
      console.error('Failed to load data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (authToken) loadAll(); }, [authToken]); // eslint-disable-line

  /* ── form helpers ── */
  const onInput = (section, field, value) =>
    setForms((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));

  const addRecord = async (section, endpoint) => {
    try {
      let payload = forms[section];

      if (section === 'lecture') {
        payload = {
          title: forms.lecture.title,
          course: forms.lecture.course,
          date: forms.lecture.date_from,
          time: forms.lecture.time_from,
          end_time: forms.lecture.time_to,
          duration: getMinutesBetween(forms.lecture.time_from, forms.lecture.time_to),
          venue: forms.lecture.venue,
          recurrence: forms.lecture.recurrence,
          repeat_from: forms.lecture.repeat_from || forms.lecture.date_from,
          repeat_to: forms.lecture.repeat_to || null,
        };
      }

      if (section === 'meeting') {
        payload = {
          title: forms.meeting.title,
          with_whom: forms.meeting.with_whom,
          date: forms.meeting.date_from,
          time: forms.meeting.time_from,
          end_time: forms.meeting.time_to,
          location: forms.meeting.location,
          online_link: forms.meeting.online_link,
          agenda: forms.meeting.online_link,
        };
      }

      if (section === 'task') {
        payload = {
          title: forms.task.title,
          topic: forms.task.description,
          audience: forms.task.subtasks,
          notes: forms.task.description,
          due_date: forms.task.deadline_date,
          deadline_date: forms.task.deadline_date,
          priority: forms.task.priority,
          status: forms.task.status,
        };
      }

      await api.post(endpoint, payload);
      setForms((prev) => ({ ...prev, [section]: emptyForms[section] }));
      loadAll();
    } catch (err) { console.error(`Failed to add ${section}`, err); }
  };

  const deleteRecord = async (endpoint, id) => {
    try { await api.delete(`${endpoint}/${id}`); loadAll(); }
    catch (err) { console.error('Delete error', err); }
  };

  const letterAction = async (id, action, payload) => {
    try { await api.put(`/letters/${id}/${action}`, payload || {}); loadAll(); }
    catch (err) { console.error('Letter action error', err); }
  };

  const taskStatusAction = async (id, status) => {
    try { await api.patch(`/talks/${id}/status`, { status }); loadAll(); }
    catch (err) { console.error('Task status error', err); }
  };

  const saveNote = async () => {
    const title = forms.note.title.trim();
    const content = forms.note.content.trim();
    if (!title || !content) return;

    try {
      if (noteEditingId) {
        await api.put(`/notes/${noteEditingId}`, { title, content });
      } else {
        await api.post('/notes', { title, content });
      }
      setForms((prev) => ({ ...prev, note: emptyForms.note }));
      setNoteEditingId(null);
      loadAll();
    } catch (err) {
      console.error('Note save error', err);
    }
  };

  const startEditNote = (note) => {
    setForms((prev) => ({
      ...prev,
      note: { title: note.title || '', content: note.content || '' },
    }));
    setNoteEditingId(note.id);
    setActiveTab('notes');
  };

  const cancelNoteEdit = () => {
    setForms((prev) => ({ ...prev, note: emptyForms.note }));
    setNoteEditingId(null);
  };

  /* ── calendar events ── */
  const calendarEvents = useMemo(() => {
    const statusIcon = (s) =>
      s === 'Completed' || s === 'Done' ? '✓ ' : s === 'In Progress' ? '⏳ ' : '';

    const lec = filters.lecture
      ? data.lectures.filter((i) => i.date && i.time).flatMap((i) => {
          const durationMs = (i.duration || 60) * 60000;
          const recurrence = i.recurrence || 'None';
          const startDate = i.repeat_from || i.date;
          const base = new Date(`${startDate}T${i.time}`);
          const horizon = i.repeat_to ? new Date(`${i.repeat_to}T23:59:59`) : new Date(base);
          if (!i.repeat_to) {
            horizon.setMonth(horizon.getMonth() + 4);
          }

          const stepDays = recurrence === 'Weekly' ? 7
            : recurrence === 'Fortnightly' ? 14
            : recurrence === 'Monthly' ? null   // handled separately
            : 0;

          const occurrences = [];
          let cursor = new Date(base);
          let idx = 0;
          while (cursor <= horizon) {
            const start = new Date(cursor);
            const end = i.end_time
              ? new Date(`${format(start, 'yyyy-MM-dd')}T${i.end_time}`)
              : new Date(start.getTime() + durationMs);
            occurrences.push({
              id: `lecture-${i.id}-${idx}`,
              title: `${i.title}${recurrence !== 'None' ? ' ↻' : ''}`,
              start,
              end,
              allDay: false,
              type: 'lecture',
              source: i,
            });
            if (stepDays === 0) break; // no recurrence — single event
            if (recurrence === 'Monthly') {
              cursor = new Date(cursor);
              cursor.setMonth(cursor.getMonth() + 1);
            } else {
              cursor = new Date(cursor.getTime() + stepDays * 86400000);
            }
            idx++;
          }
          return occurrences;
        }) : [];

    const meet = filters.meeting
      ? data.meetings.filter((i) => i.date && i.time).map((i) => {
          const start = new Date(`${i.date}T${i.time}`);
        const end = i.end_time
          ? new Date(`${i.date}T${i.end_time}`)
          : new Date(start.getTime() + 60 * 60000);
        return {
          id: `meeting-${i.id}`,
          title: i.title,
          start,
          end,
          allDay: false,
          type: 'meeting',
          source: i,
        };
        }) : [];

    const tsk = filters.task
      ? data.tasks.filter((i) => i.deadline_date || i.due_date).map((i) => {
          const taskDate = i.deadline_date || i.due_date;
          return ({
          id: `task-${i.id}`,
          title: `${statusIcon(i.status)}${i.title} [${i.priority}]`,
          type: 'task', allDay: true, status: i.status, priority: i.priority,
          start: new Date(`${taskDate}T00:00:00`),
          end: new Date(`${taskDate}T23:59:59`),
          source: i,
        });
      }) : [];

    return [...lec, ...meet, ...tsk];
  }, [data.lectures, data.meetings, data.tasks, filters]);

  const filterCounts = useMemo(() => ({
    lecture: data.lectures.length,
    meeting: data.meetings.length,
    task: data.tasks.length,
  }), [data.lectures.length, data.meetings.length, data.tasks.length]);

  /* ─── render ─────────────────────────────────────────────────── */
  if (!authToken) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">
          <img src="/logo.svg" alt="Academic Management" className="auth-logo" />

          {authScreen === 'setup' && (
            <form onSubmit={handleSetup}>
              <h2>Create Your Account</h2>
              <p className="auth-sub">Set up your admin account to get started.</p>
              <label>Email</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required autoFocus />
              <label>Password <span className="auth-hint">(min 8 characters)</span></label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required minLength={8} />
              {authMsg.text && <p className={authMsg.error ? 'auth-error' : 'auth-ok'}>{authMsg.text}</p>}
              <button type="submit" disabled={authLoading}>{authLoading ? 'Creating…' : 'Create Account'}</button>
            </form>
          )}

          {authScreen === 'login' && (
            <form onSubmit={handleLogin}>
              <h2>Sign In</h2>
              <label>Email</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required autoFocus />
              <label>Password</label>
              <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required />
              {authMsg.text && <p className={authMsg.error ? 'auth-error' : 'auth-ok'}>{authMsg.text}</p>}
              <button type="submit" disabled={authLoading}>{authLoading ? 'Signing in…' : 'Sign In'}</button>
              <p className="auth-link"><button type="button" onClick={() => { setAuthScreen('forgot'); setAuthMsg({ text: '', error: false }); }}>Forgot password?</button></p>
            </form>
          )}

          {authScreen === 'forgot' && (
            <form onSubmit={handleForgot}>
              <h2>Reset Password</h2>
              <p className="auth-sub">Enter your email and we'll send a reset link.</p>
              <label>Email</label>
              <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required autoFocus />
              {authMsg.text && <p className={authMsg.error ? 'auth-error' : 'auth-ok'}>{authMsg.text}</p>}
              <button type="submit" disabled={authLoading}>{authLoading ? 'Sending…' : 'Send Reset Link'}</button>
              <p className="auth-link"><button type="button" onClick={() => { setAuthScreen('login'); setAuthMsg({ text: '', error: false }); }}>Back to Sign In</button></p>
            </form>
          )}

          {authScreen === 'reset' && (
            <form onSubmit={handleReset}>
              <h2>Set New Password</h2>
              <label>New Password <span className="auth-hint">(min 8 characters)</span></label>
              <input type="password" value={authNewPassword} onChange={e => setAuthNewPassword(e.target.value)} required minLength={8} autoFocus />
              {authMsg.text && <p className={authMsg.error ? 'auth-error' : 'auth-ok'}>{authMsg.text}</p>}
              <button type="submit" disabled={authLoading}>{authLoading ? 'Updating…' : 'Update Password'}</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page">

      {/* ── header ── */}
      <header className="hero">
        <div className="hero-brand">
          <h1>Next<span className="logo-up">Up</span></h1>
        </div>
        <button className="logout-btn" onClick={handleLogout} title="Sign out">Sign Out</button>
      </header>

      {/* ── tab nav ── */}
      <nav className="tab-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn${activeTab === tab.id ? ' tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {loading && <p className="loading">Loading records…</p>}

      {/* ══════════════════ CALENDAR TAB ══════════════════ */}
      {activeTab === 'calendar' && (
        <div className="tab-page">
          <h2 className="tab-title">Academic Calendar</h2>
          <div className="filter-bar" role="tablist" aria-label="Academic calendar filters">
            {CALENDAR_FILTERS.map((type) => (
              <button
                key={type}
                className={`filter-btn${filters[type] ? ' filter-on' : ' filter-off'}`}
                role="tab"
                aria-selected={filters[type]}
                style={{ '--tab-color': EVENT_COLORS[type], '--tab-color-rgb': EVENT_COLORS_RGB[type] }}
                onClick={() => setFilters((prev) => ({ ...prev, [type]: !prev[type] }))}
              >
                <span className={`filter-check${filters[type] ? ' on' : ''}`}>✓</span>
                <span>{FILTER_LABELS[type]}</span>
                <span className="filter-count">{filterCounts[type]}</span>
              </button>
            ))}
          </div>
          <div className="calendar-shell">
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              views={['month', 'week', 'day']}
              view={calendarView}
              onView={setCalendarView}
              onSelectEvent={(event) => setSelectedCalendarEvent(event)}
              style={{ height: 580 }}
              eventPropGetter={(event) => {
                const base = EVENT_COLORS[event.type] || '#2d5da6';
                const done = event.status === 'Completed' || event.status === 'Done';
                const inProg = event.status === 'In Progress';
                return {
                  style: {
                    backgroundColor: done ? '#7a9e7a' : inProg ? '#e09a30' : base,
                    border: 'none',
                    borderRadius: '5px',
                    color: '#fff',
                    opacity: done ? 0.7 : 1,
                    textDecoration: done ? 'line-through' : 'none',
                  },
                };
              }}
            />
          </div>
          {selectedCalendarEvent && (
            <div className="event-detail-card">
              <h3>{selectedCalendarEvent.title}</h3>
              <p><strong>Type:</strong> {FILTER_LABELS[selectedCalendarEvent.type]}</p>
              <p><strong>From:</strong> {format(selectedCalendarEvent.start, 'dd MMM yyyy HH:mm')}</p>
              <p><strong>To:</strong> {format(selectedCalendarEvent.end, 'dd MMM yyyy HH:mm')}</p>

              {selectedCalendarEvent.type === 'lecture' && (
                <>
                  <p><strong>Course:</strong> {selectedCalendarEvent.source.course || '—'}</p>
                  <p><strong>Venue:</strong> {selectedCalendarEvent.source.venue || '—'}</p>
                  <p><strong>Repeat:</strong> {selectedCalendarEvent.source.recurrence || 'None'}</p>
                  {(selectedCalendarEvent.source.repeat_from || selectedCalendarEvent.source.repeat_to) && (
                    <p>
                      <strong>Repeat Range:</strong>{' '}
                      {selectedCalendarEvent.source.repeat_from || '—'} to {selectedCalendarEvent.source.repeat_to || '—'}
                    </p>
                  )}
                </>
              )}

              {selectedCalendarEvent.type === 'meeting' && (
                <>
                  <p><strong>With:</strong> {selectedCalendarEvent.source.with_whom || '—'}</p>
                  <p><strong>Location:</strong> {selectedCalendarEvent.source.location || '—'}</p>
                  <p><strong>Online Link:</strong> {selectedCalendarEvent.source.online_link || selectedCalendarEvent.source.agenda || '—'}</p>
                </>
              )}

              {selectedCalendarEvent.type === 'task' && (
                <>
                  <p><strong>Priority:</strong> {selectedCalendarEvent.source.priority || '—'}</p>
                  <p><strong>Status:</strong> {selectedCalendarEvent.source.status || '—'}</p>
                  <p><strong>Deadline:</strong> {selectedCalendarEvent.source.deadline_date || selectedCalendarEvent.source.due_date || '—'}</p>
                  <p><strong>Description:</strong> {selectedCalendarEvent.source.notes || selectedCalendarEvent.source.topic || '—'}</p>
                  <p><strong>Subtasks:</strong> {selectedCalendarEvent.source.audience || '—'}</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════ LETTERS TAB ══════════════════ */}
      {activeTab === 'letters' && (
        <div className="tab-page">
          <h2 className="tab-title">Letters and Approvals</h2>
          <div className="form-row">
            <input placeholder="Letter title" value={forms.letter.title}
              onChange={(e) => onInput('letter', 'title', e.target.value)} />
            <input placeholder="Send to (person / office)" value={forms.letter.send_to}
              onChange={(e) => onInput('letter', 'send_to', e.target.value)} />
          </div>
          <textarea placeholder="Description" value={forms.letter.description}
            onChange={(e) => onInput('letter', 'description', e.target.value)} />
          <button onClick={() => addRecord('letter', '/letters')}>Save as Draft</button>

          <table className="letter-table">
            <thead>
              <tr>
                <th>Letter Title</th>
                <th>Send To</th>
                <th>Description</th>
                <th>Status</th>
                <th>Timeline</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.letters.map((item) => (
                <tr key={item.id}>
                  <td className="lt-title">{item.title}</td>
                  <td>{item.send_to || <span className="muted">—</span>}</td>
                  <td className="lt-desc">{item.description || <span className="muted">—</span>}</td>
                  <td>
                    <span className={`status-badge status-${item.status.toLowerCase().replace(' ', '-')}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="lt-timeline">
                    <div className="ts-row">Drafted: <span>{fmtTs(item.created_at)}</span></div>
                    {item.sent_at    && <div className="ts-row">Sent: <span>{fmtTs(item.sent_at)}</span></div>}
                    {item.decided_at && <div className="ts-row">Decided: <span>{fmtTs(item.decided_at)}</span></div>}
                  </td>
                  <td className="lt-actions">
                    {item.status === 'Draft' && (
                      <button className="action-btn send-btn"
                        onClick={() => letterAction(item.id, 'send')}>Mark Sent</button>
                    )}
                    {item.status === 'Sent' && (<>
                      <button className="action-btn approve-btn"
                        onClick={() => letterAction(item.id, 'decide', { decision: 'Approved' })}>Approved</button>
                      <button className="action-btn reject-btn"
                        onClick={() => letterAction(item.id, 'decide', { decision: 'Rejected' })}>Rejected</button>
                    </>)}
                    {item.status !== 'Approved' && item.status !== 'Rejected' && (
                      <button className="mini"
                        onClick={() => deleteRecord('/letters', item.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════ LECTURES TAB ══════════════════ */}
      {activeTab === 'lectures' && (
        <div className="tab-page">
          <h2 className="tab-title">Lecture Schedule</h2>
          <div className="form-row">
            <input placeholder="Lecture title" value={forms.lecture.title}
              onChange={(e) => onInput('lecture', 'title', e.target.value)} />
            <input placeholder="Course" value={forms.lecture.course}
              onChange={(e) => onInput('lecture', 'course', e.target.value)} />
          </div>
          <div className="form-row three">
            <input type="date" value={forms.lecture.date_from}
              onChange={(e) => onInput('lecture', 'date_from', e.target.value)} />
            <select value={forms.lecture.time_from}
              onChange={(e) => onInput('lecture', 'time_from', e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={`lecture-from-${t}`} value={t}>{t}</option>)}
            </select>
            <select value={forms.lecture.time_to}
              onChange={(e) => onInput('lecture', 'time_to', e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={`lecture-to-${t}`} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <input placeholder="Venue" value={forms.lecture.venue}
              onChange={(e) => onInput('lecture', 'venue', e.target.value)} />
            <div className="muted">Time: From - To</div>
          </div>
          <div className="form-row">
            <select value={forms.lecture.recurrence}
              onChange={(e) => onInput('lecture', 'recurrence', e.target.value)}>
              <option value="None">No Repeat</option>
              <option value="Weekly">Weekly</option>
              <option value="Fortnightly">Fortnightly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
          {forms.lecture.recurrence !== 'None' && (
            <div className="form-row">
              <input type="date" value={forms.lecture.repeat_from}
                onChange={(e) => onInput('lecture', 'repeat_from', e.target.value)}
                placeholder="Repeat from" />
              <input type="date" value={forms.lecture.repeat_to}
                onChange={(e) => onInput('lecture', 'repeat_to', e.target.value)}
                placeholder="Repeat to" />
            </div>
          )}
          <button onClick={() => addRecord('lecture', '/lectures')}>Add Lecture</button>

          <table className="letter-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Course</th>
                <th>Date &amp; Time</th>
                <th>Venue</th>
                <th>Repeat</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.lectures.map((item) => (
                <tr key={item.id}>
                  <td className="lt-title">{item.title}</td>
                  <td>{item.course || <span className="muted">—</span>}</td>
                  <td>
                    <strong>{item.date}</strong>
                    {item.time && <span className="muted"> {item.time}</span>}
                    {item.end_time && <span className="muted"> - {item.end_time}</span>}
                  </td>
                  <td>{item.venue || <span className="muted">—</span>}</td>
                  <td>{item.recurrence && item.recurrence !== 'None'
                    ? <span className="recurrence-badge">↻ {item.recurrence}</span>
                    : <span className="muted">—</span>}
                  </td>
                  <td className="lt-timeline"><div className="ts-row">Added: <span>{fmtTs(item.created_at)}</span></div></td>
                  <td className="lt-actions">
                    <button className="mini" onClick={() => deleteRecord('/lectures', item.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════ MEETINGS TAB ══════════════════ */}
      {activeTab === 'meetings' && (
        <div className="tab-page">
          <h2 className="tab-title">Meeting Schedule</h2>
          <div className="form-row">
            <input placeholder="Meeting title" value={forms.meeting.title}
              onChange={(e) => onInput('meeting', 'title', e.target.value)} />
            <input placeholder="With whom" value={forms.meeting.with_whom}
              onChange={(e) => onInput('meeting', 'with_whom', e.target.value)} />
          </div>
          <div className="form-row three">
            <input type="date" value={forms.meeting.date_from}
              onChange={(e) => onInput('meeting', 'date_from', e.target.value)} />
            <select value={forms.meeting.time_from}
              onChange={(e) => onInput('meeting', 'time_from', e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={`meeting-from-${t}`} value={t}>{t}</option>)}
            </select>
            <select value={forms.meeting.time_to}
              onChange={(e) => onInput('meeting', 'time_to', e.target.value)}>
              {TIME_OPTIONS.map((t) => <option key={`meeting-to-${t}`} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-row">
            <input placeholder="Location" value={forms.meeting.location}
              onChange={(e) => onInput('meeting', 'location', e.target.value)} />
            <input placeholder="Online meeting link" value={forms.meeting.online_link}
              onChange={(e) => onInput('meeting', 'online_link', e.target.value)} />
          </div>
          <button onClick={() => addRecord('meeting', '/meetings')}>Add Meeting</button>

          <table className="letter-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>With</th>
                <th>Date &amp; Time</th>
                <th>Location</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.meetings.map((item) => (
                <tr key={item.id}>
                  <td className="lt-title">{item.title}</td>
                  <td>{item.with_whom || <span className="muted">—</span>}</td>
                  <td>
                    <strong>{item.date}</strong>
                    {item.time && <span className="muted"> {item.time}</span>}
                    {item.end_time && <span className="muted"> - {item.end_time}</span>}
                  </td>
                  <td>{item.location || <span className="muted">—</span>}</td>
                  <td className="lt-timeline"><div className="ts-row">Added: <span>{fmtTs(item.created_at)}</span></div></td>
                  <td className="lt-actions">
                    <button className="mini" onClick={() => deleteRecord('/meetings', item.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════ TASKS TAB ══════════════════ */}
      {activeTab === 'tasks' && (
        <div className="tab-page">
          <h2 className="tab-title">Tasks with Priority</h2>
          <div className="form-row">
            <input placeholder="Task title" value={forms.task.title}
              onChange={(e) => onInput('task', 'title', e.target.value)} />
            <input type="date" value={forms.task.deadline_date}
              onChange={(e) => onInput('task', 'deadline_date', e.target.value)} />
          </div>
          <div className="form-row">
            <textarea placeholder="Description" value={forms.task.description}
              onChange={(e) => onInput('task', 'description', e.target.value)} />
            <textarea placeholder="Subtasks (comma-separated)" value={forms.task.subtasks}
              onChange={(e) => onInput('task', 'subtasks', e.target.value)} />
          </div>
          <div className="form-row">
            <select value={forms.task.priority}
              onChange={(e) => onInput('task', 'priority', e.target.value)}>
              <option>High</option><option>Medium</option><option>Low</option>
            </select>
            <select value={forms.task.status}
              onChange={(e) => onInput('task', 'status', e.target.value)}>
              <option>To Do</option><option>In Progress</option><option>Done</option>
            </select>
          </div>
          <button onClick={() => addRecord('task', '/talks')}>Add Task</button>

          <table className="letter-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Description / Subtasks</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Deadline Date</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((item) => (
                <tr key={item.id}>
                  <td className="lt-title">{item.title}</td>
                  <td className="lt-desc">
                    {(item.notes || item.topic) && <div>{item.notes || item.topic}</div>}
                    {item.audience && <div className="muted">{item.audience}</div>}
                    {!item.notes && !item.topic && !item.audience && <span className="muted">—</span>}
                  </td>
                  <td>
                    <span className={`priority-badge prio-${item.priority.toLowerCase()}`}>{item.priority}</span>
                  </td>
                  <td>
                    <span className={`status-badge status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span>
                  </td>
                  <td>
                    {item.deadline_date || item.due_date || <span className="muted">—</span>}
                  </td>
                  <td className="lt-timeline"><div className="ts-row">Added: <span>{fmtTs(item.created_at)}</span></div></td>
                  <td className="lt-actions">
                    {item.status === 'To Do' && (
                      <button className="action-btn send-btn"
                        onClick={() => taskStatusAction(item.id, 'In Progress')}>Start</button>
                    )}
                    {item.status === 'In Progress' && (
                      <button className="action-btn approve-btn"
                        onClick={() => taskStatusAction(item.id, 'Done')}>Done</button>
                    )}
                    {item.status === 'Done' && (
                      <button className="action-btn"
                        style={{ background: '#e8f0fe', color: '#1a4aaa' }}
                        onClick={() => taskStatusAction(item.id, 'To Do')}>Reopen</button>
                    )}
                    {item.status !== 'Done' && (
                      <button className="mini" onClick={() => deleteRecord('/talks', item.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ══════════════════ NOTES TAB ══════════════════ */}
      {activeTab === 'notes' && (
        <div className="tab-page">
          <h2 className="tab-title">Notes (Markdown)</h2>
          <div className="form-row">
            <input
              placeholder="Note title"
              value={forms.note.title}
              onChange={(e) => onInput('note', 'title', e.target.value)}
            />
          </div>
          <textarea
            className="md-editor"
            placeholder={'Use Markdown, e.g.\n# Heading\n- item 1\n- item 2\n**bold** _italic_'}
            value={forms.note.content}
            onChange={(e) => onInput('note', 'content', e.target.value)}
          />
          <div className="note-actions">
            <button onClick={saveNote}>{noteEditingId ? 'Update Note' : 'Save Note'}</button>
            {noteEditingId && <button className="mini" onClick={cancelNoteEdit}>Cancel Edit</button>}
          </div>

          <div className="notes-grid">
            {data.notes.map((item) => (
              <article key={item.id} className="note-card">
                <h3>{item.title}</h3>
                <div
                  className="md-preview"
                  dangerouslySetInnerHTML={{ __html: markdownToHtml(item.content || '') }}
                />
                <div className="lt-timeline">
                  <div className="ts-row">Updated: <span>{fmtTs(item.updated_at || item.created_at)}</span></div>
                </div>
                <div className="note-actions">
                  <button onClick={() => startEditNote(item)}>Edit</button>
                  <button className="mini" onClick={() => deleteRecord('/notes', item.id)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
