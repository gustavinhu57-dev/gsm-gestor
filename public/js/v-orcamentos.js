/* Orçamento rápido, compartilhamento, detalhe do orçamento, lista de orçamentos, fotos */

const publicLink = (q) => `${location.origin}/o/${q.public_token}`;
function quoteMessage(q, link) {
  const s = S.meta.settings;
  const veh = [q.brand, q.model].filter(Boolean).join(' ');
  let itens = (q.items || []).map((i) => `• ${i.name} — ${brl(i.price)}`).join('\n');
  if (q.discount) itens += `\nDesconto: − ${brl(q.discount)}`;
  if (q.surcharge) itens += `\nAcréscimo: + ${brl(q.surcharge)}`;
  return (s.quote_message || '').replace(/\{nome\}/g, firstName(q.client_name)).replace(/\{veiculo\}/g, veh ? ` para o seu ${veh}` : '')
    .replace(/\{itens\}/g, itens).replace(/\{total\}/g, brl(q.total)).replace(/\{link\}/g, link).replace(/\{validade\}/g, q.validity_days || s.quote_validity_days);
}
function quoteRow(q) {
  return `<a class="item" href="#/orcamento/${q.id}"><div class="main">
    <div class="title">#${q.id} ${statusTag(q.status)} ${q.source !== 'manual' ? '<span class="tag site">SITE</span>' : ''}</div>
    <div class="sub">${esc(q.services || q.requested_service || 'sem serviços')}</div>
    <div class="sub">${esc(vehicleTxt(q) || '')} · ${fdate(q.created_at)}</div></div><div class="val">${brl(q.total)}</div></a>`;
}

// ---------- Fotos ----------
async function resizeImage(file, max = 1600, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise((res) => cv.toBlob((b) => res(b || file), 'image/jpeg', quality));
  } catch { return file; }
}
async function uploadPhotos(meta, blobs) {
  if (!blobs.length) return;
  const fd = new FormData();
  Object.entries(meta).forEach(([k, val]) => { if (val !== undefined && val !== null) fd.append(k, val); });
  blobs.forEach((b, i) => fd.append('files', b, `foto${i}.jpg`));
  await api('/photos', { method: 'POST', body: fd });
}
const MK = { sim: 'Sim', nao: 'Não', nao_informado: 'Não informado' };
const PHASE = { entrada: 'Entrada', antes: 'Antes', depois: 'Depois' };
const photoThumb = (p) => `<div class="ph" data-ph="${p.id}"><img loading="lazy" src="/api/photos/${p.id}/file" alt="">${p.marketing === 'sim' ? '<span class="mk">MKT</span>' : ''}${p.show_client ? '<span class="cl">CLIENTE</span>' : ''}<span class="cap">${esc(PHASE[p.phase] || '')} · ${esc(p.category || '')}</span></div>`;
function bindPhotoThumbs(root, photos) {
  $$('[data-ph]', root).forEach((el) => { el.onclick = () => photoViewer(photos.find((p) => p.id == el.dataset.ph)); });
}
function photoViewer(p) {
  const m = S.meta;
  modal('Foto', `<img src="/api/photos/${p.id}/file" style="width:100%;border-radius:12px;max-height:60vh;object-fit:contain;background:#000">
    <div class="tiny muted" style="margin:6px 0 10px">${fdt(p.created_at)}${p.client_name ? ' · ' + esc(p.client_name) : ''}${p.services ? ' · ' + esc(p.services) : ''}</div>
    <div class="row"><label class="f"><span>Fase</span><select class="i" data-k="phase">${opts(m.photoPhases, p.phase)}</select></label>
    <label class="f"><span>Categoria</span><select class="i" data-k="category">${opts(m.photoCategories, p.category)}</select></label></div>
    <div class="row"><label class="f"><span>Aparece no orçamento do cliente</span><select class="i" data-k="show_client">${opts([['1', 'Sim'], ['0', 'Não']], p.show_client ? '1' : '0')}</select></label>
    <label class="f"><span>Autorizado p/ marketing (vai pro site)</span><select class="i" data-k="marketing">${opts(Object.entries(MK), p.marketing)}</select></label></div>
    <div class="actions">${p.quote_id ? `<a class="btn" href="#/orcamento/${p.quote_id}">Abrir orçamento</a>` : ''}<a class="btn" href="/api/photos/${p.id}/file" target="_blank" download>Baixar</a><button class="btn danger" id="phd">Excluir</button></div>`, (md) => {
    $$('select[data-k]', md.el).forEach((s) => { s.onchange = async () => { const val = s.dataset.k === 'show_client' ? s.value === '1' : s.value; await run(() => put('/photos/' + p.id, { [s.dataset.k]: val })); p[s.dataset.k] = s.value; toast('Foto atualizada'); }; });
    $('a[href^="#"]', md.el)?.addEventListener('click', md.close);
    $('#phd', md.el).onclick = async () => { if (confirm('Excluir esta foto?')) { await run(() => del('/photos/' + p.id)); md.close(); reload(); } };
  });
}
// Bloco de seleção de fotos (câmera/galeria) reutilizável
function photoPickerHtml(id, { phase, show = true, marketing = true } = {}) {
  const m = S.meta;
  return `<div class="row">${phase ? `<label class="f"><span>Fase</span><select class="i" id="${id}Phase">${opts(m.photoPhases, phase)}</select></label>` : ''}
    <label class="f"><span>Categoria</span><select class="i" id="${id}Cat">${opts(m.photoCategories, 'Frente')}</select></label></div>
    <label class="check"><input type="checkbox" id="${id}Show" ${show ? 'checked' : ''}><span><b>Mostrar ao cliente no orçamento</b><br><small class="muted">Ex.: foto da avaria para ele entender o serviço</small></span></label>
    ${marketing ? `<label class="f"><span>Autorizado p/ marketing (divulgação)</span><select class="i" id="${id}Mk">${opts(Object.entries(MK), 'nao_informado')}</select></label>` : ''}
    <div class="upload-btns">
      <label class="btn">${icon('camera')} Câmera<input type="file" accept="image/*" capture="environment" hidden id="${id}Cam"></label>
      <label class="btn">${icon('image')} Galeria<input type="file" accept="image/*" multiple hidden id="${id}Gal"></label>
    </div>`;
}
function bindPhotoPicker(root, id, onFiles) {
  const handler = async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    toast(files.length > 1 ? `Processando ${files.length} fotos…` : 'Processando foto…');
    const blobs = [];
    for (const f of files) blobs.push(await resizeImage(f));
    onFiles(blobs, { category: $(`#${id}Cat`, root).value, marketing: $(`#${id}Mk`, root)?.value || 'nao_informado', show_client: $(`#${id}Show`, root).checked ? '1' : '0', phase: $(`#${id}Phase`, root)?.value });
  };
  $(`#${id}Cam`, root).onchange = handler; $(`#${id}Gal`, root).onchange = handler;
}

