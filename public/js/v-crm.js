/* CRM / Kanban e Follow-ups */

// Novo follow-up (pre: {client_id, quote_id, client_name, reason})
function followupForm(pre = {}) {
  modal('Novo follow-up', `<form id="ff">
    ${pre.client_id ? `<p style="margin-top:0"><b>${esc(pre.client_name || '')}</b></p>` : `<label class="f"><span>Cliente</span><input class="i" id="ffq" placeholder="Buscar cliente…" autocomplete="off"></label><div class="list" id="ffr"></div><input type="hidden" name="client_id">`}
    <label class="f"><span>Data</span><input class="i" type="date" name="due_date" value="${addDays(todayStr(), 2)}" required></label>${dateChips('due_date')}
    <label class="f"><span>Motivo</span><input class="i" name="reason" value="${esc(pre.reason || '')}" placeholder="Ex.: Retorno do orçamento" list="fureasons">
      <datalist id="fureasons">${['Retorno do orçamento', 'Recuperar stand-by', 'Primeira abordagem', 'Pós-venda', 'Oferta / remarketing', 'Agendar serviço', 'Cobrança'].map((r) => `<option value="${r}">`).join('')}</datalist></label>
    <div class="row"><label class="f"><span>Responsável</span><select class="i" name="owner">${opts(S.meta.users.map((u) => u.name), S.me.name)}</select></label></div>
    <label class="f"><span>Notas</span><input class="i" name="notes"></label>
    <button class="btn gold block lg">Agendar follow-up</button></form>`, (md) => {
    const fq = $('#ffq', md.el);
    if (fq) {
      let t;
      fq.oninput = () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          const r = await api('/search?q=' + encodeURIComponent(fq.value));
          $('#ffr', md.el).innerHTML = r.clients.map((c) => `<div class="item" data-c="${c.id}" data-n="${esc(c.name)}"><div class="main"><b>${esc(c.name)}</b><div class="sub">${esc(c.whatsapp || '')}</div></div></div>`).join('');
          $$('[data-c]', md.el).forEach((el) => { el.onclick = () => { md.el.querySelector('[name=client_id]').value = el.dataset.c; fq.value = el.dataset.n; $('#ffr', md.el).innerHTML = ''; }; });
        }, 220);
      };
    }
    $('#ff', md.el).onsubmit = async (e) => {
      e.preventDefault();
      const d = { ...formData(e.target), client_id: pre.client_id || formData(e.target).client_id, quote_id: pre.quote_id };
      if (!d.client_id) { toast('Selecione o cliente', true); return; }
      await run(() => post('/followups', d)); md.close(); toast('Follow-up agendado'); reload();
    };
  });
}

