/* Dashboard, Financeiro, Campanhas, Configurações */

function periodPicker(query) {
  const t = todayStr();
  const P = [
    ['mes', 'Este mês', t.slice(0, 8) + '01', t],
    ['30', '30 dias', addDays(t, -29), t],
    ['ano', 'Este ano', t.slice(0, 4) + '-01-01', t],
    ['tudo', 'Tudo', '2000-01-01', t],
  ];
  const cur = query.p || 'mes';
  const sel = P.find((p) => p[0] === cur) || P[0];
  const base = location.hash.split('?')[0];
  return {
    from: query.from || sel[2], to: query.to || sel[3],
    html: `<div class="chips" style="margin-bottom:12px">${P.map(([k, l]) => `<a class="chip ${k === cur && !query.from ? 'active' : ''}" href="${base}?p=${k}">${l}</a>`).join('')}</div>`,
  };
}

// ---------- DASHBOARD ----------
route(/^#\/$/, async (v, _, query) => {
  const per = periodPicker(query);
  const [d, j] = await Promise.all([api(`/dashboard?from=${per.from}&to=${per.to}`), api('/jarvis')]);
  const k = d.kpis; const fn = d.funnel;
  const maxF = Math.max(1, fn.leads, fn.orcamentos);
  const conv = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
  const svcList = (arr, key, fmt) => arr.length ? arr.map((s) => `<div class="row small" style="padding:5px 0;border-bottom:1px solid var(--line)"><span>${esc(s.name)}</span><b class="auto">${fmt(s[key])}</b></div>`).join('') : '<div class="small muted">Sem serviços executados no período</div>';
  v.innerHTML = `<div class="page-head"><h1>Olá, ${esc(firstName(S.me.name))}</h1><a class="btn" href="#/metas">${icon('flag')} Metas</a><a class="btn gold" href="#/orcamento/novo">${icon('plus')} Orçamento rápido</a></div>
    ${per.html}
    <div class="grid g2 md-g3 lg-g6" style="margin-bottom:12px">
      <a class="kpi dark" href="#/financeiro?p=${query.p || 'mes'}"><small>Faturamento</small><strong>${brl(k.faturamento)}</strong><em>serviços executados</em></a>
      <a class="kpi" href="#/financeiro?p=${query.p || 'mes'}"><small>Recebido</small><strong class="green">${brl(k.recebido)}</strong><em>no período</em></a>
      <a class="kpi ${k.a_receber > 0 ? 'alert' : ''}" href="#/financeiro"><small>A receber</small><strong>${brl(k.a_receber)}</strong><em>saldo em aberto</em></a>
      <a class="kpi" href="#/financeiro?p=${query.p || 'mes'}"><small>Margem</small><strong>${brl(k.margem)}</strong><em>${k.faturamento ? pct(k.margem_pct) + ' de contribuição' : '—'}</em></a>
      <a class="kpi" href="#/orcamentos"><small>Orçamentos</small><strong>${k.orcamentos}</strong><em>${brl0(k.orcamentos_valor)} orçados</em></a>
      <a class="kpi" href="#/clientes"><small>Clientes</small><strong>${k.clientes}</strong><em>+${k.clientes_novos} no período</em></a>
    </div>
    ${j.alerts.length ? `<div class="card"><h2>${icon('bell', 'width="18" height="18" style="vertical-align:-3px"')} Jarvis</h2>${jarvisList(j.alerts.slice(0, 4))}${j.alerts.length > 4 ? `<button class="btn sm" onclick="openJarvis()">Ver todos (${j.alerts.length})</button>` : ''}</div>` : ''}
    <div class="grid md-g2">
      <div class="card funnel"><h2>Funil do período</h2>
        <div class="step"><span>Leads</span><div class="bar"><div style="width:${(fn.leads / maxF) * 100}%">${fn.leads}</div></div><span class="small muted"></span></div>
        <div class="step"><span>Orçamentos</span><div class="bar"><div style="width:${(fn.orcamentos / maxF) * 100}%">${fn.orcamentos}</div></div><span class="small muted">${conv(fn.orcamentos, fn.leads)}</span></div>
        <div class="step"><span>Enviados</span><div class="bar"><div style="width:${(fn.enviados / maxF) * 100}%">${fn.enviados}</div></div><span class="small muted">${conv(fn.enviados, fn.orcamentos)}</span></div>
        <div class="step"><span>Executados</span><div class="bar gold"><div style="width:${(fn.executados / maxF) * 100}%">${fn.executados}</div></div><span class="small muted">${conv(fn.executados, fn.enviados)}</span></div>
        <div class="grid g2" style="margin-top:12px">
          <a class="kpi" href="#/orcamentos?tab=enviados"><small>Aguardando decisão</small><strong>${k.em_aberto}</strong><em>${brl0(k.em_aberto_valor)}</em></a>
          <a class="kpi" href="#/orcamentos?tab=standby"><small>Stand-by</small><strong>${k.standby}</strong><em>${brl0(k.standby_valor)} a recuperar</em></a>
        </div>
      </div>
      <div class="card"><h2>Follow-up</h2>
        <div class="grid g3">
          <a class="kpi ${d.followups.atrasados ? 'alert' : ''}" href="#/followups?tab=atrasados"><small>Atrasados</small><strong>${d.followups.atrasados}</strong></a>
          <a class="kpi" href="#/followups?tab=hoje"><small>Hoje</small><strong>${d.followups.hoje}</strong></a>
          <a class="kpi" href="#/followups?tab=proximos"><small>Próximos</small><strong>${d.followups.proximos}</strong></a>
        </div>
        <h2 style="margin-top:16px">Origem dos clientes</h2>
        ${d.origins.length ? `<div class="scroll-x"><table class="t"><tr><th>Origem</th><th class="n">Leads</th><th class="n">Vendas</th><th class="n">Faturamento</th></tr>
          ${d.origins.map((o) => `<tr><td><a href="#/clientes?origin_id=${o.id}">${esc(o.name)}</a></td><td class="n">${o.leads}</td><td class="n">${o.vendas}</td><td class="n">${brl0(o.faturamento)}</td></tr>`).join('')}</table></div>
          <div class="tiny muted" style="margin-top:6px">Leads = clientes cadastrados no período.</div>` : '<div class="small muted">Sem dados ainda</div>'}
      </div>
    </div>
    <div class="grid md-g3">
      <div class="card"><h2>Mais vendidos</h2>${svcList(d.services.mais_vendidos, 'qtd', (x) => x + 'x')}</div>
      <div class="card"><h2>Maior faturamento</h2>${svcList(d.services.maior_faturamento, 'faturamento', brl0)}</div>
      <div class="card"><h2>Maior margem</h2>${svcList(d.services.maior_margem, 'margem', brl0)}</div>
    </div>`;
});

