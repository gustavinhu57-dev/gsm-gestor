const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
  db, DATA_DIR, now, today, addDays, getSettings,
  STAGES, STAGE_IDX, CLIENT_TYPES, STANDBY_REASONS, PHOTO_CATEGORIES, PHOTO_PHASES,
  COST_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS, ROLES, VEHICLE_TYPES,
} = require('./db');
const auth = require('./auth');
const {
  digits, normPhone, normPlate, num, str, logEvent, advanceStage, setStage, recalcQuote, checkPaid, QUOTE_SELECT,
} = require('./helpers');

const r = express.Router();
const UPLOADS = path.join(DATA_DIR, 'uploads');
const wrap = (fn) => (req, res, next) => { try { const out = fn(req, res, next); if (out !== undefined && !res.headersSent) res.json(out); } catch (e) { next(e); } };
const bad = (res, msg, code = 400) => { res.status(code).json({ error: msg }); };

// =================== AUTH ===================
r.post('/login', auth.loginLimiter, wrap((req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const u = db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(email);
  if (!u || !auth.verifyPassword(String(req.body.password || ''), u.password_hash)) return bad(res, 'E-mail ou senha inválidos', 401);
  auth.resetLimiter(req.ip);
  auth.createSession(res, u.id, req.secure);
  return { ok: true };
}));
r.post('/logout', wrap((req, res) => { auth.destroySession(req, res); return { ok: true }; }));

r.use(auth.requireAuth);

r.get('/me', wrap((req) => req.user));
r.put('/me/password', wrap((req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!auth.verifyPassword(String(req.body.current || ''), u.password_hash)) return bad(res, 'Senha atual incorreta');
  if (String(req.body.password || '').length < 8) return bad(res, 'A nova senha precisa ter pelo menos 8 caracteres');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(req.body.password), u.id);
  return { ok: true };
}));
r.get('/users', wrap(() => db.prepare('SELECT id, name, email, role, active FROM users ORDER BY name').all()));
r.post('/users', auth.requireRole(), wrap((req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || String(password || '').length < 8) return bad(res, 'Nome, e-mail e senha (mín. 8) são obrigatórios');
  if (!ROLES.includes(role)) return bad(res, 'Perfil inválido');
  try {
    db.prepare('INSERT INTO users(name, email, password_hash, role, created_at) VALUES (?,?,?,?,?)')
      .run(name, String(email).toLowerCase().trim(), auth.hashPassword(password), role, now());
  } catch { return bad(res, 'E-mail já cadastrado'); }
  return { ok: true };
}));

// =================== META / CONFIG ===================
r.get('/meta', wrap(() => ({
  origins: db.prepare('SELECT * FROM origins ORDER BY active DESC, sort, name').all(),
  campaigns: db.prepare('SELECT id, name, active FROM campaigns ORDER BY active DESC, id DESC').all(),
  services: servicesWithPrices(),
  vehicleTypes: VEHICLE_TYPES,
  fixedCosts: db.prepare('SELECT * FROM fixed_costs ORDER BY sort, id').all(),
  users: db.prepare('SELECT id, name, role FROM users WHERE active = 1 ORDER BY name').all(),
  settings: getSettings(),
  stages: STAGES, clientTypes: CLIENT_TYPES, standbyReasons: STANDBY_REASONS,
  photoCategories: PHOTO_CATEGORIES, photoPhases: PHOTO_PHASES, costCategories: COST_CATEGORIES,
  expenseCategories: EXPENSE_CATEGORIES, paymentMethods: PAYMENT_METHODS, roles: ROLES, today: today(),
})));
r.put('/settings', auth.requireRole(), wrap((req) => {
  const up = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  Object.entries(req.body || {}).forEach(([k, v]) => up.run(k, String(v ?? '')));
  return getSettings();
}));
r.post('/origins', wrap((req, res) => {
  const name = str(req.body.name);
  if (!name) return bad(res, 'Informe o nome da origem');
  try { db.prepare('INSERT INTO origins(name, sort) VALUES (?, 99)').run(name); } catch { return bad(res, 'Origem já existe'); }
  return { ok: true };
}));
r.put('/origins/:id', wrap((req) => {
  db.prepare('UPDATE origins SET name = COALESCE(?, name), active = COALESCE(?, active) WHERE id = ?')
    .run(str(req.body.name), req.body.active === undefined ? null : (req.body.active ? 1 : 0), req.params.id);
  return { ok: true };
}));

// =================== SERVIÇOS / PREÇOS ===================
const optNum = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : num(v));
// Serviços com a tabela de preço por tipo de veículo (prices: [{vehicle_type, price, cost, op_cost, active}])
// Produtos: custo por serviço = preço pago (frasco em uso) ÷ rendimento (média real dos frascos encerrados, ou a estimativa)
function productsWithCost() {
  return db.prepare(`SELECT p.*,
      b.id bottle_id, b.opened_at, b.price bottle_price,
      (SELECT AVG(yield_real) FROM bottles WHERE product_id = p.id AND closed_at IS NOT NULL AND yield_real > 0) avg_real,
      (SELECT COUNT(*) FROM bottles WHERE product_id = p.id AND closed_at IS NOT NULL AND yield_real > 0) n_closed
    FROM products p LEFT JOIN bottles b ON b.id = (SELECT id FROM bottles WHERE product_id = p.id AND closed_at IS NULL ORDER BY id DESC LIMIT 1)
    WHERE p.active = 1 ORDER BY p.sort, p.id`).all().map((p) => {
    const price = p.bottle_price ?? p.price; const yld = p.avg_real || p.yield_est;
    return { ...p, yield: yld || null, yield_real: !!p.avg_real, unit_cost: price != null && yld ? price / yld : null };
  });
}
// Serviços com a tabela por veículo; cada linha traz a ficha técnica e os insumos calculados (ficha × 1+margem, ou estimativa)
function servicesWithPrices() {
  const list = db.prepare('SELECT * FROM services ORDER BY active DESC, category, sort, name').all();
  const rows = db.prepare('SELECT * FROM service_prices').all();
  const sheet = db.prepare('SELECT * FROM tech_sheet').all();
  const prods = Object.fromEntries(productsWithCost().map((p) => [p.id, p]));
  const margem = num(getSettings().margem_seg) / 100;
  const order = Object.fromEntries(VEHICLE_TYPES.map(([k], i) => [k, i]));
  rows.forEach((r) => {
    r.sheet = Object.fromEntries(sheet.filter((x) => x.service_id === r.service_id && x.vehicle_type === r.vehicle_type).map((x) => [x.product_id, x.factor]));
    const ids = Object.keys(r.sheet);
    if (r.ins_mode === 'ficha' && ids.length) {
      let tot = 0; let pend = false;
      ids.forEach((id) => { const c = prods[id] && prods[id].unit_cost; if (c == null) pend = true; else tot += c * r.sheet[id]; });
      Object.assign(r, { ins: tot * (1 + margem), ins_pending: pend, ins_source: 'ficha' });
    } else Object.assign(r, { ins: r.op_est, ins_pending: r.op_est == null, ins_source: 'estimativa' });
  });
  list.forEach((s) => { s.prices = rows.filter((p) => p.service_id === s.id).sort((a, b) => order[a.vehicle_type] - order[b.vehicle_type]); });
  return list;
}
function savePrices(serviceId, prices) {
  if (!Array.isArray(prices)) return;
  const valid = new Set(VEHICLE_TYPES.map(([k]) => k));
  const up = db.prepare(`INSERT INTO service_prices(service_id, vehicle_type, price, cost, mat_pending, pre_cost, op_est, ins_mode, active) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(service_id, vehicle_type) DO UPDATE SET price = excluded.price, cost = excluded.cost, mat_pending = excluded.mat_pending,
      pre_cost = excluded.pre_cost, op_est = excluded.op_est, ins_mode = excluded.ins_mode, active = excluded.active`);
  const delSheet = db.prepare('DELETE FROM tech_sheet WHERE service_id = ? AND vehicle_type = ?');
  const insSheet = db.prepare('INSERT INTO tech_sheet(service_id, vehicle_type, product_id, factor) VALUES (?,?,?,?)');
  db.transaction(() => {
    prices.filter((p) => valid.has(p.vehicle_type)).forEach((p) => {
      const mat = optNum(p.cost);
      up.run(serviceId, p.vehicle_type, optNum(p.price), mat ?? 0, mat === null && p.active ? 1 : 0, num(p.pre_cost), optNum(p.op_est), p.ins_mode === 'ficha' ? 'ficha' : 'estimativa', p.active ? 1 : 0);
      if (p.sheet && typeof p.sheet === 'object') {
        delSheet.run(serviceId, p.vehicle_type);
        Object.entries(p.sheet).forEach(([pid, f]) => { if (num(f) > 0) insSheet.run(serviceId, p.vehicle_type, Number(pid), num(f)); });
      }
    });
  })();
}

// =================== PRODUTOS, FRASCOS E CUSTOS FIXOS ===================
// Quantos serviços executados usaram o produto (pela ficha técnica, somando o fator) desde a abertura do frasco
const usageSince = (productId, since) => db.prepare(`SELECT COALESCE(SUM(ts.factor),0) n FROM quote_items i
    JOIN quotes q ON q.id = i.quote_id
    JOIN tech_sheet ts ON ts.service_id = i.service_id AND ts.vehicle_type = q.vehicle_type AND ts.product_id = ?
    WHERE q.status = 'executado' AND COALESCE(q.executed_ts, q.executed_at || ' 23:59:59') >= ?`).get(productId, since).n;
