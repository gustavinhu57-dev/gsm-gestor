/* GSM Gestor — núcleo: helpers, layout, roteador, busca, Jarvis */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const S = { meta: null, me: null, badges: { jarvis: 0, fu: 0 } };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const pct = (v) => (Number(v || 0) * 100).toFixed(0) + '%';
const fdate = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const fdt = (d) => (d ? fdate(d) + ' ' + String(d).slice(11, 16) : '—');
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const todayStr = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function relDay(d) {
  if (!d) return '—';
  const diff = Math.round((new Date(String(d).slice(0, 10) + 'T12:00:00') - new Date(todayStr() + 'T12:00:00')) / 864e5);
  if (diff === 0) return 'hoje'; if (diff === -1) return 'ontem'; if (diff === 1) return 'amanhã';
  return diff < 0 ? `há ${-diff} dias` : `em ${diff} dias`;
}
// Regra de divisão (30/10): o caixa tira caixa_preco% do preço final primeiro; depois saem material, linha e cola e taxa;
// a sobra divide Gustavo (split_socio1%) / 2ª parte (split_socio2%) / caixa (split_caixa%). Custos fixos: total ÷ meta do mês.
function pricing() {
  const st = S.meta.settings;
  const fixos = (S.meta.fixedCosts || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const meta = num(st.meta_faturamento_mes) || 1;
  return {
    cp: num(st.caixa_preco ?? 20) / 100, rr: num(st.split_caixa ?? 20) / 100,
    pG: num(st.split_socio1 ?? 40) / 100, pP: num(st.split_socio2 ?? 40) / 100, fixos, meta, f: fixos / meta,
  };
}
// Linha de preço de um serviço para um tipo de veículo (null se a GSM não faz esse serviço nesse veículo)
const priceRow = (s, type) => (s.prices || []).find((p) => p.vehicle_type === type && p.active) || null;
const vtLabel = (k) => (S.meta.vehicleTypes.find((t) => t[0] === k) || [k, 'Não informado'])[1];
const matRow = (row) => (row && !row.mat_pending ? Number(row.cost) || 0 : 0) + (Number(row && row.pre_cost) || 0);
// Preço mínimo: o caixa líquido não fica negativo e a sobra também não
function minPriceRow(row) {
  if (!row) return 0;
  const { cp, rr, f } = pricing(); const ma = matRow(row); const I = Number(row.ins) || 0;
  const den = cp + rr * (1 - cp) - f;
  return Math.ceil(Math.max(den > 0 ? (I + rr * ma) / den : Infinity, ma / (1 - cp))) || 0;
}
const minPrice = (s, type) => minPriceRow(priceRow(s, type));
function situacaoRow(row) {
  if (row.price == null) return ['a definir', 'amber'];
  if (row.ins_pending || row.mat_pending) return ['falta custo', 'blue'];
  return row.price < minPriceRow(row) ? ['abaixo do mínimo', 'red'] : ['OK', 'ok'];
}
// Quebra do preço pela regra de divisão (Pix, sem taxa); fixo = rateio dos custos fixos
function breakdown(price, mat, ins, fixo) {
  const { cp, rr, pG, pP } = pricing();
  const caixa1 = price * cp; const sobra = price - caixa1 - mat;
  const caixaTotal = caixa1 + sobra * rr; const caixaLiq = caixaTotal - ins - fixo;
  return { caixa1, sobra, gustavo: sobra * pG, parte2: sobra * pP, caixaSobra: sobra * rr, caixaTotal, caixaLiq };
}
const firstName = (n) => String(n || '').split(' ')[0];
const stageLabel = (k) => (S.meta.stages.find((s) => s[0] === k) || [k, k])[1];
const STATUS = { criado: 'Criado', enviado: 'Enviado', aprovado: 'Fechado', executado: 'Executado', standby: 'Stand-by' };
const statusTag = (st) => `<span class="tag ${st}">${STATUS[st] || st}</span>`;
const vehicleTxt = (o) => [o.brand, o.model].filter(Boolean).join(' ') + (o.plate ? ` · ${o.plate}` : '');
const opts = (arr, sel, empty) => (empty !== undefined ? `<option value="">${esc(empty)}</option>` : '') +
  arr.map((o) => { const [v, l] = Array.isArray(o) ? o : typeof o === 'object' ? [o.id, o.name] : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('');

function waUrl(digits, text) {
  const t = text ? `?text=${encodeURIComponent(text)}` : '';
  return digits ? `https://wa.me/${digits}${t}` : `https://wa.me/${t}`;
}
function openWa(digits, text) { window.open(waUrl(digits, text), '_blank'); }

// ---------- Ícones (SVG inline) ----------
const IC = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M17 4a4 4 0 010 8M22 21c0-3-2-5-4-6"/>',
  kanban: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="8" rx="1"/>',
  file: '<path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M4 21V4h12l-2 4 2 4H4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 01-4 0v-.1A1.6 1.6 0 009 19.4a1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 010-4h.1A1.6 1.6 0 004.6 9a1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 014 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 010 4h-.1a1.6 1.6 0 00-1.5 1z"/>',
  camera: '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bell: '<path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M19 8v6M16 11h6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  wa: '<path d="M3 21l1.6-4.8A8.5 8.5 0 1112 20.5a8.4 8.4 0 01-4.2-1.1z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8c-1-.4-1.8-1.2-2.2-2.2l.8-1-1-2z" fill="currentColor" stroke="none"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  car: '<path d="M5 17h14M3 17v-5l2-5h14l2 5v5"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  note: '<path d="M4 4h16v12l-4 4H4z"/><path d="M16 20v-4h4"/>',
  link: '<path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 01-1-1V4a1 1 0 011-1h10a1 1 0 011 1v1"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
};
const icon = (n, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${IC[n] || ''}</svg>`;

// ---------- API ----------
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body instanceof FormData) init.body = opts.body;
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  const res = await fetch('/api' + path, init);
  if (res.status === 401 && path !== '/login') { S.me = null; renderLogin(); throw new Error('Sessão expirada'); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) { const e = new Error(data?.error || 'Erro'); e.status = res.status; e.data = data; throw e; }
  return data;
}
const post = (p, body) => api(p, { method: 'POST', body: body || {} });
const put = (p, body) => api(p, { method: 'PUT', body });
const del = (p) => api(p, { method: 'DELETE' });

function toast(msg, err) {
  const d = document.createElement('div'); d.textContent = msg; if (err) d.className = 'err';
  $('#toast').appendChild(d); setTimeout(() => d.remove(), err ? 4500 : 2600);
}
// Executa uma ação mostrando erro amigável
async function run(fn) { try { return await fn(); } catch (e) { if (e.message !== 'Sessão expirada') toast(e.message, true); throw e; } }

// ---------- Modal ----------
function modal(title, html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog"><div class="modal-head"><h2>${title}</h2><button class="close" aria-label="Fechar">×</button></div><div class="modal-body">${html}</div></div>`;
  document.body.appendChild(bg);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  $('.close', bg).onclick = close;
  const m = { el: $('.modal-body', bg), close };
  if (onMount) onMount(m);
  const first = $('input:not([type=hidden]):not([type=date]), textarea', m.el);
  if (first && window.innerWidth > 700) first.focus();
  return m;
}
const formData = (form) => Object.fromEntries(new FormData(form).entries());
function dateChips(name, base = todayStr()) {
  return `<div class="chips" style="margin-bottom:8px">${[[1, 'Amanhã'], [2, '+2 dias'], [3, '+3 dias'], [7, '+1 semana'], [15, '+15 dias'], [30, '+30 dias']]
    .map(([n, l]) => `<button type="button" class="chip" data-setdate="${name}" data-v="${addDays(base, n)}">${l}</button>`).join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-setdate]');
  if (!b) return;
  const inp = b.closest('form, .modal-body').querySelector(`[name="${b.dataset.setdate}"]`);
  if (inp) { inp.value = b.dataset.v; $$(`[data-setdate="${b.dataset.setdate}"]`, b.parentElement).forEach((x) => x.classList.toggle('active', x === b)); }
});

// ---------- Layout ----------
const MENU = [
  ['#/', 'Dashboard', 'home'], ['#/metas', 'Metas', 'flag'], ['#/clientes', 'Clientes', 'users'], ['#/crm', 'CRM', 'kanban'],
  ['#/orcamentos', 'Orçamentos', 'file'], ['#/followups', 'Follow-ups', 'clock'], ['#/servicos', 'Serviços', 'tag'], ['#/produtos', 'Produtos', 'wrench'],
  ['#/financeiro', 'Financeiro', 'money'], ['#/campanhas', 'Campanhas', 'flag'], ['#/fotos', 'Fotos', 'image'], ['#/config', 'Configurações', 'gear'],
];
function menuHtml() {
  const cur = location.hash.split('?')[0] || '#/';
  return `<nav class="menu">${MENU.map(([h, l, i]) => `<a href="${h}" class="${(cur === h || (h !== '#/' && cur.startsWith(h))) ? 'active' : ''}">${icon(i)}${l}</a>`).join('')}</nav>`;
}
function renderShell() {
  const ini = esc((S.me.name || '?')[0].toUpperCase());
  $('#app').innerHTML = `
  <header class="topbar">
    <button class="ibtn menu-btn" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
    <a href="#/" class="logo">G<b>S</b>M<small>GESTOR</small></a>
    <div class="top-search" id="topSearch">${icon('search', 'width="18" height="18"')}<span>Buscar cliente, WhatsApp ou placa…</span></div>
    <div class="spacer"></div>
    <button class="btn-quote" id="topQuote">${icon('plus', 'width="18" height="18"')} ORÇAMENTO RÁPIDO</button>
    <button class="btn-client" id="topClient">${icon('userplus', 'width="18" height="18"')} Cliente</button>
    <button class="ibtn search-ibtn" id="searchBtn" aria-label="Buscar">${icon('search')}</button>
    <button class="ibtn client-ibtn" id="clientBtn" aria-label="Novo cliente">${icon('userplus')}</button>
    <a class="ibtn" href="#/followups" aria-label="Follow-ups">${icon('clock')}<span class="badge hidden" id="fuBadge"></span></a>
    <button class="ibtn" id="jarvisBtn" aria-label="Jarvis">${icon('bell')}<span class="badge gold hidden" id="jvBadge"></span></button>
    <button class="ibtn" id="profileBtn" aria-label="Perfil"><span class="avatar">${ini}</span></button>
  </header>
  <aside class="sidebar">${menuHtml()}</aside>
  <main id="view"></main>
  <nav class="bottomnav">
    <a href="#/" data-nav="#/">${icon('home')}Início</a>
    <a href="#/clientes" data-nav="#/clientes">${icon('users')}Clientes</a>
    <a href="#/orcamento/novo" class="fab"><span class="circle">${icon('plus')}</span>Orçamento</a>
    <a href="#/crm" data-nav="#/crm">${icon('kanban')}CRM</a>
    <a href="#/orcamentos" data-nav="#/orcamentos">${icon('file')}Orçamentos</a>
  </nav>`;
  $('#menuBtn').onclick = openDrawer;
  $('#topSearch').onclick = $('#searchBtn').onclick = openSearch;
  $('#topQuote').onclick = () => { location.hash = '#/orcamento/novo'; };
  $('#topClient').onclick = $('#clientBtn').onclick = () => clientForm();
  $('#jarvisBtn').onclick = openJarvis;
  $('#profileBtn').onclick = openProfile;
}
function openDrawer() {
  const bg = document.createElement('div'); bg.className = 'drawer-bg';
  const dr = document.createElement('div'); dr.className = 'drawer';
  dr.innerHTML = `<div class="profile-box"><span class="avatar">${esc(S.me.name[0])}</span><div><b style="color:#fff">${esc(S.me.name)}</b><div class="tiny">${esc(S.me.role)}</div></div></div>${menuHtml()}<div class="menu"><div class="sep"></div><a href="#" id="drLogout">${icon('logout')}Sair</a></div>`;
  const close = () => { bg.remove(); dr.remove(); };
  bg.onclick = close; dr.onclick = (e) => { if (e.target.closest('a')) close(); };
  document.body.append(bg, dr);
  $('#drLogout').onclick = (e) => { e.preventDefault(); logout(); };
}
function openProfile() {
  modal('Perfil', `<div class="kv" style="margin-bottom:14px"><dt>Nome</dt><dd>${esc(S.me.name)}</dd><dt>E-mail</dt><dd>${esc(S.me.email)}</dd><dt>Perfil</dt><dd>${esc(S.me.role)}</dd></div>
    <div class="actions"><a class="btn" href="#/config">${icon('gear')} Configurações</a><button class="btn danger" id="pfOut">${icon('logout')} Sair</button></div>`,
  (m) => { $('#pfOut', m.el).onclick = logout; $('a', m.el).onclick = m.close; });
}
async function logout() { await post('/logout'); S.me = null; location.hash = '#/'; renderLogin(); }

async function refreshBadges() {
  try {
    const j = await api('/jarvis');
    S.jarvis = j.alerts;
    const jb = $('#jvBadge'); const fb = $('#fuBadge');
    if (jb) { jb.textContent = j.alerts.length; jb.classList.toggle('hidden', !j.alerts.length); }
    if (fb) { fb.textContent = j.followups_due; fb.classList.toggle('hidden', !j.followups_due); }
  } catch { /* silencioso */ }
}
function jarvisList(alerts) {
  if (!alerts.length) return '<div class="empty">Tudo em dia por aqui. 👌</div>';
  return alerts.map((a) => `<a class="alert-item" href="${a.link}"><span class="lv ${a.level}"></span><span style="flex:1">${esc(a.text)}</span>${icon('back', 'style="transform:rotate(180deg);width:16px;height:16px;flex:none"')}</a>`).join('');
}
async function openJarvis() {
  const m = modal(`${icon('bell', 'width="20" height="20" style="vertical-align:-3px"')} Jarvis GSM`, '<div class="empty">Analisando…</div>');
  const j = await api('/jarvis');
  m.el.innerHTML = `<p class="muted small" style="margin-top:0">Alertas automáticos baseados nas regras comerciais da GSM.</p>${jarvisList(j.alerts)}`;
  $$('a', m.el).forEach((a) => { a.onclick = m.close; });
}

// ---------- Busca global ----------
function openSearch() {
  const m = modal('Buscar', `<div class="search-box"><input class="i" id="gq" placeholder="Nome, WhatsApp, placa ou #orçamento" autocomplete="off" enterkeyhint="search"></div><div class="list search-results" id="gr"><div class="empty">Digite ao menos 2 caracteres</div></div>`);
  const inp = $('#gq', m.el); inp.focus();
  let t;
  inp.oninput = () => {
    clearTimeout(t);
    t = setTimeout(async () => {
      const q = inp.value.trim();
      if (q.length < 2) { $('#gr', m.el).innerHTML = '<div class="empty">Digite ao menos 2 caracteres</div>'; return; }
      const r = await api('/search?q=' + encodeURIComponent(q));
      $('#gr', m.el).innerHTML = (r.quotes.map((x) => `<a class="item" href="#/orcamento/${x.id}"><div class="main"><div class="title">Orçamento #${x.id} ${statusTag(x.status)}</div><div class="sub">${esc(x.client_name)} · ${esc(x.services || '')}</div></div><div class="val">${brl(x.total)}</div></a>`).join('') +
        r.clients.map((c) => `<a class="item" href="#/cliente/${c.id}"><div class="main"><div class="title">${esc(c.name)} <span class="tag">${esc(c.origin_name || 'sem origem')}</span></div><div class="sub">${esc(c.whatsapp || 'sem WhatsApp')}${c.vehicles_txt ? ' · ' + esc(c.vehicles_txt) : ''}</div></div></a>`).join(''))
        || `<div class="empty">Nada encontrado.<br><br><button class="btn gold" id="srNew">${icon('userplus')} Cadastrar "${esc(q)}"</button></div>`;
      $$('a', m.el).forEach((a) => { a.onclick = m.close; });
      const nb = $('#srNew', m.el); if (nb) nb.onclick = () => { m.close(); clientForm({ name: /\d{6,}/.test(q) ? '' : q, whatsapp: /\d{6,}/.test(q) ? q : '' }); };
    }, 220);
  };
}

