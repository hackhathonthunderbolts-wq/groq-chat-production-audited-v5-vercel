import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import Groq from 'groq-sdk';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = Boolean(process.env.VERCEL);
const PORT = Number(process.env.PORT || 8787);
const MAX_BODY = process.env.MAX_BODY || '512kb';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: MAX_BODY }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.API_RATE_LIMIT || 60),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a minute.' }
});
app.use('/api', apiLimiter);

const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const MODEL = 'openai/gpt-oss-20b';
const WEB_MODEL = 'groq/compound';
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      max: Number(process.env.DB_POOL_MAX || (isVercel ? 1 : 10)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    })
  : null;

const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);
const validUuid = value => UUID_RE.test(String(value));

async function requireAcceptedConnection(client, userA, userB) {
  const { rows } = await client.query(
    `select 1 from connections
     where status='accepted'
       and ((requester_id=$1 and addressee_id=$2) or (requester_id=$2 and addressee_id=$1))
     limit 1`,
    [userA, userB]
  );
  return Boolean(rows[0]);
}

app.get('/api/health', async (_req, res) => {
  let database = 'disabled';
  if (pool) {
    try { await pool.query('select 1'); database = 'ok'; }
    catch { database = 'error'; }
  }
  res.json({ ok: true, provider: 'groq', model: MODEL, database });
});

app.post('/api/chat', async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: 'Groq is not configured. Add GROQ_API_KEY to the server environment.' });
    const message = cleanText(req.body?.message, 6000);
    const history = Array.isArray(req.body?.history) ? req.body.history : [];
    const useSearch = req.body?.useSearch !== false;
    if (!message) return res.status(400).json({ error: 'Message is required.' });

    const messages = history.slice(-8).map(item => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(item?.text, 4000)
    })).filter(item => item.content);
    messages.push({ role: 'user', content: message });

    const response = await groq.chat.completions.create({
      model: useSearch ? WEB_MODEL : MODEL,
      messages,
      temperature: 0.2
    });
    res.json({ text: response.choices?.[0]?.message?.content || 'I could not generate a response.' });
  } catch (err) {
    console.error('chat error:', err);
    const status = err?.status === 429 ? 429 : 500;
    res.status(status).json({ error: status === 429 ? 'Groq rate limit reached. Please try again shortly.' : 'Groq request failed.' });
  }
});

app.post('/api/file', upload.single('file'), async (req, res) => {
  try {
    if (!groq) return res.status(503).json({ error: 'Groq is not configured.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const mime = req.file.mimetype || 'application/octet-stream';
    const textLike = mime.startsWith('text/') || /\.(txt|md|csv|json|js|jsx|ts|tsx|py|cpp|c|java|html|css|sql|xml|yaml|yml)$/i.test(req.file.originalname);
    if (!textLike) return res.status(415).json({ error: 'Please upload a supported text or code file.' });

    const content = req.file.buffer.toString('utf8').slice(0, 80_000);
    const prompt = cleanText(req.body?.prompt || 'Analyze this file. Give me a useful summary, key findings, and practical next steps.', 2000);
    const response = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: `${prompt}\n\nFile name: ${cleanText(req.file.originalname, 200)}\n\nFile contents:\n${content}` }],
      temperature: 0.2
    });
    res.json({ name: req.file.originalname, mime, size: req.file.size, text: response.choices?.[0]?.message?.content || 'No analysis returned.' });
  } catch (err) {
    console.error('file error:', err);
    res.status(500).json({ error: 'File analysis failed.' });
  }
});

app.post('/api/session', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const id = validUuid(req.body?.id) ? req.body.id : crypto.randomUUID();
  const name = cleanText(req.body?.displayName || 'Demo user', 80) || 'Demo user';
  try {
    const { rows } = await pool.query(
      `insert into users (id, display_name) values ($1, $2)
       on conflict (id) do update set display_name = excluded.display_name
       returning id, display_name`, [id, name]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('session error:', err);
    res.status(500).json({ error: 'Could not create demo session.' });
  }
});

