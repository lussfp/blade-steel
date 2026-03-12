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
  methods: ['GET', 'POST', 'PATCH', 'PUT'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

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
    disponivel: !db.horarioOcupado(data, hora) && !bloqueados.has(hora),
  }));
  res.json({ success: true, data: { aberto: true, data, slots } });
});

app.get('/api/disponibilidade/:data/:hora/verificar', (req, res) => {
  const { data, hora } = req.params;
  const ocupado   = db.horarioOcupado(data, hora);
  const bloqueado = db.getHorariosBloqueados(data).includes(hora);
  if (ocupado || bloqueado) {
    const cfg   = db.getConfig();
    const todos = gerarSlots(cfg);
    const bloqs = new Set(db.getHorariosBloqueados(data));
    const idx   = todos.indexOf(hora);
    let sugestao = null;
    for (let i = idx + 1; i < todos.length; i++) {
      if (!db.horarioOcupado(data, todos[i]) && !bloqs.has(todos[i])) { sugestao = todos[i]; break; }
    }
    if (!sugestao) for (let i = idx - 1; i >= 0; i--) {
      if (!db.horarioOcupado(data, todos[i]) && !bloqs.has(todos[i])) { sugestao = todos[i]; break; }
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

  // Notifica barbeiro imediatamente
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

app.patch('/api/agendamentos/:codigo/cancelar', (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });
  if (ag.status === 'cancelado') return res.status(400).json({ success: false, erro: 'Já cancelado.' });
  db.atualizarAgendamento(req.params.codigo, { status: 'cancelado' });
  res.json({ success: true });
});

// ─── PIX PRÓPRIO ─────────────────────────────────────────────────────────────
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

// ─── STATUS ──────────────────────────────────────────────────────────────────
app.get('/api/pagamentos/:codigo/status', (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });
  res.json({ success: true, status: ag.pagamento_status, status_agendamento: ag.status });
});

// ─── CONFIRMAR PAGAMENTO (barbeiro confirma manualmente) ──────────────────────
app.post('/api/pagamentos/:codigo/confirmar', async (req, res) => {
  const ag = db.getAgendamentoByCodigo(req.params.codigo);
  if (!ag) return res.status(404).json({ success: false, erro: 'Não encontrado.' });

  db.atualizarAgendamento(req.params.codigo, {
    pagamento_status: 'pago',
    status: 'confirmado',
  });

  // Envia e-mail de confirmação para o cliente
  const agAtualizado = db.getAgendamentoByCodigo(req.params.codigo);
  email.enviarConfirmacaoCliente(agAtualizado).catch(err =>
    console.error('Erro e-mail cliente:', err.message)
  );

  console.log(`✅ Pagamento confirmado: ${req.params.codigo}`);
  res.json({ success: true });
});

// ─── ADMIN ────────────────────────────────────────────────────────────────────
app.get('/api/admin/dashboard', (req, res) =>
  res.json({ success: true, data: db.getDashboard() }));

app.get('/api/admin/agendamentos', (req, res) => {
  const { data, status, pagamento_status } = req.query;
  res.json({ success: true, data: db.getAgendamentos({ data, status, pagamento_status }) });
});

app.post('/api/admin/bloquear', (req, res) => {
  const { data, hora_inicio, motivo } = req.body;
  if (!data || !hora_inicio)
    return res.status(400).json({ success: false, erro: 'data e hora_inicio obrigatórios.' });
  db.bloquearHorario(data, hora_inicio, motivo);
  res.status(201).json({ success: true });
});

app.get('/api/admin/configuracoes', (req, res) =>
  res.json({ success: true, data: db.getConfig() }));

app.put('/api/admin/configuracoes', (req, res) => {
  db.setConfig(req.body);
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.send('O backend da Blade & Steel está online! ⚔️');
});

app.listen(PORT, () => {
  console.log(`\n🪒  Blade & Steel → http://localhost:${PORT}`);
  console.log(`💳  PIX Próprio: ✅ Chave configurada`);
  console.log(`📧  E-mail: ${process.env.EMAIL_USER ? '✅ ' + process.env.EMAIL_USER : '⚠️  Configure EMAIL_USER no .env'}`);
  console.log(`📁  Dados: backend/data/db.json\n`);
});