r.get('/products', wrap(() => productsWithCost().map((p) => ({
  ...p, used: p.opened_at ? usageSince(p.id, p.opened_at) : 0,
  history: db.prepare('SELECT * FROM bottles WHERE product_id = ? AND closed_at IS NOT NULL ORDER BY id DESC').all(p.id),
}))));
r.post('/products', wrap((req, res) => {
  const b = req.body;
  if (!str(b.name)) return bad(res, 'Informe o nome do produto');
  const id = db.prepare('INSERT INTO products(name, pack, price, yield_est, kind, sort, created_at) VALUES (?,?,?,?,?,99,?)')
    .run(str(b.name), str(b.pack), optNum(b.price), optNum(b.yield_est), b.kind === 'maquina' ? 'maquina' : 'produto', now()).lastInsertRowid;
  db.prepare('INSERT INTO bottles(product_id, opened_at, price) VALUES (?,?,?)').run(id, now(), optNum(b.price));
  return { id };
}));
r.put('/products/:id', wrap((req) => {
  const b = req.body;
  db.prepare('UPDATE products SET name = ?, pack = ?, price = ?, yield_est = ?, kind = ? WHERE id = ?')
    .run(str(b.name), str(b.pack), optNum(b.price), optNum(b.yield_est), b.kind === 'maquina' ? 'maquina' : 'produto', req.params.id);
  // o preço pago vale para o frasco em uso
  db.prepare('UPDATE bottles SET price = ? WHERE product_id = ? AND closed_at IS NULL').run(optNum(b.price), req.params.id);
  return { ok: true };
}));
r.delete('/products/:id', wrap((req) => { db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id); return { ok: true }; }));
// "Frasco acabou": encerra o frasco com o rendimento real e abre o próximo com o preço desta compra
r.post('/products/:id/finish', wrap((req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return bad(res, 'Produto não encontrado', 404);
  const rendeu = num(req.body.yield_real);
  if (rendeu <= 0) return bad(res, 'Informe quantos serviços o frasco rendeu');
  const novo = optNum(req.body.new_price);
  db.transaction(() => {
    const open = db.prepare('SELECT id FROM bottles WHERE product_id = ? AND closed_at IS NULL ORDER BY id DESC LIMIT 1').get(p.id);
    if (open) db.prepare('UPDATE bottles SET closed_at = ?, yield_real = ? WHERE id = ?').run(now(), rendeu, open.id);
    else db.prepare('INSERT INTO bottles(product_id, opened_at, price, closed_at, yield_real) VALUES (?,?,?,?,?)').run(p.id, p.created_at || now(), p.price, now(), rendeu);
    db.prepare('INSERT INTO bottles(product_id, opened_at, price) VALUES (?,?,?)').run(p.id, now(), novo ?? p.price);
    if (novo != null) db.prepare('UPDATE products SET price = ? WHERE id = ?').run(novo, p.id);
  })();
  return { ok: true };
}));
r.put('/fixed-costs', auth.requireRole(), wrap((req) => {
  const list = (Array.isArray(req.body.items) ? req.body.items : []).filter((x) => str(x.name) && num(x.amount) > 0);
  db.transaction(() => {
    db.prepare('DELETE FROM fixed_costs').run();
    const ins = db.prepare('INSERT INTO fixed_costs(name, amount, sort) VALUES (?,?,?)');
    list.forEach((x, i) => ins.run(str(x.name), num(x.amount), i));
    db.prepare("INSERT INTO settings(key, value) VALUES ('custos_fixos_mes', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(String(list.reduce((s, x) => s + num(x.amount), 0)));
  })();
  return db.prepare('SELECT * FROM fixed_costs ORDER BY sort, id').all();
}));
r.get('/services', wrap(() => servicesWithPrices()));
r.post('/services', wrap((req, res) => {
  const b = req.body;
  if (!str(b.name)) return bad(res, 'Informe o nome do serviço');
  const info = db.prepare('INSERT INTO services(name, category, price, price_large, cost, cost_large, op_cost, op_cost_large, description, active, sort) VALUES (?,?,?,?,?,?,?,?,?,?,99)')
    .run(str(b.name), str(b.category), num(b.price), optNum(b.price_large), num(b.cost), optNum(b.cost_large), num(b.op_cost), optNum(b.op_cost_large), str(b.description), b.active === false ? 0 : 1);
  savePrices(info.lastInsertRowid, b.prices);
  return { id: info.lastInsertRowid };
}));
r.put('/services/:id', wrap((req) => {
  const b = req.body;
  savePrices(req.params.id, b.prices);
  db.prepare('UPDATE services SET name = ?, category = ?, price = ?, price_large = ?, cost = ?, cost_large = ?, op_cost = ?, op_cost_large = ?, description = ?, active = ? WHERE id = ?')
    .run(str(b.name), str(b.category), num(b.price), optNum(b.price_large), num(b.cost), optNum(b.cost_large), num(b.op_cost), optNum(b.op_cost_large), str(b.description), b.active ? 1 : 0, req.params.id);
  return { ok: true };
}));

// =================== CLIENTES ===================
function clientFields(b) {
  return {
    name: str(b.name), whatsapp: str(b.whatsapp), whatsapp_digits: normPhone(b.whatsapp) || null,
    origin_id: b.origin_id ? Number(b.origin_id) : null, client_type: str(b.client_type), owner: str(b.owner),
    notes: str(b.notes), campaign_id: b.campaign_id ? Number(b.campaign_id) : null,
    entry_date: str(b.entry_date) || today(),
    utm_source: str(b.utm_source), utm_medium: str(b.utm_medium), utm_campaign: str(b.utm_campaign),
    utm_content: str(b.utm_content), utm_term: str(b.utm_term), ad_campaign_id: str(b.ad_campaign_id),
    adset_id: str(b.adset_id), ad_id: str(b.ad_id), creative_id: str(b.creative_id),
  };
}
function insertVehicle(clientId, v) {
  if (!v || !(v.brand || v.model || v.plate)) return null;
  return db.prepare('INSERT INTO vehicles(client_id, vehicle_type, brand, model, year, color, plate, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(clientId, str(v.vehicle_type), str(v.brand), str(v.model), str(v.year), str(v.color), normPlate(v.plate) || null, str(v.notes), now()).lastInsertRowid;
}

r.get('/clients', wrap((req) => {
  const { q, origin_id, stage, campaign_id, client_type } = req.query;
  const where = []; const p = [];
  if (q) {
    const d = digits(q); const pl = normPlate(q);
    where.push(`(c.name LIKE ? ${d.length >= 4 ? 'OR c.whatsapp_digits LIKE ?' : ''} OR EXISTS (SELECT 1 FROM vehicles v WHERE v.client_id = c.id AND (v.plate LIKE ? OR v.model LIKE ?)))`);
    p.push(`%${q}%`); if (d.length >= 4) p.push(`%${d}%`); p.push(`%${pl || q}%`, `%${q}%`);
  }
  if (origin_id) { where.push('c.origin_id = ?'); p.push(origin_id); }
  if (stage) { where.push('c.stage = ?'); p.push(stage); }
  if (campaign_id) { where.push('c.campaign_id = ?'); p.push(campaign_id); }
  if (client_type) { where.push('c.client_type = ?'); p.push(client_type); }
  return db.prepare(`SELECT c.*, o.name origin_name,
      (SELECT GROUP_CONCAT(TRIM(COALESCE(brand,'') || ' ' || COALESCE(model,'') || CASE WHEN plate IS NOT NULL THEN ' · ' || plate ELSE '' END), ', ') FROM vehicles WHERE client_id = c.id) vehicles_txt,
      (SELECT MIN(due_date) FROM followups WHERE client_id = c.id AND status = 'pendente') next_followup
    FROM clients c LEFT JOIN origins o ON o.id = c.origin_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.id DESC LIMIT 500`).all(...p);
}));

r.post('/clients', wrap((req, res) => {
  const f = clientFields(req.body);
  if (!f.name) return bad(res, 'Informe o nome do cliente');
  if (f.whatsapp_digits) {
    const ex = db.prepare('SELECT id, name FROM clients WHERE whatsapp_digits = ?').get(f.whatsapp_digits);
    if (ex && !req.body.force) return res.status(409).json({ error: `Já existe cliente com este WhatsApp: ${ex.name}`, existing_id: ex.id });
  }
  const id = db.transaction(() => {
    const cols = Object.keys(f);
    const cid = db.prepare(`INSERT INTO clients(${cols.join(',')}, created_at, updated_at) VALUES (${cols.map(() => '?').join(',')}, ?, ?)`)
      .run(...cols.map((k) => f[k]), now(), now()).lastInsertRowid;
    const vid = insertVehicle(cid, req.body.vehicle);
    logEvent(cid, null, 'contato', 'Cliente cadastrado', req.user);
    return { id: cid, vehicle_id: vid };
  })();
  return id;
}));

r.post('/clients/import', wrap((req, res) => {
  const lines = String(req.body.text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return bad(res, 'Cole a lista de contatos');
  const base = { origin_id: req.body.origin_id || null, campaign_id: req.body.campaign_id || null, client_type: req.body.client_type || 'Pessoa física' };
  let created = 0; const skipped = [];
  db.transaction(() => {
    for (const line of lines) {
      const m = line.match(/(\+?\(?\d[\d\s().-]{7,}\d)/);
      const phone = m ? m[1] : '';
      const name = (m ? line.replace(m[1], ' ') : line).replace(/[;,\t|]+/g, ' ').replace(/\s+-\s*$|^\s*-\s+/g, '').replace(/\s+/g, ' ').trim();
      const wd = normPhone(phone);
      if (!name && !wd) continue;
      if (wd && db.prepare('SELECT 1 FROM clients WHERE whatsapp_digits = ?').get(wd)) { skipped.push(line); continue; }
      const cid = db.prepare(`INSERT INTO clients(name, whatsapp, whatsapp_digits, origin_id, campaign_id, client_type, entry_date, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(name || phone, phone || null, wd || null, base.origin_id, base.campaign_id, base.client_type, today(), now(), now()).lastInsertRowid;
      logEvent(cid, null, 'contato', 'Importado de lista', req.user);
      created++;
    }
  })();
  return { created, skipped };
}));

r.get('/clients/:id', wrap((req, res) => {
  const c = db.prepare('SELECT c.*, o.name origin_name, cp.name campaign_name FROM clients c LEFT JOIN origins o ON o.id = c.origin_id LEFT JOIN campaigns cp ON cp.id = c.campaign_id WHERE c.id = ?').get(req.params.id);
  if (!c) return bad(res, 'Cliente não encontrado', 404);
  c.vehicles = db.prepare('SELECT * FROM vehicles WHERE client_id = ? ORDER BY id').all(c.id);
  c.quotes = db.prepare(`${QUOTE_SELECT} WHERE q.client_id = ? ORDER BY q.id DESC`).all(c.id);
  c.followups = db.prepare('SELECT * FROM followups WHERE client_id = ? ORDER BY status DESC, due_date').all(c.id);
  c.events = db.prepare('SELECT * FROM events WHERE client_id = ? ORDER BY id DESC LIMIT 200').all(c.id);
  c.photos = db.prepare('SELECT * FROM photos WHERE client_id = ? ORDER BY id DESC').all(c.id);
  return c;
}));
r.put('/clients/:id', wrap((req, res) => {
  const f = clientFields(req.body);
  if (!f.name) return bad(res, 'Informe o nome do cliente');
  const cols = Object.keys(f);
  db.prepare(`UPDATE clients SET ${cols.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((k) => f[k]), now(), req.params.id);
  return { ok: true };
}));
r.delete('/clients/:id', auth.requireRole(), wrap((req) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  return { ok: true };
}));
r.post('/clients/:id/stage', wrap((req, res) => {
  const stage = req.body.stage;
  if (!(stage in STAGE_IDX)) return bad(res, 'Etapa inválida');
  setStage(req.params.id, stage);
  if (['abordado', 'respondeu', 'interessado', 'posvenda'].includes(stage)) db.prepare('UPDATE clients SET last_contact_at = ? WHERE id = ?').run(now(), req.params.id);
  logEvent(req.params.id, null, stage === 'posvenda' ? 'posvenda' : 'contato', `Etapa: ${STAGES[STAGE_IDX[stage]][1]}`, req.user);
  return { ok: true };
}));
r.post('/clients/:id/events', wrap((req, res) => {
  const type = ['contato', 'nota', 'posvenda'].includes(req.body.type) ? req.body.type : 'nota';
  if (!str(req.body.description)) return bad(res, 'Descreva a interação');
  logEvent(req.params.id, null, type, str(req.body.description), req.user);
  if (type !== 'nota') db.prepare('UPDATE clients SET last_contact_at = ? WHERE id = ?').run(now(), req.params.id);
  return { ok: true };
}));
r.post('/clients/:id/contacted', wrap((req) => {
  db.prepare('UPDATE clients SET last_contact_at = ? WHERE id = ?').run(now(), req.params.id);
  advanceStage(req.params.id, 'abordado');
  logEvent(req.params.id, null, 'contato', str(req.body.description) || 'Conversa aberta no WhatsApp', req.user);
  return { ok: true };
}));

// =================== VEÍCULOS ===================
r.post('/vehicles', wrap((req, res) => {
  if (!req.body.client_id) return bad(res, 'Cliente obrigatório');
  const id = insertVehicle(req.body.client_id, req.body);
  if (!id) return bad(res, 'Informe marca, modelo ou placa');
  return { id };
}));
r.put('/vehicles/:id', wrap((req) => {
  const v = req.body;
  db.prepare('UPDATE vehicles SET vehicle_type = ?, brand = ?, model = ?, year = ?, color = ?, plate = ?, notes = ? WHERE id = ?')
    .run(str(v.vehicle_type), str(v.brand), str(v.model), str(v.year), str(v.color), normPlate(v.plate) || null, str(v.notes), req.params.id);
  return { ok: true };
}));
r.delete('/vehicles/:id', wrap((req) => { db.prepare('DELETE FROM vehicles WHERE id = ?').run(req.params.id); return { ok: true }; }));

// =================== ORÇAMENTOS ===================
function saveItems(quoteId, items) {
  db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(quoteId);
  const ins = db.prepare('INSERT INTO quote_items(quote_id, service_id, name, price, cost, pre_cost, op_cost, sort) VALUES (?,?,?,?,?,?,?,?)');
  (items || []).forEach((it, i) => { if (str(it.name)) ins.run(quoteId, it.service_id || null, str(it.name), num(it.price), num(it.cost), num(it.pre_cost), num(it.op_cost), i); });
  recalcQuote(quoteId);
}
function getQuote(id) {
  const q = db.prepare(`${QUOTE_SELECT} WHERE q.id = ?`).get(id);
  if (!q) return null;
  q.items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY sort, id').all(id);
  q.costs = db.prepare('SELECT * FROM costs WHERE quote_id = ? ORDER BY id').all(id);
  q.payments = db.prepare('SELECT * FROM payments WHERE quote_id = ? ORDER BY paid_at, id').all(id);
  q.photos = db.prepare('SELECT * FROM photos WHERE quote_id = ? ORDER BY id').all(id);
  q.followups = db.prepare('SELECT * FROM followups WHERE quote_id = ? ORDER BY status DESC, due_date').all(id);
  return q;
}

r.get('/quotes', wrap((req) => {
  const { tab, reason, service_id, origin_id, from, to, q, client_id } = req.query;
  const where = []; const p = [];
  let dateCol = 'q.created_at';
  if (tab === 'criados') where.push("q.status = 'criado'");
  if (tab === 'enviados') { where.push("q.status = 'enviado'"); dateCol = 'q.sent_at'; }
  if (tab === 'executados') { where.push("q.status IN ('aprovado','executado')"); dateCol = 'COALESCE(q.executed_at, q.approved_at)'; }
  if (tab === 'standby') { where.push("q.status = 'standby'"); dateCol = 'q.standby_at'; }
  if (reason) { where.push('q.standby_reason = ?'); p.push(reason); }
  if (service_id) { where.push('EXISTS (SELECT 1 FROM quote_items i WHERE i.quote_id = q.id AND i.service_id = ?)'); p.push(service_id); }
  if (origin_id) { where.push('c.origin_id = ?'); p.push(origin_id); }
  if (client_id) { where.push('q.client_id = ?'); p.push(client_id); }
  if (from) { where.push(`substr(${dateCol},1,10) >= ?`); p.push(from); }
  if (to) { where.push(`substr(${dateCol},1,10) <= ?`); p.push(to); }
  if (q) { where.push('(c.name LIKE ? OR v.plate LIKE ? OR v.model LIKE ?)'); p.push(`%${q}%`, `%${normPlate(q) || q}%`, `%${q}%`); }
  const order = tab === 'executados' ? "CASE q.status WHEN 'aprovado' THEN 0 ELSE 1 END, COALESCE(q.executed_at, q.approved_at) DESC" : 'q.id DESC';
  return db.prepare(`${QUOTE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 500`).all(...p);
}));
r.get('/quotes/:id', wrap((req, res) => getQuote(req.params.id) || bad(res, 'Orçamento não encontrado', 404)));

r.post('/quotes', wrap((req, res) => {
  const b = req.body;
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(b.client_id);
  if (!client) return bad(res, 'Selecione o cliente');
  const s = getSettings();
  const id = db.transaction(() => {
    const qid = db.prepare(`INSERT INTO quotes(client_id, vehicle_id, vehicle_type, vehicle_size, status, source, discount, surcharge, notes, internal_notes, validity_days, public_token, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(client.id, b.vehicle_id || null, str(b.vehicle_type), b.vehicle_type === 'carro_g' ? 'G' : 'P', 'criado', b.source || 'manual', num(b.discount), num(b.surcharge),
      str(b.notes), str(b.internal_notes), Number(b.validity_days) || Number(s.quote_validity_days) || 7,
      crypto.randomBytes(18).toString('base64url'), req.user.name, now(), now()).lastInsertRowid;
    saveItems(qid, b.items);
    advanceStage(client.id, 'orcamento');
    const t = db.prepare('SELECT total FROM quotes WHERE id = ?').get(qid).total;
    logEvent(client.id, qid, 'orcamento', `Orçamento #${qid} criado — R$ ${t.toFixed(2)}`, req.user);
    return qid;
  })();
  return getQuote(id);
}));
r.put('/quotes/:id', wrap((req, res) => {
  const b = req.body;
  const q = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!q) return bad(res, 'Orçamento não encontrado', 404);
  db.transaction(() => {
    db.prepare('UPDATE quotes SET vehicle_id = ?, vehicle_type = ?, vehicle_size = ?, discount = ?, surcharge = ?, notes = ?, internal_notes = ?, validity_days = ?, updated_at = ? WHERE id = ?')
      .run(b.vehicle_id || null, str(b.vehicle_type), b.vehicle_type === 'carro_g' ? 'G' : 'P', num(b.discount), num(b.surcharge), str(b.notes), str(b.internal_notes), Number(b.validity_days) || q.validity_days, now(), q.id);
    saveItems(q.id, b.items);
    logEvent(q.client_id, q.id, 'orcamento', `Orçamento #${q.id} editado`, req.user);
  })();
  return getQuote(q.id);
}));
r.delete('/quotes/:id', auth.requireRole(), wrap((req) => { db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id); return { ok: true }; }));

// Link do orçamento: gerar novo (o anterior para de funcionar) ou desativar/ativar
r.post('/quotes/:id/link', wrap((req, res) => {
  const q = db.prepare('SELECT id, client_id FROM quotes WHERE id = ?').get(req.params.id);
  if (!q) return bad(res, 'Orçamento não encontrado', 404);
  const a = req.body.action;
  if (a === 'renew') db.prepare('UPDATE quotes SET public_token = ?, link_active = 1 WHERE id = ?').run(crypto.randomBytes(18).toString('base64url'), q.id);
  else if (a === 'disable') db.prepare('UPDATE quotes SET link_active = 0 WHERE id = ?').run(q.id);
  else if (a === 'enable') db.prepare('UPDATE quotes SET link_active = 1 WHERE id = ?').run(q.id);
  else return bad(res, 'Ação inválida');
  logEvent(q.client_id, q.id, 'orcamento', { renew: 'Novo link do orçamento gerado (anterior desativado)', disable: 'Link do orçamento desativado', enable: 'Link do orçamento reativado' }[a], req.user);
  return getQuote(q.id);
}));

// Marcado quando o orçamento é enviado ao cliente (WhatsApp/link)
r.post('/quotes/:id/sent', wrap((req, res) => {
  const q = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!q) return bad(res, 'Orçamento não encontrado', 404);
  const s = getSettings();
  db.transaction(() => {
    if (['criado', 'enviado', 'standby'].includes(q.status)) {
      db.prepare("UPDATE quotes SET status = 'enviado', sent_at = COALESCE(sent_at, ?), standby_reason = NULL, standby_at = NULL, updated_at = ? WHERE id = ?").run(now(), now(), q.id);
      advanceStage(q.client_id, 'followup');
    }
    db.prepare('UPDATE clients SET last_contact_at = ? WHERE id = ?').run(now(), q.client_id);
    logEvent(q.client_id, q.id, 'orcamento', `Orçamento #${q.id} enviado${req.body.channel ? ' via ' + req.body.channel : ''}`, req.user);
    const pending = db.prepare("SELECT 1 FROM followups WHERE quote_id = ? AND status = 'pendente'").get(q.id);
    if (!pending && ['criado', 'enviado', 'standby'].includes(q.status)) {
      const days = Number(s.followup_after_send_days) || 2;
      db.prepare('INSERT INTO followups(client_id, quote_id, due_date, reason, owner, created_at) VALUES (?,?,?,?,?,?)')
        .run(q.client_id, q.id, addDays(today(), days), 'Retorno do orçamento', req.user.name, now());
    }
  })();
  return getQuote(q.id);
}));

r.post('/quotes/:id/status', wrap((req, res) => {
  const q = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id);
  if (!q) return bad(res, 'Orçamento não encontrado', 404);
  const b = req.body; const st = b.status;
  const closeFollowups = (result) => db.prepare("UPDATE followups SET status = 'concluido', result = ?, done_at = ? WHERE quote_id = ? AND status = 'pendente'").run(result, now(), q.id);
  db.transaction(() => {
    if (st === 'aprovado') {
      db.prepare("UPDATE quotes SET status = 'aprovado', approved_at = COALESCE(approved_at, ?), scheduled_for = ?, responsible = COALESCE(?, responsible), standby_reason = NULL, standby_at = NULL, updated_at = ? WHERE id = ?")
        .run(now(), str(b.scheduled_for), str(b.responsible), now(), q.id);
      closeFollowups('Cliente fechou');
      advanceStage(q.client_id, b.scheduled_for ? 'agendado' : 'fechado');
      logEvent(q.client_id, q.id, 'servico', `Orçamento #${q.id} fechado${b.scheduled_for ? ' — agendado para ' + b.scheduled_for.split('-').reverse().join('/') : ''}`, req.user);
    } else if (st === 'executado') {
      db.prepare('UPDATE quotes SET executed_ts = COALESCE(executed_ts, ?) WHERE id = ?').run(now(), q.id);
      db.prepare("UPDATE quotes SET status = 'executado', approved_at = COALESCE(approved_at, ?), executed_at = ?, responsible = COALESCE(?, responsible), standby_reason = NULL, standby_at = NULL, updated_at = ? WHERE id = ?")
        .run(now(), str(b.executed_at) || today(), str(b.responsible), now(), q.id);
      closeFollowups('Serviço executado');
      advanceStage(q.client_id, 'executado');
      logEvent(q.client_id, q.id, 'servico', `Serviço do orçamento #${q.id} executado`, req.user);
      // Lança automaticamente o custo de material da tabela (editável), se ainda não houver custos
      if (!db.prepare('SELECT 1 FROM costs WHERE quote_id = ?').get(q.id)) {
        const insC = db.prepare('INSERT INTO costs(quote_id, category, description, amount, created_at) VALUES (?,?,?,?,?)');
        db.prepare('SELECT name, cost, pre_cost FROM quote_items WHERE quote_id = ? AND (cost > 0 OR pre_cost > 0)').all(q.id).forEach((it) => {
          if (it.cost > 0) insC.run(q.id, 'Material', `${it.name} (tabela)`, it.cost, now());
          if (it.pre_cost > 0) insC.run(q.id, 'Linha e cola', `${it.name} (tabela)`, it.pre_cost, now());
        });
      }
      checkPaid(q.id);
    } else if (st === 'standby') {
      if (!b.reason) throw Object.assign(new Error('Informe o motivo do stand-by'), { status: 400 });
      db.prepare("UPDATE quotes SET status = 'standby', standby_reason = ?, standby_note = ?, standby_at = ?, updated_at = ? WHERE id = ?")
        .run(b.reason, str(b.note), now(), now(), q.id);
      closeFollowups('Movido para stand-by');
      const active = db.prepare("SELECT 1 FROM quotes WHERE client_id = ? AND id != ? AND status IN ('criado','enviado','aprovado')").get(q.client_id, q.id);
      if (!active) setStage(q.client_id, 'standby');
      if (b.followup_date) {
        db.prepare('INSERT INTO followups(client_id, quote_id, due_date, reason, owner, created_at) VALUES (?,?,?,?,?,?)')
          .run(q.client_id, q.id, b.followup_date, `Recuperar stand-by (${b.reason})`, req.user.name, now());
      }
      logEvent(q.client_id, q.id, 'orcamento', `Orçamento #${q.id} em stand-by — ${b.reason}${b.note ? ': ' + b.note : ''}`, req.user);
    } else if (st === 'enviado' || st === 'criado') {
      db.prepare('UPDATE quotes SET status = ?, standby_reason = NULL, standby_at = NULL, updated_at = ? WHERE id = ?').run(st, now(), q.id);
      advanceStage(q.client_id, st === 'enviado' ? 'followup' : 'orcamento');
      logEvent(q.client_id, q.id, 'orcamento', `Orçamento #${q.id} reaberto`, req.user);
    } else {
      throw Object.assign(new Error('Status inválido'), { status: 400 });
    }
  })();
  return getQuote(q.id);
}));

// Estética em que o Barbosa ajudou: ele recebe os 40% dela (senão ficam na GSM)
r.put('/quotes/:id/helper', wrap((req) => {
  const v = req.body.barbosa_helped ? 1 : 0;
  db.prepare('UPDATE quotes SET barbosa_helped = ?, updated_at = ? WHERE id = ?').run(v, now(), req.params.id);
  const q = db.prepare('SELECT client_id FROM quotes WHERE id = ?').get(req.params.id);
  if (q) logEvent(q.client_id, req.params.id, 'servico', v ? 'Barbosa ajudou na estética (recebe 40%)' : 'Barbosa não participou da estética', req.user);
  return getQuote(req.params.id);
}));
r.post('/quotes/:id/costs', wrap((req, res) => {
  if (num(req.body.amount) <= 0) return bad(res, 'Informe o valor do custo');
  db.prepare('INSERT INTO costs(quote_id, category, description, amount, created_at) VALUES (?,?,?,?,?)')
    .run(req.params.id, str(req.body.category) || 'Outros', str(req.body.description), num(req.body.amount), now());
  return getQuote(req.params.id);
}));
r.delete('/costs/:id', wrap((req) => {
  const c = db.prepare('SELECT quote_id FROM costs WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM costs WHERE id = ?').run(req.params.id);
  return c ? getQuote(c.quote_id) : { ok: true };
}));
r.post('/quotes/:id/payments', wrap((req, res) => {
  const q = db.prepare('SELECT client_id FROM quotes WHERE id = ?').get(req.params.id);
  if (!q) return bad(res, 'Orçamento não encontrado', 404);
  const amount = num(req.body.amount);
  if (amount <= 0) return bad(res, 'Informe o valor recebido');
  const pid = db.prepare('INSERT INTO payments(quote_id, amount, method, paid_at, notes, created_at) VALUES (?,?,?,?,?,?)')
    .run(req.params.id, amount, str(req.body.method), str(req.body.paid_at) || today(), str(req.body.notes), now()).lastInsertRowid;
  // Cartão: a taxa da maquininha vira custo do serviço (sai antes da divisão, como o material)
  const st = getSettings(); const m = String(req.body.method || '');
  const rate = num(/crédito/i.test(m) ? st.taxa_credito : /débito/i.test(m) ? st.taxa_debito : 0);
  if (rate > 0) {
    db.prepare('INSERT INTO costs(quote_id, category, description, amount, created_at) VALUES (?,?,?,?,?)')
      .run(req.params.id, 'Taxa de cartão', `${m} ${rate}% (pagamento #${pid})`, Math.round(amount * rate) / 100, now());
  }
  logEvent(q.client_id, req.params.id, 'pagamento', `Pagamento R$ ${amount.toFixed(2)} (${req.body.method || '—'}) — orçamento #${req.params.id}`, req.user);
  checkPaid(req.params.id);
  return getQuote(req.params.id);
}));
r.delete('/payments/:id', wrap((req) => {
  const p = db.prepare('SELECT quote_id FROM payments WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  db.prepare("DELETE FROM costs WHERE category = 'Taxa de cartão' AND description LIKE ?").run(`%(pagamento #${Number(req.params.id)})`);
  return p ? getQuote(p.quote_id) : { ok: true };
}));

// =================== FOTOS ===================
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + (path.extname(file.originalname).toLowerCase().match(/^\.(jpe?g|png|webp|heic)$/) ? path.extname(file.originalname).toLowerCase() : '.jpg')),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
r.post('/photos', upload.array('files', 20), wrap((req, res) => {
  const b = req.body;
  if (!req.files || !req.files.length) return bad(res, 'Nenhuma imagem recebida');
  let clientId = b.client_id || null; let vehicleId = b.vehicle_id || null;
  if (b.quote_id) {
    const q = db.prepare('SELECT client_id, vehicle_id FROM quotes WHERE id = ?').get(b.quote_id);
    if (q) { clientId = clientId || q.client_id; vehicleId = vehicleId || q.vehicle_id; }
  }
  const marketing = ['sim', 'nao', 'nao_informado'].includes(b.marketing) ? b.marketing : 'nao_informado';
  const showClient = b.show_client === '1' || b.show_client === 'true' ? 1 : 0;
  const ins = db.prepare('INSERT INTO photos(client_id, vehicle_id, quote_id, category, phase, filename, marketing, show_client, created_at) VALUES (?,?,?,?,?,?,?,?,?)');
  const ids = req.files.map((f) => ins.run(clientId, vehicleId, b.quote_id || null, str(b.category) || 'Outras', str(b.phase) || 'entrada', f.filename, marketing, showClient, now()).lastInsertRowid);
  return { ids };
}));
r.get('/photos', wrap((req) => {
  const { marketing, phase, client_id, quote_id, executed } = req.query;
  const where = []; const p = [];
  if (marketing) { where.push('p.marketing = ?'); p.push(marketing); }
  if (phase) { where.push('p.phase = ?'); p.push(phase); }
  if (client_id) { where.push('p.client_id = ?'); p.push(client_id); }
  if (quote_id) { where.push('p.quote_id = ?'); p.push(quote_id); }
  if (executed) where.push("q.status = 'executado'");
  return db.prepare(`SELECT p.*, c.name client_name, v.brand, v.model, v.plate, q.status quote_status,
      (SELECT GROUP_CONCAT(name, ' + ') FROM quote_items WHERE quote_id = p.quote_id) services
    FROM photos p LEFT JOIN clients c ON c.id = p.client_id LEFT JOIN vehicles v ON v.id = p.vehicle_id LEFT JOIN quotes q ON q.id = p.quote_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY p.id DESC LIMIT 300`).all(...p);
}));
r.get('/photos/:id/file', (req, res) => {
  const ph = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id);
  if (!ph) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.sendFile(path.join(UPLOADS, path.basename(ph.filename)));
});
r.put('/photos/:id', wrap((req) => {
  const b = req.body;
  db.prepare('UPDATE photos SET category = COALESCE(?, category), phase = COALESCE(?, phase), marketing = COALESCE(?, marketing), show_client = COALESCE(?, show_client) WHERE id = ?')
    .run(str(b.category), str(b.phase), ['sim', 'nao', 'nao_informado'].includes(b.marketing) ? b.marketing : null,
      b.show_client === undefined ? null : (b.show_client ? 1 : 0), req.params.id);
  return { ok: true };
}));
r.delete('/photos/:id', wrap((req) => {
  const ph = db.prepare('SELECT filename FROM photos WHERE id = ?').get(req.params.id);
  if (ph) { db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id); fs.rm(path.join(UPLOADS, path.basename(ph.filename)), () => {}); }
  return { ok: true };
}));

// =================== FOLLOW-UPS ===================
r.get('/followups', wrap(() => {
  const rows = db.prepare(`SELECT f.*, c.name client_name, c.whatsapp, c.whatsapp_digits, c.last_contact_at, o.name origin_name,
      COALESCE(
        (SELECT TRIM(COALESCE(v.brand,'') || ' ' || COALESCE(v.model,'')) FROM quotes q JOIN vehicles v ON v.id = q.vehicle_id WHERE q.id = f.quote_id),
        (SELECT TRIM(COALESCE(brand,'') || ' ' || COALESCE(model,'')) FROM vehicles WHERE client_id = c.id ORDER BY id DESC LIMIT 1)) vehicle,
      (SELECT GROUP_CONCAT(name, ' + ') FROM quote_items WHERE quote_id = f.quote_id) services,
      (SELECT total FROM quotes WHERE id = f.quote_id) quote_total,
      (SELECT public_token FROM quotes WHERE id = f.quote_id) public_token
    FROM followups f JOIN clients c ON c.id = f.client_id LEFT JOIN origins o ON o.id = c.origin_id
    WHERE f.status = 'pendente' ORDER BY f.due_date, f.id`).all();
  const t = today();
  return {
    atrasados: rows.filter((x) => x.due_date < t),
    hoje: rows.filter((x) => x.due_date === t),
    proximos: rows.filter((x) => x.due_date > t),
  };
}));
r.post('/followups', wrap((req, res) => {
  const b = req.body;
  if (!b.client_id || !b.due_date) return bad(res, 'Cliente e data são obrigatórios');
  const id = db.prepare('INSERT INTO followups(client_id, quote_id, due_date, reason, notes, owner, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(b.client_id, b.quote_id || null, b.due_date, str(b.reason), str(b.notes), str(b.owner) || req.user.name, now()).lastInsertRowid;
  logEvent(b.client_id, b.quote_id, 'followup', `Follow-up agendado para ${b.due_date.split('-').reverse().join('/')}${b.reason ? ' — ' + b.reason : ''}`, req.user);
  return { id };
}));
r.put('/followups/:id', wrap((req) => {
  const b = req.body;
  const f = db.prepare('SELECT * FROM followups WHERE id = ?').get(req.params.id);
  db.prepare('UPDATE followups SET due_date = COALESCE(?, due_date), reason = COALESCE(?, reason), notes = COALESCE(?, notes), owner = COALESCE(?, owner) WHERE id = ?')
    .run(str(b.due_date), str(b.reason), str(b.notes), str(b.owner), req.params.id);
  if (f && b.due_date && b.due_date !== f.due_date) logEvent(f.client_id, f.quote_id, 'followup', `Follow-up reagendado para ${b.due_date.split('-').reverse().join('/')}`, req.user);
  return { ok: true };
}));
r.post('/followups/:id/done', wrap((req, res) => {
  const f = db.prepare('SELECT * FROM followups WHERE id = ?').get(req.params.id);
  if (!f) return bad(res, 'Follow-up não encontrado', 404);
  const b = req.body;
  db.transaction(() => {
    db.prepare("UPDATE followups SET status = 'concluido', result = ?, done_at = ? WHERE id = ?").run(str(b.result), now(), f.id);
    db.prepare('UPDATE clients SET last_contact_at = ? WHERE id = ?').run(now(), f.client_id);
    logEvent(f.client_id, f.quote_id, 'followup', `Follow-up concluído${b.result ? ': ' + b.result : ''}`, req.user);
    if (b.next_date) {
      db.prepare('INSERT INTO followups(client_id, quote_id, due_date, reason, owner, created_at) VALUES (?,?,?,?,?,?)')
        .run(f.client_id, f.quote_id, b.next_date, str(b.next_reason) || f.reason, f.owner || req.user.name, now());
    }
  })();
  return { ok: true };
}));

// =================== CRM / PIPELINE ===================
r.get('/pipeline', wrap((req) => {
  const { origin_id, campaign_id, q } = req.query;
  const where = []; const p = [];
  if (origin_id) { where.push('c.origin_id = ?'); p.push(origin_id); }
  if (campaign_id) { where.push('c.campaign_id = ?'); p.push(campaign_id); }
  if (q) { where.push('c.name LIKE ?'); p.push(`%${q}%`); }
  const rows = db.prepare(`SELECT c.id, c.name, c.stage, c.whatsapp_digits, o.name origin_name,
      lq.id quote_id, lq.total potential,
      (SELECT GROUP_CONCAT(name, ' + ') FROM quote_items WHERE quote_id = lq.id) services,
      COALESCE((SELECT TRIM(COALESCE(brand,'') || ' ' || COALESCE(model,'')) FROM vehicles WHERE id = lq.vehicle_id),
               (SELECT TRIM(COALESCE(brand,'') || ' ' || COALESCE(model,'')) FROM vehicles WHERE client_id = c.id ORDER BY id DESC LIMIT 1)) vehicle,
      (SELECT MIN(due_date) FROM followups WHERE client_id = c.id AND status = 'pendente') next_followup
    FROM clients c LEFT JOIN origins o ON o.id = c.origin_id
    LEFT JOIN quotes lq ON lq.id = (SELECT id FROM quotes WHERE client_id = c.id ORDER BY id DESC LIMIT 1)
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY c.updated_at DESC LIMIT 1000`).all(...p);
  return { stages: STAGES, cards: rows };
}));

// =================== BUSCA GLOBAL ===================
r.get('/search', wrap((req) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return { clients: [], quotes: [] };
  const d = digits(q); const pl = normPlate(q);
  const clients = db.prepare(`SELECT c.id, c.name, c.whatsapp, c.stage, o.name origin_name,
      (SELECT GROUP_CONCAT(TRIM(COALESCE(brand,'') || ' ' || COALESCE(model,'') || CASE WHEN plate IS NOT NULL THEN ' · ' || plate ELSE '' END), ', ') FROM vehicles WHERE client_id = c.id) vehicles_txt
    FROM clients c LEFT JOIN origins o ON o.id = c.origin_id
    WHERE c.name LIKE ? ${d.length >= 4 ? 'OR c.whatsapp_digits LIKE ?' : ''}
      OR EXISTS (SELECT 1 FROM vehicles v WHERE v.client_id = c.id AND (v.plate LIKE ? OR v.model LIKE ? OR v.brand LIKE ?))
    ORDER BY c.id DESC LIMIT 12`).all(...[`%${q}%`, ...(d.length >= 4 ? [`%${d}%`] : []), `%${pl || q}%`, `%${q}%`, `%${q}%`]);
  const qid = q.match(/^#?(\d{1,6})$/);
  const quotes = qid ? db.prepare(`${QUOTE_SELECT} WHERE q.id = ?`).all(qid[1]) : [];
  return { clients, quotes };
}));

// =================== FINANCEIRO ===================
function period(req) {
  const t = today();
  return { from: req.query.from || t.slice(0, 8) + '01', to: req.query.to || t };
}
function financeData(from, to) {
  const executed = db.prepare(`${QUOTE_SELECT} WHERE q.status = 'executado' AND substr(q.executed_at,1,10) BETWEEN ? AND ? ORDER BY q.executed_at DESC`).all(from, to);
  const faturamento = executed.reduce((s, q) => s + q.total, 0);
  const custos = executed.reduce((s, q) => s + q.costs_total, 0);
  // Base da divisão por equipe: tapeçaria (Gustavo + Barbosa) e estética (Gustavo + Carlinhos), proporcional ao valor dos itens
  const TAPECARIA = ['Tapeçaria', 'Caminhão', 'Moto', 'Sofá / residencial'];
  const itemsQ = db.prepare('SELECT i.price, i.cost, i.pre_cost, s.category FROM quote_items i LEFT JOIN services s ON s.id = i.service_id WHERE i.quote_id = ?');
  const cp = num(getSettings().caixa_preco) / 100;
  const split = { tapecaria: 0, estetica: 0, estetica_barbosa: 0, caixa_preco: faturamento * cp };
  for (const q of executed) {
    const its = itemsQ.all(q.id);
    if (!its.length) { split[q.barbosa_helped ? 'estetica_barbosa' : 'estetica'] += q.total * (1 - cp) - q.costs_total; continue; }
    const sum = its.reduce((s, i) => s + i.price, 0);
    const itemMat = its.reduce((s, i) => s + (i.cost || 0) + (i.pre_cost || 0), 0);
    const extra = q.costs_total - itemMat; // taxa de cartão, material extra lançado à mão
    its.forEach((i) => {
      const share = sum ? i.price / sum : 1 / its.length;
      const grp = TAPECARIA.includes(i.category) ? 'tapecaria' : q.barbosa_helped ? 'estetica_barbosa' : 'estetica';
      split[grp] += q.total * share * (1 - cp) - (i.cost || 0) - (i.pre_cost || 0) - extra * share;
    });
  }
  // Custo operacional estimado (panos, desgaste, boina) dos serviços executados: sai do caixa da empresa
  const custoOp = db.prepare(`SELECT COALESCE(SUM(i.op_cost),0) s FROM quote_items i JOIN quotes q ON q.id = i.quote_id
    WHERE q.status = 'executado' AND substr(q.executed_at,1,10) BETWEEN ? AND ?`).get(from, to).s;
  const recebido = db.prepare('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE paid_at BETWEEN ? AND ?').get(from, to).s;
  const aReceber = db.prepare(`SELECT COALESCE(SUM(q.total - COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id),0)),0) s
    FROM quotes q WHERE q.status = 'executado'`).get().s;
  const costsByCat = db.prepare(`SELECT co.category, SUM(co.amount) total FROM costs co JOIN quotes q ON q.id = co.quote_id
    WHERE q.status = 'executado' AND substr(q.executed_at,1,10) BETWEEN ? AND ? GROUP BY co.category ORDER BY total DESC`).all(from, to);
  const expenses = db.prepare('SELECT * FROM expenses WHERE date BETWEEN ? AND ? ORDER BY date DESC, id DESC').all(from, to);
  const despesas = expenses.reduce((s, e) => s + e.amount, 0);
  const expByCat = {};
  expenses.forEach((e) => { expByCat[e.category] = (expByCat[e.category] || 0) + e.amount; });
  return {
    from, to, executed, expenses, costsByCat,
    expensesByCat: Object.entries(expByCat).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total),
    totals: {
      faturamento, recebido, a_receber: Math.max(0, aReceber), custos, custo_operacional: custoOp, margem: faturamento - custos, split,
      margem_pct: faturamento ? (faturamento - custos) / faturamento : 0, despesas, resultado: faturamento - custos - despesas,
    },
  };
}
r.get('/finance', wrap((req) => { const { from, to } = period(req); return financeData(from, to); }));
r.post('/expenses', wrap((req, res) => {
  const b = req.body;
  if (num(b.amount) <= 0) return bad(res, 'Informe o valor');
  db.prepare('INSERT INTO expenses(category, description, amount, date, created_at) VALUES (?,?,?,?,?)')
    .run(str(b.category) || 'Outros', str(b.description), num(b.amount), str(b.date) || today(), now());
  return { ok: true };
}));
r.delete('/expenses/:id', wrap((req) => { db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id); return { ok: true }; }));

// =================== DASHBOARD ===================
r.get('/dashboard', wrap((req) => {
  const { from, to } = period(req);
  const fin = financeData(from, to);
  const one = (sql, ...p) => db.prepare(sql).get(...p).n;
  const t = today();
  const funnel = {
    leads: one('SELECT COUNT(*) n FROM clients WHERE substr(created_at,1,10) BETWEEN ? AND ?', from, to),
    orcamentos: one('SELECT COUNT(*) n FROM quotes WHERE substr(created_at,1,10) BETWEEN ? AND ?', from, to),
    enviados: one('SELECT COUNT(*) n FROM quotes WHERE substr(sent_at,1,10) BETWEEN ? AND ?', from, to),
    executados: fin.executed.length,
  };
  const followups = {
    atrasados: one("SELECT COUNT(*) n FROM followups WHERE status = 'pendente' AND due_date < ?", t),
    hoje: one("SELECT COUNT(*) n FROM followups WHERE status = 'pendente' AND due_date = ?", t),
    proximos: one("SELECT COUNT(*) n FROM followups WHERE status = 'pendente' AND due_date > ?", t),
  };
  const origins = db.prepare(`SELECT o.id, o.name,
      (SELECT COUNT(*) FROM clients c WHERE c.origin_id = o.id AND substr(c.created_at,1,10) BETWEEN @from AND @to) leads,
      (SELECT COUNT(*) FROM clients c WHERE c.origin_id = o.id) clientes,
      (SELECT COUNT(*) FROM quotes q JOIN clients c ON c.id = q.client_id WHERE c.origin_id = o.id AND substr(q.created_at,1,10) BETWEEN @from AND @to) orcamentos,
      (SELECT COUNT(*) FROM quotes q JOIN clients c ON c.id = q.client_id WHERE c.origin_id = o.id AND q.status = 'executado' AND substr(q.executed_at,1,10) BETWEEN @from AND @to) vendas,
      (SELECT COALESCE(SUM(q.total),0) FROM quotes q JOIN clients c ON c.id = q.client_id WHERE c.origin_id = o.id AND q.status = 'executado' AND substr(q.executed_at,1,10) BETWEEN @from AND @to) faturamento,
      (SELECT COALESCE(SUM(q.total),0) - COALESCE(SUM((SELECT COALESCE(SUM(amount),0) FROM costs WHERE quote_id = q.id)),0) FROM quotes q JOIN clients c ON c.id = q.client_id WHERE c.origin_id = o.id AND q.status = 'executado' AND substr(q.executed_at,1,10) BETWEEN @from AND @to) margem
    FROM origins o`).all({ from, to }).filter((o) => o.leads || o.clientes || o.vendas).sort((a, b) => b.faturamento - a.faturamento || b.leads - a.leads);

  // Serviços: receita e custos rateados proporcionalmente ao preço de cada item
  const svc = {};
  for (const q of fin.executed) {
    const items = db.prepare('SELECT name, price FROM quote_items WHERE quote_id = ?').all(q.id);
    for (const it of items) {
      const share = q.subtotal > 0 ? it.price / q.subtotal : 1 / items.length;
      const s = svc[it.name] || (svc[it.name] = { name: it.name, qtd: 0, faturamento: 0, custos: 0 });
      s.qtd++; s.faturamento += q.total * share; s.custos += q.costs_total * share;
    }
  }
  const services = Object.values(svc).map((s) => ({ ...s, margem: s.faturamento - s.custos }));

  return {
    from, to,
    kpis: {
      faturamento: fin.totals.faturamento, recebido: fin.totals.recebido, a_receber: fin.totals.a_receber,
      margem: fin.totals.margem, margem_pct: fin.totals.margem_pct,
      orcamentos: funnel.orcamentos, orcamentos_valor: db.prepare("SELECT COALESCE(SUM(total),0) n FROM quotes WHERE substr(created_at,1,10) BETWEEN ? AND ?").get(from, to).n,
      clientes: one('SELECT COUNT(*) n FROM clients'), clientes_novos: funnel.leads,
      standby: one("SELECT COUNT(*) n FROM quotes WHERE status = 'standby'"),
      standby_valor: db.prepare("SELECT COALESCE(SUM(total),0) n FROM quotes WHERE status = 'standby'").get().n,
      em_aberto: one("SELECT COUNT(*) n FROM quotes WHERE status = 'enviado'"),
      em_aberto_valor: db.prepare("SELECT COALESCE(SUM(total),0) n FROM quotes WHERE status = 'enviado'").get().n,
    },
    funnel, followups, origins,
    services: {
      mais_vendidos: [...services].sort((a, b) => b.qtd - a.qtd).slice(0, 5),
      maior_faturamento: [...services].sort((a, b) => b.faturamento - a.faturamento).slice(0, 5),
      maior_margem: [...services].sort((a, b) => b.margem - a.margem).slice(0, 5),
    },
  };
}));

// =================== METAS (meta x realizado) ===================
// Dias úteis = segunda a sábado, sem feriados nacionais e de Manaus/AM (+ Sexta-feira Santa)
function holidays(year) {
  const fixed = ['01-01', '04-21', '05-01', '09-05', '09-07', '10-12', '10-24', '11-02', '11-15', '11-20', '12-08', '12-25'].map((d) => `${year}-${d}`);
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  const goodFriday = addDays(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, -2);
  return new Set([...fixed, goodFriday]);
}
function workDays(from, to) {
  let n = 0; let d = from; const hol = holidays(Number(from.slice(0, 4)));
  while (d <= to) { const wd = new Date(d + 'T12:00:00').getDay(); if (wd !== 0 && !hol.has(d)) n++; d = addDays(d, 1); }
  return n;
}
const SOURCE_GROUPS = [
  ['Lista de contatos', ['Lista Gustavo', 'Lista Barbosa', 'Cliente antigo']],
  ['TikTok', ['TikTok']],
  ['Indicação', ['Indicação', 'Parceiro']],
  ['Fachada / presencial', ['Fachada (passou na frente)', 'Presencial']],
];
r.get('/goals', wrap((req) => {
  const t = today();
  const from = req.query.from || t.slice(0, 8) + '01';
  const monthEnd = (() => { const d = new Date(from.slice(0, 7) + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10); })();
  const to = req.query.to || monthEnd;
  const st = getSettings();
  const vt = Object.fromEntries(VEHICLE_TYPES);
  const TAPE = ['Tapeçaria', 'Caminhão', 'Moto', 'Sofá / residencial'];

  const created = db.prepare(`${QUOTE_SELECT} WHERE substr(q.created_at,1,10) BETWEEN ? AND ?`).all(from, to);
  const executed = db.prepare(`${QUOTE_SELECT} WHERE q.status = 'executado' AND substr(q.executed_at,1,10) BETWEEN ? AND ?`).all(from, to);
  const fechados = db.prepare(`${QUOTE_SELECT} WHERE q.status = 'aprovado'`).all();
  const enviados = db.prepare(`${QUOTE_SELECT} WHERE q.status = 'enviado'`).all();
  const items = db.prepare('SELECT i.*, s.category, s.name svc_name FROM quote_items i LEFT JOIN services s ON s.id = i.service_id WHERE i.quote_id = ?');
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  // linhas de análise: chave → {orcamentos, orcado, vendas, faturamento, sobra}
  const blank = () => ({ leads: 0, orcamentos: 0, orcado: 0, vendas: 0, faturamento: 0, sobra: 0 });
  const byType = {}; const bySvc = {}; const bySrc = {};
  const srcOf = (q) => (SOURCE_GROUPS.find(([, names]) => names.includes(q.origin_name)) || [q.origin_name ? 'Outros / não atribuído' : 'Outros / não atribuído'])[0];
  const add = (map, key, field, v) => { (map[key] = map[key] || blank())[field] += v; };
  const typeOf = (q) => vt[q.vehicle_type] || 'Não informado';
  const cp = num(st.caixa_preco) / 100; // sobra = preço − caixa − material − linha e cola − taxas
  const each = (q, fn) => {
    const its = items.all(q.id); const tot = sum(its, (i) => i.price) || 1;
    const extra = q.costs_total - sum(its, (i) => (i.cost || 0) + (i.pre_cost || 0));
    its.forEach((i) => { const sh = i.price / tot; fn(i, q.total * sh, q.total * sh * (1 - cp) - (i.cost || 0) - (i.pre_cost || 0) - extra * sh); });
  };
  for (const q of created) {
    add(byType, typeOf(q), 'orcamentos', 1); add(byType, typeOf(q), 'orcado', q.total);
    add(bySrc, srcOf(q), 'orcamentos', 1); add(bySrc, srcOf(q), 'orcado', q.total);
    each(q, (i, rev) => { add(bySvc, i.svc_name || i.name, 'orcamentos', 1); add(bySvc, i.svc_name || i.name, 'orcado', rev); });
  }
  for (const q of executed) {
    const base = q.total * (1 - cp) - q.costs_total;
    [[byType, typeOf(q)], [bySrc, srcOf(q)]].forEach(([m, k]) => { add(m, k, 'vendas', 1); add(m, k, 'faturamento', q.total); add(m, k, 'sobra', base); });
    each(q, (i, rev, b) => { const k = i.svc_name || i.name; add(bySvc, k, 'vendas', 1); add(bySvc, k, 'faturamento', rev); add(bySvc, k, 'sobra', b); });
  }
  // leads por origem (clientes cadastrados no período)
  db.prepare(`SELECT o.name origin_name FROM clients c LEFT JOIN origins o ON o.id = c.origin_id WHERE substr(c.created_at,1,10) BETWEEN ? AND ?`).all(from, to)
    .forEach((c) => add(bySrc, srcOf(c), 'leads', 1));
  const toList = (m) => Object.entries(m).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.faturamento - a.faturamento || b.orcado - a.orcado);

  const realizado = sum(executed, (q) => q.total);
  const decididos = created.filter((q) => ['aprovado', 'executado', 'standby'].includes(q.status));
  const vendidos = created.filter((q) => ['aprovado', 'executado'].includes(q.status));
  const ticket = executed.length ? realizado / executed.length : (() => {
    const all = db.prepare("SELECT AVG(total) a FROM quotes WHERE status = 'executado'").get().a; return all || null;
  })();
  return {
    from, to, hoje: t,
    metas: { base: num(st.meta_faturamento_mes), desafio: num(st.meta_desafio_mes), taxa_fechamento: num(st.taxa_fechamento_meta) / 100 },
    dias: { total: workDays(from, to), restantes: t > to ? 0 : workDays(t < from ? from : t, to) },
    realizado, sobra: sum(executed, (q) => q.total * (1 - cp) - q.costs_total), vendas: executed.length,
    fechado_a_executar: sum(fechados, (q) => q.total), fechados: fechados.length,
    enviados_valor: sum(enviados, (q) => q.total), enviados: enviados.length,
    orcamentos: created.length, taxa_real: decididos.length ? vendidos.length / decididos.length : null, ticket,
    porTipo: toList(byType), porServico: toList(bySvc), porOrigem: toList(bySrc),
  };
}));