// ---------- ORÇAMENTO RÁPIDO ----------
route(/^#\/orcamento\/novo$/, (v, _, q) => quoteForm(v, null, q));
route(/^#\/orcamento\/(\d+)\/editar$/, async (v, [id]) => quoteForm(v, await api('/quotes/' + id), {}));

async function quoteForm(v, existing, query) {
  const m = S.meta;
  const st = {
    client: null, vehicle_id: null, items: [], discount: 0, surcharge: 0, notes: '', internal_notes: '',
    validity_days: Number(m.settings.quote_validity_days) || 7, photos: [], size: 'P',
  };
  if (existing) {
    Object.assign(st, { size: existing.vehicle_size || 'P', vehicle_id: existing.vehicle_id, discount: existing.discount, surcharge: existing.surcharge, notes: existing.notes || '', internal_notes: existing.internal_notes || '', validity_days: existing.validity_days });
    st.items = existing.items.map((i) => ({ service_id: i.service_id, name: i.name, price: i.price, cost: i.cost, op_cost: i.op_cost }));
    st.client = await api('/clients/' + existing.client_id);
  } else if (query.client) {
    st.client = await api('/clients/' + query.client);
    if (st.client.vehicles.length === 1) st.vehicle_id = st.client.vehicles[0].id;
  }
  const services = m.services.filter((s) => s.active);
  const cats = [...new Set(services.map((s) => s.category || 'Outros'))];
  v.className = 'has-sticky';
  v.innerHTML = `
    <div class="page-head"><a class="btn ghost sm" href="${existing ? '#/orcamento/' + existing.id : '#/orcamentos'}">${icon('back')}</a><h1>${existing ? 'Editar orçamento #' + existing.id : 'Orçamento rápido'}</h1></div>
    ${existing?.requested_service ? `<div class="card small"><b>Pedido do site:</b> ${esc(existing.requested_service)}${existing.internal_notes ? '<br>' + esc(existing.internal_notes) : ''}</div>` : ''}
    <section class="qq-section"><h2><span class="step-n" id="n1">1</span> Cliente</h2><div id="qqClient"></div></section>
    <section class="qq-section" id="secVeh"><h2><span class="step-n" id="n2">2</span> Veículo</h2><div id="qqVehicle"></div></section>
    <section class="qq-section"><h2><span class="step-n" id="n3">3</span> Serviços</h2>
      <div class="opt-list" id="qqSize" style="margin-bottom:10px"><button type="button" class="opt" data-size="P">Carro pequeno</button><button type="button" class="opt" data-size="G">Carro grande / SUV</button></div>
      ${cats.map((c) => `<div class="small muted bold" style="margin:6px 0">${esc(c)}</div><div class="svc-grid">${services.filter((s) => (s.category || 'Outros') === c).map((s) => `<button type="button" class="svc-btn" data-add="${s.id}"><b>${esc(s.name)}</b><span data-pr="${s.id}"></span></button>`).join('')}</div>`).join('')}
      <div id="qqItems" style="margin-top:14px"></div>
      <button type="button" class="btn sm" id="qqFree">${icon('plus')} Item avulso</button>
      <div class="totals">
        <div class="tr"><span>Subtotal</span><b id="qqSub"></b></div>
        <div class="tr"><span>Desconto (R$)</span><input class="i" id="qqDisc" inputmode="decimal" value="${st.discount || ''}" placeholder="0,00"></div>
        <div class="tr"><span>Acréscimo (R$)</span><input class="i" id="qqSur" inputmode="decimal" value="${st.surcharge || ''}" placeholder="0,00"></div>
        <div class="grand"><span>TOTAL</span><span id="qqTot"></span></div>
      </div>
    </section>
    <section class="qq-section"><h2><span class="step-n">4</span> Fotos do veículo <span class="muted small" style="font-weight:500">(opcional)</span></h2>
      ${existing?.photos?.length ? `<p class="small muted">${existing.photos.length} foto(s) já salvas neste orçamento.</p>` : ''}
      ${photoPickerHtml('qp', { marketing: false })}
      <div class="photos" id="qqPh"></div>
    </section>
    <section class="qq-section"><h2><span class="step-n">5</span> Observações</h2>
      <label class="f"><span>Observações para o cliente</span><textarea class="i" id="qqNotes" rows="3" placeholder="Ex.: Prazo de execução 1 dia. Pagamento via Pix ou cartão.">${esc(st.notes)}</textarea></label>
      <div class="row"><label class="f"><span>Validade (dias)</span><input class="i" id="qqVal" inputmode="numeric" value="${st.validity_days}"></label><div></div></div>
      <label class="f"><span>Observação interna (não aparece para o cliente)</span><textarea class="i" id="qqInt" rows="2">${esc(st.internal_notes)}</textarea></label>
    </section>
    <div class="sticky-bar"><div class="tot"><small>TOTAL</small><span id="qqTot2"></span></div>
      <button class="btn" id="qqSave">Salvar</button><button class="btn gold" id="qqShare">${icon('share')} Salvar e compartilhar</button></div>`;

  const renderClient = () => {
    const box = $('#qqClient');
    $('#n1').classList.toggle('ok', !!st.client);
    $('#secVeh').classList.toggle('hidden', !st.client);
    if (st.client) {
      const c = st.client;
      box.innerHTML = `<div class="sel-card"><div class="main"><b>${esc(c.name)}</b><div class="small muted">${esc(c.whatsapp || 'sem WhatsApp')} · ${esc(c.origin_name || 'sem origem')}</div></div>${existing ? '' : '<button class="btn sm" id="qqChange">Trocar</button>'}</div>`;
      if (!existing) $('#qqChange').onclick = () => { st.client = null; st.vehicle_id = null; renderClient(); renderVehicle(); };
      return;
    }
    box.innerHTML = `<input class="i" id="qqS" placeholder="Buscar por nome, WhatsApp ou placa" autocomplete="off" enterkeyhint="search">
      <div class="list" id="qqR"></div>
      <button class="btn block" id="qqNew" style="margin-top:8px">${icon('userplus')} Novo cliente</button>
      <form id="qqNF" class="hidden" style="margin-top:10px">
        <label class="f"><span>Nome *</span><input class="i" name="name" required></label>
        <label class="f"><span>WhatsApp</span><input class="i" name="whatsapp" type="tel" inputmode="tel" placeholder="(11) 99999-9999"></label>
        <div class="row"><label class="f"><span>Origem</span><select class="i" name="origin_id">${opts(m.origins.filter((o) => o.active), m.origins.find((o) => o.name === 'Presencial')?.id, 'Selecione…')}</select></label>
        <label class="f"><span>Tipo</span><select class="i" name="client_type">${opts(m.clientTypes, 'Pessoa física')}</select></label></div>
        <div class="row"><label class="f"><span>Veículo (marca/modelo)</span><input class="i" name="v_model" placeholder="Ex.: Chevrolet Onix"></label>
        <label class="f auto" style="width:115px"><span>Placa</span><input class="i" name="v_plate" style="text-transform:uppercase"></label></div>
        <button class="btn primary block lg">Cadastrar e continuar</button>
      </form>`;
    let t;
    $('#qqS').oninput = (e) => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = e.target.value.trim();
        if (q.length < 2) { $('#qqR').innerHTML = ''; return; }
        const r = await api('/search?q=' + encodeURIComponent(q));
        $('#qqR').innerHTML = r.clients.map((c) => `<div class="item" data-pick="${c.id}"><div class="main"><div class="title">${esc(c.name)}</div><div class="sub">${esc(c.whatsapp || '')}${c.vehicles_txt ? ' · ' + esc(c.vehicles_txt) : ''}</div></div></div>`).join('') || '<div class="small muted" style="padding:8px 0">Nenhum cliente encontrado — cadastre abaixo.</div>';
        $$('[data-pick]').forEach((el) => { el.onclick = () => pickClient(el.dataset.pick); });
        const nf = $('#qqNF');
        if (!r.clients.length && nf) { nf.classList.remove('hidden'); if (/\d{8,}/.test(q.replace(/\D/g, ''))) nf.whatsapp.value = q; else nf.name.value = q; }
      }, 220);
    };
    $('#qqNew').onclick = () => { $('#qqNF').classList.toggle('hidden'); $('#qqNF').name.focus(); };
    $('#qqNF').onsubmit = async (e) => {
      e.preventDefault();
      const d = formData(e.target);
      if (d.v_model || d.v_plate) { const p = d.v_model.trim().split(/\s+/); d.vehicle = p.length > 1 ? { brand: p[0], model: p.slice(1).join(' '), plate: d.v_plate } : { model: d.v_model, plate: d.v_plate }; }
      try {
        const out = await post('/clients', d);
        await pickClient(out.id, out.vehicle_id); toast('Cliente cadastrado');
      } catch (err) {
        if (err.status === 409 && confirm(err.message + '\n\nUsar este cliente?')) pickClient(err.data.existing_id); else if (err.status !== 409) toast(err.message, true);
      }
    };
  };
  const pickClient = async (id, vehicleId) => {
    st.client = await api('/clients/' + id);
    st.vehicle_id = vehicleId || (st.client.vehicles.length === 1 ? st.client.vehicles[0].id : null);
    renderClient(); renderVehicle();
  };
  const renderVehicle = () => {
    const box = $('#qqVehicle');
    $('#n2').classList.toggle('ok', !!st.vehicle_id);
    if (!st.client) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="opt-list">${st.client.vehicles.map((x) => `<button type="button" class="opt ${x.id === st.vehicle_id ? 'active' : ''}" data-v="${x.id}">${icon('car', 'width="16" height="16" style="vertical-align:-3px"')} ${esc([x.brand, x.model].filter(Boolean).join(' ') || 'Veículo')}${x.plate ? ' · ' + esc(x.plate) : ''}</button>`).join('')}
      <button type="button" class="opt" id="qqNV">${icon('plus', 'width="16" height="16" style="vertical-align:-3px"')} Novo veículo</button></div>`;
    $$('[data-v]', box).forEach((b) => { b.onclick = () => { st.vehicle_id = st.vehicle_id === Number(b.dataset.v) ? null : Number(b.dataset.v); renderVehicle(); }; });
    $('#qqNV').onclick = () => vehicleForm(st.client.id, {}, async (out) => { st.client = await api('/clients/' + st.client.id); st.vehicle_id = out.id; renderVehicle(); });
  };
  const totals = () => {
    const sub = st.items.reduce((s, i) => s + num(i.price), 0);
    const tot = Math.max(0, sub - num(st.discount) + num(st.surcharge));
    $('#qqSub').textContent = brl(sub); $('#qqTot').textContent = brl(tot); $('#qqTot2').textContent = brl(tot);
    $('#n3').classList.toggle('ok', st.items.length > 0);
    $$('.svc-btn').forEach((b) => b.classList.toggle('added', st.items.some((i) => String(i.service_id) === b.dataset.add)));
  };
  const renderItems = () => {
    $('#qqItems').innerHTML = st.items.map((it, i) => `<div class="line">
      <input class="i" data-name="${i}" value="${esc(it.name)}" placeholder="Descrição">
      <input class="i right" data-price="${i}" inputmode="decimal" value="${it.price ? String(it.price).replace('.', ',') : ''}" placeholder="R$">
      <button type="button" class="rm" data-rm="${i}" aria-label="Remover">×</button></div>`).join('') || '<div class="small muted" style="margin-bottom:8px">Toque nos serviços acima para adicionar.</div>';
    $$('[data-name]').forEach((el) => { el.oninput = () => { st.items[el.dataset.name].name = el.value; }; });
    $$('[data-price]').forEach((el) => { el.oninput = () => { st.items[el.dataset.price].price = num(el.value); totals(); }; });
    $$('[data-rm]').forEach((el) => { el.onclick = () => { st.items.splice(el.dataset.rm, 1); renderItems(); }; });
    totals();
  };
  const renderPhotos = () => {
    $('#qqPh').innerHTML = st.photos.map((p, i) => `<div class="ph"><img src="${p.url}">${p.marketing === 'sim' ? '<span class="mk">MKT</span>' : ''}${p.show_client === '1' ? '<span class="cl">CLIENTE</span>' : ''}<span class="cap">${esc(p.category)}</span><button type="button" class="x" data-prm="${i}">×</button></div>`).join('');
    $$('[data-prm]').forEach((b) => { b.onclick = () => { URL.revokeObjectURL(st.photos[b.dataset.prm].url); st.photos.splice(b.dataset.prm, 1); renderPhotos(); }; });
  };

  // Preço e custo conforme o porte do veículo (P = pequeno, G = grande)
  const priceOf = (s) => (st.size === 'G' && s.price_large != null ? s.price_large : s.price);
  const costOf = (s) => (st.size === 'G' && s.cost_large != null ? s.cost_large : s.cost) || 0;
  const opOf = (s) => (st.size === 'G' && s.op_cost_large != null ? s.op_cost_large : s.op_cost) || 0;
  const renderSize = () => {
    $$('#qqSize [data-size]').forEach((b) => b.classList.toggle('active', b.dataset.size === st.size));
    services.forEach((s) => { const el = $(`[data-pr="${s.id}"]`); if (el) el.textContent = priceOf(s) ? brl(priceOf(s)) : 'preço a combinar'; });
  };
  $$('#qqSize [data-size]').forEach((b) => {
    b.onclick = () => {
      st.size = b.dataset.size;
      // reprecifica os itens da tabela que têm preço diferente por porte
      st.items.forEach((it) => { const s = services.find((x) => x.id === it.service_id); if (s && s.price_large != null) { it.price = priceOf(s); it.cost = costOf(s); it.op_cost = opOf(s); } });
      renderSize(); renderItems();
    };
  });
  $$('[data-add]').forEach((b) => {
    b.onclick = () => {
      const s = services.find((x) => x.id == b.dataset.add);
      st.items.push({ service_id: s.id, name: s.name, price: priceOf(s), cost: costOf(s), op_cost: opOf(s) });
      renderItems();
    };
  });
  $('#qqFree').onclick = () => { st.items.push({ service_id: null, name: '', price: 0 }); renderItems(); $$('[data-name]').pop().focus(); };
  $('#qqDisc').oninput = (e) => { st.discount = num(e.target.value); totals(); };
  $('#qqSur').oninput = (e) => { st.surcharge = num(e.target.value); totals(); };
  bindPhotoPicker(v, 'qp', (blobs, meta) => { blobs.forEach((b) => st.photos.push({ blob: b, url: URL.createObjectURL(b), category: meta.category, marketing: meta.marketing, show_client: meta.show_client })); renderPhotos(); });

  const save = async (share) => {
    if (!st.client) { toast('Selecione ou cadastre o cliente', true); window.scrollTo(0, 0); return; }
    st.items = st.items.filter((i) => String(i.name).trim());
    if (!st.items.length) { toast('Adicione pelo menos um serviço', true); renderItems(); return; }
    const body = {
      client_id: st.client.id, vehicle_id: st.vehicle_id, vehicle_size: st.size, items: st.items, discount: st.discount, surcharge: st.surcharge,
      notes: $('#qqNotes').value, internal_notes: $('#qqInt').value, validity_days: $('#qqVal').value,
    };
    $('#qqSave').disabled = $('#qqShare').disabled = true;
    try {
      const q = existing ? await put('/quotes/' + existing.id, body) : await post('/quotes', body);
      // agrupa fotos por categoria/autorização para enviar
      const groups = {};
      st.photos.forEach((p) => { const k = p.category + '|' + p.marketing + '|' + p.show_client; (groups[k] = groups[k] || []).push(p.blob); });
      for (const [k, blobs] of Object.entries(groups)) {
        const [category, marketing, show_client] = k.split('|');
        await uploadPhotos({ quote_id: q.id, client_id: q.client_id, vehicle_id: q.vehicle_id || '', category, marketing, show_client, phase: 'entrada' }, blobs);
      }
      st.photos.forEach((p) => URL.revokeObjectURL(p.url)); st.photos = [];
      toast(`Orçamento #${q.id} salvo`);
      location.hash = share ? `#/orcamento/${q.id}/enviar` : `#/orcamento/${q.id}`;
    } catch (e) { toast(e.message, true); $('#qqSave').disabled = $('#qqShare').disabled = false; }
  };
  $('#qqSave').onclick = () => save(false);
  $('#qqShare').onclick = () => save(true);
  renderSize(); renderClient(); renderVehicle(); renderItems(); renderPhotos();
}

