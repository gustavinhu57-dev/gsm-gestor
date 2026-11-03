/* Avisos do funil: botão flutuante que mostra, por coluna, quem precisa receber mensagem agora.
   Fica escondido na tela do funil (#/crm). Atualiza a cada 5 minutos e, se permitido, avisa pelo navegador. */

// Mensagens de retomada por coluna (a etapa "A contatar" usa a apresentação do segmento, pitchText)
const FOLLOW_MSG = {
  abordado: (n) => `Olá${n}, tudo bem? Passando para saber se conseguiu ver a apresentação do Studio GSM que enviei. Se fizer sentido, fazemos uma avaliação dos veículos sem compromisso: é só me enviar o modelo e uma foto que eu preparo o orçamento.`,
  respondeu: (n) => `Olá${n}, tudo bem? Dando continuidade à nossa conversa: consegue me enviar o modelo e uma foto do veículo para eu preparar o orçamento?`,
  interessado: (n) => `Olá${n}, tudo bem? Para eu montar o seu orçamento, me envia o modelo do veículo e uma foto? Assim já te passo valores e prazo.`,
  orcamento: (n) => `Olá${n}, tudo bem? Conseguiu avaliar o orçamento que enviei? Se quiser, ajusto alguma coisa ou já deixamos a data reservada na agenda.`,
  followup: (n) => `Olá${n}, tudo bem? Passando para retomar o orçamento do Studio GSM. Ficou alguma dúvida que eu possa esclarecer?`,
  fechado: (n) => `Olá${n}! Vamos agendar o serviço? Qual dia fica melhor para você esta semana? Lembrando que buscamos e entregamos o veículo.`,
  standby: (n) => `Olá${n}, tudo bem? Faz um tempo que conversamos sobre o serviço no seu veículo. Estamos com agenda aberta esta semana: quer que eu atualize o orçamento?`,
  executado: (n) => `Olá${n}, tudo bem? Passando para saber como ficou o seu veículo depois do serviço. Sua opinião é muito importante para nós! Se puder, marque o @studiogsm_ no Instagram 😉`,
};
FOLLOW_MSG.pago = FOLLOW_MSG.executado;
function avisoMsg(c) {
  if (c.group === 'lead') {
    return `Olá ${firstName(c.contact_person || c.name)}, tudo bem? Aqui é o ${firstName(S.me.name) || 'Gustavo'}, do Studio GSM — Estética & Tapeçaria Automotiva. Recebi o seu contato!

Me conta: qual é o modelo do seu veículo e qual serviço você procura? Se puder, mande uma foto que eu já preparo o orçamento.

Studio GSM | Estética & Tapeçaria Automotiva
Customizar • Reparar • Proteger`;
  }
  if (c.stage === 'novo') return pitchText(c);
  const nome = c.contact_person || (c.segment && c.segment !== 'Consumidor final' ? '' : c.name);
  const n = nome ? ' ' + firstName(nome) : '';
  return `${(FOLLOW_MSG[c.stage] || FOLLOW_MSG.followup)(n)}\n\n${firstName(S.me.name) || 'Gustavo'} | Studio GSM`;
}

const AV = { data: null, timer: null };
const onFunnel = () => (location.hash || '').split('?')[0] === '#/crm';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sem storage */ } };

function ensureAvisoFab() {
  if (!S.me || $('#avisoFab')) return;
  const b = document.createElement('button');
  b.id = 'avisoFab'; b.className = 'aviso-fab hidden'; b.setAttribute('aria-label', 'Contatos para mandar mensagem');
  b.innerHTML = `${icon('wa')}<span class="aviso-txt">Mandar mensagem</span><span class="aviso-n" id="avisoN">0</span>`;
  b.onclick = openAvisos;
  document.body.appendChild(b);
}

async function refreshAvisos() {
  if (!S.me) return;
  ensureAvisoFab();
  try { AV.data = await api('/funnel-alerts'); } catch (e) { return; }
  const d = AV.data; const fab = $('#avisoFab');
  $('#avisoN').textContent = d.total;
  fab.classList.toggle('urgent', d.urgent > 0);
  fab.classList.toggle('hidden', !d.total || onFunnel());
  document.title = (d.total ? `(${d.total}) ` : '') + 'GSM Gestor';
  notifyAvisos(d);
  if (!AV.timer) AV.timer = setInterval(refreshAvisos, 5 * 60 * 1000);
}

// Notificação do navegador: quando aparece contato novo para mensagem, ou no máximo a cada 2 horas se continuar pendente
function notifyAvisos(d) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !d.total) return;
  if (onFunnel() && !document.hidden) return;
  const last = Number(lsGet('gsm_aviso_total') || 0); const lastAt = Number(lsGet('gsm_aviso_at') || 0);
  if (d.total <= last && Date.now() - lastAt < 2 * 60 * 60 * 1000) return;
  lsSet('gsm_aviso_total', d.total); lsSet('gsm_aviso_at', Date.now());
  const resumo = d.groups.map((g) => `${g.label}: ${g.items.length}`).join(' · ');
  try {
    const n = new Notification(`${d.total} contato${d.total > 1 ? 's' : ''} esperando mensagem`, { body: resumo, icon: '/icon.svg', tag: 'gsm-avisos' });
    n.onclick = () => { window.focus(); openAvisos(); n.close(); };
  } catch (e) { /* alguns celulares só notificam pelo app instalado */ }
}

