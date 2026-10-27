/* Site GSM: zoom progressivo, serviços e portfólio vindos do CRM, formulário de orçamento com atribuição de anúncio */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- Atribuição (primeiro toque) ----------
  const ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'campaign_id', 'adset_id', 'ad_id', 'creative_id'];
  const qs = new URLSearchParams(location.search);
  let attr = {};
  try { attr = JSON.parse(localStorage.getItem('gsm_attr') || '{}'); } catch { /* sem storage */ }
  if (ATTR_KEYS.some((k) => qs.get(k))) {
    attr = {}; ATTR_KEYS.forEach((k) => { if (qs.get(k)) attr[k] = qs.get(k).slice(0, 200); });
    try { localStorage.setItem('gsm_attr', JSON.stringify(attr)); } catch { /* ok */ }
  }

  // ---------- Zoom: carro → interior → banco → couro → textura → costura ----------
  const STAGES = [
    ['1-carro', 'O carro', 'Tudo começa pelo conjunto.'],
    ['2-interior', 'O interior', 'Onde você passa o seu tempo.'],
    ['3-banco', 'O banco', 'Conforto que se sente no corpo.'],
    ['4-couro', 'O couro', 'Material escolhido a dedo.'],
    ['5-textura', 'A textura', 'Cada fibra no lugar certo.'],
    ['6-costura', 'A costura', 'O acabamento é a nossa assinatura.'],
  ];
  const N = STAGES.length;
  $('#layers').innerHTML = STAGES.map(([f, t], i) => `<div class="layer${i < 2 ? ' fit' : ''}"><img src="/s/img/${f}.jpg" alt="${esc(t)}" decoding="async" ${i > 1 ? 'loading="lazy"' : ''}></div>`).join('');
  $('#rail').innerHTML = STAGES.map(() => '<i></i>').join('');
  const layers = [...document.querySelectorAll('.layer')];
  const rails = [...document.querySelectorAll('#rail i')];
  const zoom = $('.zoom'); const hero = $('#hero'); const cap = $('#caption'); const mbar = $('.mbar');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shownCap = -1;

  function frame() {
    const r = zoom.getBoundingClientRect();
    const total = zoom.offsetHeight - innerHeight;
    const p = clamp(-r.top / total, 0, 1) * (N - 1);
    layers.forEach((l, i) => {
      const d = p - i;
      let op = 0; let sc = 1;
      if (d >= -0.6 && d <= 0) { op = 1 + d / 0.6; sc = 1 + 0.25 * d; } // chegando: cresce até 1
      else if (d > 0 && d < 1) { op = i === N - 1 ? 1 : clamp(1 - (d - 0.35) / 0.65, 0, 1); sc = 1 + 1.3 * d; } // aproximando
      else if (i === N - 1 && d >= 1) { op = 1; sc = 1; }
      if (i === 0 && d <= 0) op = 1;
      l.style.opacity = op.toFixed(3);
      l.style.transform = `scale(${sc.toFixed(4)})`;
    });
    hero.style.opacity = clamp(1 - p / 0.35, 0, 1).toFixed(3);
    hero.style.transform = `translateY(${(-p * 60).toFixed(1)}px)`;
    hero.style.pointerEvents = p > 0.3 ? 'none' : '';
    const near = Math.round(p);
    if (near !== shownCap) {
      shownCap = near;
      $('#capN').textContent = String(near + 1).padStart(2, '0') + ' / ' + String(N).padStart(2, '0');
      $('#capT').textContent = STAGES[near][1]; $('#capS').textContent = STAGES[near][2];
    }
    const capOp = near === 0 ? 0 : clamp(1 - Math.abs(p - near) * 2.6, 0, 1);
    cap.style.opacity = capOp.toFixed(3);
    cap.style.transform = `translateY(${((p - near) * -40).toFixed(1)}px)`;
    rails.forEach((x, i) => x.classList.toggle('on', i === near));
    mbar.classList.toggle('show', scrollY > innerHeight * 0.6);
  }
  if (reduce) { document.documentElement.classList.add('static'); addEventListener('scroll', () => mbar.classList.toggle('show', scrollY > 200), { passive: true }); }
  else {
    let ticking = false;
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { frame(); ticking = false; }); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    frame();
  }

  // ---------- Dados do CRM ----------
  let site = { services: [], portfolio: [] };
  const waMsg = (svc) => `Olá GSM! Vim pelo site e quero um orçamento${svc ? ' de ' + svc : ''}.${attr.utm_campaign ? `\n(ref: ${attr.utm_campaign})` : ''}`;
  const setWa = () => {
    if (!site.whatsapp) return;
    const svc = $('#svcSel').value;
    document.querySelectorAll('.wa-link').forEach((a) => { a.href = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(waMsg(svc))}`; a.classList.remove('hidden'); });
  };

  function renderServices() {
    $('#svc').innerHTML = site.services.map((s) => `<div class="svc"><small>${esc(s.category || '')}</small><b>${esc(s.name)}</b><p>${esc(s.description || '')}</p><button type="button" data-svc="${esc(s.name)}">Quero orçamento →</button></div>`).join('');
    $('#svcSel').insertAdjacentHTML('beforeend', site.services.map((s) => `<option>${esc(s.name)}</option>`).join(''));
    document.querySelectorAll('[data-svc]').forEach((b) => { b.onclick = () => { $('#svcSel').value = b.dataset.svc; setWa(); $('#orcamento').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); }; });
    let pre0 = qs.get('servico');
    try { if (pre0) localStorage.setItem('gsm_servico', pre0); else pre0 = localStorage.getItem('gsm_servico'); } catch { /* ok */ }
    const pre = (pre0 || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (pre) {
      const m = site.services.find((s) => s.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(pre.replace(/-/g, ' ')));
      if (m) $('#svcSel').value = m.name;
    }
  }
  function renderPortfolio() {
    const pairs = site.portfolio;
    if (!pairs.length) {
      $('#port').innerHTML = `<div class="empty-port">Em breve, resultados reais de clientes GSM aqui.${site.instagram ? `<br><br>Enquanto isso, veja nosso trabalho no Instagram <b>${esc(site.instagram)}</b>.` : ''}</div>`;
      return;
    }
    $('#port').innerHTML = `<div class="port">${pairs.map((g) => {
      const label = esc([g.services, g.vehicle].filter(Boolean).join(' · '));
      if (g.antes.length && g.depois.length) {
        return `<figure style="margin:0"><div class="ba"><img src="/p/foto/${g.antes[0]}" alt="Antes" loading="lazy"><img class="after" src="/p/foto/${g.depois[0]}" alt="Depois" loading="lazy"><span class="lb l">ANTES</span><span class="lb r">DEPOIS</span><span class="bar"></span></div><figcaption>${label}</figcaption></figure>`;
      }
      const id = g.depois[0] || g.outras[0] || g.antes[0];
      return `<figure style="margin:0"><div class="ba"><img src="/p/foto/${id}" alt="${label}" loading="lazy"></div><figcaption>${label}</figcaption></figure>`;
    }).join('')}</div>`;
    document.querySelectorAll('.ba').forEach((ba) => {
      const after = ba.querySelector('.after'); const bar = ba.querySelector('.bar');
      if (!after) return;
      const set = (x) => { const r = ba.getBoundingClientRect(); const pc = clamp(((x - r.left) / r.width) * 100, 0, 100); after.style.clipPath = `inset(0 0 0 ${pc}%)`; bar.style.left = pc + '%'; };
      let drag = false;
      ba.addEventListener('pointerdown', (e) => { drag = true; set(e.clientX); });
      addEventListener('pointerup', () => { drag = false; });
      ba.addEventListener('pointermove', (e) => { if (drag || e.pointerType === 'mouse') set(e.clientX); });
    });
  }
  fetch('/api/public/site').then((r) => r.json()).then((d) => {
    site = d;
    renderServices(); renderPortfolio(); setWa();
    if (d.tagline) $('#ftTag').textContent = d.tagline;
    $('#ftInfo').innerHTML = [d.whatsapp_display && 'WhatsApp ' + esc(d.whatsapp_display), d.instagram && 'Instagram ' + esc(d.instagram), d.address && esc(d.address)].filter(Boolean).join(' · ');
  }).catch(() => { $('#port').innerHTML = ''; });
  $('#svcSel').addEventListener('change', setWa);

  // ---------- Formulário de orçamento → CRM ----------
  $('#lead').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target; const err = $('#leadErr');
    const data = Object.fromEntries(new FormData(f).entries());
    if (!data.name.trim() || data.whatsapp.replace(/\D/g, '').length < 10) { err.textContent = 'Informe seu nome e um WhatsApp com DDD.'; err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    const btn = f.querySelector('button'); btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const res = await fetch('/api/public/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, ...attr, source: 'site' }) });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Erro');
      f.classList.add('hidden'); $('#leadOk').classList.remove('hidden'); setWa();
    } catch (ex) {
      err.textContent = 'Não foi possível enviar agora. Tente de novo ou chame no WhatsApp.'; err.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Enviar pedido de orçamento';
    }
  });
})();
