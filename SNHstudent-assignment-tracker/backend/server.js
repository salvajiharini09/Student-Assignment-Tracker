require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createSupabaseClient } = require('./supabase');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map(value => value.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('This browser origin is not allowed by CORS.'));
  }
}));
app.use(express.json({ limit: '32kb' }));

let supabase;
try {
  supabase = createSupabaseClient();
} catch (error) {
  // Keep health/docs routes available, but fail database routes clearly until configured.
  console.warn(`[configuration] ${error.message}`);
}

const allowedStatuses = ['pending', 'in_progress', 'completed'];
const allowedPriorities = ['low', 'medium', 'high'];
const fields = ['title', 'subject', 'due_date', 'priority', 'status', 'estimated_hours', 'notes'];

function validatePayload(body, partial = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Request body must be a JSON object.';
  const unknown = Object.keys(body).filter(key => !fields.includes(key));
  if (unknown.length) return `Unknown field(s): ${unknown.join(', ')}.`;
  if (!partial || Object.hasOwn(body, 'title')) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 160) return 'Title is required and must be 1–160 characters.';
  }
  if (!partial || Object.hasOwn(body, 'subject')) {
    if (typeof body.subject !== 'string' || !body.subject.trim() || body.subject.trim().length > 100) return 'Subject is required and must be 1–100 characters.';
  }
  if (!partial || Object.hasOwn(body, 'due_date')) {
    if (typeof body.due_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.due_date) || !Number.isFinite(Date.parse(`${body.due_date}T00:00:00Z`)) || new Date(`${body.due_date}T00:00:00Z`).toISOString().slice(0,10) !== body.due_date) return 'Due date must be a valid date in YYYY-MM-DD format.';
  }
  if (Object.hasOwn(body, 'priority') && !allowedPriorities.includes(body.priority)) return `Priority must be one of: ${allowedPriorities.join(', ')}.`;
  if (Object.hasOwn(body, 'status') && !allowedStatuses.includes(body.status)) return `Status must be one of: ${allowedStatuses.join(', ')}.`;
  if (Object.hasOwn(body, 'estimated_hours') && body.estimated_hours !== null &&
      (typeof body.estimated_hours !== 'number' || !Number.isFinite(body.estimated_hours) || body.estimated_hours < 0 || body.estimated_hours > 500)) return 'Estimated hours must be a number from 0 to 500, or null.';
  if (Object.hasOwn(body, 'notes') && body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 2000)) return 'Notes must be at most 2000 characters, or null.';
  return null;
}
function requireDatabase(req, res, next) {
  if (!supabase) return res.status(503).json({ error: 'Database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env, then restart the server.' });
  next();
}
function dbError(res, error) {
  console.error('[database]', error.message || error);
  return res.status(500).json({ error: 'Database operation failed. Check your Supabase schema, credentials, and server logs.' });
}
app.get('/api/health', (req, res) => res.json({ status: 'ok', databaseConfigured: Boolean(supabase), timestamp: new Date().toISOString() }));
app.get('/api', (req, res) => res.json({ name: 'Student Assignment Tracker API', version: '1.0.0', endpoints: ['GET /api/health', 'GET /api/assignments', 'POST /api/assignments', 'GET /api/assignments/:id', 'PATCH /api/assignments/:id', 'DELETE /api/assignments/:id'] }));

app.get('/api/assignments', requireDatabase, async (req, res) => {
  try {
    let query = supabase.from('assignments').select('*').order('due_date', { ascending: true }).order('created_at', { ascending: false });
    if (req.query.status) {
      if (!allowedStatuses.includes(req.query.status)) return res.status(400).json({ error: 'Invalid status filter.' });
      query = query.eq('status', req.query.status);
    }
    if (req.query.priority) {
      if (!allowedPriorities.includes(req.query.priority)) return res.status(400).json({ error: 'Invalid priority filter.' });
      query = query.eq('priority', req.query.priority);
    }
    const { data, error } = await query;
    if (error) return dbError(res, error);
    res.json({ assignments: data });
  } catch (error) { return dbError(res, error); }
});
app.post('/api/assignments', requireDatabase, async (req, res) => {
  const validation = validatePayload(req.body);
  if (validation) return res.status(400).json({ error: validation });
  const record = {
    title: req.body.title.trim(), subject: req.body.subject.trim(), due_date: req.body.due_date,
    priority: req.body.priority || 'medium', status: req.body.status || 'pending',
    estimated_hours: req.body.estimated_hours ?? null, notes: req.body.notes?.trim() || null
  };
  try {
    const { data, error } = await supabase.from('assignments').insert(record).select('*').single();
    if (error) return dbError(res, error);
    res.status(201).json({ assignment: data });
  } catch (error) { return dbError(res, error); }
});
app.get('/api/assignments/:id', requireDatabase, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ error: 'Assignment id must be a valid UUID.' });
  try {
    const { data, error } = await supabase.from('assignments').select('*').eq('id', req.params.id).maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'Assignment not found.' });
    res.json({ assignment: data });
  } catch (error) { return dbError(res, error); }
});
app.patch('/api/assignments/:id', requireDatabase, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ error: 'Assignment id must be a valid UUID.' });
  if (!req.body || !Object.keys(req.body).length) return res.status(400).json({ error: 'Provide at least one field to update.' });
  const validation = validatePayload(req.body, true);
  if (validation) return res.status(400).json({ error: validation });
  const record = {};
  for (const field of fields) if (Object.hasOwn(req.body, field)) record[field] = typeof req.body[field] === 'string' && ['title','subject','notes'].includes(field) ? (req.body[field]?.trim() || (field === 'notes' ? null : '')) : req.body[field];
  try {
    const { data, error } = await supabase.from('assignments').update(record).eq('id', req.params.id).select('*').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'Assignment not found.' });
    res.json({ assignment: data });
  } catch (error) { return dbError(res, error); }
});
app.delete('/api/assignments/:id', requireDatabase, async (req, res) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.params.id)) return res.status(400).json({ error: 'Assignment id must be a valid UUID.' });
  try {
    const { data, error } = await supabase.from('assignments').delete().eq('id', req.params.id).select('id').maybeSingle();
    if (error) return dbError(res, error);
    if (!data) return res.status(404).json({ error: 'Assignment not found.' });
    res.json({ message: 'Assignment deleted successfully.', id: data.id });
  } catch (error) { return dbError(res, error); }
});
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'Malformed JSON request body.' });
  if (error.message && error.message.includes('CORS')) return res.status(403).json({ error: error.message });
  console.error('[server]', error);
  return res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, HOST, () => console.log(`Student Assignment Tracker API listening at http://${HOST}:${PORT}`));