// ---------- FUNIL COMERCIAL (CRM / KANBAN) ----------
// Mensagens de apresentação por segmento (tom consultivo; serviços agrupados; CTA pedindo modelo e foto)
const PITCH = {
  'Transportadora': `Trabalhamos com conservação e conforto de cabines de caminhão, o que pesa no dia a dia do motorista e no valor do veículo da frota.

🪡 Tapeçaria e revestimentos: capas de banco sob medida (prontas em 2 dias, caminhão parado o mínimo possível), painel e colchão
✨ Estética automotiva: higienização completa da cabine, restauração de farol e de plásticos

Fazemos uma avaliação dos veículos e montamos uma proposta para a frota.
Com quem posso falar sobre a manutenção dos caminhões? Se puder, me envie os modelos e uma foto da cabine que eu já preparo o orçamento.`,
  'Frota': `Cuidamos do acabamento e da conservação de veículos de frota. Interior limpo e bem conservado passa confiança para quem usa o veículo todos os dias.

🪡 Tapeçaria e revestimentos: capas de banco sob medida, volante e revestimentos
✨ Estética automotiva: higienização interna completa, polimento, restauração de farol e de plásticos

Buscamos e entregamos o veículo e fazemos condição especial por quantidade.
Me envia os modelos da frota e uma foto do interior que eu preparo uma proposta?`,
  'Loja de veículos': `Ajudamos lojas a valorizar o seminovo antes da venda: farol transparente, pintura com brilho e interior higienizado fazem o carro vender mais rápido e com menos negociação.

✨ Estética automotiva: polimento comercial, restauração de farol e de plásticos, higienização interna
🪡 Tapeçaria e revestimentos: capas de banco e volante para renovar o interior

Temos preço de parceiro por carro e buscamos o veículo na loja.
Posso avaliar um carro do seu estoque? Me envie o modelo e uma foto.`,
  'Locadora': `Ajudamos locadoras a manter os carros prontos para o próximo cliente e protegidos do desgaste.

✨ Estética automotiva: higienização interna entre locações, polimento, farol e plásticos
🪡 Tapeçaria e revestimentos: capas de banco sob medida que protegem o estofado original

Fechamos pacote mensal com preço por veículo, com busca e entrega.
Com quem posso falar sobre a manutenção da frota? Se puder, me envie os modelos que vocês têm.`,
  'Embarcações': `Também atendemos embarcações: estofados expostos a sol e umidade pedem material e costura adequados.

🪡 Tapeçaria e revestimentos: capas e estofados sob medida para lanchas e barcos
✨ Estética: higienização de estofados e interiores

Fazemos a avaliação no local. Se vocês atendem donos de lancha que precisam desse serviço, podemos fazer uma parceria de indicação.
Tem alguma embarcação para avaliarmos? Me envie o modelo e uma foto.`,
  'Oficina': `Muitos clientes da oficina também precisam de acabamento interno e estético, e isso não concorre com o serviço de vocês.

🪡 Tapeçaria e revestimentos: capas de banco, volante, carpete e teto
✨ Estética automotiva: higienização, polimento, restauração de farol e de plásticos

Proposta de parceria: vocês indicam e recebem comissão por serviço fechado. Buscamos e entregamos o carro.
Posso passar aí para apresentar o nosso trabalho?`,
  'Lava-jato': `A ideia é somar com o seu lava-jato: os serviços que pedem mais tempo e equipamento ficam com a gente, e você atende o seu cliente completo.

🪡 Tapeçaria e revestimentos: capas de banco, volante, teto e carpete
✨ Estética automotiva: higienização completa, polimento, farol e plásticos

Você indica e recebe comissão por serviço fechado; buscamos e entregamos o carro.
Podemos conversar sobre essa parceria?`,
  'Comerciante': `Atendemos empresas que usam veículos no dia a dia (entregas, vendas, serviços externos). Conservar o interior evita desgaste e mantém a boa imagem da empresa.

🪡 Tapeçaria e revestimentos: capas de banco sob medida para carros, utilitários, caminhões e motos
✨ Estética automotiva: higienização interna, restauração de farol e de plásticos

Condição especial para empresa, com busca e entrega.
Quais veículos vocês usam? Me envie o modelo e uma foto que eu preparo o orçamento.`,
  '_padrao': `Cuidamos do acabamento, do conforto e da conservação do seu veículo.

🪡 Tapeçaria e revestimentos: capas de banco, volante, teto e carpete
✨ Estética automotiva: higienização, polimento, restauração de farol e de plásticos

Fazemos uma avaliação do veículo, e buscamos e entregamos.
Me envie o modelo do carro e uma foto que eu preparo o orçamento?`,
};
function pitchText(c) {
  const quem = firstName(S.me.name) || 'Gustavo';
  const contato = c.contact_person ? `Olá, ${firstName(c.contact_person)}, tudo bem?` : 'Olá, tudo bem?';
  return `${contato} Aqui é o ${quem}, do Studio GSM — Estética & Tapeçaria Automotiva, na Zona Norte de Manaus.

${PITCH[c.segment] || PITCH._padrao}

Studio GSM | Estética & Tapeçaria Automotiva
Customizar • Reparar • Proteger`;
}
const telDigits = (c) => (c.whatsapp_digits || digitsOnly(c.phone));
function digitsOnly(s) { const d = String(s || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : ''; }

route(/^#\/crm$/, async (v, _, query) => {
  const m = S.meta;
  const fl = { origin_id: query.origin_id || '', campaign_id: query.campaign_id || '', segment: query.segment || '', priority: query.priority || '' };
  const data = await api('/pipeline?' + new URLSearchParams(fl));
  const t = todayStr();
  const byStage = Object.fromEntries(data.stages.map(([k]) => [k, []]));
  data.cards.forEach((c) => (byStage[c.stage] || byStage.novo).push(c));
  const prOrder = { A: 0, B: 1, C: 2 };
  byStage.novo.sort((a, b) => (prOrder[a.priority] ?? 3) - (prOrder[b.priority] ?? 3));
  const stIdx = Object.fromEntries(data.stages.map(([k], i) => [k, i]));
  // Etapas de execução (Agendado → Pós-venda) ficam ocultas por padrão para o funil caber na tela
  const EXEC = ['agendado', 'executado', 'pago', 'posvenda'];
  let showExec = false; try { showExec = localStorage.getItem('gsm_funil_exec') === '1'; } catch (e) { /* sem storage */ }
  const visible = data.stages.filter(([k]) => showExec || !EXEC.includes(k) || byStage[k].length);
  const segOpts = [['_empresas', 'Só empresas']].concat(m.segments.map((s) => [s, s]));
  v.innerHTML = `<div class="page-head"><h1>Funil comercial</h1><button class="btn" id="kImp">${icon('users')} Importar</button><button class="btn gold" id="kNew">${icon('userplus')} Lead</button></div>
    <div class="kfilters">
      <select class="i" id="kSeg">${opts(segOpts, fl.segment, 'Todos os segmentos')}</select>
      <select class="i" id="kPri">${opts([['A', 'Prioridade A'], ['B', 'Prioridade B'], ['C', 'Prioridade C']], fl.priority, 'Todas as prioridades')}</select>
      <select class="i" id="kOrig">${opts(m.origins, fl.origin_id, 'Todas as origens')}</select>
      <select class="i" id="kCamp">${opts(m.campaigns, fl.campaign_id, 'Todas as campanhas')}</select>
    </div>
    <div class="chips" style="margin-bottom:10px">${visible.map(([k, l]) => `<button class="chip" data-jump="${k}">${l}<span class="n">${byStage[k].length}</span></button>`).join('')}</div>
    <div class="row tiny muted" style="margin:-4px 0 8px;align-items:center;gap:12px;flex-wrap:wrap"><span>Arraste os cartões entre as colunas (computador) ou use ◀ ▶ (celular). Toque no cartão para enviar a apresentação.</span>
      <label style="display:flex;gap:6px;align-items:center;cursor:pointer;white-space:nowrap"><input type="checkbox" id="kExec" ${showExec ? 'checked' : ''}> Mostrar etapas de execução</label></div>
    <div class="kanban" id="kb">${visible.map(([k, l]) => `<div class="col" data-col="${k}" id="col-${k}">
      <div class="col-head">${l} <small>${byStage[k].length}${byStage[k].some((c) => c.potential) ? ' · ' + brl0(byStage[k].reduce((s, c) => s + (c.potential || 0), 0)) : ''}</small></div>
      <div class="col-body">${byStage[k].slice(0, 300).map((c) => `<div class="kcard" draggable="true" data-card="${c.id}">
        <div class="nm">${c.priority ? `<span class="pri pri-${esc(c.priority)}">${esc(c.priority)}</span> ` : ''}${esc(c.name)}</div>
        ${c.segment || c.neighborhood ? `<div class="ln">${esc([c.segment, c.neighborhood].filter(Boolean).join(' · '))}</div>` : ''}
        ${c.services ? `<div class="ln">${esc(c.services)}</div>` : ''}
        ${c.vehicle ? `<div class="ln">${icon('car', 'width="13" height="13" style="vertical-align:-2px"')} ${esc(c.vehicle)}</div>` : ''}
        <div class="ft"><span class="tag">${esc(c.origin_name || '—')}</span>${c.potential ? `<b>${brl0(c.potential)}</b>` : (!c.whatsapp_digits && c.phone ? '<span class="tiny muted">☎ fixo</span>' : '')}</div>
        <div class="ft"><span class="tiny ${c.next_followup && c.next_followup < t ? 'red bold' : 'muted'}">${c.next_followup ? '⏰ ' + fdate(c.next_followup) : (c.last_contact_at ? 'últ. contato ' + relDay(c.last_contact_at) : 'sem follow-up')}</span>
          <span class="mv">${k !== 'standby' && stIdx[k] > 0 ? '<button data-mv="-1" aria-label="Voltar">◀</button>' : ''}${k !== 'standby' && stIdx[k] < data.stages.length - 2 ? '<button data-mv="1" aria-label="Avançar">▶</button>' : ''}</span></div>
      </div>`).join('') || '<div class="tiny muted" style="padding:6px">—</div>'}${byStage[k].length > 300 ? `<div class="tiny muted" style="padding:6px">+${byStage[k].length - 300} — use os filtros</div>` : ''}</div></div>`).join('')}</div>`;

  const go = () => { location.hash = '#/crm?' + new URLSearchParams({ segment: $('#kSeg').value, priority: $('#kPri').value, origin_id: $('#kOrig').value, campaign_id: $('#kCamp').value }); };
  $('#kOrig').onchange = $('#kCamp').onchange = $('#kSeg').onchange = $('#kPri').onchange = go;
  $('#kNew').onclick = () => clientForm({}, () => reload());
  $('#kImp').onclick = () => importForm({ mode: 'csv' });
  // Marca nos cartões quem está esperando mensagem (mesma regra do aviso flutuante)
  api('/funnel-alerts').then((fa) => fa.groups.flatMap((g) => g.items).forEach((it) => {
    const el = $(`[data-card="${it.id}"]`, v);
    if (el && !$('.needs', el)) el.insertAdjacentHTML('beforeend', `<div class="needs ${it.urgent ? 'urgent' : ''}">📨 ${esc(it.reason)}</div>`);
  })).catch(() => {});
  $('#kExec').onchange = (e) => { try { localStorage.setItem('gsm_funil_exec', e.target.checked ? '1' : '0'); } catch (err) { /* sem storage */ } reload(); };
  // Rolagem automática do quadro ao arrastar perto das bordas
  const kb = $('#kb');
  kb.addEventListener('dragover', (e) => {
    const r = kb.getBoundingClientRect(); const edge = 90;
    if (e.clientX < r.left + edge) kb.scrollLeft -= 18; else if (e.clientX > r.right - edge) kb.scrollLeft += 18;
  });
  $$('[data-jump]', v).forEach((b) => { b.onclick = () => $('#col-' + b.dataset.jump).scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); });
  const move = async (id, stage) => {
    if (stage === 'standby') { standbyAsk(id, () => reload()); return; }
    await run(() => post(`/clients/${id}/stage`, { stage })); toast('Movido para ' + stageLabel(stage)); reload();
  };
  $$('[data-card]', v).forEach((el) => {
    const c = data.cards.find((x) => x.id == el.dataset.card);
    el.onclick = (e) => {
      const mv = e.target.closest('[data-mv]');
      if (mv) { e.stopPropagation(); move(c.id, data.stages[stIdx[c.stage] + Number(mv.dataset.mv)][0]); return; }
      cardSheet(c, data.stages, move);
    };
    el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); };
    el.ondragend = () => el.classList.remove('dragging');
  });
  $$('[data-col]', v).forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); };
    col.ondrop = (e) => {
      e.preventDefault(); col.classList.remove('over');
      const id = e.dataTransfer.getData('text/plain'); const c = data.cards.find((x) => x.id == id);
      if (id && c && c.stage !== col.dataset.col) move(id, col.dataset.col);
    };
  });
});

