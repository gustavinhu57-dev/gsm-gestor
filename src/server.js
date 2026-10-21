process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, now, today, getSettings } = require('./db');
const { ensureAdmin } = require('./auth');
const { normPhone, str, logEvent, advanceStage, recalcQuote } = require('./helpers');

ensureAdmin();
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const br = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');

// ---------- Página pública do orçamento (sem dados sensíveis) ----------
app.get('/o/:token', (req, res) => {
  const q = db.prepare(`SELECT q.id, q.subtotal, q.discount, q.surcharge, q.total, q.notes, q.validity_days, q.created_at, q.sent_at,
      c.name client_name, v.brand, v.model, v.year, v.color, v.plate
    FROM quotes q JOIN clients c ON c.id = q.client_id LEFT JOIN vehicles v ON v.id = q.vehicle_id WHERE q.public_token = ?`).get(req.params.token);
  if (!q) return res.status(404).send('<h1 style="font-family:sans-serif">Orçamento não encontrado</h1>');
  const items = db.prepare('SELECT i.name, i.price, s.description FROM quote_items i LEFT JOIN services s ON s.id = i.service_id WHERE i.quote_id = ? ORDER BY i.sort, i.id').all(q.id);
  const s = getSettings();
  const firstName = String(q.client_name).split(' ')[0];
  const vehicle = [q.brand, q.model, q.year, q.color].filter(Boolean).join(' ');
  const base = (q.sent_at || q.created_at).slice(0, 10);
  const valid = new Date(base + 'T12:00:00'); valid.setDate(valid.getDate() + (q.validity_days || 7));
  const wa = normPhone(s.company_whatsapp);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Orçamento GSM #${q.id}</title>
<style>
:root{--ink:#14161a;--mute:#6b7280;--line:#e6e6e6;--gold:#c8a24a;--bg:#f5f4f0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink)}
.wrap{max-width:640px;margin:0 auto;padding:16px}
.card{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.06)}
.head{background:#111;color:#fff;padding:28px 24px}.brand{font-size:34px;font-weight:800;letter-spacing:4px}.brand span{color:var(--gold)}
.tag{color:#cfcfcf;font-size:14px;letter-spacing:.5px}.body{padding:24px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}.meta div small{display:block;color:var(--mute);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:1px;color:var(--mute);margin:24px 0 8px}
.item{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.item small{display:block;color:var(--mute)}
.sum{display:flex;justify-content:space-between;padding:6px 0;color:var(--mute)}
.total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:16px;background:#111;color:#fff;border-radius:12px;font-size:22px;font-weight:800}
.total span:last-child{color:var(--gold)}.notes{white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:10px}
.foot{padding:20px 24px;border-top:1px solid var(--line);color:var(--mute);font-size:14px}
.btn{display:block;text-align:center;background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:12px;margin-top:16px}
.print{background:none;border:1px solid var(--line);color:var(--ink);width:100%;font:inherit;padding:12px;border-radius:12px;margin-top:10px;cursor:pointer}
@media print{body{background:#fff}.btn,.print{display:none}.card{box-shadow:none}}
</style></head><body><div class="wrap"><div class="card">
<div class="head"><div class="brand">${esc(s.company_name).replace('GSM', 'G<span>S</span>M')}</div><div class="tag">${esc(s.company_tagline)}</div></div>
<div class="body">
<div class="meta"><div><small>Cliente</small>${esc(firstName)}</div><div><small>Orçamento</small>#${q.id} · ${br(base)}</div>
${vehicle ? `<div><small>Veículo</small>${esc(vehicle)}</div>` : ''}${q.plate ? `<div><small>Placa</small>${esc(q.plate)}</div>` : ''}</div>
<h2>Serviços</h2>
${items.map((i) => `<div class="item"><div>${esc(i.name)}${i.description ? `<small>${esc(i.description)}</small>` : ''}</div><strong>${brl(i.price)}</strong></div>`).join('')}
${q.discount || q.surcharge ? `<div class="sum" style="margin-top:8px"><span>Subtotal</span><span>${brl(q.subtotal)}</span></div>` : ''}
${q.discount ? `<div class="sum"><span>Desconto</span><span>− ${brl(q.discount)}</span></div>` : ''}
${q.surcharge ? `<div class="sum"><span>Acréscimo</span><span>+ ${brl(q.surcharge)}</span></div>` : ''}
<div class="total"><span>TOTAL</span><span>${brl(q.total)}</span></div>
${q.notes ? `<h2>Observações</h2><div class="notes">${esc(q.notes)}</div>` : ''}
<h2>Validade</h2><div>Orçamento válido até <strong>${br(valid.toISOString())}</strong> (${q.validity_days} dias).</div>
${wa ? `<a class="btn" href="https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Sobre o orçamento #${q.id} da GSM...`)}">Falar com a GSM no WhatsApp</a>` : ''}
<button class="print" onclick="window.print()">Salvar em PDF / Imprimir</button>
</div>
<div class="foot"><strong>${esc(s.company_name)} — ${esc(s.company_tagline)}</strong><br>
${s.company_whatsapp ? `WhatsApp: ${esc(s.company_whatsapp)}<br>` : ''}${s.company_instagram ? `Instagram: ${esc(s.company_instagram)}<br>` : ''}${s.company_address ? esc(s.company_address) : ''}</div>
</div></div></body></html>`);
});

// ---------- Entrada pública de leads (site / landing pages / formulários futuros) ----------
const leadHits = new Map();
app.use('/api/public', (req, res, next) => {
  const allowed = (process.env.LEAD_ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.post('/api/public/lead', (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ ok: true }); // honeypot anti-spam
  const ip = req.ip; const h = leadHits.get(ip) || [];
  const recent = h.filter((t) => Date.now() - t < 3600e3);
  if (recent.length >= 10) return res.status(429).json({ error: 'Muitas solicitações' });
  leadHits.set(ip, [...recent, Date.now()]);
  const name = str(b.name); const wd = normPhone(b.whatsapp);
  if (!name || wd.length < 12) return res.status(400).json({ error: 'Nome e WhatsApp são obrigatórios' });

  const src = String(b.utm_source || '').toLowerCase();
  let originName = str(b.origin);
  if (!originName) originName = /facebook|instagram|meta|fb|ig/.test(src) && /paid|cpc|ads|paid_social/.test(String(b.utm_medium || '').toLowerCase()) ? 'Meta Ads'
    : /google/.test(src) ? 'Google Maps/B2B' : 'Site';
  const origin = db.prepare('SELECT id FROM origins WHERE name = ?').get(originName) || db.prepare("SELECT id FROM origins WHERE name = 'Site'").get();
  const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_campaign_id', 'adset_id', 'ad_id', 'creative_id'];

  const out = db.transaction(() => {
    let client = db.prepare('SELECT id FROM clients WHERE whatsapp_digits = ?').get(wd);
    if (!client) {
      const cid = db.prepare(`INSERT INTO clients(name, whatsapp, whatsapp_digits, origin_id, client_type, entry_date, ${utm.join(',')}, created_at, updated_at)
        VALUES (?,?,?,?,?,?,${utm.map(() => '?').join(',')},?,?)`).run(name, str(b.whatsapp), wd, origin?.id || null, 'Pessoa física', today(),
        ...utm.map((k) => str(b[k] ?? (k === 'ad_campaign_id' ? b.campaign_id : undefined))), now(), now()).lastInsertRowid;
      client = { id: cid };
    }
    let vehicleId = null;
    if (b.vehicle) {
      vehicleId = db.prepare('INSERT INTO vehicles(client_id, model, created_at) VALUES (?,?,?)').run(client.id, str(b.vehicle), now()).lastInsertRowid;
    }
    const qid = db.prepare(`INSERT INTO quotes(client_id, vehicle_id, status, source, requested_service, notes, internal_notes, public_token, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(client.id, vehicleId, 'criado', str(b.source) || 'site', str(b.service), null, str(b.message),
      crypto.randomBytes(18).toString('base64url'), 'Site', now(), now()).lastInsertRowid;
    if (b.service) {
      const svc = db.prepare('SELECT id, name, price FROM services WHERE active = 1 AND name LIKE ?').get(`%${b.service}%`);
      if (svc) db.prepare('INSERT INTO quote_items(quote_id, service_id, name, price) VALUES (?,?,?,?)').run(qid, svc.id, svc.name, svc.price);
      recalcQuote(qid);
    }
    advanceStage(client.id, 'novo');
    logEvent(client.id, qid, 'orcamento', `Pedido de orçamento recebido pelo ${originName}${b.service ? ' — ' + b.service : ''}`, { name: 'Site' });
    return { ok: true };
  })();
  res.json(out);
});

app.use('/api', require('./api'));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.status !== 400) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro interno. Tente novamente.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GSM Gestor rodando em http://localhost:${PORT}`));
