/* Clientes, ficha do cliente, veículos, importação de listas */

// Formulário de cliente (criar/editar). onSaved recebe {id, vehicle_id}
function clientForm(c = {}, onSaved) {
  const m = S.meta; const isNew = !c.id;
  const html = `<form id="cf">
    <label class="f"><span>Nome *</span><input class="i" name="name" value="${esc(c.name)}" required></label>
    <label class="f"><span>WhatsApp</span><input class="i" name="whatsapp" type="tel" inputmode="tel" placeholder="(11) 99999-9999" value="${esc(c.whatsapp)}"></label>
    <div class="row">
      <label class="f"><span>Origem</span><select class="i" name="origin_id">${opts(m.origins.filter((o) => o.active || o.id === c.origin_id), c.origin_id, 'Selecione…')}</select></label>
      <label class="f"><span>Tipo</span><select class="i" name="client_type">${opts(m.clientTypes, c.client_type || 'Pessoa física')}</select></label>
    </div>
    ${isNew ? `<div class="row">
      <label class="f"><span>Marca/modelo</span><input class="i" name="v_model" placeholder="Ex.: Chevrolet Onix"></label>
      <label class="f auto" style="width:120px"><span>Placa</span><input class="i" name="v_plate" style="text-transform:uppercase" placeholder="ABC1D23"></label>
    </div>
    <label class="f"><span>Tipo de veículo</span><select class="i" name="v_type">${opts(m.vehicleTypes, 'carro_p')}</select></label>` : ''}
    <div class="row">
      <label class="f"><span>Responsável</span><select class="i" name="owner">${opts(m.users.map((u) => u.name), c.owner || S.me.name, '—')}</select></label>
      <label class="f"><span>Campanha</span><select class="i" name="campaign_id">${opts(m.campaigns.filter((x) => x.active || x.id === c.campaign_id), c.campaign_id, 'Nenhuma')}</select></label>
    </div>
    <label class="f"><span>Observações</span><textarea class="i" name="notes" rows="2">${esc(c.notes)}</textarea></label>
    <details><summary class="small muted">Atribuição de anúncio (UTM / Meta Ads)</summary>
      <div class="grid g2" style="margin-top:8px">
      ${['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_campaign_id', 'adset_id', 'ad_id', 'creative_id']
    .map((k) => `<label class="f"><span>${k === 'ad_campaign_id' ? 'campaign_id' : k}</span><input class="i" name="${k}" value="${esc(c[k])}"></label>`).join('')}
      </div></details>
    <button class="btn gold block lg" type="submit" style="margin-top:8px">${isNew ? 'Cadastrar cliente' : 'Salvar'}</button>
  </form>`;
  modal(isNew ? 'Novo cliente' : 'Editar cliente', html, (md) => {
    $('#cf', md.el).onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (isNew && (d.v_model || d.v_plate)) {
        const parts = d.v_model.trim().split(/\s+/);
        d.vehicle = parts.length > 1 ? { brand: parts[0], model: parts.slice(1).join(' '), plate: d.v_plate, vehicle_type: d.v_type } : { model: d.v_model, plate: d.v_plate, vehicle_type: d.v_type };
      }
      try {
        let out;
        if (isNew) out = await post('/clients', d); else { await put('/clients/' + c.id, d); out = { id: c.id }; }
        md.close(); toast(isNew ? 'Cliente cadastrado' : 'Cliente atualizado');
        if (onSaved) onSaved(out); else if (isNew) location.hash = '#/cliente/' + out.id; else reload();
      } catch (err) {
        if (err.status === 409 && err.data?.existing_id) {
          if (confirm(err.message + '\n\nAbrir o cadastro existente?')) { md.close(); if (onSaved) onSaved({ id: err.data.existing_id, existing: true }); else location.hash = '#/cliente/' + err.data.existing_id; }
        } else toast(err.message, true);
      }
    };
  });
}