// ---------- COMPARTILHAR / ENVIAR ----------
route(/^#\/orcamento\/(\d+)\/enviar$/, async (v, [id]) => {
  const q = await api('/quotes/' + id);
  const s = S.meta.settings;
  const link = publicLink(q);
  const veh = [q.brand, q.model, q.year].filter(Boolean).join(' ');
  const pics = q.photos.filter((p) => p.show_client);
  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] }));
  v.innerHTML = `<div class="page-head"><a class="btn ghost sm" href="#/orcamento/${q.id}">${icon('back')}</a><h1>Enviar orçamento #${q.id}</h1></div>
  ${q.link_active ? '' : `<div class="card small red"><b>O link deste orçamento está desativado.</b> O cliente não consegue abri-lo. <button class="btn sm" id="sEnable">Reativar link</button></div>`}
  <div class="card preview" style="padding:0">
    <div class="ph-head"><b>${esc(s.company_name).replace('GSM', 'G<i>S</i>M')}</b><div class="small" style="color:#bbb">${esc(s.company_tagline)}</div></div>
    <div style="padding:14px">
      <dl class="kv" style="margin-bottom:10px"><dt>Cliente</dt><dd>${esc(q.client_name)}</dd>${veh ? `<dt>Veículo</dt><dd>${esc(veh)}</dd>` : ''}</dl>
      <div class="small muted bold">SERVIÇOS</div>
      ${q.items.map((i) => `<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(i.name)}</span><b class="auto">${brl(i.price)}</b></div>`).join('')}
      ${q.discount ? `<div class="row small muted" style="padding-top:6px"><span>Desconto</span><span class="auto">− ${brl(q.discount)}</span></div>` : ''}
      ${q.surcharge ? `<div class="row small muted"><span>Acréscimo</span><span class="auto">+ ${brl(q.surcharge)}</span></div>` : ''}
      <div class="grand"><span>TOTAL</span><span>${brl(q.total)}</span></div>
      ${pics.length ? `<div class="small muted bold" style="margin-top:12px">FOTOS DO VEÍCULO (${pics.length})</div><div class="photos" style="margin-top:6px">${pics.map(photoThumb).join('')}</div>` : ''}
      ${q.notes ? `<p class="small" style="white-space:pre-wrap">${esc(q.notes)}</p>` : ''}
      <p class="small muted">Validade: ${q.validity_days} dias${s.company_whatsapp ? ' · Contato GSM: ' + esc(s.company_whatsapp) : ''}</p>
    </div>
  </div>
  ${q.whatsapp_digits ? '' : '<div class="card small amber"><b>Cliente sem WhatsApp cadastrado.</b> O WhatsApp abrirá para você escolher o contato.</div>'}
  <button class="btn wa block lg" id="sWa" style="font-size:17px">${icon('wa')} ENVIAR PELO WHATSAPP</button>
  ${pics.length && canShareFiles ? `<button class="btn block lg" id="sPics" style="margin-top:10px">${icon('camera')} Enviar as ${pics.length} foto(s) no WhatsApp</button>` : ''}
  <div class="grid g2" style="margin-top:10px">
    ${navigator.share ? `<button class="btn" id="sShare">${icon('share')} Compartilhar…</button>` : ''}
    <button class="btn" id="sCopyLink">${icon('link')} Copiar link</button>
    <button class="btn" id="sCopyMsg">${icon('copy')} Copiar mensagem</button>
    <a class="btn" href="${link}" target="_blank">${icon('file')} Ver como o cliente vê / PDF</a>
  </div>
  <details class="card" style="margin-top:12px"><summary>Editar mensagem</summary><textarea class="i" id="sMsg" rows="10" style="margin-top:8px">${esc(quoteMessage(q, link))}</textarea></details>
  <div class="card small" style="margin-top:12px"><b>🔒 Privacidade do link</b><br>
    <span class="muted">O link é secreto (código aleatório impossível de adivinhar), não aparece no Google e mostra só o primeiro nome do cliente, o veículo, os serviços, o valor e as fotos marcadas "mostrar ao cliente". Telefone, observações internas, custos e as demais fotos nunca aparecem.</span>
    <div class="actions" style="margin-top:8px"><button class="btn sm" id="sRenew">Gerar novo link</button>${q.link_active ? '<button class="btn sm danger" id="sDisable">Desativar link</button>' : ''}</div></div>
  <div class="actions" style="margin-top:4px"><button class="btn sm ghost" id="sMark">Já enviei por outro meio</button></div>`;
  bindPhotoThumbs(v, pics);
  const linkAct = async (action, msg) => { await run(() => post(`/quotes/${q.id}/link`, { action })); toast(msg); reload(); };
  $('#sRenew').onclick = () => { if (confirm('Gerar um novo link? O link enviado antes deixará de funcionar.')) linkAct('renew', 'Novo link gerado'); };
  if ($('#sDisable')) $('#sDisable').onclick = () => { if (confirm('Desativar o link? O cliente não conseguirá mais abrir este orçamento.')) linkAct('disable', 'Link desativado'); };
  if ($('#sEnable')) $('#sEnable').onclick = () => linkAct('enable', 'Link reativado');
  if ($('#sPics')) {
    $('#sPics').onclick = async () => {
      try {
        const files = await Promise.all(pics.map(async (p, i) => new File([await (await fetch('/api/photos/' + p.id + '/file')).blob()], `GSM-orcamento-${q.id}-${i + 1}.jpg`, { type: 'image/jpeg' })));
        await navigator.share({ files, text: `Fotos do seu ${veh || 'veículo'} — orçamento GSM #${q.id}` });
      } catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar as fotos', true); }
    };
  }
  const markSent = async (channel) => { await post(`/quotes/${q.id}/sent`, { channel }); toast('Orçamento em ENVIADOS · follow-up agendado'); refreshBadges(); };
  $('#sWa').onclick = () => { openWa(q.whatsapp_digits, $('#sMsg').value); markSent('WhatsApp').then(() => setTimeout(() => { location.hash = '#/orcamento/' + q.id; }, 600)); };
  const copy = async (t, msg) => { try { await navigator.clipboard.writeText(t); toast(msg); } catch { prompt('Copie:', t); } };
  $('#sCopyLink').onclick = () => copy(link, 'Link copiado');
  $('#sCopyMsg').onclick = () => copy($('#sMsg').value, 'Mensagem copiada');
  if ($('#sShare')) $('#sShare').onclick = async () => { try { await navigator.share({ title: `Orçamento GSM #${q.id}`, text: $('#sMsg').value }); markSent('compartilhamento'); } catch { /* cancelado */ } };
  $('#sMark').onclick = () => markSent('outro meio').then(() => { location.hash = '#/orcamento/' + q.id; });
});

