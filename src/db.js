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

// ---------- Seeds (rodam só uma vez) ----------
function seed() {
  const hasOrigins = db.prepare('SELECT COUNT(*) c FROM origins').get().c;
  if (!hasOrigins) {
    const ins = db.prepare('INSERT INTO origins(name, sort) VALUES (?, ?)');
    ['Lista Gustavo', 'Lista Barbosa', 'Meta Ads', 'Instagram', 'TikTok', 'Site', 'WhatsApp', 'Indicação',
      'Cliente antigo', 'Presencial', 'Parceiro', 'Google Maps/B2B', 'Cliente recorrente', 'Outros']
      .forEach((n, i) => ins.run(n, i));
  }
  const hasServices = db.prepare('SELECT COUNT(*) c FROM services').get().c;
  if (!hasServices) {
    const ins = db.prepare('INSERT INTO services(name, category, price, description, sort) VALUES (?,?,?,?,?)');
    [
      ['Higienização', 'Estética', 220, 'Higienização interna completa'],
      ['Polimento', 'Estética', 400, 'Polimento técnico da pintura'],
      ['Restauração de farol', 'Estética', 150, 'Par de faróis'],
      ['Banco automotivo', 'Tapeçaria', 350, 'Reforma/revestimento de banco'],
      ['Banco de caminhão', 'Tapeçaria', 450, 'Reforma de banco de caminhão'],
      ['Revestimento', 'Tapeçaria', 300, 'Revestimento interno'],
      ['Volante', 'Tapeçaria', 250, 'Revestimento de volante'],
      ['Tapeçaria', 'Tapeçaria', 400, 'Teto, forros e acabamentos'],
      ['Outros', 'Outros', 0, 'Serviço avulso'],
    ].forEach((s, i) => ins.run(...s, i));
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
    quote_message: 'Olá {nome}! Tudo bem? Segue o orçamento da *GSM — Estética & Tapeçaria Automotiva*{veiculo}:\n\n{itens}\n\n*TOTAL: {total}*\n\nVer orçamento completo: {link}\n\nValidade: {validade} dias. Qualquer dúvida estou à disposição!',
  };
  const insS = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  Object.entries(defaults).forEach(([k, v]) => insS.run(k, v));
}
seed();

function getSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
}

module.exports = {
  db, DATA_DIR, now, today, addDays, getSettings,
  STAGES, STAGE_IDX, CLIENT_TYPES, STANDBY_REASONS, PHOTO_CATEGORIES, PHOTO_PHASES,
  COST_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS, ROLES,
};
