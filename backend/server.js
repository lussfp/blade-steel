require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');
const pix     = require('./pix');
const email   = require('./email');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['https://lussfp.github.io', 'http://localhost:3001'],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Admin-Key']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function gerarCodigo() {
  return 'BS-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function gerarSlots(cfg) {
  const slots = [];
  const [hI, mI] = cfg.horario_inicio.split(':').map(Number);
  const [hF, mF] = cfg.horario_fim.split(':').map(Number);
  const step = parseInt(cfg.intervalo_min);
  let cur = hI * 60 + mI, fim = hF * 60 + mF;
  while (cur + step <= fim) {
    slots.push(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`);
    cur += step;
  }
  return slots;
}

// Verifica se um slot data+hora já passou (horário de Brasília)
function slotJaPassou(data, hora) {
  const agora   = new Date();
  const [y,m,d] = data.split('-').map(Number);
  const [hh,mm] = hora.split(':').map(Number);
  const slot = new Date(y, m - 1, d, hh, mm, 0);
  return slot <= agora;
}

// Middleware simples de admin (chave no header ou query)
function adminAuth(req, res, next) {
  const ADMIN_KEY = process.env.ADMIN_KEY || 'bladesteel2026';
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY)
    return res.status(401).json({ success: false, erro: 'Acesso não autorizado.' });
  next();
}

// ─── SERVIÇOS ────────────────────────────────────────────────────────────────
app.get('/api/servicos', (req, res) => {
  res.json({ success: true, data: db.getServicos() });
});

// ─── DISPONIBILIDADE ─────────────────────────────────────────────────────────
app.get('/api/disponibilidade/:data', (req, res) => {
  const { data } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return res.status(400).json({ success: false, erro: 'Use YYYY-MM-DD.' });

  const cfg = db.getConfig();
  const dia = new Date(data + 'T12:00:00').getDay();
  if (!cfg.dias_funcionamento.split(',').map(Number).includes(dia))
    return res.json({ success: true, data: { aberto: false, slots: [] } });

  const bloqueados = new Set(db.getHorariosBloqueados(data));
  const slots = gerarSlots(cfg).map(hora => ({
    hora,
    // FIX 1: Marca como indisponível slots que já passaram
    disponivel: !db.horarioOcupado(data, hora) && !bloqueados.has(hora) && !slotJaPassou(data, hora),
    passado:    slotJaPassou(data, hora),
  }));
  res.json({ success: true, data: { aberto: true, data, slots } });
});

app.get('/api/disponibilidade/:data/:hora/verificar', (req, res) => {
  const { data, hora } = req.params;

  // FIX 1: Rejeita horário passado
  if (slotJaPassou(data, hora))
    return res.json({ success: true, disponivel: false, mensagem: `Horário ${hora} já passou.`, sugestao: null });

  const ocupado   = db.horarioOcupado(data, hora);
  const bloqueado = db.getHorariosBloqueados(data).includes(hora);
  if (ocupado || bloqueado) {
    const cfg   = db.getConfig();
    const todos = gerarSlots(cfg);
    const bloqs = new Set(db.getHorariosBloqueados(data));
    const idx   = todos.indexOf(hora);
    let sugestao = null;
    for (let i = idx + 1; i < todos.length; i++) {
      if (!db.horarioOcupado(data, todos[i]) && !bloqs.has(todos[i]) && !slotJaPassou(data, todos[i])) { sugestao = todos[i]; break; }
    }
    if (!sugestao) for (let i = idx - 1; i >= 0; i--) {
      if (!db.horarioOcupado(data, todos[i]) && !bloqs.has(todos[i]) && !slotJaPassou(data, todos[i])) { sugestao = todos[i]; break; }
    }
    return res.json({ success: true, disponivel: false, mensagem: `Horário ${hora} indisponível.`, sugestao });
  }
  res.json({ success: true, disponivel: true, hora });
});

// ─── AGENDAMENTOS ────────────────────────────────────────────────────────────
app.post('/api/agendamentos', (req, res) => {
  const { cliente_nome, cliente_email, cliente_tel, servico_id, data, hora, observacoes } = req.body;
  if (!cliente_nome || !servico_id || !data || !hora)
    return res.status(400).json({ success: false, erro: 'Campos obrigatórios: cliente_nome, servico_id, data, hora.' });

  // FIX 1: Bloqueia criação em horário passado
  if (slotJaPassou(data, hora))
    return res.status(400).json({ success: false, erro: 'Não é possível agendar em horário que já passou.' });

  const srv = db.getServicos().find(s => s.id === Number(servico_id));
  if (!srv) return res.status(404).json({ success: false, erro: 'Serviço não encontrado.' });
  if (db.horarioOcupado(data, hora))
    return res.status(409).json({ success: false, erro: 'Horário indisponível.', codigo: 'HORARIO_OCUPADO' });

  let codigo = gerarCodigo();
  while (db.getAgendamentoByCodigo(codigo)) codigo = gerarCodigo();

  const ag = db.criarAgendamento({
    codigo, cliente_nome: cliente_nome.trim(),
    cliente_email: cliente_email || null, cliente_tel: cliente_tel || null,
    servico_id: Number(servico_id), data, hora,
    duracao: srv.duracao, preco: srv.preco,
    status: 'aguardando_pagamento',
    pagamento_tipo: 'pix_proprio', pagamento_status: 'pendente',
    pagamento_mp_id: null, observacoes: observacoes || null,
  });

  email.enviarNotificacaoBarbeiro(ag).catch(err =>
    console.error('Erro e-mail barbeiro:', err.message)
  );

  res.status(201).json({ success: true, data: ag });
});

app.get('/api/agendamentos/:codigo', (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Agendamento não encontrado.' });
  res.json({ success: true, data: ag });
});

// FIX 3: Cancelamento pelo cliente — libera o horário automaticamente
app.patch('/api/agendamentos/:codigo/cancelar', (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });
  if (ag.status === 'cancelado') return res.status(400).json({ success: false, erro: 'Já cancelado.' });

  // Não permite cancelar agendamento que já aconteceu
  if (slotJaPassou(ag.data, ag.hora))
    return res.status(400).json({ success: false, erro: 'Não é possível cancelar agendamento que já ocorreu.' });

  // Status cancelado faz horarioOcupado() retornar false — horário volta a aparecer
  db.atualizarAgendamento(req.params.codigo, { status: 'cancelado' });
  console.log(`🚫 Agendamento cancelado: ${req.params.codigo} — horário ${ag.data} ${ag.hora} liberado`);
  res.json({ success: true, mensagem: 'Agendamento cancelado. O horário foi liberado.' });
});

// FIX 3: Reagendamento pelo cliente — troca data/hora e libera horário anterior
app.patch('/api/agendamentos/:codigo/reagendar', (req, res) => {
  const { nova_data, nova_hora } = req.body;
  if (!nova_data || !nova_hora)
    return res.status(400).json({ success: false, erro: 'nova_data e nova_hora obrigatórios.' });

  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });
  if (ag.status === 'cancelado') return res.status(400).json({ success: false, erro: 'Agendamento cancelado.' });
  if (slotJaPassou(ag.data, ag.hora))
    return res.status(400).json({ success: false, erro: 'Não é possível reagendar agendamento que já ocorreu.' });
  if (slotJaPassou(nova_data, nova_hora))
    return res.status(400).json({ success: false, erro: 'Novo horário já passou.' });
  if (db.horarioOcupado(nova_data, nova_hora, req.params.codigo))
    return res.status(409).json({ success: false, erro: 'Novo horário indisponível.', codigo: 'HORARIO_OCUPADO' });

  db.atualizarAgendamento(req.params.codigo, {
    data: nova_data, hora: nova_hora,
    status: 'aguardando_pagamento', pagamento_status: 'pendente',
  });

  console.log(`🔄 Reagendado: ${req.params.codigo} → ${nova_data} ${nova_hora}`);
  res.json({ success: true, mensagem: `Reagendado para ${nova_data} às ${nova_hora}.` });
});

// ─── PIX ─────────────────────────────────────────────────────────────────────
app.post('/api/pagamentos/pix', (req, res) => {
  const { codigo_agendamento } = req.body;
  if (!codigo_agendamento)
    return res.status(400).json({ success: false, erro: 'codigo_agendamento obrigatório.' });

  const ag = db.getAgendamentoByCodigo(codigo_agendamento);
  if (!ag) return res.status(404).json({ success: false, erro: 'Agendamento não encontrado.' });
  if (ag.pagamento_status === 'pago') return res.json({ success: true, ja_pago: true });

  const dados = pix.gerarDadosPix({
    valor:     ag.preco,
    descricao: `${ag.servico_nome || 'Servico'} ${ag.data} ${ag.hora}`,
    txid:      ag.codigo.replace(/[^a-zA-Z0-9]/g, ''),
  });

  db.atualizarAgendamento(ag.codigo, { pagamento_tipo: 'pix_proprio' });
  console.log(`✅ PIX gerado: ${ag.codigo} → R$ ${ag.preco}`);
  res.json({ success: true, ...dados });
});

app.get('/api/pagamentos/:codigo/status', (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });
  res.json({ success: true, status: ag.pagamento_status, status_agendamento: ag.status });
});

app.post('/api/pagamentos/:codigo/confirmar', async (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });

  db.atualizarAgendamento(req.params.codigo, { pagamento_status: 'pago', status: 'confirmado' });

  const agAtualizado = db.getAgendamentoByCodigo(req.params.codigo);
  email.enviarConfirmacaoCliente(agAtualizado).catch(err =>
    console.error('Erro e-mail cliente:', err.message)
  );

  console.log(`✅ Pagamento confirmado: ${req.params.codigo}`);
  res.json({ success: true });
});

// ─── PAINEL ADMIN (FIX 2) ────────────────────────────────────────────────────
// Todas as rotas /api/admin/* exigem chave de acesso

app.get('/api/admin/dashboard', adminAuth, (req, res) =>
  res.json({ success: true, data: db.getDashboard() }));

app.get('/api/admin/agendamentos', adminAuth, (req, res) => {
  const { data, status, pagamento_status } = req.query;
  res.json({ success: true, data: db.getAgendamentos({ data, status, pagamento_status }) });
});

// Confirmar pagamento pelo painel admin
app.post('/api/admin/agendamentos/:codigo/confirmar', adminAuth, async (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });

  db.atualizarAgendamento(req.params.codigo, { pagamento_status: 'pago', status: 'confirmado' });

  const agAtualizado = db.getAgendamentoByCodigo(req.params.codigo);
  email.enviarConfirmacaoCliente(agAtualizado).catch(err =>
    console.error('Erro e-mail cliente:', err.message)
  );

  res.json({ success: true });
});

// Cancelar pelo admin
app.patch('/api/admin/agendamentos/:codigo/cancelar', adminAuth, (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });
  db.atualizarAgendamento(req.params.codigo, { status: 'cancelado' });
  res.json({ success: true });
});

app.post('/api/admin/bloquear', adminAuth, (req, res) => {
  const { data, hora_inicio, motivo } = req.body;
  if (!data || !hora_inicio)
    return res.status(400).json({ success: false, erro: 'data e hora_inicio obrigatórios.' });
  db.bloquearHorario(data, hora_inicio, motivo);
  res.status(201).json({ success: true });
});

app.get('/api/admin/configuracoes', adminAuth, (req, res) =>
  res.json({ success: true, data: db.getConfig() }));

app.put('/api/admin/configuracoes', adminAuth, (req, res) => {
  db.setConfig(req.body);
  res.json({ success: true });
});

// FIX 2: Painel admin como página HTML protegida por chave
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/', (req, res) => {
  res.send('O backend da Blade & Steel está online! ⚔️');
});

app.listen(PORT, () => {
  console.log(`\n🪒  Blade & Steel → http://localhost:${PORT}`);
  console.log(`🔐  Admin: http://localhost:${PORT}/admin (key: ${process.env.ADMIN_KEY || 'bladesteel2026'})`);
  console.log(`💳  PIX Próprio: ✅ Chave configurada`);
  console.log(`📧  E-mail: ${process.env.EMAIL_USER ? '✅ ' + process.env.EMAIL_USER : '⚠️  Configure EMAIL_USER no .env'}`);
  console.log(`📁  Dados: backend/data/db.json\n`);
});