// ---------- Modais de status ----------
function convertForm(q) {
  modal('Converter em serviço', `<form id="cvf">
    <div class="opt-list" style="margin-bottom:12px"><label class="opt active"><input type="radio" name="status" value="aprovado" checked hidden> Fechou — agendar</label><label class="opt"><input type="radio" name="status" value="executado" hidden> Já executado</label></div>
    <div id="cvA"><label class="f"><span>Agendado para (opcional)</span><input class="i" type="date" name="scheduled_for"></label>${dateChips('scheduled_for')}</div>
    <div id="cvE" class="hidden"><label class="f"><span>Data da execução</span><input class="i" type="date" name="executed_at" value="${todayStr()}"></label></div>
    <label class="f"><span>Responsável</span><select class="i" name="responsible">${opts(S.meta.users.map((u) => u.name), q.responsible || S.me.name, '—')}</select></label>
    <button class="btn gold block lg">Confirmar</button></form>`, (md) => {
    $$('input[name=status]', md.el).forEach((r) => { r.onchange = () => { $$('.opt', md.el).forEach((o) => o.classList.toggle('active', $('input', o).checked)); $('#cvA', md.el).classList.toggle('hidden', r.value !== 'aprovado' || !r.checked); $('#cvE', md.el).classList.toggle('hidden', r.value !== 'executado' || !r.checked); }; });
    $('#cvf', md.el).onsubmit = async (e) => {
      e.preventDefault(); const d = formData(e.target);
      if (d.status === 'aprovado') delete d.executed_at; else delete d.scheduled_for;
      await run(() => post(`/quotes/${q.id}/status`, d)); md.close(); toast(d.status === 'executado' ? 'Serviço executado registrado' : 'Orçamento fechado'); location.hash = '#/orcamento/' + q.id; reload();
    };
  });
}
function executeForm(q) {
  modal('Marcar como executado', `<form id="exf"><label class="f"><span>Data da execução</span><input class="i" type="date" name="executed_at" value="${todayStr()}"></label>
    <label class="f"><span>Responsável</span><select class="i" name="responsible">${opts(S.meta.users.map((u) => u.name), q.responsible || S.me.name, '—')}</select></label>
    <button class="btn gold block lg">Confirmar execução</button></form>`, (md) => {
    $('#exf', md.el).onsubmit = async (e) => { e.preventDefault(); await run(() => post(`/quotes/${q.id}/status`, { status: 'executado', ...formData(e.target) })); md.close(); toast('Serviço executado'); reload(); };
  });
}
function standbyForm(q) {
  modal('Mover para Stand-by', `<form id="sbf"><p class="small muted" style="margin-top:0">A oportunidade continua disponível para follow-up, renegociação e remarketing.</p>
    <div class="opt-list" style="margin-bottom:12px">${S.meta.standbyReasons.map((r) => `<label class="opt"><input type="radio" name="reason" value="${esc(r)}" hidden required> ${esc(r)}</label>`).join('')}</div>
    <label class="f"><span>Detalhe (opcional)</span><input class="i" name="note" placeholder="Ex.: volta a falar depois do dia 10"></label>
    <label class="f"><span>Retomar contato em</span><input class="i" type="date" name="followup_date" value="${addDays(todayStr(), 15)}"></label>${dateChips('followup_date')}
    <button class="btn primary block lg">Mover para Stand-by</button></form>`, (md) => {
    $$('input[name=reason]', md.el).forEach((r) => { r.onchange = () => $$('.opt', md.el).forEach((o) => o.classList.toggle('active', $('input', o).checked)); });
    $('#sbf', md.el).onsubmit = async (e) => { e.preventDefault(); await run(() => post(`/quotes/${q.id}/status`, { status: 'standby', ...formData(e.target) })); md.close(); toast('Movido para Stand-by'); reload(); };
  });
}
const waQuote = (q) => {
  openWa(q.whatsapp_digits, `Olá ${firstName(q.client_name)}, tudo bem? Aqui é da GSM. Passando para saber se conseguiu ver o orçamento${q.services ? ' de ' + q.services : ''}: ${publicLink(q)}`);
  post(`/clients/${q.client_id}/contacted`, { description: `WhatsApp aberto (orçamento #${q.id})` });
};

