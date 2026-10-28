# GSM Gestor — CRM MVP

CRM mobile-first da GSM — Estética & Tapeçaria Automotiva.
Node.js + Express + SQLite + SPA em JavaScript puro (sem build).

## Endereços
- `/` — **Site GSM** (público): zoom carro → interior → banco → couro → textura → costura, serviços, resultados (antes/depois), formulário de orçamento
- `/gestor` — **GSM Gestor** (CRM, com login)
- `/o/<token>` — link do orçamento enviado ao cliente

Fotos do zoom do site: `site/img/1-carro.jpg` … `6-costura.jpg` (arte provisória gerada a partir de `site/art/*.svg`). Substitua por fotos reais da GSM com o mesmo nome (quadradas, ~1100px).
Links de anúncio: `/?utm_source=facebook&utm_medium=paid&utm_campaign=NOME&utm_content=CRIATIVO&ad_id=ID&servico=higienizacao`

## Rodar localmente
```bash
npm install
ADMIN_EMAIL=voce@email.com ADMIN_PASSWORD=suasenha npm start
# site: http://localhost:3000  ·  CRM: http://localhost:3000/gestor
```
O administrador é criado no primeiro start a partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

## Deploy (Render — mais simples)
1. render.com › entrar com o GitHub.
2. New › **Blueprint** › escolher `gsm-gestor` (o `render.yaml` cria serviço + disco em `/data`).
3. Preencher `ADMIN_EMAIL` e `ADMIN_PASSWORD` › Apply. Custo ~US$ 7,25/mês (Starter + 1 GB de disco).
4. Abrir `https://<nome>.onrender.com/gestor`.

## Deploy (Railway)
1. Suba este projeto para um repositório privado no GitHub.
2. Railway → New Project → Deploy from GitHub repo (detecta o Dockerfile).
3. Adicione um **Volume** montado em `/data` (banco + fotos ficam ali).
4. Variables: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATA_DIR=/data`, `TZ=America/Sao_Paulo`.
5. Settings → Networking → Generate Domain (ou conecte seu domínio).

## Estrutura
- `src/db.js` — schema e dados iniciais (origens, serviços, campanha inicial)
- `src/api.js` — API autenticada
- `src/server.js` — página pública do orçamento `/o/:token` e entrada de leads `/api/public/lead`
- `public/` — interface (core, clientes, orçamentos, crm, gestão)

## Backup
Configurações → "Baixar backup do banco" (arquivo SQLite). Faça semanalmente.

## Entrada de leads (site futuro)
`POST /api/public/lead` com `name`, `whatsapp`, `service`, `vehicle`, `message`, `utm_*`, `campaign_id`, `adset_id`, `ad_id`, `creative_id`.
Libere o domínio do site em `LEAD_ALLOWED_ORIGINS`.
