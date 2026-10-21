const crypto = require('crypto');
const { db, now } = require('./db');

const SESSION_DAYS = 30;
const COOKIE = 'gsm_sess';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

// Cria o administrador no primeiro start a partir das variáveis de ambiente.
function ensureAdmin() {
  const count = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  if (count) return;
  const email = (process.env.ADMIN_EMAIL || 'admin@gsm.local').toLowerCase();
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    pw = crypto.randomBytes(9).toString('base64url');
    console.log('\n==============================================');
    console.log(' Usuário administrador criado (ADMIN_PASSWORD não definido)');
    console.log(` E-mail: ${email}`);
    console.log(` Senha temporária: ${pw}`);
    console.log(' Troque a senha em Configurações após o primeiro login.');
    console.log('==============================================\n');
  }
  db.prepare('INSERT INTO users(name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)')
    .run(process.env.ADMIN_NAME || 'Gustavo', email, hashPassword(pw), 'admin', now());
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function createSession(res, userId, secure) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions(token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, exp);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`);
}
function destroySession(req, res) {
  const t = parseCookies(req)[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`);
}

function requireAuth(req, res, next) {
  const t = parseCookies(req)[COOKIE];
  if (t) {
    const row = db.prepare(`SELECT u.id, u.name, u.email, u.role, s.expires_at FROM sessions s
      JOIN users u ON u.id = s.user_id WHERE s.token = ? AND u.active = 1`).get(t);
    if (row && row.expires_at > Date.now()) {
      req.user = { id: row.id, name: row.name, email: row.email, role: row.role };
      return next();
    }
  }
  res.status(401).json({ error: 'Não autenticado' });
}

// Estrutura pronta para permissões futuras (admin, comercial, operacional, financeiro).
function requireRole(...roles) {
  return (req, res, next) => (req.user && (req.user.role === 'admin' || roles.includes(req.user.role))
    ? next() : res.status(403).json({ error: 'Sem permissão' }));
}

// Limite simples de tentativas de login por IP
const attempts = new Map();
function loginLimiter(req, res, next) {
  const ip = req.ip;
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
  a.n++; attempts.set(ip, a);
  next();
}
function resetLimiter(ip) { attempts.delete(ip); }

module.exports = { hashPassword, verifyPassword, ensureAdmin, createSession, destroySession, requireAuth, requireRole, loginLimiter, resetLimiter };