// ---------- Roteador ----------
const ROUTES = [];
const route = (re, fn) => ROUTES.push([re, fn]);
function parseHash() {
  const [p, qs] = (location.hash || '#/').split('?');
  return { path: p || '#/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}
async function router() {
  if (!S.me) return;
  const { path, query } = parseHash();
  const v = $('#view'); if (!v) return;
  $$('.sidebar').forEach((s) => { s.innerHTML = menuHtml(); });
  $$('.bottomnav a[data-nav]').forEach((a) => {
    const n = a.dataset.nav;
    a.classList.toggle('active', n === '#/' ? path === '#/' : path.startsWith(n.replace(/s$/, '')));
  });
  for (const [re, fn] of ROUTES) {
    const mt = path.match(re);
    if (mt) {
      window.scrollTo(0, 0);
      v.className = '';
      v.innerHTML = '<div class="empty">Carregando…</div>';
      try { await fn(v, mt.slice(1), query); } catch (e) { if (e.message !== 'Sessão expirada') v.innerHTML = `<div class="card empty red">${esc(e.message)}</div>`; console.error(e); }
      refreshBadges();
      return;
    }
  }
  v.innerHTML = '<div class="empty">Página não encontrada</div>';
}
window.addEventListener('hashchange', router);
const reload = () => router();

// ---------- Login ----------
function renderLogin() {
  $('#app').innerHTML = `<div class="login"><form id="lf">
    <span class="logo">G<b>S</b>M</span><p>GSM Gestor · Estética &amp; Tapeçaria Automotiva</p>
    <label class="f"><span>E-mail</span><input class="i" name="email" type="email" autocomplete="username" required></label>
    <label class="f"><span>Senha</span><input class="i" name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn gold block lg" type="submit">Entrar</button></form></div>`;
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    try { await post('/login', formData(e.target)); await boot(); } catch (err) { toast(err.message, true); }
  };
}

async function loadMeta() { S.meta = await api('/meta'); }
async function boot() {
  try { S.me = await api('/me'); } catch { return; }
  await loadMeta();
  renderShell();
  router();
}
