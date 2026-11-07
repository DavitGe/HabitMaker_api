import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { credentials, stateSchema } from './validation.js';
const scrypt = promisify(scryptCallback);

export function createApp({ users, secret, origins = [], trustProxy = false }) {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || origins.includes(origin)) }));
  app.use(express.json({ limit: '2mb' }));
  app.use(rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
  app.post('/auth/:action', authLimit, async (req, res) => {
    if (!['register', 'login'].includes(req.params.action)) return res.status(404).json({ error: 'Not found' });
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Use a valid email and a password of 10–128 characters.' });
    const { email, password } = parsed.data;
    let user = await users.findOne({ email });
    if (req.params.action === 'register') {
      if (user) return res.status(409).json({ error: 'An account already exists. Sign in instead.' });
      const salt = randomBytes(16).toString('hex');
      const hash = Buffer.from(await scrypt(password, salt, 64)).toString('hex');
      user = { id: randomBytes(16).toString('hex'), email, salt, hash, state: { challenges: [], entries: [] }, revision: 0 };
      try { await users.insertOne(user); } catch (err) { if (err.code === 11000) return res.status(409).json({ error: 'An account already exists.' }); throw err; }
    } else {
      const salt = user?.salt || 'noexcuse-dummy-salt';
      const hash = Buffer.from(await scrypt(password, salt, 64));
      if (!user || !timingSafeEqual(hash, Buffer.from(user.hash, 'hex'))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const token = jwt.sign({ sub: user.id }, secret, { expiresIn: '30d', issuer: 'noexcuse', audience: 'noexcuse-app' });
    res.json({ token, email, state: user.state, revision: user.revision });
  });
  app.use('/state', (req, res, next) => {
    try {
      const payload = jwt.verify(req.headers.authorization?.replace(/^Bearer /, '') || '', secret, { issuer: 'noexcuse', audience: 'noexcuse-app', algorithms: ['HS256'] });
      req.userId = payload.sub; next();
    } catch { res.status(401).json({ error: 'Your session expired. Sign in again.' }); }
  });
  app.get('/state', async (req, res) => {
    const user = await users.findOne({ id: req.userId });
    if (!user) return res.status(401).json({ error: 'Account not found.' });
    res.json({ state: user.state, revision: user.revision });
  });
  app.put('/state', async (req, res) => {
    const parsed = stateSchema.safeParse(req.body.state);
    if (!parsed.success || !Number.isSafeInteger(req.body.revision) || req.body.revision < 0) return res.status(400).json({ error: 'Invalid check-in data.' });
    const result = await users.updateOne({ id: req.userId, revision: req.body.revision }, { $set: { state: parsed.data }, $inc: { revision: 1 } });
    if (!result.matchedCount) return res.status(409).json({ error: 'Your data changed on another device. Refresh cloud data before editing.' });
    res.json({ revision: req.body.revision + 1 });
  });
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(err.message); res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });
  return app;
}