// Stand-by pede o motivo (vai para o histórico do cliente)
function standbyAsk(id, done) {
  modal('Mover para stand-by', `<form id="sbf">
    <div class="opt-list">${S.meta.standbyReasons.map((r, i) => `<label class="opt"><input type="radio" name="reason" value="${esc(r)}" ${i ? '' : 'checked'} hidden>${esc(r)}</label>`).join('')}</div>
    <label class="f" style="margin-top:10px"><span>Retomar em (opcional)</span><input class="i" type="date" name="due" value=""></label>
    <button class="btn gold block lg">Mover para stand-by</button></form>`, (md) => {
    $$('.opt input', md.el).forEach((r) => { r.onchange = () => $$('.opt', md.el).forEach((o) => o.classList.toggle('active', $('input', o).checked)); });
    $$('.opt', md.el)[0]?.classList.add('active');
    $('#sbf', md.el).onsubmit = async (e) => {
      e.preventDefault(); const d = formData(e.target);
      await run(async () => {
        await post(`/clients/${id}/stage`, { stage: 'standby' });
        await post(`/clients/${id}/events`, { type: 'nota', description: 'Stand-by: ' + d.reason });
        if (d.due) await post('/followups', { client_id: id, due_date: d.due, reason: 'Recuperar stand-by', owner: S.me.name });
      });
      md.close(); toast('Movido para stand-by'); done();
    };
  });
}

