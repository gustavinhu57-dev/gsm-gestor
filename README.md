# GSM Gestor — CRM MVP

CRM mobile-first da GSM — Estética & Tapeçaria Automotiva.
Node.js + Express + SQLite + SPA em JavaScript puro (sem build).

## Rodar localmente
```bash
npm install
ADMIN_EMAIL=voce@email.com ADMIN_PASSWORD=suasenha npm start
# abra http://localhost:3000
```
O administrador é criado no primeiro start a partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

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
