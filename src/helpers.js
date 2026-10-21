const { db, now, STAGE_IDX } = require('./db');

const digits = (s) => String(s || '').replace(/\D/g, '');

// Normaliza WhatsApp brasileiro para formato internacional (55 + DDD + número)
function normPhone(s) {
  let d = digits(s).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}
const normPlate = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const str = (v) => (v === undefined || v === null ? null : String(v).trim() || null);

function logEvent(clientId, quoteId, type, description, user) {
  db.prepare('INSERT INTO events(client_id, quote_id, type, description, user_name, created_at) VALUES (?,?,?,?,?,?)')
    .run(clientId, quoteId || null, type, description, user ? user.name : null, now());
}

// Avança a etapa do cliente no funil (nunca retrocede automaticamente; sai do stand-by se houver novidade)
function advanceStage(clientId, stage) {
  const c = db.prepare('SELECT stage, stage_reached FROM clients WHERE id = ?').get(clientId);
  if (!c) return;
  const target = STAGE_IDX[stage];
  if (c.stage === 'standby' || STAGE_IDX[c.stage] < target || stage === 'standby') {
    setStage(clientId, stage);
  }
}
function setStage(clientId, stage) {
  const c = db.prepare('SELECT stage_reached FROM clients WHERE id = ?').get(clientId);
  const reached = stage === 'standby' ? c.stage_reached : Math.max(c.stage_reached, STAGE_IDX[stage]);
  db.prepare('UPDATE clients SET stage = ?, stage_reached = ?, updated_at = ? WHERE id = ?').run(stage, reached, now(), clientId);
}

function recalcQuote(quoteId) {
  const q = db.prepare('SELECT discount, surcharge FROM quotes WHERE id = ?').get(quoteId);
  const subtotal = db.prepare('SELECT COALESCE(SUM(price),0) s FROM quote_items WHERE quote_id = ?').get(quoteId).s;
  const total = Math.max(0, subtotal - (q.discount || 0) + (q.surcharge || 0));
  db.prepare('UPDATE quotes SET subtotal = ?, total = ?, updated_at = ? WHERE id = ?').run(subtotal, total, now(), quoteId);
}

// Se o serviço estiver executado e totalmente pago, cliente vai para "Pago"
function checkPaid(quoteId) {
  const q = db.prepare(`SELECT q.client_id, q.status, q.total, COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id),0) paid
    FROM quotes q WHERE q.id = ?`).get(quoteId);
  if (q && q.status === 'executado' && q.total > 0 && q.paid >= q.total - 0.009) advanceStage(q.client_id, 'pago');
}

const QUOTE_SELECT = `
  SELECT q.*, c.name client_name, c.whatsapp, c.whatsapp_digits, c.origin_id, o.name origin_name, c.client_type,
    v.brand, v.model, v.plate, v.year, v.color,
    (SELECT GROUP_CONCAT(name, ' + ') FROM (SELECT name FROM quote_items WHERE quote_id = q.id ORDER BY sort, id)) services,
    COALESCE((SELECT SUM(amount) FROM payments WHERE quote_id = q.id), 0) paid,
    COALESCE((SELECT SUM(amount) FROM costs WHERE quote_id = q.id), 0) costs_total,
    (SELECT COUNT(*) FROM photos WHERE quote_id = q.id) photo_count,
    (SELECT MIN(due_date) FROM followups WHERE quote_id = q.id AND status = 'pendente') next_followup
  FROM quotes q
  JOIN clients c ON c.id = q.client_id
  LEFT JOIN origins o ON o.id = c.origin_id
  LEFT JOIN vehicles v ON v.id = q.vehicle_id`;

module.exports = { digits, normPhone, normPlate, num, str, logEvent, advanceStage, setStage, recalcQuote, checkPaid, QUOTE_SELECT };