// ---------- DETALHE DO ORÇAMENTO ----------
route(/^#\/orcamento\/(\d+)$/, async (v, [id]) => {
  const q = await api('/quotes/' + id);
  const m = S.meta;
  const sold = ['aprovado', 'executado'].includes(q.status);
  const receber = Math.max(0, q.total - q.paid);
  const margem = q.total - q.costs_total;
  const veh = [q.brand, q.model, q.year, q.color].filter(Boolean).join(' ');
  const A = {
    wa: `<button class="btn wa" data-a="wa">${icon('wa')} WhatsApp</button>`,
    send: `<a class="btn gold" href="#/orcamento/${q.id}/enviar">${icon('share')} ${q.sent_at ? 'Reenviar' : 'Enviar / compartilhar'}</a>`,
    edit: `<a class="btn" href="#/orcamento/${q.id}/editar">${icon('edit')} Editar</a>`,
    fu: `<button class="btn" data-a="fu">${icon('clock')} Follow-up</button>`,
    conv: `<button class="btn primary" data-a="conv">${icon('check')} Converter em serviço</button>`,
    exec: `<button class="btn primary" data-a="exec">${icon('wrench')} Marcar executado</button>`,
    sb: `<button class="btn" data-a="sb">${icon('pause')} Stand-by</button>`,
    reopen: `<button class="btn" data-a="reopen">Reabrir (enviado)</button>`,
  };
  const actions = {
    criado: ['send', 'edit', 'conv', 'sb', 'wa', 'fu'], enviado: ['wa', 'send', 'fu', 'edit', 'conv', 'sb'],
    aprovado: ['exec', 'wa', 'edit', 'sb'], executado: ['wa', 'fu'], standby: ['wa', 'fu', 'reopen', 'conv', 'edit'],
  }[q.status] || [];
  v.innerHTML = `
  <div class="page-head"><a class="btn ghost sm" href="#/orcamentos">${icon('back')}</a><h1>Orçamento #${q.id}</h1>${statusTag(q.status)}${q.source !== 'manual' ? '<span class="tag site">SITE</span>' : ''}</div>
  <div class="card">
    <a href="#/cliente/${q.client_id}" style="text-decoration:none"><b style="font-size:17px">${esc(q.client_name)}</b> <span class="tag">${esc(q.origin_name || 'sem origem')}</span></a>
    <div class="small muted">${esc(q.whatsapp || 'sem WhatsApp')}${veh ? ' · ' + esc(veh) : ''}${q.plate ? ' · ' + esc(q.plate) : ''}</div>
    <div class="actions" style="margin-top:12px">${actions.map((a) => A[a]).join('')}</div>
    ${q.status === 'standby' ? `<p class="small" style="background:#f3e8ff;padding:10px;border-radius:10px;margin-bottom:0"><b>Stand-by:</b> ${esc(q.standby_reason)}${q.standby_note ? ' — ' + esc(q.standby_note) : ''} · desde ${fdate(q.standby_at)}</p>` : ''}
  </div>
  <div class="card">
    ${q.requested_service ? `<p class="small"><b>Pedido do site:</b> ${esc(q.requested_service)}</p>` : ''}
    ${q.items.map((i) => `<div class="row" style="padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(i.name)}</span><b class="auto">${brl(i.price)}</b></div>`).join('') || '<div class="muted small">Sem serviços — edite para montar o orçamento.</div>'}
    <div class="totals"><div class="tr"><span>Subtotal</span><span>${brl(q.subtotal)}</span></div>
    ${q.discount ? `<div class="tr"><span>Desconto</span><span>− ${brl(q.discount)}</span></div>` : ''}${q.surcharge ? `<div class="tr"><span>Acréscimo</span><span>+ ${brl(q.surcharge)}</span></div>` : ''}
    <div class="grand"><span>TOTAL</span><span>${brl(q.total)}</span></div></div>
    ${q.notes ? `<p class="small" style="white-space:pre-wrap"><b>Obs. cliente:</b> ${esc(q.notes)}</p>` : ''}
    ${q.internal_notes ? `<p class="small" style="white-space:pre-wrap;background:var(--soft);padding:8px;border-radius:8px"><b>Interno:</b> ${esc(q.internal_notes)}</p>` : ''}
    <dl class="kv small" style="margin-top:10px"><dt>Criado</dt><dd>${fdt(q.created_at)} ${q.created_by ? '· ' + esc(q.created_by) : ''}</dd>
      ${q.sent_at ? `<dt>Enviado</dt><dd>${fdt(q.sent_at)}</dd>` : ''}${q.approved_at ? `<dt>Fechado</dt><dd>${fdt(q.approved_at)}</dd>` : ''}
      ${q.scheduled_for ? `<dt>Agendado</dt><dd>${fdate(q.scheduled_for)}</dd>` : ''}${q.executed_at ? `<dt>Executado</dt><dd>${fdate(q.executed_at)}</dd>` : ''}
      ${q.responsible ? `<dt>Responsável</dt><dd>${esc(q.responsible)}</dd>` : ''}<dt>Validade</dt><dd>${q.validity_days} dias</dd></dl>
  </div>

  ${sold ? `<div class="card"><h2>Financeiro do serviço</h2>
    <div class="grid g2 md-g4" style="margin-bottom:12px">
      <div class="kpi"><small>Vendido</small><strong>${brl(q.total)}</strong></div>
      <div class="kpi"><small>Recebido</small><strong class="green">${brl(q.paid)}</strong></div>
      <div class="kpi ${receber > 0 ? 'alert' : ''}"><small>A receber</small><strong>${brl(receber)}</strong></div>
      <div class="kpi"><small>Margem</small><strong>${brl(margem)}</strong><em>${q.total ? pct(margem / q.total) : '—'} · custos ${brl(q.costs_total)}</em></div>
    </div>
    <h3>Pagamentos</h3>
    ${q.payments.map((p) => `<div class="row small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${fdate(p.paid_at)} · ${esc(p.method || '')}</span><b class="auto">${brl(p.amount)}</b><button class="btn sm ghost auto danger" data-dp="${p.id}">×</button></div>`).join('') || '<div class="small muted">Nenhum pagamento registrado</div>'}
    <form id="payF" class="row" style="flex-wrap:wrap;margin:10px 0 16px">
      <input class="i" name="amount" inputmode="decimal" placeholder="Valor" value="${receber ? String(receber.toFixed(2)).replace('.', ',') : ''}" style="flex:1 1 100px">
      <select class="i" name="method" style="flex:1 1 120px">${opts(m.paymentMethods, 'Pix')}</select>
      <input class="i" type="date" name="paid_at" value="${todayStr()}" style="flex:1 1 140px">
      <button class="btn green primary" style="flex:1 1 100%">Registrar pagamento</button></form>
    <h3>Custos diretos</h3>
    ${q.costs.map((c) => `<div class="row small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(c.category)}${c.description ? ' — ' + esc(c.description) : ''}</span><b class="auto">${brl(c.amount)}</b><button class="btn sm ghost auto danger" data-dc="${c.id}">×</button></div>`).join('') || '<div class="small muted">Nenhum custo lançado</div>'}
    <form id="costF" class="row" style="flex-wrap:wrap;margin-top:10px">
      <select class="i" name="category" style="flex:1 1 130px">${opts(m.costCategories, 'Material')}</select>
      <input class="i" name="description" placeholder="Descrição" style="flex:2 1 150px">
      <input class="i" name="amount" inputmode="decimal" placeholder="Valor" style="flex:1 1 90px">
      <button class="btn" style="flex:1 1 100%">Adicionar custo</button></form>
  </div>` : ''}

  <div class="card"><h2>Fotos (${q.photos.length})</h2>
    <div class="photos" style="margin-bottom:10px">${q.photos.map(photoThumb).join('')}</div>
    <details ${q.photos.length ? '' : 'open'}><summary>${icon('camera', 'width="16" height="16" style="vertical-align:-3px"')} Adicionar fotos</summary>${photoPickerHtml('dp', { phase: q.status === 'executado' ? 'depois' : sold ? 'antes' : 'entrada', show: !sold })}</details>
  </div>

  ${q.followups.length ? `<div class="card"><h2>Follow-ups</h2>${q.followups.map((f) => `<div class="small" style="padding:6px 0;border-bottom:1px solid var(--line)"><b class="${f.status === 'pendente' && f.due_date < todayStr() ? 'red' : ''}">${fdate(f.due_date)}</b> · ${esc(f.reason || '')} · <span class="muted">${f.status === 'pendente' ? 'pendente' : 'concluído' + (f.result ? ': ' + esc(f.result) : '')}</span></div>`).join('')}</div>` : ''}
  ${S.me.role === 'admin' ? '<div style="text-align:center"><button class="btn sm ghost danger" id="qDel">Excluir orçamento</button></div>' : ''}`;

  const act = {
    wa: () => waQuote(q), fu: () => followupForm({ client_id: q.client_id, quote_id: q.id, client_name: q.client_name, reason: 'Retorno do orçamento' }),
    conv: () => convertForm(q), exec: () => executeForm(q), sb: () => standbyForm(q),
    reopen: async () => { await run(() => post(`/quotes/${q.id}/status`, { status: 'enviado' })); reload(); },
  };
  $$('[data-a]', v).forEach((b) => { b.onclick = act[b.dataset.a]; });
  bindPhotoThumbs(v, q.photos);
  bindPhotoPicker(v, 'dp', async (blobs, meta) => { await run(() => uploadPhotos({ quote_id: q.id, ...meta }, blobs)); toast('Fotos salvas'); reload(); });
  if (sold) {
    $('#payF').onsubmit = async (e) => { e.preventDefault(); await run(() => post(`/quotes/${q.id}/payments`, formData(e.target))); toast('Pagamento registrado'); reload(); };
    $('#costF').onsubmit = async (e) => { e.preventDefault(); await run(() => post(`/quotes/${q.id}/costs`, formData(e.target))); toast('Custo adicionado'); reload(); };
    $$('[data-dp]', v).forEach((b) => { b.onclick = async () => { if (confirm('Remover pagamento?')) { await run(() => del('/payments/' + b.dataset.dp)); reload(); } }; });
    $$('[data-dc]', v).forEach((b) => { b.onclick = async () => { await run(() => del('/costs/' + b.dataset.dc)); reload(); }; });
  }
  const qd = $('#qDel'); if (qd) qd.onclick = async () => { if (confirm('Excluir definitivamente este orçamento?')) { await run(() => del('/quotes/' + q.id)); location.hash = '#/orcamentos'; } };
});