function vehicleForm(clientId, v = {}, onSaved) {
  modal(v.id ? 'Editar veículo' : 'Novo veículo', `<form id="vf">
    <label class="f"><span>Tipo</span><select class="i" name="vehicle_type">${opts(S.meta.vehicleTypes, v.vehicle_type || 'carro_p')}</select></label>
    <div class="row"><label class="f"><span>Marca</span><input class="i" name="brand" value="${esc(v.brand)}" placeholder="Chevrolet"></label>
    <label class="f"><span>Modelo</span><input class="i" name="model" value="${esc(v.model)}" placeholder="Onix"></label></div>
    <div class="row"><label class="f"><span>Ano</span><input class="i" name="year" inputmode="numeric" value="${esc(v.year)}"></label>
    <label class="f"><span>Cor</span><input class="i" name="color" value="${esc(v.color)}"></label>
    <label class="f"><span>Placa</span><input class="i" name="plate" style="text-transform:uppercase" value="${esc(v.plate)}"></label></div>
    <label class="f"><span>Observações</span><input class="i" name="notes" value="${esc(v.notes)}"></label>
    <div class="actions"><button class="btn gold lg" style="flex:1" type="submit">Salvar veículo</button>${v.id ? '<button type="button" class="btn danger lg" id="vdel">Excluir</button>' : ''}</div>
  </form>`, (md) => {
    $('#vf', md.el).onsubmit = async (e) => {
      e.preventDefault();
      const d = { ...formData(e.target), client_id: clientId };
      const out = await run(() => (v.id ? put('/vehicles/' + v.id, d) : post('/vehicles', d)));
      md.close(); toast('Veículo salvo');
      if (onSaved) onSaved(v.id ? { id: v.id } : out); else reload();
    };
    const dl = $('#vdel', md.el);
    if (dl) dl.onclick = async () => { if (confirm('Excluir este veículo?')) { await run(() => del('/vehicles/' + v.id)); md.close(); reload(); } };
  });
}

function importForm(preset = {}) {
  const m = S.meta;
  modal('Importar lista de contatos', `<form id="imf">
    <p class="small muted" style="margin-top:0">Cole um contato por linha. Ex.: <code>João Silva 11 99999-8888</code> ou <code>Maria;11988887777</code>. Números já cadastrados são ignorados.</p>
    <label class="f"><span>Contatos</span><textarea class="i" name="text" rows="8" placeholder="João Silva 11999998888&#10;Maria Souza;(11) 98888-7777" required></textarea></label>
    <div class="row">
      <label class="f"><span>Origem</span><select class="i" name="origin_id" required>${opts(m.origins.filter((o) => o.active), preset.origin_id, 'Selecione…')}</select></label>
      <label class="f"><span>Campanha</span><select class="i" name="campaign_id">${opts(m.campaigns.filter((x) => x.active), preset.campaign_id ?? m.campaigns[0]?.id, 'Nenhuma')}</select></label>
    </div>
    <label class="f"><span>Tipo de cliente</span><select class="i" name="client_type">${opts(m.clientTypes, 'Pessoa física')}</select></label>
    <button class="btn gold block lg" type="submit">Importar</button></form>`, (md) => {
    $('#imf', md.el).onsubmit = async (e) => {
      e.preventDefault();
      const r = await run(() => post('/clients/import', formData(e.target)));
      md.close();
      toast(`${r.created} contato(s) importado(s)${r.skipped.length ? ` · ${r.skipped.length} já existiam` : ''}`);
      location.hash = '#/clientes'; reload();
    };
  });
}