app.get('/api/connections/:userId', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  if (!validUuid(req.params.userId)) return res.status(400).json({ error: 'Invalid user id.' });
  try {
    const { rows } = await pool.query(
      `select distinct on (least(c.requester_id, c.addressee_id), greatest(c.requester_id, c.addressee_id))
              c.id, c.requester_id, c.addressee_id, c.status, c.created_at, c.updated_at,
              u.display_name as name
       from connections c
       join users u on u.id = case when c.requester_id = $1 then c.addressee_id else c.requester_id end
       where c.requester_id = $1 or c.addressee_id = $1
       order by least(c.requester_id, c.addressee_id), greatest(c.requester_id, c.addressee_id),
                (c.status = 'accepted') desc, c.updated_at desc`, [req.params.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('connections get error:', err);
    res.status(500).json({ error: 'Could not load connections.' });
  }
});

app.post('/api/connections', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const requesterId = req.body?.requesterId;
  const addresseeId = req.body?.addresseeId;
  if (!validUuid(requesterId) || !validUuid(addresseeId) || requesterId === addresseeId) {
    return res.status(400).json({ error: 'Invalid connection request.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const pairKey = [requesterId, addresseeId].sort().join(':');
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [pairKey]);

    const users = await client.query('select id from users where id = any($1::uuid[])', [[requesterId, addresseeId]]);
    if (users.rows.length !== 2) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'The sender link belongs to a session that has not been initialized yet.' });
    }

    await client.query(
      `insert into connections (requester_id, addressee_id, status)
       values ($1, $2, 'pending')
       on conflict (requester_id, addressee_id)
       do update set status = case when connections.status='declined' then 'pending' else connections.status end,
                     updated_at = now()`, [requesterId, addresseeId]
    );

    const reciprocal = await client.query(
      `select id from connections where requester_id=$1 and addressee_id=$2 and status='pending' limit 1`,
      [addresseeId, requesterId]
    );

    if (reciprocal.rows[0]) {
      await client.query(
        `update connections set status='accepted', updated_at=now()
         where (requester_id=$1 and addressee_id=$2) or (requester_id=$2 and addressee_id=$1)`,
        [requesterId, addresseeId]
      );
      const { rows } = await client.query(
        `select id, requester_id, addressee_id, status, created_at, updated_at from connections
         where requester_id=$1 and addressee_id=$2 limit 1`, [requesterId, addresseeId]
      );
      await client.query('COMMIT');
      return res.json({ connection: rows[0], mutual: true });
    }

    const { rows } = await client.query(
      `select id, requester_id, addressee_id, status, created_at, updated_at from connections
       where requester_id=$1 and addressee_id=$2 limit 1`, [requesterId, addresseeId]
    );
    await client.query('COMMIT');
    res.json({ connection: rows[0], mutual: false });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('connection post error:', err);
    res.status(500).json({ error: 'Could not establish the connection.' });
  } finally {
    client.release();
  }
});

app.patch('/api/connections/:id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const status = req.body?.status;
  const userId = req.body?.userId;
  if (!validUuid(req.params.id) || !['accepted', 'declined'].includes(status) || !validUuid(userId)) {
    return res.status(400).json({ error: 'Invalid connection update.' });
  }
  try {
    const existing = await pool.query(
      `select id, requester_id, addressee_id, status from connections where id=$1 limit 1`, [req.params.id]
    );
    const connection = existing.rows[0];
    if (!connection) return res.status(404).json({ error: 'Connection not found.' });
    if (connection.addressee_id !== userId) return res.status(403).json({ error: 'Only the receiver can accept or reject this request.' });
    if (connection.status !== 'pending') return res.status(409).json({ error: `This request is already ${connection.status}.` });

    const { rows } = await pool.query(
      `update connections set status=$1, updated_at=now() where id=$2 and addressee_id=$3 and status='pending' returning *`,
      [status, req.params.id, userId]
    );
    if (!rows[0]) return res.status(409).json({ error: 'The connection request changed before it could be updated.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('connection patch error:', err);
    res.status(500).json({ error: 'Could not update connection.' });
  }
});

app.get('/api/messages/:userId/:otherId', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const { userId, otherId } = req.params;
  if (!validUuid(userId) || !validUuid(otherId)) return res.status(400).json({ error: 'Invalid user id.' });
  try {
    if (!await requireAcceptedConnection(pool, userId, otherId)) return res.status(403).json({ error: 'Messaging is available only after a mutual connection.' });
    const { rows } = await pool.query(
      `select id, sender_id, recipient_id, body, created_at, delivered_at, read_at
       from messages where (sender_id=$1 and recipient_id=$2) or (sender_id=$2 and recipient_id=$1)
       order by created_at asc limit 200`, [userId, otherId]
    );
    res.json(rows);
  } catch (err) {
    console.error('messages get error:', err);
    res.status(500).json({ error: 'Could not load messages.' });
  }
});

app.post('/api/messages', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database is not configured.' });
  const senderId = req.body?.senderId;
  const recipientId = req.body?.recipientId;
  const body = cleanText(req.body?.body, 4000);
  if (!validUuid(senderId) || !validUuid(recipientId) || !body || senderId === recipientId) return res.status(400).json({ error: 'Invalid message.' });
  const client = await pool.connect();
  try {
    if (!await requireAcceptedConnection(client, senderId, recipientId)) return res.status(403).json({ error: 'Messaging is available only after a mutual connection.' });
    const { rows } = await client.query(
      `insert into messages (id, sender_id, recipient_id, body, delivered_at) values ($1,$2,$3,$4,now()) returning *`,
      [crypto.randomUUID(), senderId, recipientId, body]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('message post error:', err);
    res.status(500).json({ error: 'Could not send message.' });
  } finally { client.release(); }
});

if (!isVercel) {
  app.use(express.static(path.join(__dirname, '..', 'dist'), { maxAge: isProduction ? '1h' : 0 }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(__dirname, '..', 'dist', 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large. Maximum size is 5 MB.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: `Request is too large. Maximum body size is ${MAX_BODY}.` });
  console.error('unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

export { app, pool, PORT };
export default app;
