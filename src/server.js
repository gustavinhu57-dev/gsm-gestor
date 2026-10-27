process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { db, DATA_DIR, now, today, getSettings } = require('./db');
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
    FROM quotes q JOIN clients c ON c.id = q.client_id LEFT JOIN vehicles v ON v.id = q.vehicle_id WHERE q.public_token = ? AND q.link_active = 1`).get(req.params.token);
  if (!q) return res.status(404).send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:sans-serif;padding:40px 20px;text-align:center"><h2>Orçamento indisponível</h2><p>Este link não está mais ativo. Fale com a GSM para receber o orçamento atualizado.</p></div>');
  const photos = db.prepare('SELECT id, category FROM photos WHERE quote_id = ? AND show_client = 1 ORDER BY id').all(q.id);
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
.total span:last-child{color:var(--gold)}.pics{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.pics figure{margin:0}.pics img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block;background:#eee}.pics figcaption{font-size:12px;color:var(--mute);margin-top:2px}
.notes{white-space:pre-wrap;background:var(--bg);padding:12px;border-radius:10px}
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
${photos.length ? `<h2>Fotos do seu veículo</h2><div class="pics">${photos.map((p) => `<figure><a href="/o/${esc(req.params.token)}/foto/${p.id}" target="_blank"><img loading="lazy" src="/o/${esc(req.params.token)}/foto/${p.id}" alt="${esc(p.category)}"></a><figcaption>${esc(p.category || '')}</figcaption></figure>`).join('')}</div>` : ''}
${q.notes ? `<h2>Observações</h2><div class="notes">${esc(q.notes)}</div>` : ''}
<h2>Validade</h2><div>Orçamento válido até <strong>${br(valid.toISOString())}</strong> (${q.validity_days} dias).</div>
${wa ? `<a class="btn" href="https://wa.me/${wa}?text=${encodeURIComponent(`Olá! Sobre o orçamento #${q.id} da GSM...`)}">Falar com a GSM no WhatsApp</a>` : ''}
<button class="print" onclick="window.print()">Salvar em PDF / Imprimir</button>
</div>
<div class="foot"><strong>${esc(s.company_name)} — ${esc(s.company_tagline)}</strong><br>
${s.company_whatsapp ? `WhatsApp: ${esc(s.company_whatsapp)}<br>` : ''}${s.company_instagram ? `Instagram: ${esc(s.company_instagram)}<br>` : ''}${s.company_address ? esc(s.company_address) : ''}</div>
</div></div></body></html>`);
});

// Foto do orçamento: só se pertence a ESTE orçamento, o link está ativo e a foto foi marcada "mostrar ao cliente"
app.get('/o/:token/foto/:id', (req, res) => {
  const ph = db.prepare(`SELECT p.filename FROM photos p JOIN quotes q ON q.id = p.quote_id
    WHERE q.public_token = ? AND q.link_active = 1 AND p.id = ? AND p.show_client = 1`).get(req.params.token, req.params.id);
  if (!ph) return res.status(404).end();
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.sendFile(path.join(DATA_DIR, 'uploads', path.basename(ph.filename)));
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
  const med = String(b.utm_medium || '').toLowerCase();
  const paid = /paid|cpc|ads|ppc|paid_social/.test(med) || !!b.ad_id;
  if (!originName) {
    originName = /facebook|instagram|meta|^fb$|^ig$/.test(src) && paid ? 'Meta Ads'
      : /instagram|^ig$/.test(src) ? 'Instagram'
        : /tiktok/.test(src) ? 'TikTok'
          : /google/.test(src) ? 'Google Maps/B2B' : 'Site';
  }
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
      const svc = db.prepare('SELECT id, name, price, cost FROM services WHERE active = 1 AND name LIKE ?').get(`%${b.service}%`);
      if (svc) db.prepare('INSERT INTO quote_items(quote_id, service_id, name, price, cost) VALUES (?,?,?,?,?)').run(qid, svc.id, svc.name, svc.price, svc.cost || 0);
      recalcQuote(qid);
    }
    advanceStage(client.id, 'novo');
    logEvent(client.id, qid, 'orcamento', `Pedido de orçamento recebido pelo ${originName}${b.service ? ' — ' + b.service : ''}`, { name: 'Site' });
    return { ok: true };
  })();
  res.json(out);
});

// ---------- Dados públicos do SITE (somente informações seguras) ----------
app.get('/api/public/site', (req, res) => {
  const st = getSettings();
  const services = db.prepare("SELECT id, name, category, description FROM services WHERE active = 1 AND name != 'Outros' ORDER BY category, sort, name").all();
  // Portfólio: SOMENTE fotos marcadas "autorizado para marketing = sim", agrupadas por serviço
  const photos = db.prepare(`SELECT p.id, p.quote_id, p.phase, p.category, v.brand, v.model,
      (SELECT GROUP_CONCAT(name, ' + ') FROM quote_items WHERE quote_id = p.quote_id) services
    FROM photos p LEFT JOIN vehicles v ON v.id = p.vehicle_id WHERE p.marketing = 'sim' ORDER BY p.id DESC LIMIT 200`).all();
  const groups = new Map();
  for (const ph of photos) {
    const key = ph.quote_id || 'f' + ph.id;
    if (!groups.has(key)) groups.set(key, { services: ph.services || '', vehicle: [ph.brand, ph.model].filter(Boolean).join(' '), antes: [], depois: [], outras: [] });
    const g = groups.get(key);
    (ph.phase === 'antes' ? g.antes : ph.phase === 'depois' ? g.depois : g.outras).push(ph.id);
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    company_name: st.company_name, tagline: st.company_tagline, whatsapp: normPhone(st.company_whatsapp),
    whatsapp_display: st.company_whatsapp, instagram: st.company_instagram, address: st.company_address,
    services, portfolio: [...groups.values()].sort((a, b) => (b.antes.length && b.depois.length) - (a.antes.length && a.depois.length)).slice(0, 12),
  });
});
app.get('/p/foto/:id', (req, res) => {
  const ph = db.prepare("SELECT filename FROM photos WHERE id = ? AND marketing = 'sim'").get(req.params.id);
  if (!ph) return res.status(404).end();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(path.join(DATA_DIR, 'uploads', path.basename(ph.filename)));
});

app.use('/api', require('./api'));

// ---------- SITE em "/" e GSM GESTOR (CRM) em "/gestor" ----------
const cacheAge = process.env.NODE_ENV === 'production' ? '1h' : 0;
app.use('/s', express.static(path.join(__dirname, '..', 'site'), { maxAge: cacheAge }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'site', 'index.html')));
app.get(['/gestor', '/gestor/'], (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, maxAge: cacheAge }));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.status !== 400) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Erro interno. Tente novamente.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GSM Gestor rodando em http://localhost:${PORT}`));
