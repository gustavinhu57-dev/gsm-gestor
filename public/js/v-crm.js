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

// ---------- CRM / KANBAN ----------
route(/^#\/crm$/, async (v, _, query) => {
  const m = S.meta;
  const params = new URLSearchParams({ origin_id: query.origin_id || '', campaign_id: query.campaign_id || '' });
  const data = await api('/pipeline?' + params);
  const t = todayStr();
  const byStage = Object.fromEntries(data.stages.map(([k]) => [k, []]));
  data.cards.forEach((c) => (byStage[c.stage] || byStage.novo).push(c));
  const stIdx = Object.fromEntries(data.stages.map(([k], i) => [k, i]));
  v.innerHTML = `<div class="page-head"><h1>CRM</h1><button class="btn gold" id="kNew">${icon('userplus')} Lead</button></div>
    <div class="row" style="margin-bottom:10px">
      <select class="i" id="kOrig">${opts(m.origins, query.origin_id, 'Todas as origens')}</select>
      <select class="i" id="kCamp">${opts(m.campaigns, query.campaign_id, 'Todas as campanhas')}</select>
    </div>
    <div class="chips" style="margin-bottom:10px">${data.stages.map(([k, l]) => `<button class="chip" data-jump="${k}">${l}<span class="n">${byStage[k].length}</span></button>`).join('')}</div>
    <div class="kanban" id="kb">${data.stages.map(([k, l]) => `<div class="col" data-col="${k}" id="col-${k}">
      <div class="col-head">${l} <small>${byStage[k].length}${byStage[k].some((c) => c.potential) ? ' · ' + brl0(byStage[k].reduce((s, c) => s + (c.potential || 0), 0)) : ''}</small></div>
      <div class="col-body">${byStage[k].map((c) => `<div class="kcard" draggable="true" data-card="${c.id}">
        <div class="nm">${esc(c.name)}</div>
        ${c.services ? `<div class="ln">${esc(c.services)}</div>` : ''}
        ${c.vehicle ? `<div class="ln">${icon('car', 'width="13" height="13" style="vertical-align:-2px"')} ${esc(c.vehicle)}</div>` : ''}
        <div class="ft"><span class="tag">${esc(c.origin_name || '—')}</span>${c.potential ? `<b>${brl0(c.potential)}</b>` : ''}</div>
        <div class="ft"><span class="tiny ${c.next_followup && c.next_followup < t ? 'red bold' : 'muted'}">${c.next_followup ? '⏰ ' + fdate(c.next_followup) : 'sem follow-up'}</span>
          <span class="mv">${k !== 'standby' && stIdx[k] > 0 ? '<button data-mv="-1" aria-label="Voltar">◀</button>' : ''}${k !== 'standby' && stIdx[k] < data.stages.length - 2 ? '<button data-mv="1" aria-label="Avançar">▶</button>' : ''}</span></div>
      </div>`).join('') || '<div class="tiny muted" style="padding:6px">—</div>'}</div></div>`).join('')}</div>`;

  const go = () => { location.hash = '#/crm?' + new URLSearchParams({ origin_id: $('#kOrig').value, campaign_id: $('#kCamp').value }); };
  $('#kOrig').onchange = $('#kCamp').onchange = go;
  $('#kNew').onclick = () => clientForm({}, () => reload());
  $$('[data-jump]', v).forEach((b) => { b.onclick = () => $('#col-' + b.dataset.jump).scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); });
  const move = async (id, stage) => { await run(() => post(`/clients/${id}/stage`, { stage })); toast('Movido para ' + stageLabel(stage)); reload(); };
  $$('[data-card]', v).forEach((el) => {
    const c = data.cards.find((x) => x.id == el.dataset.card);
    el.onclick = (e) => {
      const mv = e.target.closest('[data-mv]');
      if (mv) { e.stopPropagation(); move(c.id, data.stages[stIdx[c.stage] + Number(mv.dataset.mv)][0]); return; }
      cardSheet(c, data.stages, move);
    };
    el.ondragstart = (e) => { e.dataTransfer.setData('text/plain', c.id); };
  });
  $$('[data-col]', v).forEach((col) => {
    col.ondragover = (e) => { e.preventDefault(); col.classList.add('over'); };
    col.ondragleave = () => col.classList.remove('over');
    col.ondrop = (e) => { e.preventDefault(); col.classList.remove('over'); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, col.dataset.col); };
  });
});
function cardSheet(c, stages, move) {
  modal(esc(c.name), `<div class="small muted" style="margin-bottom:10px">${esc([c.services, c.vehicle, c.origin_name].filter(Boolean).join(' · '))}${c.potential ? ' · ' + brl(c.potential) : ''}</div>
    <div class="grid g2" style="margin-bottom:12px">
      <button class="btn wa" id="csWa" ${c.whatsapp_digits ? '' : 'disabled'}>${icon('wa')} WhatsApp</button>
      <a class="btn" href="#/cliente/${c.id}">Abrir ficha</a>
      <a class="btn gold" href="#/orcamento/novo?client=${c.id}">${icon('plus')} Orçamento</a>
      <button class="btn" id="csFu">${icon('clock')} Follow-up</button>
    </div>
    <label class="f"><span>Mover para</span></label>
    <div class="opt-list">${stages.map(([k, l]) => `<button class="opt ${k === c.stage ? 'active' : ''}" data-st="${k}">${l}</button>`).join('')}</div>`, (md) => {
    $$('a', md.el).forEach((a) => { a.addEventListener('click', md.close); });
    $('#csWa', md.el).onclick = () => { openWa(c.whatsapp_digits, `Olá ${firstName(c.name)}, tudo bem? Aqui é da GSM — Estética & Tapeçaria Automotiva.`); post(`/clients/${c.id}/contacted`); md.close(); };
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
