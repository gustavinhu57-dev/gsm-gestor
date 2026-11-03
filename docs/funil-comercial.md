# Funil comercial (03/11/2026)

O quadro do CRM virou o **Funil comercial** (`#/crm`), usado para prospecção ativa em Manaus.

- **Etapas:** mesmas chaves de antes. Mudaram só os nomes: `novo` = **A contatar**, `abordado` = **Apresentação enviada**. As etapas de execução (Agendado → Pós-venda) ficam ocultas por padrão; há uma caixa para mostrá-las.
- **Arrastar com o mouse** entre colunas (HTML5 drag and drop, com rolagem automática nas bordas). No celular: ◀ ▶.
- **Stand-by** pede o motivo ("Sem interesse" foi incluído) e, opcionalmente, a data para retomar, que vira um follow-up.
- **Novos campos em `clients`:** `segment`, `priority` (A/B/C), `contact_person`, `phone` (fixo), `address`, `neighborhood`, `website`, `instagram`, `distance_km`, `source_ref` (place_id do Google). A migração é automática (`ALTER TABLE` se a coluna não existir).
- **Segmentos:** Transportadora, Frota, Embarcações, Locadora, Loja de veículos, Oficina, Lava-jato, Comerciante, Consumidor final.
- **Filtros do funil:** segmento (inclui "Só empresas"), prioridade, origem e campanha.
- **Cartão → "Enviar apresentação":** abre o WhatsApp com a mensagem do segmento (editável), move para Apresentação enviada e cria um follow-up em 2 dias. "Já me apresentei" faz o mesmo para ligação ou visita. Se a empresa tiver só telefone fixo, aparece o botão "Ligar".
- **Importação:** Funil → Importar → "Planilha de prospecção (CSV)" → `POST /api/clients/import-csv`. CSV com cabeçalho, separado por `;` ou `,`. Duplicados são ignorados pelo WhatsApp, pelo place_id ou pelo nome + telefone fixo. A origem fica "Google Maps/B2B".
- **Lista inicial:** `docs/prospeccao/GSM_prospeccao_Manaus.csv`, com 178 empresas levantadas no Google Maps em 03/11/2026, classificadas por segmento e com prioridade calculada por segmento, distância da GSM (Av. Passarinho) e número de avaliações.

## Avisos do funil (03/11/2026, noite)

Botão flutuante **"Mandar mensagem"** (com o número de contatos) em todas as telas, **menos no Funil**. Ao tocar, abre um painel com os contatos agrupados por coluna.

- **API:** `GET /api/funnel-alerts` → `{ total, urgent, goal, done, groups:[{stage,label,items}] }`. Os itens são clientes com `reason` (motivo do aviso) e `urgent`.
- **Regras** (`FUNNEL_RULES` em `src/api.js`, contadas em dias sem contato):

| Coluna | Avisa após | Motivo |
|---|---|---|
| Apresentação enviada | 2 dias | mandar a 2ª mensagem |
| Respondeu | 1 dia | cliente esperando resposta |
| Interessado | 1 dia | pedir modelo e foto |
| Orçamento | 2 dias | follow-up do orçamento |
| Follow-up | 2 dias | retomar |
| Fechado | 1 dia | combinar a data do serviço |
| Stand-by | 15 dias | tentar retomar |
| Executado/Pago | 7 dias | pós-venda |

- Um follow-up pendente **vencido** (hoje ou antes) sempre gera aviso, marcado como urgente. Um follow-up com **data futura** segura o aviso até lá.
- **Lead novo de entrada** (não veio da lista de prospecção) entra no grupo "Leads novos — responder já", que é urgente.
- **"A contatar — meta do dia":** sugere as próximas empresas da prospecção (prioridade A → B → C, depois a mais perto) até completar a meta diária. A meta fica em `settings.funil_meta_dia` (padrão 10) e pode ser editada no próprio painel. As apresentações feitas no dia são contadas pelos eventos cuja descrição começa com "Apresenta…".
- **Ações em cada contato:** WhatsApp (mensagem pronta por coluna e editável no WhatsApp) · Ligar (quando só tem fixo) · ✓ Feito · Amanhã (adiar) · Ficha.
  - Em "A contatar": usa `POST /clients/:id/contacted` e cria follow-up em 2 dias.
  - Nas outras colunas: `POST /clients/:id/touch` (atualiza `last_contact_at` e conclui os follow-ups vencidos).
  - Amanhã: `POST /clients/:id/snooze` (cria follow-up para o dia seguinte).
- **No Funil:** os cartões de quem está esperando mensagem ganham a etiqueta "📨 motivo".
- **Atualização:** a cada troca de tela e a cada 5 minutos. O título da aba mostra "(N) GSM Gestor".
- **Aviso do navegador:** botão "Ativar avisos do navegador" no painel. Notifica quando aumenta o número de contatos, ou a cada 2 horas se continuar pendente. **Só funciona com o GSM Gestor aberto** (pode estar em segundo plano). Avisar com o app fechado exige Web Push (service worker + servidor de push), que fica como próximo passo.
- **Arquivos:** `public/js/w-avisos.js` (novo), `public/js/core.js` (`refreshBadges` chama `refreshAvisos`), `public/js/v-crm.js` (etiquetas nos cartões), `public/app.css`, `public/index.html`.