// ---------- Lista de clientes ----------
route(/^#\/clientes$/, async (v, _, q) => {
  const m = S.meta;
  v.innerHTML = `<div class="page-head"><h1>Clientes</h1>
      <button class="btn" id="imp">Importar lista</button><button class="btn gold" id="nc">${icon('userplus')} Cliente</button></div>
    <div class="card" style="padding:10px">
      <input class="i" id="cq" placeholder="Buscar nome, WhatsApp, placa…" value="${esc(q.q || '')}" enterkeyhint="search">
      <div class="row" style="margin-top:8px">
        <select class="i" id="co">${opts(m.origins, q.origin_id, 'Todas as origens')}</select>
        <select class="i" id="cs">${opts(m.stages, q.stage, 'Todas as etapas')}</select>
      </div>
    </div>
    <div class="card tight list" id="cl"><div class="empty">Carregando…</div></div>`;
  $('#nc', v).onclick = () => clientForm();
  $('#imp', v).onclick = () => importForm({ campaign_id: q.campaign_id });
  const load = async () => {
    const params = new URLSearchParams({ q: $('#cq').value, origin_id: $('#co').value, stage: $('#cs').value, campaign_id: q.campaign_id || '' });
    const rows = await api('/clients?' + params);
    $('#cl').innerHTML = rows.length ? `<div class="small muted" style="padding:8px 14px">${rows.length} cliente(s)</div>` + rows.map((c) => `
      <a class="item" href="#/cliente/${c.id}"><div class="main">
        <div class="title">${esc(c.name)} <span class="tag">${esc(c.origin_name || 'sem origem')}</span></div>
        <div class="sub">${esc(c.whatsapp || 'sem WhatsApp')}${c.vehicles_txt ? ' · ' + esc(c.vehicles_txt) : ''}</div>
        <div class="sub">${esc(stageLabel(c.stage))}${c.next_followup ? ` · follow-up <b class="${c.next_followup < todayStr() ? 'red' : ''}">${fdate(c.next_followup)}</b>` : ''}</div>
      </div></a>`).join('') : '<div class="empty">Nenhum cliente encontrado</div>';
  };
  let t; $('#cq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#co').onchange = $('#cs').onchange = load;
  if (q.import) importForm({ campaign_id: q.campaign_id });
  await load();
});

// ---------- Ficha do cliente ----------
const EV_ICON = { contato: 'wa', orcamento: 'file', followup: 'clock', servico: 'wrench', pagamento: 'money', posvenda: 'check', nota: 'note' };
const EV_LABEL = { contato: 'Contato', orcamento: 'Orçamento', followup: 'Follow-up', servico: 'Serviço', pagamento: 'Pagamento', posvenda: 'Pós-venda', nota: 'Nota' };