function avisoItem(c) {
  const fixo = !c.whatsapp_digits && c.phone;
  return `<div class="aviso-item" data-av="${c.id}">
    <div class="main"><b>${c.priority ? `<span class="pri pri-${esc(c.priority)}">${esc(c.priority)}</span> ` : ''}${esc(c.name)}</b>
      <div class="sub ${c.urgent ? 'red' : ''}">${esc(c.reason)}</div>
      ${c.segment || c.neighborhood ? `<div class="tiny muted">${esc([c.segment, c.neighborhood].filter(Boolean).join(' · '))}</div>` : ''}</div>
    <div class="aviso-actions">
      ${c.whatsapp_digits ? `<button class="btn wa sm" data-act="wa">${icon('wa')} WhatsApp</button>` : ''}
      ${fixo ? `<a class="btn sm" data-act="tel" href="tel:+${digitsOnly(c.phone)}">☎ Ligar</a>` : ''}
      <button class="btn sm" data-act="done" title="Já falei com este contato">✓ Feito</button>
      <button class="btn sm ghost" data-act="snooze" title="Lembrar amanhã">Amanhã</button>
      <a class="btn sm ghost" data-act="open" href="#/cliente/${c.id}">Ficha</a>
    </div></div>`;
}

async function openAvisos() {
  if (!AV.data) await refreshAvisos();
  const d = AV.data || { total: 0, groups: [], goal: 0, done: 0 };
  const canAsk = 'Notification' in window && Notification.permission === 'default';
  const md = modal(`${icon('wa', 'width="20" height="20" style="vertical-align:-3px"')} Mandar mensagem`, `
    <div class="aviso-meta"><span>Apresentações hoje: <b>${d.done}</b> de
      <input class="i" id="avGoal" type="number" min="0" max="100" value="${d.goal}" inputmode="numeric" aria-label="Meta de apresentações por dia"></span>
      <a class="btn sm" href="#/crm">Abrir funil</a></div>
    ${canAsk ? '<button class="btn block sm" id="avNotif" style="margin-bottom:10px">🔔 Ativar avisos do navegador</button>' : ''}
    ${d.total ? d.groups.map((g) => `<div class="aviso-group" data-g="${g.stage}"><div class="aviso-gh">${esc(g.label)} <span class="n">${g.items.length}</span></div>
      ${g.items.map(avisoItem).join('')}</div>`).join('') : '<div class="empty">Ninguém esperando mensagem agora. 👌</div>'}`, (m) => {
    const goal = $('#avGoal', m.el);
    goal.onchange = async () => { await run(() => put('/settings', { funil_meta_dia: Math.max(0, Number(goal.value) || 0) })); await refreshAvisos(); m.close(); openAvisos(); };
    const nb = $('#avNotif', m.el);
    if (nb) nb.onclick = async () => { const p = await Notification.requestPermission(); nb.remove(); toast(p === 'granted' ? 'Avisos do navegador ativados' : 'Avisos do navegador bloqueados'); };
    $$('a[data-act="open"], a[href="#/crm"]', m.el).forEach((a) => a.addEventListener('click', m.close));
    $$('[data-av]', m.el).forEach((row) => {
      const c = d.groups.flatMap((g) => g.items).find((x) => x.id == row.dataset.av);
      const finish = async (kind) => {
        if (kind === 'snooze') await post(`/clients/${c.id}/snooze`, { days: 1 });
        else if (c.stage === 'novo') {
          await post(`/clients/${c.id}/contacted`, { description: kind === 'wa' ? 'Apresentação enviada pelo WhatsApp' : 'Apresentação feita (ligação/visita)' });
          await post('/followups', { client_id: c.id, due_date: addDays(todayStr(), 2), reason: 'Retorno da apresentação', owner: S.me.name }).catch(() => {});
        } else await post(`/clients/${c.id}/touch`, { description: kind === 'wa' ? 'Mensagem enviada pelo WhatsApp (aviso do funil)' : 'Contato feito (aviso do funil)' });
        const grp = row.closest('.aviso-group'); row.remove();
        const left = $$('.aviso-item', grp).length; $('.n', grp).textContent = left; if (!left) grp.remove();
        toast(kind === 'snooze' ? 'Lembro amanhã' : 'Contato registrado');
        refreshAvisos();
      };
      $$('[data-act]', row).forEach((b) => {
        const act = b.dataset.act;
        if (act === 'wa') b.onclick = () => { openWa(c.whatsapp_digits, avisoMsg(c)); finish('wa'); };
        if (act === 'tel') b.addEventListener('click', () => setTimeout(() => { if (confirm(`Conseguiu falar com ${c.name}?`)) finish('done'); }, 800));
        if (act === 'done') b.onclick = () => finish('done');
        if (act === 'snooze') b.onclick = () => finish('snooze');
      });
    });
  });
  return md;
}
