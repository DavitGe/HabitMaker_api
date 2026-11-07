import { MongoClient } from 'mongodb';
import { createApp } from './app.js';
let client;
let stage = 'configuration';
try {
  console.log('[startup] Checking environment variables. A local .env file is optional on Render.');
  const { MONGODB_URI, JWT_SECRET, MONGODB_DB = 'noexcuse', PORT = '4000', CORS_ORIGINS = '', TRUST_PROXY } = process.env;
  const problems = [];
  if (!MONGODB_URI) problems.push('MONGODB_URI is missing or empty.');
  else if (!/^mongodb(?:\+srv)?:\/\//.test(MONGODB_URI)) problems.push('MONGODB_URI must begin with mongodb+srv:// or mongodb://. Paste only the value, without quotes or MONGODB_URI=.');
  if (!JWT_SECRET) problems.push('JWT_SECRET is missing or empty.');
  else if (JWT_SECRET.length < 32 || JWT_SECRET.startsWith('replace-')) problems.push('JWT_SECRET must be a unique secret of at least 32 characters, not the example placeholder.');
  if (!MONGODB_DB.trim()) problems.push('MONGODB_DB must not be empty; use noexcuse.');
  if (!/^\d+$/.test(PORT) || Number(PORT) < 1 || Number(PORT) > 65535) problems.push('PORT must be a valid port number. On Render, remove your custom PORT variable and use the supplied value.');
  if (problems.length) { for (const problem of problems) console.error(`[startup] ${problem}`); process.exitCode = 1; }
  else {
    stage = 'Atlas connection';
    console.log('[startup] Configuration valid. Connecting to MongoDB Atlas (10-second server selection timeout).');
    client = new MongoClient(MONGODB_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });
    await client.connect();
    console.log('[startup] MongoDB connected. Creating account indexes.');
    stage = 'database indexes';
    const users = client.db(MONGODB_DB).collection('users');
    await users.createIndex({ email: 1 }, { unique: true });
    await users.createIndex({ id: 1 }, { unique: true });
    stage = 'HTTP listener';
    const app = createApp({ users, secret: JWT_SECRET, origins: CORS_ORIGINS.split(',').map(s => s.trim()).filter(Boolean), trustProxy: TRUST_PROXY === 'true' });
    const server = app.listen(Number(PORT), '0.0.0.0');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    console.log(`[startup] NoExcuse API listening on port ${PORT}. Health check: /health`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { server.close(async () => { await client.close(); process.exit(0); }); });
  }
} catch (error) {
  // Driver messages can include connection details. Log only a known failure category.
  console.error(`[startup] Failed during ${stage}.`);
  if (error.code === 18 || error.code === 8000) console.error('[startup] Atlas authentication failed. Check the database-user password and percent-encode special characters in the connection URI.');
  else if (error.code === 13) console.error('[startup] Atlas permission denied. The database user needs readWrite access to the application database, including creating indexes.');
  else if (error.code === 11000) console.error('[startup] Duplicate account records prevent creating unique indexes. Inspect duplicate email/user IDs in the existing users collection.');
  else if (['ENOTFOUND', 'ESERVFAIL', 'ECONNREFUSED', 'ETIMEOUT'].includes(error.code)) console.error('[startup] DNS or network connection failed. Check the Atlas cluster hostname, cluster status, and Render outbound IP access in Atlas.');
  else if (error.name === 'MongoParseError' || error.name === 'MongoAPIError' || error.name === 'MongoInvalidArgumentError') console.error('[startup] Invalid MongoDB connection configuration. Use the complete Atlas Drivers URI and replace any password placeholders.');
  else if (stage === 'Atlas connection') console.error('[startup] Could not connect to Atlas. Add all Render Connect > Outbound ranges to the Atlas IP Access List, confirm the cluster is running, and check database credentials.');
  else if (stage === 'database indexes') console.error('[startup] Atlas connected, but database setup failed. Check database-user permissions and the existing users collection.');
  else console.error('[startup] Could not start the HTTP server. Check PORT and deployment settings.');
  process.exitCode = 1;
  if (client) await client.close().catch(() => {});
}