// ---------- LISTA DE ORÇAMENTOS ----------
route(/^#\/orcamentos$/, async (v, _, query) => {
  const m = S.meta;
  const tab = query.tab || 'todos';
  const all = await api('/quotes');
  const TABS = [['todos', 'Todos / Criados'], ['enviados', 'Enviados'], ['executados', 'Serviços executados'], ['standby', 'Stand-by']];
  const inTab = (q, t) => (t === 'todos' ? true : t === 'enviados' ? q.status === 'enviado' : t === 'executados' ? ['aprovado', 'executado'].includes(q.status) : q.status === 'standby');
  const f = { sub: query.sub || '', origin: '', reason: '', service: '', from: '', to: '', q: '' };
  v.innerHTML = `<div class="page-head"><h1>Orçamentos</h1><a class="btn gold" href="#/orcamento/novo">${icon('plus')} Orçamento rápido</a></div>
    <div class="chips" style="margin-bottom:10px">${TABS.map(([k, l]) => `<a class="chip ${k === tab ? 'active' : ''}" href="#/orcamentos?tab=${k}">${l}<span class="n">${all.filter((q) => inTab(q, k)).length}</span></a>`).join('')}</div>
    <div class="card" style="padding:10px">
      ${tab === 'todos' ? `<div class="chips" style="margin-bottom:8px">${[['', 'Todos'], ['criado', 'Criados (não enviados)'], ['site', 'Pedidos do site']].map(([k, l]) => `<button class="chip ${f.sub === k || (query.tab === 'criados' && k === 'criado') ? 'active' : ''}" data-sub="${k}">${l}</button>`).join('')}</div>` : ''}
      ${tab === 'executados' ? `<div class="chips" style="margin-bottom:8px">${[['', 'Todos'], ['aprovado', 'Fechados / agendados'], ['executado', 'Executados']].map(([k, l]) => `<button class="chip ${!k ? 'active' : ''}" data-sub="${k}">${l}</button>`).join('')}</div>` : ''}
      <input class="i" id="oq" placeholder="Buscar cliente, placa, modelo…" style="margin-bottom:8px">
      <div class="grid g2">
        <select class="i" id="oo">${opts(m.origins, '', 'Todas as origens')}</select>
        <select class="i" id="os">${opts(m.services, '', 'Todos os serviços')}</select>
        ${tab === 'standby' ? `<select class="i" id="or">${opts(m.standbyReasons, '', 'Todos os motivos')}</select>` : ''}
        <input class="i" type="date" id="of" title="De"><input class="i" type="date" id="ot" title="Até">
      </div>
    </div>
    <div class="small muted" id="osum" style="margin:0 4px 8px"></div>
    <div class="card tight list" id="ol"></div>`;
  if (query.tab === 'criados') f.sub = 'criado';
  const dateOf = (q) => (tab === 'enviados' ? q.sent_at : tab === 'executados' ? (q.executed_at || q.approved_at) : tab === 'standby' ? q.standby_at : q.created_at) || '';
  const render = () => {
    const svc = m.services.find((s) => s.id == f.service);
    const rows = all.filter((q) => inTab(q, tab === 'criados' ? 'todos' : tab)
      && (!f.sub || (f.sub === 'site' ? q.source !== 'manual' : q.status === f.sub))
      && (!f.origin || q.origin_id == f.origin) && (!f.reason || q.standby_reason === f.reason)
      && (!svc || (q.services || '').includes(svc.name))
      && (!f.from || dateOf(q).slice(0, 10) >= f.from) && (!f.to || dateOf(q).slice(0, 10) <= f.to)
      && (!f.q || `${q.client_name} ${q.plate || ''} ${q.model || ''} ${q.brand || ''}`.toLowerCase().includes(f.q.toLowerCase())));
    $('#osum').textContent = `${rows.length} orçamento(s) · ${brl(rows.reduce((s, q) => s + q.total, 0))}`;
    $('#ol').innerHTML = rows.map((q) => `<div class="item" data-q="${q.id}" style="flex-direction:column;gap:6px">
      <div class="row" style="width:100%;align-items:flex-start"><div class="main">
        <div class="title">${esc(q.client_name)} ${statusTag(q.status)} ${q.source !== 'manual' ? '<span class="tag site">SITE</span>' : ''}</div>
        <div class="sub">${esc(vehicleTxt(q) || 'sem veículo')} · ${esc(q.origin_name || 'sem origem')}</div>
        <div class="sub">${esc(q.services || q.requested_service || 'sem serviços')}</div>
        <div class="sub">#${q.id} · ${fdate(dateOf(q))}${q.status === 'standby' ? ' · <b>' + esc(q.standby_reason) + '</b>' : ''}${q.next_followup ? ` · follow-up <b class="${q.next_followup < todayStr() ? 'red' : ''}">${fdate(q.next_followup)}</b>` : ''}${q.status === 'executado' && q.total - q.paid > 0.009 ? ` · <b class="red">a receber ${brl(q.total - q.paid)}</b>` : ''}</div>
      </div><div class="val auto">${brl(q.total)}</div></div>
      ${['enviado', 'standby', 'criado'].includes(q.status) ? `<div class="actions" style="width:100%">
        <button class="btn sm wa" data-qa="wa">${icon('wa')}</button><button class="btn sm" data-qa="fu">Follow-up</button>
        <a class="btn sm" href="#/orcamento/${q.id}/editar">Editar</a><button class="btn sm" data-qa="conv">Fechou</button>
        ${q.status !== 'standby' ? '<button class="btn sm" data-qa="sb">Stand-by</button>' : ''}</div>` : ''}
    </div>`).join('') || '<div class="empty">Nenhum orçamento aqui.</div>';
    $$('[data-q]', v).forEach((el) => {
      const q = all.find((x) => x.id == el.dataset.q);
      el.onclick = (e) => {
        const b = e.target.closest('[data-qa]');
        if (e.target.closest('a')) return;
        if (!b) { location.hash = '#/orcamento/' + q.id; return; }
        ({ wa: () => waQuote(q), fu: () => followupForm({ client_id: q.client_id, quote_id: q.id, client_name: q.client_name, reason: q.status === 'standby' ? 'Recuperar stand-by' : 'Retorno do orçamento' }), conv: () => convertForm(q), sb: () => standbyForm(q) })[b.dataset.qa]();
      };
    });
  };
  $$('[data-sub]', v).forEach((b) => { b.onclick = () => { f.sub = b.dataset.sub; $$('[data-sub]', v).forEach((x) => x.classList.toggle('active', x === b)); render(); }; });
  $('#oq').oninput = (e) => { f.q = e.target.value; render(); };
  $('#oo').onchange = (e) => { f.origin = e.target.value; render(); };
  $('#os').onchange = (e) => { f.service = e.target.value; render(); };
  if ($('#or')) $('#or').onchange = (e) => { f.reason = e.target.value; render(); };
  $('#of').onchange = (e) => { f.from = e.target.value; render(); };
  $('#ot').onchange = (e) => { f.to = e.target.value; render(); };
  render();
});