// =================== CAMPANHAS ===================
function campaignMetrics(c) {
  const g = (sql) => db.prepare(sql).get(c.id).n;
  return {
    ...c,
    selecionados: g('SELECT COUNT(*) n FROM clients WHERE campaign_id = ?'),
    abordados: g(`SELECT COUNT(*) n FROM clients WHERE campaign_id = ? AND stage_reached >= ${STAGE_IDX.abordado}`),
    respostas: g(`SELECT COUNT(*) n FROM clients WHERE campaign_id = ? AND stage_reached >= ${STAGE_IDX.respondeu}`),
    interessados: g(`SELECT COUNT(*) n FROM clients WHERE campaign_id = ? AND stage_reached >= ${STAGE_IDX.interessado}`),
    orcamentos: g('SELECT COUNT(*) n FROM quotes q JOIN clients cl ON cl.id = q.client_id WHERE cl.campaign_id = ?'),
    vendas: g("SELECT COUNT(*) n FROM quotes q JOIN clients cl ON cl.id = q.client_id WHERE cl.campaign_id = ? AND q.status = 'executado'"),
    faturamento: g("SELECT COALESCE(SUM(q.total),0) n FROM quotes q JOIN clients cl ON cl.id = q.client_id WHERE cl.campaign_id = ? AND q.status = 'executado'"),
    recebido: g('SELECT COALESCE(SUM(p.amount),0) n FROM payments p JOIN quotes q ON q.id = p.quote_id JOIN clients cl ON cl.id = q.client_id WHERE cl.campaign_id = ?'),
  };
}
r.get('/campaigns', wrap(() => db.prepare('SELECT * FROM campaigns ORDER BY active DESC, id DESC').all().map(campaignMetrics)));
r.post('/campaigns', wrap((req, res) => {
  const b = req.body;
  if (!str(b.name)) return bad(res, 'Informe o nome da campanha');
  const id = db.prepare('INSERT INTO campaigns(name, goal, sources, channels, offer, start_date, end_date, notes, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(str(b.name), Number(b.goal) || 0, str(b.sources), str(b.channels), str(b.offer), str(b.start_date) || today(), str(b.end_date), str(b.notes), now()).lastInsertRowid;
  return { id };
}));
r.put('/campaigns/:id', wrap((req) => {
  const b = req.body;
  db.prepare('UPDATE campaigns SET name = ?, goal = ?, sources = ?, channels = ?, offer = ?, start_date = ?, end_date = ?, notes = ?, active = ? WHERE id = ?')
    .run(str(b.name), Number(b.goal) || 0, str(b.sources), str(b.channels), str(b.offer), str(b.start_date), str(b.end_date), str(b.notes), b.active === false ? 0 : 1, req.params.id);
  return { ok: true };
}));

// Atribuição de tráfego pago: agrupa por utm_campaign / utm_content (anúncio/criativo)
r.get('/campaigns/ads', wrap((req) => {
  const by = req.query.by === 'content' ? 'utm_content' : req.query.by === 'ad' ? 'ad_id' : 'utm_campaign';
  return db.prepare(`SELECT COALESCE(c.${by}, '(sem identificação)') label, COUNT(DISTINCT c.id) leads,
      COUNT(DISTINCT q.id) orcamentos,
      COUNT(DISTINCT CASE WHEN q.status = 'executado' THEN q.id END) vendas,
      COALESCE(SUM(CASE WHEN q.status = 'executado' THEN q.total END),0) faturamento,
      COALESCE(SUM(CASE WHEN q.status = 'executado' THEN q.total - (SELECT COALESCE(SUM(amount),0) FROM costs WHERE quote_id = q.id) END),0) margem
    FROM clients c LEFT JOIN quotes q ON q.client_id = c.id
    WHERE c.utm_source IS NOT NULL OR c.ad_id IS NOT NULL OR c.origin_id = (SELECT id FROM origins WHERE name = 'Meta Ads')
    GROUP BY label ORDER BY faturamento DESC, leads DESC`).all();
}));

// =================== JARVIS (alertas por regras, sem IA) ===================
r.get('/jarvis', wrap(() => {
  const t = today();
  const n = (sql, ...p) => db.prepare(sql).get(...p).n;
  const alerts = [];
  const add = (level, text, link, count) => { if (count) alerts.push({ level, text, link, count }); };

  const atrasados = n("SELECT COUNT(*) n FROM followups WHERE status = 'pendente' AND due_date < ?", t);
  add('alta', `Você possui ${atrasados} follow-up${atrasados > 1 ? 's' : ''} atrasado${atrasados > 1 ? 's' : ''}.`, '#/followups', atrasados);
  const hoje = n("SELECT COUNT(*) n FROM followups WHERE status = 'pendente' AND due_date = ?", t);
  add('media', `${hoje} follow-up${hoje > 1 ? 's' : ''} para hoje.`, '#/followups', hoje);
  const parados = n("SELECT COUNT(*) n FROM quotes WHERE status = 'enviado' AND substr(sent_at,1,10) <= ?", addDays(t, -7));
  add('alta', `${parados} orçamento${parados > 1 ? 's estão parados' : ' está parado'} há mais de 7 dias.`, '#/orcamentos?tab=enviados', parados);
  const naoEnviados = n("SELECT COUNT(*) n FROM quotes WHERE status = 'criado' AND source = 'manual' AND substr(created_at,1,10) < ?", t);
  add('media', `${naoEnviados} orçamento${naoEnviados > 1 ? 's criados' : ' criado'} e ainda não enviado${naoEnviados > 1 ? 's' : ''}.`, '#/orcamentos?tab=criados', naoEnviados);
  const site = n("SELECT COUNT(*) n FROM quotes WHERE status = 'criado' AND source != 'manual'");
  add('alta', `${site} pedido${site > 1 ? 's' : ''} de orçamento recebido${site > 1 ? 's' : ''} pelo site aguardando avaliação.`, '#/orcamentos?tab=criados', site);
  const semFollow = n(`SELECT COUNT(*) n FROM clients c WHERE c.stage IN ('interessado','orcamento','followup','standby')
    AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.client_id = c.id AND f.status = 'pendente')`);
  add('media', `${semFollow} cliente${semFollow > 1 ? 's podem' : ' pode'} receber follow-up (interessados sem próximo contato).`, '#/crm', semFollow);
  const novos = n("SELECT COUNT(*) n FROM clients WHERE stage = 'novo' AND substr(created_at,1,10) <= ?", addDays(t, -2));
  add('media', `${novos} lead${novos > 1 ? 's' : ''} novo${novos > 1 ? 's' : ''} ainda não abordado${novos > 1 ? 's' : ''}.`, '#/crm', novos);
  const sb = n("SELECT COUNT(*) n FROM quotes WHERE status = 'standby'");
  const sbValor = db.prepare("SELECT COALESCE(SUM(total),0) n FROM quotes WHERE status = 'standby'").get().n;
  add('baixa', `Você possui ${sb} oportunidade${sb > 1 ? 's' : ''} em Stand-by (R$ ${sbValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`, '#/orcamentos?tab=standby', sb);
  const aReceber = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(q.total - COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id),0)),0) v
    FROM quotes q WHERE q.status = 'executado' AND q.total > COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id),0) + 0.009`).get();
  add('alta', `${aReceber.n} serviço${aReceber.n > 1 ? 's executados' : ' executado'} com saldo a receber (R$ ${aReceber.v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`, '#/financeiro', aReceber.n);
  const semCusto = n("SELECT COUNT(*) n FROM quotes q WHERE q.status = 'executado' AND NOT EXISTS (SELECT 1 FROM costs WHERE quote_id = q.id)");
  add('baixa', `${semCusto} serviço${semCusto > 1 ? 's executados' : ' executado'} sem custos lançados (margem incompleta).`, '#/orcamentos?tab=executados', semCusto);
  const fotos = n("SELECT COUNT(DISTINCT q.id) n FROM quotes q JOIN photos p ON p.quote_id = q.id WHERE q.status = 'executado'");
  add('baixa', `Existe${fotos > 1 ? 'm' : ''} ${fotos} serviço${fotos > 1 ? 's executados' : ' executado'} com fotos disponíveis.`, '#/fotos', fotos);
  const posvenda = n("SELECT COUNT(*) n FROM clients c WHERE c.stage IN ('executado','pago') AND EXISTS (SELECT 1 FROM quotes q WHERE q.client_id = c.id AND q.status = 'executado' AND substr(q.executed_at,1,10) <= ?)", addDays(t, -7));
  add('media', `${posvenda} cliente${posvenda > 1 ? 's prontos' : ' pronto'} para pós-venda (serviço há mais de 7 dias).`, '#/crm', posvenda);
  const meta = db.prepare("SELECT id FROM origins WHERE name = 'Meta Ads'").get();
  if (meta) {
    const leads = n('SELECT COUNT(*) n FROM clients WHERE origin_id = ? AND substr(created_at,1,10) >= ?', meta.id, addDays(t, -7));
    add('baixa', `Meta Ads trouxe ${leads} lead${leads > 1 ? 's' : ''} nos últimos 7 dias.`, `#/clientes?origin_id=${meta.id}`, leads);
  }
  const order = { alta: 0, media: 1, baixa: 2 };
  return { alerts: alerts.sort((a, b) => order[a.level] - order[b.level]), followups_due: atrasados + hoje };
}));

// =================== BACKUP ===================
r.get('/backup', auth.requireRole(), async (req, res, next) => {
  try {
    const file = path.join(DATA_DIR, `backup-${today()}.db`);
    await db.backup(file);
    res.download(file, `gsm-backup-${today()}.db`, () => fs.rm(file, () => {}));
  } catch (e) { next(e); }
});

module.exports = r;