function cardSheet(c, stages, move) {
  const wa = c.whatsapp_digits; const tel = telDigits(c);
  modal(esc(c.name), `<div class="small muted" style="margin-bottom:10px">${esc([c.segment, c.neighborhood, c.services, c.vehicle, c.origin_name].filter(Boolean).join(' · '))}${c.potential ? ' · ' + brl(c.potential) : ''}</div>
    ${c.notes ? `<p class="small" style="background:var(--soft);padding:10px;border-radius:10px;white-space:pre-wrap;margin-top:0">${esc(c.notes)}</p>` : ''}
    ${c.stage === 'novo' ? `<label class="f"><span>Mensagem de apresentação (edite se quiser)</span><textarea class="i" id="csMsg" rows="9">${esc(pitchText(c))}</textarea></label>` : ''}
    <div class="grid g2" style="margin-bottom:12px">
      ${c.stage === 'novo'
    ? `<button class="btn wa" id="csPitch" ${wa ? '' : 'disabled'}>${icon('wa')} Enviar apresentação</button>`
    : `<button class="btn wa" id="csWa" ${wa ? '' : 'disabled'}>${icon('wa')} WhatsApp</button>`}
      ${tel ? `<a class="btn" href="tel:+${tel}" id="csTel">☎ Ligar ${!wa && c.phone ? '(fixo)' : ''}</a>` : '<span></span>'}
      <a class="btn" href="#/cliente/${c.id}">Abrir ficha</a>
      <a class="btn gold" href="#/orcamento/novo?client=${c.id}">${icon('plus')} Orçamento</a>
      <button class="btn" id="csFu">${icon('clock')} Follow-up</button>
      ${c.stage === 'novo' ? `<button class="btn" id="csDone">✓ Já me apresentei</button>` : ''}
    </div>
    <label class="f"><span>Mover para</span></label>
    <div class="opt-list">${stages.map(([k, l]) => `<button class="opt ${k === c.stage ? 'active' : ''}" data-st="${k}">${l}</button>`).join('')}</div>`, (md) => {
    $$('a', md.el).forEach((a) => { a.addEventListener('click', md.close); });
    const afterPitch = async (desc) => {
      await post(`/clients/${c.id}/contacted`, { description: desc });
      await post('/followups', { client_id: c.id, due_date: addDays(todayStr(), 2), reason: 'Retorno da apresentação', owner: S.me.name }).catch(() => {});
      md.close(); toast('Apresentação registrada · follow-up em 2 dias'); reload();
    };
    const pb = $('#csPitch', md.el);
    if (pb) pb.onclick = () => { openWa(wa, $('#csMsg', md.el).value); afterPitch('Apresentação enviada pelo WhatsApp'); };
    const dn = $('#csDone', md.el);
    if (dn) dn.onclick = () => afterPitch('Apresentação feita (ligação/visita)');
    const wb = $('#csWa', md.el);
    if (wb) wb.onclick = () => { openWa(wa, `Olá ${firstName(c.contact_person || c.name)}, tudo bem? Aqui é da GSM — Estética & Tapeçaria Automotiva.`); post(`/clients/${c.id}/contacted`); md.close(); };
    $('#csFu', md.el).onclick = () => { md.close(); followupForm({ client_id: c.id, quote_id: c.quote_id, client_name: c.name }); };
    $$('[data-st]', md.el).forEach((b) => { b.onclick = () => { md.close(); if (b.dataset.st !== c.stage) move(c.id, b.dataset.st); }; });
  });
}

