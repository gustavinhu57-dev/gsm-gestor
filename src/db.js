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
// Tipos de veículo atendidos (cada serviço tem preço/custos por tipo)
const VEHICLE_TYPES = [
  ['carro_p', 'Carro pequeno'], ['carro_g', 'Carro grande / SUV'], ['caminhao', 'Caminhão'],
  ['moto', 'Moto'], ['lancha', 'Lancha'], ['residencial', 'Residencial (sofá, cadeira)'],
];

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
db.exec(`CREATE TABLE IF NOT EXISTS service_prices (
  id INTEGER PRIMARY KEY, service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE, vehicle_type TEXT NOT NULL,
  price REAL, cost REAL NOT NULL DEFAULT 0, op_cost REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(service_id, vehicle_type))`);
// 30/10: linha e cola (sai antes da divisão), insumos estimados podendo ficar "a informar", modo estimativa/ficha
if (!hasCol('service_prices', 'pre_cost')) db.exec('ALTER TABLE service_prices ADD COLUMN pre_cost REAL NOT NULL DEFAULT 0');
if (!hasCol('service_prices', 'op_est')) db.exec('ALTER TABLE service_prices ADD COLUMN op_est REAL');
if (!hasCol('service_prices', 'mat_pending')) db.exec('ALTER TABLE service_prices ADD COLUMN mat_pending INTEGER NOT NULL DEFAULT 0');
if (!hasCol('service_prices', 'ins_mode')) db.exec("ALTER TABLE service_prices ADD COLUMN ins_mode TEXT NOT NULL DEFAULT 'estimativa'");
if (!hasCol('quote_items', 'pre_cost')) db.exec('ALTER TABLE quote_items ADD COLUMN pre_cost REAL NOT NULL DEFAULT 0');
if (!hasCol('quotes', 'executed_ts')) db.exec('ALTER TABLE quotes ADD COLUMN executed_ts TEXT');
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, pack TEXT, price REAL, yield_est REAL,
  kind TEXT NOT NULL DEFAULT 'produto', active INTEGER NOT NULL DEFAULT 1, sort INTEGER DEFAULT 0, created_at TEXT
);
CREATE TABLE IF NOT EXISTS bottles (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL, price REAL, closed_at TEXT, yield_real REAL
);
CREATE TABLE IF NOT EXISTS tech_sheet (
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE, vehicle_type TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE, factor REAL NOT NULL DEFAULT 1,
  PRIMARY KEY (service_id, vehicle_type, product_id)
);
CREATE TABLE IF NOT EXISTS fixed_costs (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, sort INTEGER DEFAULT 0
);
`);
if (!hasCol('quotes', 'vehicle_type')) db.exec('ALTER TABLE quotes ADD COLUMN vehicle_type TEXT');
if (!hasCol('vehicles', 'vehicle_type')) db.exec('ALTER TABLE vehicles ADD COLUMN vehicle_type TEXT');
if (!hasCol('quotes', 'barbosa_helped')) db.exec('ALTER TABLE quotes ADD COLUMN barbosa_helped INTEGER NOT NULL DEFAULT 0');
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
    // Regra de 30/10: o caixa tira caixa_preco% do preço final primeiro; split_socio1/2 e split_caixa são % da sobra
    caixa_preco: '20', margem_seg: '30',
    // Precificação: custos fixos do mês (pagos pelo caixa) e faturamento-meta do mês para ratear esses custos
    custos_fixos_mes: '350', meta_faturamento_mes: '15000', meta_desafio_mes: '50000', taxa_fechamento_meta: '20',
    // Estética (lavagens, higienização, polimento, farol) é feita por Gustavo + Carlinhos: a parte do Carlinhos fica na GSM
    split_estetica_nome: 'Carlinhos (fica na GSM: material e máquinas)',
    // Taxas da maquininha (%), lançadas como custo quando o pagamento é no cartão. Vazio = não lança.
    taxa_debito: '', taxa_credito: '',
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

// 28/10: produtos de lavagem/polimento/farol são INSUMOS pagos pelo caixa (não pelo cliente) → passam para o custo
// operacional. Material (sai antes da divisão) fica só onde o cliente paga: tapeçaria. Mini higienização R$280; antirrepelência com Hydrox Wash.
(function applyCatalogV4() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'catalog_version' AND value >= '4'").get()) return;
  db.transaction(() => {
    db.prepare(`UPDATE services SET op_cost = op_cost + cost, op_cost_large = COALESCE(op_cost_large, op_cost) + COALESCE(cost_large, cost),
      cost = 0, cost_large = NULL WHERE active = 1 AND category IN ('Lavagem', 'Higienização', 'Polimento')`).run();
    db.prepare("UPDATE services SET price = 280, price_large = 280 WHERE name = 'Mini higienização' AND active = 1").run();
    db.prepare("UPDATE services SET op_cost = 20, op_cost_large = 24.5, description = 'Lavagem com shampoo cerâmico que repele água' WHERE name = 'Lavagem com antirrepelência' AND active = 1").run();
    db.prepare("INSERT INTO settings(key, value) VALUES ('catalog_version', '4') ON CONFLICT(key) DO UPDATE SET value = '4'").run();
  })();
})();

// 28/10: o material do farol (~R$50 por serviço) é pago pelo cliente → vai para material, sai antes da divisão
(function applyCatalogV5() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'catalog_version' AND value >= '5'").get()) return;
  db.transaction(() => {
    db.prepare("UPDATE services SET cost = 50, cost_large = 50, op_cost = 1, op_cost_large = 1 WHERE name = 'Restauração de farol' AND active = 1").run();
    db.prepare("INSERT INTO settings(key, value) VALUES ('catalog_version', '5') ON CONFLICT(key) DO UPDATE SET value = '5'").run();
  })();
})();

// 28/10: serviço × tipo de veículo. Capa de carro/caminhão + banco de moto viram "Capa de banco" (carro, caminhão, moto, lancha).
// Preço NULL = atende esse tipo, mas o preço ainda está "a definir".
(function applyCatalogV6() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'catalog_version' AND value >= '6'").get()) return;
  db.transaction(() => {
    const svc = (name) => db.prepare('SELECT * FROM services WHERE name = ? AND active = 1').get(name);
    const put = db.prepare(`INSERT INTO service_prices(service_id, vehicle_type, price, cost, op_cost) VALUES (?,?,?,?,?)
      ON CONFLICT(service_id, vehicle_type) DO UPDATE SET price = excluded.price, cost = excluded.cost, op_cost = excluded.op_cost, active = 1`);
    // 1) Todo serviço de carro ganha linhas carro pequeno / carro grande a partir dos preços atuais
    for (const s of db.prepare('SELECT * FROM services WHERE active = 1').all()) {
      if (['Capa de caminhão', 'Banco de moto', 'Painel e colchão', 'Sofá retrátil', 'Restauração de cadeira', 'Outros'].includes(s.name)) continue;
      put.run(s.id, 'carro_p', s.price || null, s.cost || 0, s.op_cost || 0);
      put.run(s.id, 'carro_g', (s.price_large ?? s.price) || null, (s.cost_large ?? s.cost) || 0, (s.op_cost_large ?? s.op_cost) || 0);
    }
    // 2) Capa de banco: carro (R$400), caminhão (R$700), moto (R$350), lancha (a definir)
    const capa = svc('Capa de carro'); const cam = svc('Capa de caminhão'); const moto = svc('Banco de moto');
    if (capa) {
      db.prepare("UPDATE services SET name = 'Capa de banco', description = 'Capas e revestimento de bancos sob medida' WHERE id = ?").run(capa.id);
      if (cam) { put.run(capa.id, 'caminhao', cam.price, cam.cost, cam.op_cost); db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(cam.id); }
      if (moto) { put.run(capa.id, 'moto', moto.price, moto.cost, moto.op_cost); db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(moto.id); }
      put.run(capa.id, 'lancha', null, 0, 2);
    }
    // 3) Farol: carro (R$200, material R$50); caminhão e moto a definir
    const farol = svc('Restauração de farol');
    if (farol) { put.run(farol.id, 'caminhao', null, 50, 1); put.run(farol.id, 'moto', null, 50, 1); }
    // 4) Polimento: também caminhão, moto e lancha (a definir). Higienização: também caminhão (cabine) e lancha (a definir)
    for (const n of ['Polimento comercial', 'Polimento técnico']) { const s = svc(n); if (s) ['caminhao', 'moto', 'lancha'].forEach((t) => put.run(s.id, t, null, 0, s.op_cost_large ?? s.op_cost ?? 0)); }
    const hig = svc('Higienização');
    if (hig) ['caminhao', 'lancha'].forEach((t) => put.run(hig.id, t, null, 0, hig.op_cost_large ?? hig.op_cost ?? 0));
    // 5) Só caminhão / residencial
    const pc = svc('Painel e colchão'); if (pc) { put.run(pc.id, 'caminhao', pc.price, pc.cost, pc.op_cost); db.prepare("UPDATE services SET category = 'Tapeçaria' WHERE id = ?").run(pc.id); }
    for (const n of ['Sofá retrátil', 'Restauração de cadeira']) { const s = svc(n); if (s) put.run(s.id, 'residencial', s.price || null, s.cost || 0, s.op_cost || 0); }
    const out = svc('Outros'); if (out) VEHICLE_TYPES.forEach(([t]) => put.run(out.id, t, null, 0, 0));
    // 6) Orçamentos antigos: porte P/G → tipo de veículo
    db.prepare("UPDATE quotes SET vehicle_type = CASE vehicle_size WHEN 'G' THEN 'carro_g' ELSE 'carro_p' END WHERE vehicle_type IS NULL").run();
    db.prepare("INSERT INTO settings(key, value) VALUES ('catalog_version', '6') ON CONFLICT(key) DO UPDATE SET value = '6'").run();
  })();
})();

// 30/10 (resumo atualizado): tabela serviço × veículo nova, material + linha e cola da tapeçaria, 2 serviços novos,
// produtos com frascos (rendimento real) e custos fixos em lista. Nada lançado é apagado: só preços da tabela mudam.
const GRID_V7 = {
  // serviço: [categoria, {veículo: [preço|null, material|null(a definir), linha e cola]}]
  'Ducha': ['Lavagem', { carro_p: [20], carro_g: [20], caminhao: [100], moto: [20], lancha: [100] }],
  'Lavagem simples': ['Lavagem', { carro_p: [45], carro_g: [90], caminhao: [250], moto: [35], lancha: [100] }],
  'Lavagem de manutenção': ['Lavagem', { carro_p: [60], carro_g: [120], caminhao: [300], moto: [45], lancha: [150] }],
  'Lavagem com antirrepelência': ['Lavagem', { carro_p: [70], carro_g: [140], caminhao: [320], moto: [60], lancha: [200] }],
  'Lavagem do motor': ['Lavagem', { carro_p: [100], carro_g: [100], caminhao: [250], moto: [100], lancha: [150] }],
  'Lavagem detalhada': ['Lavagem', { carro_p: [120], carro_g: [220], caminhao: [420], moto: [100], lancha: [350] }],
  'Descontaminação de pintura': ['Lavagem', { carro_p: [140], carro_g: [190], caminhao: [240], moto: [120], lancha: [190] }],
  'Enceramento técnico': ['Lavagem', { carro_p: [190], carro_g: [290], caminhao: [900], moto: [150], lancha: [290] }],
  'Polimento comercial': ['Polimento', { carro_p: [500], carro_g: [700], caminhao: [900], moto: [250], lancha: [600] }],
  'Polimento técnico': ['Polimento', { carro_p: [900], carro_g: [1200], caminhao: [1400], moto: [600], lancha: [900] }],
  'Mini higienização': ['Higienização', { carro_p: [290], carro_g: [290], caminhao: [290], lancha: [290] }],
  'Higienização': ['Higienização', { carro_p: [550], carro_g: [550], caminhao: [550] }],
  'Restauração de farol': ['Polimento', { carro_p: [200, 50], carro_g: [200, 50], caminhao: [300, 50], moto: [100, 50] }],
  'Restauração de plástico': ['Polimento', { carro_p: [120], carro_g: [120], caminhao: [250], moto: [120] }],
  'Lavagem de banco individual': ['Higienização', { carro_p: [120], carro_g: [120], caminhao: [120] }],
  'Capa de banco': ['Tapeçaria', { carro_p: [400, 150, 50], carro_g: [400, 150, 50], caminhao: [700, 300, 50], moto: [350, 100, 50], lancha: [400, 200, 50] }],
  'Banco acoplado': ['Tapeçaria', { carro_p: [550, 300], carro_g: [550, 300], lancha: [550, null] }],
  'Volante e suportes': ['Tapeçaria', { carro_p: [270, 100], carro_g: [270, 100], caminhao: [270, null], lancha: [270, null] }],
  'Painel e colchão': ['Tapeçaria', { caminhao: [600, 300, 50] }],
  'Carpete e teto': ['Tapeçaria', { carro_p: [800, 400, 50], carro_g: [800, 400, 50], caminhao: [900, null] }],
  'Sofá retrátil': ['Tapeçaria', { residencial: [null, 250] }],
  'Restauração de cadeira': ['Tapeçaria', { residencial: [null, null] }],
};
const PRODUCTS_V7 = [
  // nome, embalagem, preço pago, rende (serviços), tipo
  ['V-Mol', '5 L', 118, 40], ['Sintra', '5 L', 118, 50], ['Delet', '5 L', 140, 50], ['Shiny', '500 ml', 55, 15],
  ['Darker (Dark)', '1 L', 55, 20], ['Tok Final', '500 ml', 35, 50], ['Hydrox Wash', '500 ml', 40, 15], ['Clay bar', 'un.', 22, 2],
  ['Massa de polimento', 'pote', 50, 3], ['Boina de polimento', 'un.', 70, 20], ['Restaurador de plásticos', '', 45, 50],
  ['Pano de microfibra', 'un.', 2.7, 30], ['Lavadora (desgaste)', 'máquina', 500, 800, 'maquina'], ['Politriz (desgaste)', 'máquina', 1000, null, 'maquina'],
  ['Extratora (desgaste)', 'máquina', null, null, 'maquina'], ['Cera (enceramento)', '', null, null],
];
(function applyCatalogV7() {
  if (db.prepare("SELECT 1 FROM settings WHERE key = 'catalog_version' AND value >= '7'").get()) return;
  db.transaction(() => {
    // insumos estimados antigos passam para op_est (só carro tinha estimativa; tapeçaria mantém o desgaste estimado)
    db.prepare("UPDATE service_prices SET op_est = op_cost WHERE vehicle_type IN ('carro_p', 'carro_g') OR service_id IN (SELECT id FROM services WHERE category = 'Tapeçaria')").run();
    db.prepare("UPDATE services SET name = 'Banco acoplado' WHERE name = 'Banco acoplado pra carro' AND active = 1").run();
    const find = db.prepare('SELECT * FROM services WHERE name = ? AND active = 1');
    const ins = db.prepare('INSERT INTO services(name, category, price, description, sort) VALUES (?,?,?,?,99)');
    const up = db.prepare(`INSERT INTO service_prices(service_id, vehicle_type, price, cost, pre_cost, mat_pending, op_cost, op_est, active) VALUES (?,?,?,?,?,?,0,?,1)
      ON CONFLICT(service_id, vehicle_type) DO UPDATE SET price = excluded.price, cost = excluded.cost, pre_cost = excluded.pre_cost,
        mat_pending = excluded.mat_pending, active = 1, op_est = CASE WHEN excluded.vehicle_type IN ('carro_p','carro_g') THEN service_prices.op_est ELSE excluded.op_est END`);
    const DESC = { 'Restauração de plástico': 'Plásticos externos e internos sem aspecto ressecado', 'Lavagem de banco individual': 'Limpeza de um banco avulso' };
    for (const [name, [cat, rows]] of Object.entries(GRID_V7)) {
      let s = find.get(name);
      if (!s) { const id = ins.run(name, cat, Object.values(rows)[0][0] || 0, DESC[name] || null).lastInsertRowid; s = { id, category: cat }; }
      const tape = cat === 'Tapeçaria';
      for (const [vt] of VEHICLE_TYPES) {
        const r = rows[vt];
        if (!r) { db.prepare('UPDATE service_prices SET active = 0 WHERE service_id = ? AND vehicle_type = ?').run(s.id, vt); continue; }
        const [price, mat = 0, linha = 0] = r;
        up.run(s.id, vt, price ?? null, mat ?? 0, linha, mat === null ? 1 : 0, tape ? (vt === 'moto' ? 1 : 2) : null);
      }
    }
    const insP = db.prepare('INSERT INTO products(name, pack, price, yield_est, kind, sort, created_at) VALUES (?,?,?,?,?,?,?)');
    const insB = db.prepare('INSERT INTO bottles(product_id, opened_at, price) VALUES (?,?,?)');
    if (!db.prepare('SELECT COUNT(*) c FROM products').get().c) {
      PRODUCTS_V7.forEach(([n, pk, pr, y, kind], i) => { const id = insP.run(n, pk, pr, y, kind || 'produto', i, now()).lastInsertRowid; insB.run(id, now(), pr); });
    }
    if (!db.prepare('SELECT COUNT(*) c FROM fixed_costs').get().c) {
      const insF = db.prepare('INSERT INTO fixed_costs(name, amount, sort) VALUES (?,?,?)');
      insF.run('Luz', 200, 0); insF.run('Internet', 150, 1);
    }
    db.prepare("INSERT INTO settings(key, value) VALUES ('catalog_version', '7') ON CONFLICT(key) DO UPDATE SET value = '7'").run();
  })();
})();

function getSettings() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
}

module.exports = {
  db, DATA_DIR, now, today, addDays, getSettings,
  STAGES, STAGE_IDX, CLIENT_TYPES, STANDBY_REASONS, PHOTO_CATEGORIES, PHOTO_PHASES,
  COST_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS, ROLES, VEHICLE_TYPES,
};