route(/^#\/cliente\/(\d+)$/, async (v, [id]) => {
  const c = await api('/clients/' + id);
  const pending = c.followups.filter((f) => f.status === 'pendente');
  v.innerHTML = `
  <div class="page-head"><a class="btn ghost sm" href="#/clientes">${icon('back')}</a><h1>${esc(c.name)}</h1></div>
  <div class="card">
    <div class="actions" style="margin-bottom:12px">
      <span class="tag">${esc(c.origin_name || 'sem origem')}</span><span class="tag">${esc(c.client_type || '—')}</span>
      ${c.campaign_name ? `<span class="tag gold">${esc(c.campaign_name)}</span>` : ''}
    </div>
    <div class="grid g2" style="margin-bottom:12px">
      <button class="btn wa" id="cwa" ${c.whatsapp_digits ? '' : 'disabled'}>${icon('wa')} WhatsApp</button>
      <a class="btn gold" href="#/orcamento/novo?client=${c.id}">${icon('plus')} Orçamento</a>
      <button class="btn" id="cfu">${icon('clock')} Follow-up</button>
      <button class="btn" id="cct">${icon('note')} Registrar</button>
    </div>
    <label class="f"><span>Etapa no CRM</span><select class="i" id="cstage">${opts(S.meta.stages, c.stage)}</select></label>
    <dl class="kv">
      <dt>WhatsApp</dt><dd>${esc(c.whatsapp || '—')}</dd>
      <dt>Entrada</dt><dd>${fdate(c.entry_date)}</dd>
      <dt>Responsável</dt><dd>${esc(c.owner || '—')}</dd>
      <dt>Último contato</dt><dd>${c.last_contact_at ? fdate(c.last_contact_at) + ' (' + relDay(c.last_contact_at) + ')' : '—'}</dd>
      <dt>Próximo follow-up</dt><dd class="${pending[0] && pending[0].due_date < todayStr() ? 'red' : ''}">${pending[0] ? fdate(pending[0].due_date) + ' — ' + esc(pending[0].reason || '') : '—'}</dd>
      ${c.utm_campaign || c.ad_id ? `<dt>Anúncio</dt><dd>${esc([c.utm_source, c.utm_campaign, c.utm_content, c.ad_id].filter(Boolean).join(' · '))}</dd>` : ''}
    </dl>
    ${c.notes ? `<p class="small" style="background:var(--soft);padding:10px;border-radius:10px;white-space:pre-wrap">${esc(c.notes)}</p>` : ''}
    <button class="btn sm" id="ced" style="margin-top:10px">${icon('edit')} Editar dados</button>
  </div>

  <div class="card"><div class="row" style="margin-bottom:8px"><h2 style="margin:0">Veículos</h2><button class="btn sm auto" id="cnv">${icon('plus')} Veículo</button></div>
    ${c.vehicles.length ? c.vehicles.map((x) => `<div class="item" style="display:flex;padding:10px 0;border-bottom:1px solid var(--line);cursor:pointer" data-veh="${x.id}">
      ${icon('car', 'width="22" height="22" style="flex:none;margin-right:10px;color:var(--mute)"')}<div class="main"><b>${esc([x.brand, x.model].filter(Boolean).join(' ') || 'Veículo')}</b> ${x.vehicle_type ? `<span class="tag">${esc(vtLabel(x.vehicle_type))}</span>` : ''}
      <div class="sub">${esc([x.year, x.color, x.plate].filter(Boolean).join(' · ') || '—')}${x.notes ? ' · ' + esc(x.notes) : ''}</div></div></div>`).join('') : '<div class="muted small">Nenhum veículo cadastrado</div>'}
  </div>

  <div class="card tight"><h2 style="padding:14px 14px 0">Orçamentos e serviços</h2><div class="list">
    ${c.quotes.length ? c.quotes.map(quoteRow).join('') : '<div class="empty">Nenhum orçamento</div>'}</div></div>

  ${pending.length ? `<div class="card"><h2>Follow-ups pendentes</h2>${pending.map((f) => `<div class="row small" style="padding:6px 0"><span><b class="${f.due_date < todayStr() ? 'red' : ''}">${fdate(f.due_date)}</b> — ${esc(f.reason || '')}</span></div>`).join('')}<a class="btn sm" href="#/followups">Abrir follow-ups</a></div>` : ''}

  ${c.photos.length ? `<div class="card"><h2>Fotos (${c.photos.length})</h2><div class="photos">${c.photos.map(photoThumb).join('')}</div></div>` : ''}

  <div class="card"><h2>Histórico</h2>
    <div class="chips" id="evf" style="margin-bottom:8px"><button class="chip active" data-t="">Tudo</button>${Object.entries(EV_LABEL).map(([k, l]) => `<button class="chip" data-t="${k}">${l}</button>`).join('')}</div>
    <ul class="tl" id="evl">${c.events.map((e) => `<li data-type="${e.type}"><span class="dot">${icon(EV_ICON[e.type] || 'note')}</span><div><div>${esc(e.description)}</div><div class="tiny muted">${EV_LABEL[e.type] || e.type} · ${fdt(e.created_at)}${e.user_name ? ' · ' + esc(e.user_name) : ''}</div></div></li>`).join('')}</ul>
  </div>`;

  $('#cwa').onclick = () => { openWa(c.whatsapp_digits, `Olá ${firstName(c.name)}, tudo bem? Aqui é da GSM — Estética & Tapeçaria Automotiva.`); post(`/clients/${c.id}/contacted`).then(() => reload()); };
  $('#cfu').onclick = () => followupForm({ client_id: c.id, client_name: c.name });
  $('#cct').onclick = () => eventForm(c.id);
  $('#ced').onclick = () => clientForm(c);
  $('#cnv').onclick = () => vehicleForm(c.id);
  $$('[data-veh]', v).forEach((el) => { el.onclick = () => vehicleForm(c.id, c.vehicles.find((x) => x.id == el.dataset.veh)); });
  $('#cstage').onchange = async (e) => { await run(() => post(`/clients/${c.id}/stage`, { stage: e.target.value })); toast('Etapa atualizada'); reload(); };
  $$('#evf .chip').forEach((b) => { b.onclick = () => { $$('#evf .chip').forEach((x) => x.classList.toggle('active', x === b)); $$('#evl li').forEach((li) => li.classList.toggle('hidden', !!b.dataset.t && li.dataset.type !== b.dataset.t)); }; });
  bindPhotoThumbs(v, c.photos);
});