// ---------- FINANCEIRO ----------
route(/^#\/financeiro$/, async (v, _, query) => {
  const per = periodPicker(query);
  const f = await api(`/finance?from=${per.from}&to=${per.to}`);
  const T = f.totals; const m = S.meta;
  const line = (l, val, cls = '', strong) => `<div class="row" style="padding:7px 0;border-bottom:1px solid var(--line)"><span class="${strong ? 'bold' : ''}">${l}</span><span class="auto ${cls} ${strong ? 'bold' : ''}">${val}</span></div>`;
  v.innerHTML = `<div class="page-head"><h1>Financeiro</h1></div>${per.html}
    <div class="grid md-g2">
      <div class="card"><h2>Resultado do período</h2>
        ${line('Faturamento (serviços executados)', brl(T.faturamento), '', true)}
        ${line('(−) Custos diretos', brl(T.custos), 'red')}
        ${line('= Margem de contribuição', `${brl(T.margem)} <span class="tiny muted">${T.faturamento ? pct(T.margem_pct) : ''}</span>`, '', true)}
        ${line('(−) Despesas operacionais', brl(T.despesas), 'red')}
        ${line('= Resultado operacional', brl(T.resultado), T.resultado < 0 ? 'red' : 'green', true)}
        <div class="grid g2" style="margin-top:12px">
          <div class="kpi"><small>Recebido no período</small><strong class="green">${brl(T.recebido)}</strong></div>
          <div class="kpi ${T.a_receber > 0 ? 'alert' : ''}"><small>A receber (total)</small><strong>${brl(T.a_receber)}</strong></div>
        </div>
        <p class="tiny muted">Margem de contribuição não é lucro líquido: não considera impostos, pró-labore nem despesas fora do sistema.</p>
      </div>
      ${(() => {
        const st = S.meta.settings; const base = Math.max(0, T.margem);
        const tb = Math.max(0, T.split?.tapecaria || 0); const eb = Math.max(0, T.split?.estetica || 0); const ebb = Math.max(0, T.split?.estetica_barbosa || 0);
        const p1 = Number(st.split_socio1) || 0; const p2 = Number(st.split_socio2) || 0; const pc = Number(st.split_caixa) || 0;
        const meta = Number(st.prolabore_meta) || 0; const caixaLiq = base * pc / 100 - (T.custo_operacional || 0) - T.despesas;
        const share = (nome, v, withMeta) => line(esc(nome), `${brl(v)}${withMeta && meta ? ` <span class="tiny ${v >= meta ? 'green' : 'red'}">meta ${brl0(meta)}</span>` : ''}`);
        return `<div class="card"><h2>Divisão da margem ${p1}/${p2}/${pc}</h2>
          <p class="tiny muted" style="margin-top:0">Base = faturamento − material (e taxa de cartão). Tapeçaria: ${brl0(tb)} · Estética: ${brl0(eb + ebb)}${ebb ? ` (${brl0(ebb)} com ajuda do ${esc(st.split_socio2_nome)})` : ''}.</p>
          ${share(`${st.split_socio1_nome} (${p1}% de tudo)`, base * p1 / 100, true)}
          ${share(`${st.split_socio2_nome} (${p2}% da tapeçaria${ebb ? ' + estética em que ajudou' : ''})`, (tb + ebb) * p2 / 100, true)}
          ${share(`${st.split_estetica_nome || 'Parceiro da estética'} (${p2}% da estética)`, eb * p2 / 100, false)}
          ${line(`Caixa da empresa (${pc}%)`, brl(base * pc / 100))}
          ${line('(−) Custo operacional dos serviços (panos, desgaste)', brl(T.custo_operacional || 0), 'red')}
          ${line('(−) Despesas fixas lançadas (luz, internet…)', brl(T.despesas), 'red')}
          ${line('= Caixa líquido', brl(caixaLiq), caixaLiq < 0 ? 'red' : 'green', true)}</div>`;
      })()}
      <div class="card"><h2>Custos diretos por categoria</h2>
        ${f.costsByCat.map((c) => line(esc(c.category), brl(c.total))).join('') || '<div class="small muted">Nenhum custo lançado nos serviços do período</div>'}
        <h2 style="margin-top:16px">Despesas por categoria</h2>
        ${f.expensesByCat.map((c) => line(esc(c.category), brl(c.total))).join('') || '<div class="small muted">Nenhuma despesa no período</div>'}
      </div>
    </div>
    <div class="card"><h2>Lançar despesa operacional</h2>
      <form id="exF" class="row" style="flex-wrap:wrap">
        <select class="i" name="category" style="flex:1 1 140px">${opts(m.expenseCategories, 'Aluguel')}</select>
        <input class="i" name="description" placeholder="Descrição" style="flex:2 1 160px">
        <input class="i" name="amount" inputmode="decimal" placeholder="Valor" style="flex:1 1 100px" required>
        <input class="i" type="date" name="date" value="${todayStr()}" style="flex:1 1 140px">
        <button class="btn gold" style="flex:1 1 100%">Adicionar despesa</button>
      </form>
      ${f.expenses.length ? `<div class="scroll-x" style="margin-top:12px"><table class="t"><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="n">Valor</th><th></th></tr>
        ${f.expenses.map((e) => `<tr><td>${fdate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.description || '')}</td><td class="n">${brl(e.amount)}</td><td class="n"><button class="btn sm ghost danger" data-de="${e.id}">×</button></td></tr>`).join('')}</table></div>` : ''}
    </div>
    <div class="card tight"><h2 style="padding:14px 14px 0">Serviços executados no período (${f.executed.length})</h2>
      <div class="scroll-x"><table class="t" style="min-width:640px"><tr><th style="padding-left:14px">Data</th><th>Cliente</th><th>Serviço</th><th class="n">Vendido</th><th class="n">Recebido</th><th class="n">A receber</th><th class="n">Custos</th><th class="n" style="padding-right:14px">Margem</th></tr>
      ${f.executed.map((q) => `<tr style="cursor:pointer" onclick="location.hash='#/orcamento/${q.id}'"><td style="padding-left:14px">${fdate(q.executed_at)}</td><td>${esc(q.client_name)}</td><td>${esc(q.services || '')}</td><td class="n">${brl(q.total)}</td><td class="n">${brl(q.paid)}</td><td class="n ${q.total - q.paid > 0.009 ? 'red' : ''}">${brl(Math.max(0, q.total - q.paid))}</td><td class="n">${brl(q.costs_total)}</td><td class="n" style="padding-right:14px">${brl(q.total - q.costs_total)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Nenhum serviço executado no período</td></tr>'}</table></div>
    </div>`;
  $('#exF').onsubmit = async (e) => { e.preventDefault(); await run(() => post('/expenses', formData(e.target))); toast('Despesa lançada'); reload(); };
  $$('[data-de]', v).forEach((b) => { b.onclick = async () => { if (confirm('Excluir despesa?')) { await run(() => del('/expenses/' + b.dataset.de)); reload(); } }; });
});

// ---------- CAMPANHAS ----------
route(/^#\/campanhas$/, async (v) => {
  const [list, ads] = await Promise.all([api('/campaigns'), api('/campaigns/ads')]);
  const metric = (l, n, goal) => `<div class="kpi"><small>${l}</small><strong>${n}</strong>${goal ? `<em>${Math.round((n / goal) * 100)}% da meta</em>` : ''}</div>`;
  v.innerHTML = `<div class="page-head"><h1>Campanhas</h1><button class="btn gold" id="ncp">${icon('plus')} Campanha</button></div>
    ${list.map((c) => `<div class="card">
      <div class="row" style="align-items:flex-start"><div><h2 style="margin-bottom:2px">${esc(c.name)} ${c.active ? '' : '<span class="tag">encerrada</span>'}</h2>
        <div class="small muted">${esc([c.sources && 'Fontes: ' + c.sources, c.channels && 'Canais: ' + c.channels].filter(Boolean).join(' · '))}</div>
        ${c.offer ? `<div class="small">Oferta: <b>${esc(c.offer)}</b></div>` : ''}</div>
        <button class="btn sm auto" data-ec="${c.id}">${icon('edit')}</button></div>
      <div style="margin:12px 0 6px" class="small"><b>${c.selecionados}</b> de <b>${c.goal}</b> contatos selecionados</div>
      <div class="progress"><div style="width:${Math.min(100, (c.selecionados / (c.goal || 1)) * 100)}%"></div></div>
      <div class="grid g3 md-g4" style="margin-top:12px">
        ${metric('Selecionados', c.selecionados)}${metric('Abordados', c.abordados, c.selecionados)}${metric('Respostas', c.respostas, c.abordados)}
        ${metric('Interessados', c.interessados, c.respostas)}${metric('Orçamentos', c.orcamentos)}${metric('Vendas', c.vendas)}
        <div class="kpi dark"><small>Faturamento</small><strong>${brl0(c.faturamento)}</strong></div><div class="kpi"><small>Recebido</small><strong class="green">${brl0(c.recebido)}</strong></div>
      </div>
      <div class="actions" style="margin-top:12px"><a class="btn sm" href="#/clientes?import=1&campaign_id=${c.id}">Importar contatos</a><a class="btn sm" href="#/crm?campaign_id=${c.id}">Ver no CRM</a><a class="btn sm" href="#/clientes?campaign_id=${c.id}">Lista de clientes</a></div>
      <p class="tiny muted" style="margin-bottom:0">Abordados/respostas/interessados contam pela etapa máxima atingida no CRM. Mova os cards no CRM conforme a conversa avança.</p>
    </div>`).join('')}
    <div class="card"><h2>Tráfego pago — atribuição</h2>
      <p class="small muted" style="margin-top:0">Leads com UTM / IDs de anúncio ou origem "Meta Ads", agrupados por campanha (utm_campaign).</p>
      ${ads.length ? `<div class="scroll-x"><table class="t"><tr><th>Campanha</th><th class="n">Leads</th><th class="n">Orç.</th><th class="n">Vendas</th><th class="n">Faturamento</th><th class="n">Margem</th></tr>
      ${ads.map((a) => `<tr><td>${esc(a.label)}</td><td class="n">${a.leads}</td><td class="n">${a.orcamentos}</td><td class="n">${a.vendas}</td><td class="n">${brl0(a.faturamento)}</td><td class="n">${brl0(a.margem)}</td></tr>`).join('')}</table></div>` : '<div class="small muted">Nenhum lead de tráfego pago ainda. Ao cadastrar um cliente vindo de anúncio, escolha a origem "Meta Ads" e preencha utm_campaign (ex.: higienizacao-out26).</div>'}
    </div>`;
  $('#ncp').onclick = () => campaignForm();
  $$('[data-ec]', v).forEach((b) => { b.onclick = () => campaignForm(list.find((c) => c.id == b.dataset.ec)); });
});
function campaignForm(c = { active: 1 }) {
  modal(c.id ? 'Editar campanha' : 'Nova campanha', `<form id="cpf">
    <label class="f"><span>Nome *</span><input class="i" name="name" value="${esc(c.name)}" required></label>
    <div class="row"><label class="f"><span>Meta (contatos)</span><input class="i" name="goal" inputmode="numeric" value="${c.goal || ''}"></label>
    <label class="f"><span>Início</span><input class="i" type="date" name="start_date" value="${c.start_date || todayStr()}"></label></div>
    <label class="f"><span>Fontes</span><input class="i" name="sources" value="${esc(c.sources)}" placeholder="Lista Gustavo, Lista Barbosa"></label>
    <label class="f"><span>Canais</span><input class="i" name="channels" value="${esc(c.channels)}" placeholder="WhatsApp, Presencial"></label>
    <label class="f"><span>Oferta</span><input class="i" name="offer" value="${esc(c.offer)}"></label>
    <label class="f"><span>Notas</span><textarea class="i" name="notes" rows="2">${esc(c.notes)}</textarea></label>
    <label class="f row"><input type="checkbox" name="active" class="auto" style="width:22px;height:22px" ${c.active ? 'checked' : ''}><span style="margin:0">Ativa</span></label>
    <button class="btn gold block lg">Salvar</button></form>`, (md) => {
    $('#cpf', md.el).onsubmit = async (e) => {
      e.preventDefault(); const d = formData(e.target); d.active = !!d.active;
      await run(() => (c.id ? put('/campaigns/' + c.id, d) : post('/campaigns', d))); md.close(); toast('Campanha salva'); await loadMeta(); reload();
    };
  });
}

// ---------- CONFIGURAÇÕES ----------
route(/^#\/config$/, async (v) => {
  await loadMeta();
  const m = S.meta; const s = m.settings; const admin = S.me.role === 'admin';
  const users = await api('/users');
  v.innerHTML = `<div class="page-head"><h1>Configurações</h1></div>
    <div class="card"><h2>Dados da GSM (aparecem no orçamento)</h2><form id="stF">
      <div class="row"><label class="f"><span>Nome</span><input class="i" name="company_name" value="${esc(s.company_name)}"></label>
      <label class="f"><span>Slogan</span><input class="i" name="company_tagline" value="${esc(s.company_tagline)}"></label></div>
      <div class="row"><label class="f"><span>WhatsApp GSM</span><input class="i" name="company_whatsapp" type="tel" value="${esc(s.company_whatsapp)}" placeholder="(11) 99999-9999"></label>
      <label class="f"><span>Instagram</span><input class="i" name="company_instagram" value="${esc(s.company_instagram)}" placeholder="@gsm"></label></div>
      <label class="f"><span>Endereço</span><input class="i" name="company_address" value="${esc(s.company_address)}"></label>
      <div class="row"><label class="f"><span>Validade padrão (dias)</span><input class="i" name="quote_validity_days" inputmode="numeric" value="${esc(s.quote_validity_days)}"></label>
      <label class="f"><span>Follow-up após envio (dias)</span><input class="i" name="followup_after_send_days" inputmode="numeric" value="${esc(s.followup_after_send_days)}"></label></div>
      <div class="row"><label class="f"><span>Sócio 1</span><input class="i" name="split_socio1_nome" value="${esc(s.split_socio1_nome)}"></label><label class="f"><span>% sócio 1</span><input class="i" name="split_socio1" inputmode="numeric" value="${esc(s.split_socio1)}"></label></div>
      <div class="row"><label class="f"><span>Sócio 2</span><input class="i" name="split_socio2_nome" value="${esc(s.split_socio2_nome)}"></label><label class="f"><span>% sócio 2</span><input class="i" name="split_socio2" inputmode="numeric" value="${esc(s.split_socio2)}"></label></div>
      <div class="row"><label class="f"><span>Meta desafio do mês (R$)</span><input class="i" name="meta_desafio_mes" inputmode="numeric" value="${esc(s.meta_desafio_mes)}"></label><label class="f"><span>Taxa de fechamento esperada (%)</span><input class="i" name="taxa_fechamento_meta" inputmode="numeric" value="${esc(s.taxa_fechamento_meta)}"></label></div>
      <div class="row"><label class="f"><span>Custos fixos do mês (luz, internet, comunicação visual…)</span><input class="i" name="custos_fixos_mes" inputmode="numeric" value="${esc(s.custos_fixos_mes)}"></label><label class="f"><span>Meta de faturamento do mês</span><input class="i" name="meta_faturamento_mes" inputmode="numeric" value="${esc(s.meta_faturamento_mes)}"></label></div>
      <label class="f"><span>Na estética (sem o ${esc(s.split_socio2_nome)}), os ${esc(s.split_socio2)}% vão para</span><input class="i" name="split_estetica_nome" value="${esc(s.split_estetica_nome)}"></label>
      <div class="row"><label class="f"><span>Taxa maquininha débito (%)</span><input class="i" name="taxa_debito" inputmode="decimal" value="${esc(s.taxa_debito)}" placeholder="ex.: 1,99"></label><label class="f"><span>Taxa maquininha crédito (%)</span><input class="i" name="taxa_credito" inputmode="decimal" value="${esc(s.taxa_credito)}" placeholder="ex.: 4,99"></label></div>
      <div class="row"><label class="f"><span>% caixa da empresa</span><input class="i" name="split_caixa" inputmode="numeric" value="${esc(s.split_caixa)}"></label><label class="f"><span>Meta de pró-labore (R$/mês)</span><input class="i" name="prolabore_meta" inputmode="numeric" value="${esc(s.prolabore_meta)}"></label></div>
      <label class="f"><span>Mensagem do WhatsApp — variáveis: {nome} {veiculo} {itens} {total} {link} {validade}</span><textarea class="i" name="quote_message" rows="7">${esc(s.quote_message)}</textarea></label>
      <button class="btn gold" ${admin ? '' : 'disabled'}>Salvar</button></form></div>

    <div class="card"><h2>Origens de lead</h2>
      <div class="opt-list" style="margin-bottom:10px">${m.origins.map((o) => `<button class="opt ${o.active ? 'active' : ''}" data-or="${o.id}" data-act="${o.active}" title="Toque para ativar/desativar">${esc(o.name)}</button>`).join('')}</div>
      <form id="orF" class="row"><input class="i" name="name" placeholder="Nova origem (ex.: Feira de carros)"><button class="btn auto">Adicionar</button></form>
      <p class="tiny muted">Origem = de onde o cliente veio. Tipo de cliente (PF, empresa, frota…) é outro campo.</p></div>

    <div class="card"><h2>Usuários</h2>
      ${users.map((u) => `<div class="row small" style="padding:6px 0;border-bottom:1px solid var(--line)"><span><b>${esc(u.name)}</b> · ${esc(u.email)}</span><span class="tag auto">${esc(u.role)}</span></div>`).join('')}
      ${admin ? `<details style="margin-top:8px"><summary>Adicionar usuário</summary><form id="usF" style="margin-top:8px">
        <div class="row"><label class="f"><span>Nome</span><input class="i" name="name" required></label><label class="f"><span>Perfil</span><select class="i" name="role">${opts(m.roles, 'comercial')}</select></label></div>
        <div class="row"><label class="f"><span>E-mail</span><input class="i" type="email" name="email" required></label><label class="f"><span>Senha inicial (mín. 8)</span><input class="i" type="password" name="password" minlength="8" required autocomplete="new-password"></label></div>
        <button class="btn">Criar usuário</button></form></details>` : ''}
      <p class="tiny muted">Perfis preparados: administrador, comercial, operacional, financeiro (restrições detalhadas virão numa próxima fase).</p></div>

    <div class="card"><h2>Minha senha</h2><form id="pwF" class="grid md-g3">
      <input class="i" type="password" name="current" placeholder="Senha atual" required autocomplete="current-password">
      <input class="i" type="password" name="password" placeholder="Nova senha (mín. 8)" minlength="8" required autocomplete="new-password">
      <button class="btn">Alterar senha</button></form></div>

    <div class="card"><h2>Site GSM</h2><p class="small muted" style="margin-top:0">O site usa os serviços ativos, o WhatsApp e o Instagram desta tela. Fotos com "Autorizado p/ marketing = Sim" aparecem em Resultados (antes/depois). Pedidos do site chegam em Orçamentos › Criados.</p><a class="btn" href="/" target="_blank">Abrir o site</a></div>
    <div class="card"><h2>Backup e integrações</h2>
      ${admin ? `<a class="btn" href="/api/backup">Baixar backup do banco</a>` : ''}
      <p class="small" style="margin-bottom:4px"><b>Entrada de leads do futuro site / landing pages</b></p>
      <code class="small" style="display:block;background:var(--soft);padding:10px;border-radius:10px;white-space:pre-wrap;word-break:break-all">POST ${location.origin}/api/public/lead
{ "name": "...", "whatsapp": "...", "service": "Higienização", "vehicle": "Onix",
  "message": "...", "utm_source": "facebook", "utm_medium": "paid", "utm_campaign": "...",
  "utm_content": "...", "ad_id": "...", "adset_id": "...", "campaign_id": "..." }</code>
      <p class="tiny muted">O lead cai em Clientes + Orçamentos › Criados (marcado como SITE) e gera alerta no Jarvis.</p></div>`;

  $('#stF').onsubmit = async (e) => { e.preventDefault(); await run(() => put('/settings', formData(e.target))); await loadMeta(); toast('Configurações salvas'); };
  $$('[data-or]', v).forEach((b) => { b.onclick = async () => { await run(() => put('/origins/' + b.dataset.or, { active: b.dataset.act !== '1' })); reload(); }; });
  $('#orF').onsubmit = async (e) => { e.preventDefault(); await run(() => post('/origins', formData(e.target))); toast('Origem criada'); reload(); };
  const us = $('#usF'); if (us) us.onsubmit = async (e) => { e.preventDefault(); await run(() => post('/users', formData(e.target))); toast('Usuário criado'); reload(); };
  $('#pwF').onsubmit = async (e) => { e.preventDefault(); await run(() => put('/me/password', formData(e.target))); e.target.reset(); toast('Senha alterada'); };
});

// ---------- METAS: meta x realizado, por tipo de veículo, serviço e origem ----------
route(/^#\/metas$/, async (v, _, query) => {
  const t = todayStr();
  const mes = query.mes || t.slice(0, 7);
  const from = mes + '-01';
  const end = (() => { const d = new Date(from + 'T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); })();
  const g = await api(`/goals?from=${from}&to=${end}`);
  const taxa = g.metas.taxa_fechamento || 0.2;
  const passados = Math.max(1, g.dias.total - g.dias.restantes);
  const ritmo = g.realizado / passados;
  const bar = (meta, label) => {
    if (!meta) return '';
    const real = Math.min(100, (g.realizado / meta) * 100); const fech = Math.min(100 - real, (g.fechado_a_executar / meta) * 100);
    const falta = Math.max(0, meta - g.realizado - g.fechado_a_executar);
    const vendas = g.ticket ? Math.ceil(falta / g.ticket) : null;
    return `<div style="margin-bottom:16px">
      <div class="row" style="margin-bottom:6px"><b>${label}: ${brl0(meta)}</b><span class="auto bold">${pct(g.realizado / meta)}</span></div>
      <div class="progress" style="height:16px;display:flex"><div style="width:${real}%;background:var(--dark)"></div><div style="width:${fech}%;background:var(--gold)"></div></div>
      <div class="small muted" style="margin-top:6px">Realizado ${brl0(g.realizado)} · fechado a executar ${brl0(g.fechado_a_executar)}</div>
      ${falta > 0 ? `<div class="small" style="margin-top:4px">Faltam <b>${brl0(falta)}</b>${g.dias.restantes ? ` em ${g.dias.restantes} dias úteis = <b>${brl0(falta / g.dias.restantes)}/dia</b>` : ''}${vendas ? ` · ~<b>${vendas} vendas</b> → ~<b>${Math.ceil(vendas / taxa)} orçamentos</b> (a ${pct(taxa)} de fechamento)` : ''}</div>` : '<div class="small green bold" style="margin-top:4px">Meta atingida! 🎉</div>'}
    </div>`;
  };
  const table = (rows, first, withLeads, withShare) => {
    const totFat = rows.reduce((s, r) => s + r.faturamento, 0);
    if (!rows.length) return '<div class="small muted">Sem dados neste mês.</div>';
    return `<div class="scroll-x"><table class="t" style="min-width:${withLeads ? 620 : 520}px"><tr><th>${first}</th>${withLeads ? '<th class="n">Leads</th>' : ''}<th class="n">Orçam.</th><th class="n">Orçado</th><th class="n">Vendas</th><th class="n">Faturamento</th><th class="n">Sobra</th><th class="n">% fat.</th>${withShare ? '<th class="n">Meta</th>' : ''}</tr>
      ${rows.map((r) => `<tr><td>${esc(r.nome)}</td>${withLeads ? `<td class="n">${r.leads || 0}</td>` : ''}<td class="n">${r.orcamentos}</td><td class="n">${brl0(r.orcado)}</td><td class="n">${r.vendas}</td><td class="n bold">${brl0(r.faturamento)}</td><td class="n">${brl0(r.sobra)}</td><td class="n">${totFat ? pct(r.faturamento / totFat) : '—'}</td>${withShare ? `<td class="n muted">20%</td>` : ''}</tr>`).join('')}
    </table></div>`;
  };
  v.innerHTML = `<div class="page-head"><h1>Metas</h1><input class="i auto" type="month" id="mMes" value="${mes}" style="max-width:170px"></div>
    <div class="card">${bar(g.metas.base, 'Meta')}${bar(g.metas.desafio, 'Desafio')}
      <div class="grid g2 md-g4">
        <div class="kpi"><small>Ritmo atual</small><strong>${brl0(ritmo)}</strong><em>por dia útil (${passados} de ${g.dias.total})</em></div>
        <div class="kpi"><small>Ticket médio</small><strong>${g.ticket ? brl0(g.ticket) : '—'}</strong><em>${g.vendas} venda(s) no mês</em></div>
        <div class="kpi ${g.taxa_real != null && g.taxa_real < taxa ? 'alert' : ''}"><small>Fechamento</small><strong>${g.taxa_real == null ? '—' : pct(g.taxa_real)}</strong><em>meta ${pct(taxa)} · ${g.orcamentos} orçamentos</em></div>
        <a class="kpi" href="#/orcamentos?tab=enviados"><small>Aguardando resposta</small><strong>${g.enviados}</strong><em>${brl0(g.enviados_valor)} · ~${brl0(g.enviados_valor * taxa)} esperado</em></a>
      </div>
      <p class="tiny muted" style="margin-bottom:0">Metas e taxa de fechamento em Configurações. Dias úteis: segunda a sábado, sem feriados.</p></div>
    <div class="card"><h2>Por tipo de veículo</h2>${table(g.porTipo, 'Veículo')}</div>
    <div class="card"><h2>Por serviço</h2>${table(g.porServico, 'Serviço')}</div>
    <div class="card"><h2>Por origem do cliente</h2>${table(g.porOrigem, 'Origem', true, true)}
      <p class="tiny muted" style="margin-bottom:0">Meta inicial de 20% para cada origem (estimativa). Os números reais vão substituindo a estimativa.</p></div>`;
  $('#mMes').onchange = (e) => { location.hash = '#/metas?mes=' + e.target.value; };
});
