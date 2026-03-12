/**
 * db.js — Banco de dados em JSON puro
 * Sem compilação C++, funciona em qualquer Node.js
 * Dados salvos em: backend/data/db.json
 */

const fs   = require('fs');
const path = require('path');

const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

// ─── DADOS INICIAIS ───────────────────────────────────────────────────────────
const DEFAULTS = {
  servicos: [
    { id:1, nome:'Corte Clássico',       descricao:'Corte personalizado com tesoura e máquina.',  preco:65,  duracao:45, icone:'✂',  ativo:1 },
    { id:2, nome:'Barba Completa',        descricao:'Barba desenhada, aparada e hidratada.',       preco:55,  duracao:40, icone:'🪒', ativo:1 },
    { id:3, nome:'Combo Premium',         descricao:'Corte + Barba. O pacote mais completo.',      preco:110, duracao:80, icone:'⚡', ativo:1 },
    { id:4, nome:'Design de Sobrancelha', descricao:'Modelagem com pinça e linha.',                preco:30,  duracao:20, icone:'👁',  ativo:1 },
    { id:5, nome:'Relaxamento Capilar',   descricao:'Hidratação profunda do couro cabeludo.',      preco:90,  duracao:60, icone:'🌿', ativo:1 },
    { id:6, nome:'Coloração',             descricao:'Coloração profissional.',                     preco:130, duracao:90, icone:'🎨', ativo:1 },
  ],
  agendamentos: [],
  horarios_bloqueados: [],
  configuracoes: {
    barbeiro_nome:      'Marcus Silva',
    horario_inicio:     '09:00',
    horario_fim:        '19:00',
    intervalo_min:      '60',
    dias_funcionamento: '1,2,3,4,5,6',
  },
  _nextId: { agendamentos: 1, bloqueados: 1 },
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    save(DEFAULTS);
    console.log('✅ Banco de dados JSON inicializado.');
  }
}

// ─── LOAD / SAVE ──────────────────────────────────────────────────────────────
function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ─── API PÚBLICA ──────────────────────────────────────────────────────────────

// Serviços
function getServicos() {
  return load().servicos.filter(s => s.ativo);
}

// Configurações
function getConfig() {
  return load().configuracoes;
}
function setConfig(updates) {
  const db = load();
  db.configuracoes = { ...db.configuracoes, ...updates };
  save(db);
}

// Agendamentos
function getAgendamentos(filtros = {}) {
  let list = load().agendamentos;
  if (filtros.data)            list = list.filter(a => a.data === filtros.data);
  if (filtros.status)          list = list.filter(a => a.status === filtros.status);
  if (filtros.pagamento_status)list = list.filter(a => a.pagamento_status === filtros.pagamento_status);
  return list.sort((a,b) => (a.data+a.hora).localeCompare(b.data+b.hora));
}

function getAgendamentoByCodigo(codigo) {
  const db = load();
  const ag = db.agendamentos.find(a => a.codigo === codigo);
  if (!ag) return null;
  const srv = db.servicos.find(s => s.id === ag.servico_id);
  return { ...ag, servico_nome: srv?.nome, icone: srv?.icone };
}

function criarAgendamento(dados) {
  const db = load();
  const id = db._nextId.agendamentos++;
  const ag = { id, ...dados, criado_em: new Date().toISOString() };
  db.agendamentos.push(ag);
  save(db);
  return ag;
}

function atualizarAgendamento(codigo, updates) {
  const db = load();
  const idx = db.agendamentos.findIndex(a => a.codigo === codigo);
  if (idx === -1) return null;
  db.agendamentos[idx] = { ...db.agendamentos[idx], ...updates };
  save(db);
  return db.agendamentos[idx];
}

// Verifica conflito de horário (ignora cancelados e aguardando pagamento)
function horarioOcupado(data, hora, excluirCodigo = null) {
  const db = load();
  const STATUS_OK = ['cancelado', 'aguardando_pagamento'];
  return db.agendamentos.some(a =>
    a.data === data &&
    a.hora === hora &&
    !STATUS_OK.includes(a.status) &&
    a.codigo !== excluirCodigo
  );
}

// Horários bloqueados
function getHorariosBloqueados(data) {
  return load().horarios_bloqueados
    .filter(h => h.data === data)
    .map(h => h.hora_inicio);
}

function bloquearHorario(data, hora_inicio, motivo) {
  const db = load();
  const id = db._nextId.bloqueados++;
  db.horarios_bloqueados.push({ id, data, hora_inicio, motivo: motivo || 'Bloqueado', criado_em: new Date().toISOString() });
  save(db);
}

// Dashboard
function getDashboard() {
  const db   = load();
  const hoje = new Date().toISOString().split('T')[0];
  const mes  = hoje.slice(0, 7) + '-01';
  const ags  = db.agendamentos;
  return {
    agendamentos_hoje: ags.filter(a => a.data === hoje && a.status !== 'cancelado').length,
    receita_hoje:      ags.filter(a => a.data === hoje && a.pagamento_status === 'pago').reduce((s,a) => s + a.preco, 0),
    receita_mes:       ags.filter(a => a.data >= mes  && a.pagamento_status === 'pago').reduce((s,a) => s + a.preco, 0),
    aguardando_pag:    ags.filter(a => a.pagamento_status === 'pendente').length,
    proximos:          ags.filter(a => a.data >= hoje && a.status === 'confirmado')
                          .sort((a,b) => (a.data+a.hora).localeCompare(b.data+b.hora))
                          .slice(0, 10)
                          .map(a => ({ ...a, servico_nome: db.servicos.find(s=>s.id===a.servico_id)?.nome })),
  };
}

init();

module.exports = {
  getServicos, getConfig, setConfig,
  getAgendamentos, getAgendamentoByCodigo,
  criarAgendamento, atualizarAgendamento,
  horarioOcupado, getHorariosBloqueados, bloquearHorario,
  getDashboard,
};