function eventForm(clientId) {
  modal('Registrar interação', `<form id="ef">
    <div class="chips" style="margin-bottom:10px">${[['contato', 'Contato'], ['posvenda', 'Pós-venda'], ['nota', 'Nota interna']].map(([k, l], i) => `<label class="chip ${i ? '' : 'active'}"><input type="radio" name="type" value="${k}" ${i ? '' : 'checked'} hidden>${l}</label>`).join('')}</div>
    <label class="f"><span>Descrição</span><textarea class="i" name="description" rows="3" required placeholder="Ex.: Ligou perguntando sobre polimento"></textarea></label>
    <button class="btn gold block lg">Salvar</button></form>`, (md) => {
    $$('.chip input', md.el).forEach((r) => { r.onchange = () => $$('.chip', md.el).forEach((c) => c.classList.toggle('active', $('input', c).checked)); });
    $('#ef', md.el).onsubmit = async (e) => { e.preventDefault(); await run(() => post(`/clients/${clientId}/events`, formData(e.target))); md.close(); toast('Registrado'); reload(); };
  });
}

// ---------- Serviços / tabela de preços em grade (serviço × veículo) ----------
route(/^#\/servicos$/, async (v) => {
  await loadMeta();
  const list = S.meta.services;
  const cats = [...new Set(list.filter((s) => s.active).map((s) => s.category || 'Outros'))];
  const pr = pricing(); const st = S.meta.settings;
  const rowsOf = (s) => (s.prices || []).filter((p) => p.active);
  const cnt = { 'abaixo do mínimo': 0, 'falta custo': 0, 'a definir': 0 };
  list.filter((s) => s.active && s.name !== 'Outros').forEach((s) => rowsOf(s).forEach((p) => { const k = situacaoRow(p)[0]; if (k in cnt) cnt[k]++; }));
  v.innerHTML = `<div class="page-head"><h1>Serviços e preços</h1><button class="btn gold" id="ns">${icon('plus')} Serviço</button></div>
    <div class="card small"><b>Como a divisão e o mínimo são calculados</b><br>
      <span class="muted">1) O caixa fica com ${pct(pr.cp)} do preço. 2) Saem material, linha e cola e a taxa do cartão. 3) A sobra é dividida: ${esc(st.split_socio1_nome)} ${pct(pr.pG)}, 2ª parte ${pct(pr.pP)} (${esc(st.split_socio2_nome)} na tapeçaria; GSM na estética), caixa ${pct(pr.rr)}.
      Custos fixos: ${brl0(pr.fixos)} ÷ meta de ${brl0(pr.meta)} = ${(pr.f * 100).toFixed(1).replace('.', ',')}% de cada preço.</span><br>
      <b>Mínimo</b>: menor preço em que o caixa líquido não fica negativo e a sobra também não.
      <div style="margin-top:6px">${cnt['abaixo do mínimo'] ? `<span class="tag red">${cnt['abaixo do mínimo']} abaixo do mínimo</span> ` : ''}${cnt['falta custo'] ? `<span class="tag blue">${cnt['falta custo']} com custo faltando</span> ` : ''}${cnt['a definir'] ? `<span class="tag amber">${cnt['a definir']} preço a definir</span>` : ''}</div></div>
    ${cats.map((cat) => `<div class="card tight"><h2 style="padding:14px 14px 0">${esc(cat)}</h2>
      ${list.filter((s) => s.active && (s.category || 'Outros') === cat).map((s) => `<div style="padding:12px 14px;border-top:1px solid var(--line)">
        <div class="row"><div><b>${esc(s.name)}</b><div class="small muted">${esc(s.description || '')}</div></div><button class="btn sm auto" data-s="${s.id}">${icon('edit')} Editar</button></div>
        <div class="scroll-x"><table class="t small" style="margin-top:6px;min-width:780px"><tr><th>Veículo</th><th class="n">Preço</th><th class="n">Caixa ${pct(pr.cp)}</th><th class="n">Mat.+linha</th><th class="n">Sobra</th><th class="n">${esc(st.split_socio1_nome)}</th><th class="n">2ª parte</th><th class="n">Insumos</th><th class="n">Caixa líq.</th><th class="n">Fica na GSM</th><th class="n">Mínimo</th><th>Situação</th></tr>
        ${rowsOf(s).map((p) => {
          const [sit, cls] = situacaoRow(p); const price = p.price || 0; const ma = matRow(p);
          const b = breakdown(price, ma, Number(p.ins) || 0, price * pr.f);
          const empresa = b.caixaLiq + (s.category === 'Tapeçaria' ? 0 : b.parte2);
          return `<tr><td>${esc(vtLabel(p.vehicle_type))}</td><td class="n bold">${p.price == null ? 'a definir' : brl0(p.price)}</td><td class="n">${brl0(b.caixa1)}</td>
            <td class="n">${p.mat_pending ? '?' : brl0(ma)}</td><td class="n">${brl0(b.sobra)}</td><td class="n">${brl0(b.gustavo)}</td><td class="n">${brl0(b.parte2)}</td>
            <td class="n">${p.ins == null ? '?' : brl(p.ins)}<div class="tiny muted">${p.ins_source === 'ficha' ? 'ficha' : 'estim.'}</div></td><td class="n">${brl0(b.caixaLiq)}</td><td class="n">${brl0(empresa)}</td>
            <td class="n muted">${brl0(minPriceRow(p))}</td><td><span class="tag ${cls}">${sit}</span></td></tr>`;
        }).join('') || '<tr><td colspan="12" class="muted">Nenhum veículo marcado</td></tr>'}</table></div></div>`).join('')}</div>`).join('')}
    ${list.some((s) => !s.active) ? `<details class="card"><summary class="muted">Serviços inativos (${list.filter((s) => !s.active).length})</summary>${list.filter((s) => !s.active).map((s) => `<div class="row" style="padding:8px 0"><span>${esc(s.name)}</span><button class="btn sm auto" data-s="${s.id}">Abrir</button></div>`).join('')}</details>` : ''}`;
  $('#ns', v).onclick = () => serviceForm();
  $$('[data-s]', v).forEach((el) => { el.onclick = () => serviceForm(list.find((s) => s.id == el.dataset.s)); });
});
async function serviceForm(s = { active: 1, prices: [] }) {
  const prods = await api('/products');
  const cats = [...new Set(['Lavagem', 'Higienização', 'Polimento', 'Tapeçaria', 'Outros', ...S.meta.services.map((x) => x.category).filter(Boolean)])];
  const row = (t) => (s.prices || []).find((p) => p.vehicle_type === t) || {};
  const fv = (x) => (x == null || x === '' ? '' : String(x).replace('.', ','));
  modal(s.id ? esc(s.name) : 'Novo serviço', `<form id="sf">
    <div class="row"><label class="f"><span>Nome *</span><input class="i" name="name" value="${esc(s.name)}" required></label>
    <label class="f"><span>Categoria</span><input class="i" name="category" list="cats" value="${esc(s.category)}"><datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></label></div>
    <label class="f"><span>Descrição curta (aparece para o cliente)</span><input class="i" name="description" value="${esc(s.description)}"></label>
    <p class="tiny muted" style="margin-top:0"><b>Material</b> e <b>linha e cola</b>: o cliente paga, saem antes da divisão (material vazio = a definir). <b>Insumos</b> (produtos, panos, desgaste): o caixa paga. Na ficha técnica, fator 1 = uso normal, 2 = o dobro, 0,5 = metade; o custo da ficha leva +${esc(S.meta.settings.margem_seg || 30)}% de margem de segurança.</p>
    ${S.meta.vehicleTypes.map(([t, l]) => { const p = row(t); const estado = !p.active ? 'nao' : p.price == null ? 'definir' : 'preco'; const sh = p.sheet || {};
      return `<div class="card" style="padding:10px;margin-bottom:8px" data-vt="${t}">
      <div class="row"><b>${esc(l)}</b><select class="i auto" data-k="estado" style="max-width:150px"><option value="nao" ${estado === 'nao' ? 'selected' : ''}>Não faz</option><option value="definir" ${estado === 'definir' ? 'selected' : ''}>A definir</option><option value="preco" ${estado === 'preco' ? 'selected' : ''}>Tem preço</option></select></div>
      <div class="grid g2 md-g4" style="margin-top:8px">
        <label class="f" style="margin:0"><span>Preço</span><input class="i" data-k="price" inputmode="decimal" value="${fv(p.price)}"></label>
        <label class="f" style="margin:0"><span>Material</span><input class="i" data-k="cost" inputmode="decimal" value="${p.mat_pending ? '' : fv(p.cost)}" placeholder="a definir"></label>
        <label class="f" style="margin:0"><span>Linha e cola</span><input class="i" data-k="pre_cost" inputmode="decimal" value="${fv(p.pre_cost || '')}"></label>
        <label class="f" style="margin:0"><span>Insumos estimados</span><input class="i" data-k="op_est" inputmode="decimal" value="${fv(p.op_est)}" placeholder="a informar"></label></div>
      <details style="margin-top:6px"><summary class="small">Ficha técnica (${Object.keys(sh).length} produto(s)) · usando ${p.ins_mode === 'ficha' ? 'ficha' : 'estimativa'}</summary>
        <label class="row small" style="margin-top:6px"><input type="checkbox" data-k="ficha" class="auto" style="width:20px;height:20px" ${p.ins_mode === 'ficha' ? 'checked' : ''}> Usar a ficha técnica (desmarcado: usa os insumos estimados)</label>
        <div class="ficha">${prods.map((pr) => `<label><span>${esc(pr.name)}</span><input data-prod="${pr.id}" inputmode="decimal" value="${fv(sh[pr.id])}" aria-label="Fator de ${esc(pr.name)}"></label>`).join('')}</div></details></div>`; }).join('')}
    <label class="f row" style="align-items:center"><input type="checkbox" name="active" class="auto" style="width:22px;height:22px" ${s.active ? 'checked' : ''}> <span style="margin:0">Serviço ativo</span></label>
    <button class="btn gold block lg">Salvar</button></form>`, (md) => {
    $('#sf', md.el).onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target); d.active = !!d.active;
      const on = (x) => (String(x).trim() === '' ? null : num(x));
      d.prices = $$('[data-vt]', md.el).map((c) => {
        const g = (k) => $(`[data-k="${k}"]`, c); const estado = g('estado').value;
        const sheet = {}; $$('[data-prod]', c).forEach((inp) => { const f = on(inp.value); if (f) sheet[inp.dataset.prod] = f; });
        return { vehicle_type: c.dataset.vt, active: estado !== 'nao', price: estado === 'preco' ? on(g('price').value) : null, cost: on(g('cost').value),
          pre_cost: num(g('pre_cost').value), op_est: on(g('op_est').value), ins_mode: g('ficha').checked ? 'ficha' : 'estimativa', sheet };
      });
      const first = d.prices.find((p) => p.active && p.price != null);
      d.price = first ? first.price : 0; // preço de referência (site / leads)
      await run(() => (s.id ? put('/services/' + s.id, d) : post('/services', d)));
      md.close(); toast('Serviço salvo'); await loadMeta(); reload();
    };
  });
}