// ---------- FOLLOW-UPS ----------
route(/^#\/followups$/, async (v, _, query) => {
  const data = await api('/followups');
  const tab = query.tab || (data.atrasados.length ? 'atrasados' : data.hoje.length ? 'hoje' : 'proximos');
  const T = [['atrasados', 'Atrasados'], ['hoje', 'Hoje'], ['proximos', 'Próximos']];
  const rows = data[tab];
  v.innerHTML = `<div class="page-head"><h1>Follow-ups</h1><button class="btn gold" id="fuNew">${icon('plus')} Novo</button></div>
    <div class="chips" style="margin-bottom:10px">${T.map(([k, l]) => `<a class="chip ${k === tab ? 'active' : ''} ${k === 'atrasados' && data.atrasados.length ? 'red' : ''}" href="#/followups?tab=${k}">${l}<span class="n">${data[k].length}</span></a>`).join('')}</div>
    <div class="card tight">${rows.map((f) => `<div class="fu-card" data-f="${f.id}">
      <div class="row" style="align-items:flex-start"><div><a href="#/cliente/${f.client_id}" style="text-decoration:none"><b style="font-size:16px">${esc(f.client_name)}</b></a>
        <div class="small muted">${esc(f.whatsapp || 'sem telefone')}${f.vehicle ? ' · ' + esc(f.vehicle) : ''}</div></div>
        <div class="auto right"><b class="${f.due_date < todayStr() ? 'red' : ''}">${fdate(f.due_date)}</b><div class="tiny muted">${relDay(f.due_date)}</div></div></div>
      <dl class="kv small" style="margin:8px 0">
        <dt>Motivo</dt><dd>${esc(f.reason || '—')}</dd>
        ${f.services ? `<dt>Serviço</dt><dd>${esc(f.services)}${f.quote_total ? ' · ' + brl(f.quote_total) : ''}</dd>` : ''}
        <dt>Última interação</dt><dd>${f.last_contact_at ? fdate(f.last_contact_at) + ' (' + relDay(f.last_contact_at) + ')' : '—'}</dd>
        <dt>Responsável</dt><dd>${esc(f.owner || '—')}</dd>
        ${f.notes ? `<dt>Notas</dt><dd>${esc(f.notes)}</dd>` : ''}
      </dl>
      <div class="actions"><button class="btn sm wa" data-fa="wa">${icon('wa')} WhatsApp</button><button class="btn sm primary" data-fa="done">${icon('check')} Concluir</button>
        <button class="btn sm" data-fa="resched">Reagendar</button><button class="btn sm" data-fa="new">+ Novo</button></div>
    </div>`).join('') || `<div class="empty">Nenhum follow-up ${tab === 'atrasados' ? 'atrasado 🎉' : tab === 'hoje' ? 'para hoje' : 'agendado'}.</div>`}</div>`;
  $('#fuNew').onclick = () => followupForm();
  $$('[data-f]', v).forEach((el) => {
    const f = rows.find((x) => x.id == el.dataset.f);
    $$('[data-fa]', el).forEach((b) => {
      b.onclick = () => ({
        wa: () => {
          const link = f.public_token ? ` ${location.origin}/o/${f.public_token}` : '';
          openWa(f.whatsapp_digits, `Olá ${firstName(f.client_name)}, tudo bem? Aqui é da GSM — Estética & Tapeçaria Automotiva.${f.services ? ` Passando para saber sobre o orçamento de ${f.services}.${link}` : ''}`);
          post(`/clients/${f.client_id}/contacted`, { description: 'WhatsApp aberto pelo follow-up' });
        },
        done: () => doneForm(f),
        resched: () => modal('Reagendar', `<form id="rf"><label class="f"><span>Nova data</span><input class="i" type="date" name="due_date" value="${addDays(todayStr(), 2)}" required></label>${dateChips('due_date')}<button class="btn gold block lg">Reagendar</button></form>`, (md) => {
          $('#rf', md.el).onsubmit = async (e) => { e.preventDefault(); await run(() => put('/followups/' + f.id, formData(e.target))); md.close(); toast('Reagendado'); reload(); };
        }),
        new: () => followupForm({ client_id: f.client_id, quote_id: f.quote_id, client_name: f.client_name }),
      })[b.dataset.fa]();
    });
  });
});
function doneForm(f) {
  modal('Concluir follow-up', `<form id="df">
    <label class="f"><span>Resultado</span><input class="i" name="result" list="fures" placeholder="Ex.: Vai fechar semana que vem">
      <datalist id="fures">${['Sem resposta', 'Respondeu — vai pensar', 'Interessado', 'Fechou', 'Pediu para chamar depois', 'Não tem interesse agora'].map((r) => `<option value="${r}">`).join('')}</datalist></label>
    <label class="f"><span>Próximo follow-up (opcional)</span><input class="i" type="date" name="next_date"></label>${dateChips('next_date')}
    <button class="btn gold block lg">Concluir</button>
    ${f.quote_id ? `<div class="grid g2" style="margin-top:10px"><a class="btn" href="#/orcamento/${f.quote_id}">Abrir orçamento</a><a class="btn" href="#/cliente/${f.client_id}">Abrir ficha</a></div>` : ''}
  </form>`, (md) => {
    $$('a', md.el).forEach((a) => a.addEventListener('click', md.close));
    $('#df', md.el).onsubmit = async (e) => { e.preventDefault(); await run(() => post(`/followups/${f.id}/done`, formData(e.target))); md.close(); toast('Follow-up concluído'); reload(); };
  });
}
