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