// ---------- Galeria de fotos ----------
route(/^#\/fotos$/, async (v, _, query) => {
  const f = { marketing: query.marketing || '', phase: '', executed: query.executed ?? '1' };
  v.innerHTML = `<div class="page-head"><h1>Fotos</h1></div>
    <div class="card" style="padding:10px"><div class="grid g3">
      <select class="i" id="fm">${opts(Object.entries(MK), f.marketing, 'Marketing: todas')}</select>
      <select class="i" id="fp">${opts(S.meta.photoPhases, '', 'Todas as fases')}</select>
      <select class="i" id="fe">${opts([['1', 'Serviços executados'], ['', 'Todas']], f.executed)}</select>
    </div></div><div id="fg"></div>`;
  const load = async () => {
    const rows = await api('/photos?' + new URLSearchParams({ marketing: $('#fm').value, phase: $('#fp').value, executed: $('#fe').value }));
    $('#fg').innerHTML = rows.length ? `<div class="small muted" style="margin:0 4px 8px">${rows.length} foto(s) · fotos operacionais não são consideradas autorizadas para divulgação</div><div class="photos">${rows.map(photoThumb).join('')}</div>` : '<div class="card empty">Nenhuma foto</div>';
    bindPhotoThumbs(v, rows);
  };
  $('#fm').onchange = $('#fp').onchange = $('#fe').onchange = load;
  await load();
});
