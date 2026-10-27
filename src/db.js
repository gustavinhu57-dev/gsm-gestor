const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'gsm.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Horário local (TZ=America/Sao_Paulo) no formato 'YYYY-MM-DD HH:MM:SS'
function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function today() { return now().slice(0, 10); }
function addDays(dateStr, n) {
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const STAGES = [
  ['novo', 'Novo lead'], ['abordado', 'Abordado'], ['respondeu', 'Respondeu'],
  ['interessado', 'Interessado'], ['orcamento', 'Orçamento'], ['followup', 'Follow-up'],
  ['fechado', 'Fechado'], ['agendado', 'Agendado'], ['executado', 'Executado'],
  ['pago', 'Pago'], ['posvenda', 'Pós-venda'], ['standby', 'Stand-by'],
];
const STAGE_IDX = Object.fromEntries(STAGES.map(([k], i) => [k, i]));

const CLIENT_TYPES = ['Pessoa física', 'Empresa', 'Frota', 'Caminhoneiro', 'Oficina/parceiro', 'Revenda'];
const STANDBY_REASONS = ['Achou caro', 'Sem dinheiro agora', 'Vai pensar', 'Sem resposta', 'Adiou', 'Escolheu concorrente', 'Não é prioridade', 'Outro'];
const PHOTO_CATEGORIES = ['Frente', 'Traseira', 'Lateral esquerda', 'Lateral direita', 'Interior', 'Banco', 'Avarias', 'Detalhes', 'Outras'];
const PHOTO_PHASES = [['entrada', 'Entrada/orçamento'], ['antes', 'Antes'], ['depois', 'Depois']];
const COST_CATEGORIES = ['Material', 'Produtos', 'Mão de obra', 'Comissão/parceiro', 'Outros'];
const EXPENSE_CATEGORIES = ['Aluguel', 'Energia', 'Marketing', 'Combustível', 'Ferramentas', 'Software', 'Manutenção', 'Administrativo', 'Outros'];
const PAYMENT_METHODS = ['Pix', 'Dinheiro', 'Cartão de crédito', 'Cartão de débito', 'Transferência', 'Outro'];
const ROLES = ['admin', 'comercial', 'operacional', 'financeiro'];

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', active INTEGER NOT NULL DEFAULT 1, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS origins (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, goal INTEGER DEFAULT 0, sources TEXT, channels TEXT, offer TEXT,
  start_date TEXT, end_date TEXT, notes TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, whatsapp TEXT, whatsapp_digits TEXT,
  origin_id INTEGER REFERENCES origins(id), client_type TEXT, owner TEXT, notes TEXT,
  stage TEXT NOT NULL DEFAULT 'novo', stage_reached INTEGER NOT NULL DEFAULT 0,
  campaign_id INTEGER REFERENCES campaigns(id), entry_date TEXT, last_contact_at TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_content TEXT, utm_term TEXT,
  ad_campaign_id TEXT, adset_id TEXT, ad_id TEXT, creative_id TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_clients_wa ON clients(whatsapp_digits);
CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brand TEXT, model TEXT, year TEXT, color TEXT, plate TEXT, notes TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_vehicles_client ON vehicles(client_id);
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT, price REAL NOT NULL DEFAULT 0,
  description TEXT, active INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'criado', source TEXT NOT NULL DEFAULT 'manual',
  requested_service TEXT,
  subtotal REAL DEFAULT 0, discount REAL DEFAULT 0, surcharge REAL DEFAULT 0, total REAL DEFAULT 0,
  notes TEXT, internal_notes TEXT, validity_days INTEGER DEFAULT 7, public_token TEXT UNIQUE,
  sent_at TEXT, approved_at TEXT, scheduled_for TEXT, executed_at TEXT, responsible TEXT,
  standby_reason TEXT, standby_note TEXT, standby_at TEXT,
  created_by TEXT, created_at TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE TABLE IF NOT EXISTS quote_items (
  id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE SET NULL, name TEXT NOT NULL, price REAL NOT NULL DEFAULT 0, sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  category TEXT, description TEXT, amount REAL NOT NULL DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  amount REAL NOT NULL, method TEXT, paid_at TEXT, notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY, client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL, quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  category TEXT, phase TEXT DEFAULT 'entrada', filename TEXT NOT NULL,
  marketing TEXT NOT NULL DEFAULT 'nao_informado', notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  due_date TEXT NOT NULL, reason TEXT, notes TEXT, owner TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', result TEXT, done_at TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_followups ON followups(status, due_date);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY, client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  quote_id INTEGER, type TEXT NOT NULL, description TEXT, user_name TEXT, created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_client ON events(client_id);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, category TEXT, description TEXT, amount REAL NOT NULL, date TEXT NOT NULL, created_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

// ---------- Migrações simples (colunas novas em bancos já existentes) ----------
const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
if (!hasCol('photos', 'show_client')) db.exec('ALTER TABLE photos ADD COLUMN show_client INTEGER NOT NULL DEFAULT 0');
if (!hasCol('quotes', 'link_active')) db.exec('ALTER TABLE quotes ADD COLUMN link_active INTEGER NOT NULL DEFAULT 1');
// Preço por porte (carro pequeno / grande) e custo direto de material por serviço
if (!hasCol('services', 'price_large')) db.exec('ALTER TABLE services ADD COLUMN price_large REAL');
if (!hasCol('services', 'cost')) db.exec('ALTER TABLE services ADD COLUMN cost REAL NOT NULL DEFAULT 0');
if (!hasCol('services', 'cost_large')) db.exec('ALTER TABLE services ADD COLUMN cost_large REAL');
if (!hasCol('quote_items', 'cost')) db.exec('ALTER TABLE quote_items ADD COLUMN cost REAL NOT NULL DEFAULT 0');
// Custo operacional por serviço (panos, desgaste de máquinas, boina): pago pelo caixa da empresa, não pelo cliente
if (!hasCol('services', 'op_cost')) db.exec('ALTER TABLE services ADD COLUMN op_cost REAL NOT NULL DEFAULT 0');
if (!hasCol('services', 'op_cost_large')) db.exec('ALTER TABLE services ADD COLUMN op_cost_large REAL');
if (!hasCol('quote_items', 'op_cost')) db.exec('ALTER TABLE quote_items ADD COLUMN op_cost REAL NOT NULL DEFAULT 0');
if (!hasCol('quotes', 'vehicle_size')) db.exec("ALTER TABLE quotes ADD COLUMN vehicle_size TEXT DEFAULT 'P'");

// Tabela oficial GSM (out/2026). Custos de estética = estimativa de produtos do kit Vonixx (preço médio de mercado);
// custos de tapeçaria = tabela GSM (material). Preço 0 = "a definir / varia".
const CATALOG_V2 = [
  // nome, categoria, preço P, preço G, custo P, custo G, descrição (aparece para o cliente)
  ['Ducha', 'Lavagem', 20, 20, 1, 1, 'Enxágue rápido'],
  ['Lavagem simples', 'Lavagem', 45, 90, 7, 10, 'Lavagem externa com pneus'],
  ['Lavagem de manutenção', 'Lavagem', 60, 120, 9, 13, 'Externa + limpeza interna rápida'],
  ['Lavagem com antirrepelência', 'Lavagem', 70, 140, 9, 13, 'Lavagem + proteção que repele água'],
  ['Lavagem detalhada', 'Lavagem', 120, 220, 18, 26, 'Lavagem completa com acabamento e cera'],
  ['Descontaminação de pintura', 'Lavagem', 140, 190, 18, 26, 'Remove contaminantes presos na pintura'],
  ['Enceramento técnico', 'Lavagem', 170, 290, 22, 32, 'Proteção e brilho da pintura'],
  ['Lavagem do motor', 'Lavagem', 100, 100, 9, 9, 'Limpeza e proteção do cofre do motor'],
  ['Mini higienização', 'Higienização', 180, 450, 8, 15, 'Higienização interna parcial'],
  ['Higienização', 'Higienização', 550, 550, 25, 30, 'Higienização interna completa: bancos, carpete e teto'],
  ['Polimento comercial', 'Polimento', 500, 700, 0, 0, 'Recupera brilho e remove riscos leves'],
  ['Polimento técnico', 'Polimento', 900, 1200, 0, 0, 'Correção de pintura (a partir de)'],
  ['Restauração de farol', 'Polimento', 0, 0, 0, 0, 'Faróis transparentes de novo'],
  ['Capa de carro', 'Tapeçaria', 400, null, 200, null, 'Capas sob medida para os bancos'],
  ['Banco acoplado pra carro', 'Tapeçaria', 550, null, 300, null, 'Revestimento de banco'],
  ['Volante e suportes', 'Tapeçaria', 270, null, 100, null, 'Revestimento de volante'],
  ['Painel e colchão', 'Tapeçaria', 600, null, 300, null, 'Revestimento de painel e colchão'],
  ['Carpete e teto', 'Tapeçaria', 900, null, 400, null, 'Troca de carpete e forro de teto'],
  ['Capa de caminhão', 'Caminhão', 700, null, 300, null, 'Capas sob medida para caminhão — entrega em 2 dias'],
  ['Banco de moto', 'Moto', 350, null, 100, null, 'Reforma do banco da moto'],
  ['Sofá retrátil', 'Sofá / residencial', 0, null, 250, null, 'Reforma de sofá retrátil'],
  ['Restauração de cadeira', 'Sofá / residencial', 0, null, 0, null, 'Reforma de cadeiras'],
  ['Outros', 'Outros', 0, null, 0, null, 'Serviço avulso'],
];


// ---------- Seeds (rodam só uma vez) ----------
function seed() {
  const hasOrigins = db.prepare('SELECT COUNT(*) c FROM origins').get().c;
  if (!hasOrigins) {
    const ins = db.prepare('INSERT INTO origins(name, sort) VALUES (?, ?)');
    ['Lista Gustavo', 'Lista Barbosa', 'Meta Ads', 'Instagram', 'TikTok', 'Site', 'WhatsApp', 'Indicação',
      'Cliente antigo', 'Presencial', 'Parceiro', 'Google Maps/B2B', 'Cliente recorrente', 'Outros']
      .forEach((n, i) => ins.run(n, i));
  }
  const hasCampaign = db.prepare('SELECT COUNT(*) c FROM campaigns').get().c;
  if (!hasCampaign) {
    db.prepare(`INSERT INTO campaigns(name, goal, sources, channels, offer, start_date, created_at)
      VALUES (?,?,?,?,?,?,?)`).run('Lista GSM — Construção de Carteira', 50, 'Lista Gustavo, Lista Barbosa',
      'WhatsApp, Presencial', 'Mix GSM — Estética & Tapeçaria Automotiva', today(), now());
  }
  const defaults = {
    company_name: 'GSM',
    company_tagline: 'Estética & Tapeçaria Automotiva',
    company_whatsapp: '',
    company_instagram: '',
    company_address: '',
    quote_validity_days: '7',
    followup_after_send_days: '2',
    // Divisão da margem (receita − material): sócio 1 / sócio 2 / caixa da empresa
    split_socio1_nome: 'Gustavo', split_socio1: '40',
    split_socio2_nome: 'Barbosa', split_socio2: '40',
    split_caixa: '20', prolabore_meta: '2000',
    quote_message: 'Olá {nome}! Tudo bem? Segue o orçamento da *GSM — Estética & Tapeçaria Automotiva*{veiculo}:\n\n{itens}\n\n*TOTAL: {total}*\n\nVer orçamento completo: {link}\n\nValidade: {validade} dias. Qualquer dúvida estou à disposição!',
  };
  const insS = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  Object.entries(defaults).forEach(([k, v]) => insS.run(k, v));
}
seed();

// Aplica a tabela oficial uma única vez: desativa o catálogo provisório (mantém histórico) e insere o oficial
(function applyCatalogV2() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'catalog_version' AND value >= '2'").get()) return;
  db.transaction(() => {
    db.prepare('UPDATE services SET active = 0').run();
    const ins = db.prepare('INSERT INTO services(name, category, price, price_large, cost, cost_large, description, sort) VALUES (?,?,?,?,?,?,?,?)');
    CATALOG_V2.forEach((s, i) => ins.run(...s, i));
    db.prepare("INSERT OR IGNORE INTO origins(name, sort) VALUES ('Fachada (passou na frente)', 9)").run();
    db.prepare("INSERT INTO settings(key, value) VALUES ('catalog_version', '2') ON CONFLICT(key) DO UPDATE SET value = '2'").run();
  })();
})();

// Correções do Gustavo (27/10): higienização R$220 (P e G), farol R$200 (material ~R$50),
// painel e colchão = caminhão, Hydrox na antirrepelência, clay bar + sabão na descontaminação, custo operacional por serviço
const CATALOG_V3 = {
  // nome: [preço P, preço G, material P, material G, operacional P, operacional G, categoria?]
  'Ducha': [20, 20, 1, 1, 1, 1],
  'Lavagem simples': [45, 90, 7, 10, 1.5, 2],
  'Lavagem de manutenção': [60, 120, 9, 13, 2, 2.5],
  'Lavagem com antirrepelência': [70, 140, 12, 17, 2, 2.5],
  'Lavagem detalhada': [120, 220, 18, 26, 2.5, 3],
  'Descontaminação de pintura': [140, 190, 15, 21, 2.5, 3],
  'Enceramento técnico': [170, 290, 22, 32, 3, 3.5],
  'Lavagem do motor': [100, 100, 9, 9, 1.5, 1.5],
  'Mini higienização': [180, 450, 8, 15, 2, 3],
  'Higienização': [220, 220, 25, 30, 4, 4],
  'Polimento comercial': [500, 700, 0, 0, 4, 5],
  'Polimento técnico': [900, 1200, 0, 0, 8, 10],
  'Restauração de farol': [200, 200, 50, 50, 1, 1],
  'Capa de carro': [400, null, 200, null, 2, null],
  'Banco acoplado pra carro': [550, null, 300, null, 2, null],
  'Volante e suportes': [270, null, 100, null, 1, null],
  'Painel e colchão': [600, null, 300, null, 2, null, 'Caminhão'],
  'Carpete e teto': [900, null, 400, null, 2, null],
  'Capa de caminhão': [700, null, 300, null, 2, null],
  'Banco de moto': [350, null, 100, null, 1, null],
  'Sofá retrátil': [0, null, 250, null, 2, null],
};
(function applyCatalogV3() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'catalog_version' AND value >= '3'").get()) return;
  db.transaction(() => {
    const up = db.prepare('UPDATE services SET price = ?, price_large = ?, cost = ?, cost_large = ?, op_cost = ?, op_cost_large = ?, category = COALESCE(?, category) WHERE name = ? AND active = 1');
    Object.entries(CATALOG_V3).forEach(([name, v]) => up.run(v[0], v[1], v[2], v[3], v[4], v[5], v[6] || null, name));
    db.prepare("UPDATE services SET description = 'Reforma do painel e colchão da cabine do caminhão' WHERE name = 'Painel e colchão' AND active = 1").run();
    db.prepare("INSERT INTO settings(key, value) VALUES ('catalog_version', '3') ON CONFLICT(key) DO UPDATE SET value = '3'").run();
  })();
})();

function getSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
}

module.exports = {
  db, DATA_DIR, now, today, addDays, getSettings,
  STAGES, STAGE_IDX, CLIENT_TYPES, STANDBY_REASONS, PHOTO_CATEGORIES, PHOTO_PHASES,
  COST_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS, ROLES,
};
