/**
 * email.js — Envio de e-mails via Gmail (Nodemailer)
 * Dispara: confirmação para o cliente + notificação para o barbeiro
 */

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

function formatarData(dataStr) {
  const d = new Date(dataStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── E-MAIL PARA O CLIENTE ───────────────────────────────────────────────────
async function enviarConfirmacaoCliente(ag) {
  if (!ag.cliente_email) return;

  await transporter.sendMail({
    from: `"Blade & Steel ✦" <${process.env.EMAIL_USER}>`,
    to:   ag.cliente_email,
    subject: `✅ Agendamento Confirmado — ${ag.codigo}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0804;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0804;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1510;border:1px solid #2e2618;max-width:560px;width:100%;">
        
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a1510,#211c14);padding:40px;text-align:center;border-bottom:2px solid #c9a84c;">
          <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#c9a84c;margin-bottom:12px;">Barbearia Premium</div>
          <div style="font-size:32px;font-weight:900;color:#f0e6d0;letter-spacing:3px;text-transform:uppercase;">BLADE <span style="color:#c9a84c;font-style:italic">&amp;</span> STEEL</div>
          <div style="width:60px;height:1px;background:#c9a84c;margin:16px auto 0;"></div>
        </td></tr>

        <!-- Status -->
        <tr><td style="padding:32px 40px 16px;text-align:center;">
          <div style="display:inline-block;background:rgba(30,92,58,.2);border:1px solid #1e5c3a;padding:12px 28px;border-radius:2px;">
            <span style="color:#4ade80;font-size:13px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">✓ Pagamento Confirmado</span>
          </div>
          <p style="color:#a8956e;font-size:14px;margin:16px 0 0;line-height:1.7;">Olá, <strong style="color:#f0e6d0;">${ag.cliente_nome}</strong>! Seu agendamento está confirmado.</p>
        </td></tr>

        <!-- Código -->
        <tr><td style="padding:8px 40px 24px;text-align:center;">
          <div style="border:1px solid #c9a84c;display:inline-block;padding:12px 32px;">
            <div style="font-size:10px;letter-spacing:3px;color:#a8956e;text-transform:uppercase;margin-bottom:6px;">Código do Agendamento</div>
            <div style="font-size:26px;color:#c9a84c;font-weight:700;letter-spacing:4px;">${ag.codigo}</div>
          </div>
        </td></tr>

        <!-- Detalhes -->
        <tr><td style="padding:0 40px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2e2618;">
            <tr style="border-bottom:1px solid #2e2618;">
              <td style="padding:14px 20px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a8956e;width:40%;">Serviço</td>
              <td style="padding:14px 20px;font-size:13px;color:#f0e6d0;font-weight:600;">${ag.icone || '✂'} ${ag.servico_nome}</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;background:rgba(42,34,20,.4);">
              <td style="padding:14px 20px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a8956e;">Data</td>
              <td style="padding:14px 20px;font-size:13px;color:#f0e6d0;font-weight:600;">📅 ${formatarData(ag.data)}</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;">
              <td style="padding:14px 20px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a8956e;">Horário</td>
              <td style="padding:14px 20px;font-size:13px;color:#f0e6d0;font-weight:600;">🕐 ${ag.hora}</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;background:rgba(42,34,20,.4);">
              <td style="padding:14px 20px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a8956e;">Duração</td>
              <td style="padding:14px 20px;font-size:13px;color:#f0e6d0;font-weight:600;">⏱ ${ag.duracao} minutos</td>
            </tr>
            <tr>
              <td style="padding:14px 20px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#a8956e;">Total Pago</td>
              <td style="padding:14px 20px;font-size:20px;color:#c9a84c;font-weight:700;">R$ ${parseFloat(ag.preco).toFixed(2).replace('.',',')}</td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;text-align:center;border-top:1px solid #2e2618;">
          <p style="color:#7a6230;font-size:12px;margin:0;line-height:1.8;">
            Em caso de dúvidas, entre em contato conosco.<br>
            <span style="color:#c9a84c;">✦ Excellence in every cut ✦</span>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  console.log(`📧 E-mail confirmação enviado → ${ag.cliente_email}`);
}

// ─── E-MAIL PARA O BARBEIRO ──────────────────────────────────────────────────
async function enviarNotificacaoBarbeiro(ag) {
  const dest = process.env.EMAIL_NOTIF || process.env.EMAIL_USER;

  await transporter.sendMail({
    from: `"Blade & Steel Sistema" <${process.env.EMAIL_USER}>`,
    to:   dest,
    subject: `🆕 Novo Agendamento — ${ag.codigo} | ${ag.data} às ${ag.hora}`,
    html: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0a0804;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0804;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1510;border:1px solid #2e2618;max-width:560px;width:100%;">

        <tr><td style="padding:32px 40px;border-bottom:2px solid #c9a84c;text-align:center;">
          <div style="font-size:11px;letter-spacing:4px;color:#c9a84c;text-transform:uppercase;margin-bottom:8px;">Novo Agendamento Recebido</div>
          <div style="font-size:28px;font-weight:900;color:#f0e6d0;letter-spacing:2px;">BLADE <span style="color:#c9a84c">&amp;</span> STEEL</div>
        </td></tr>

        <tr><td style="padding:28px 40px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2e2618;">
            <tr style="background:rgba(201,168,76,.08);">
              <td colspan="2" style="padding:12px 20px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c9a84c;">Cliente</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;">
              <td style="padding:12px 20px;font-size:11px;color:#a8956e;width:35%;">Nome</td>
              <td style="padding:12px 20px;font-size:13px;color:#f0e6d0;font-weight:600;">${ag.cliente_nome}</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;background:rgba(42,34,20,.4);">
              <td style="padding:12px 20px;font-size:11px;color:#a8956e;">Telefone</td>
              <td style="padding:12px 20px;font-size:13px;color:#f0e6d0;">${ag.cliente_tel || '—'}</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;">
              <td style="padding:12px 20px;font-size:11px;color:#a8956e;">E-mail</td>
              <td style="padding:12px 20px;font-size:13px;color:#f0e6d0;">${ag.cliente_email || '—'}</td>
            </tr>

            <tr style="background:rgba(201,168,76,.08);">
              <td colspan="2" style="padding:12px 20px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#c9a84c;">Agendamento</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;">
              <td style="padding:12px 20px;font-size:11px;color:#a8956e;">Serviço</td>
              <td style="padding:12px 20px;font-size:13px;color:#f0e6d0;font-weight:600;">${ag.icone || '✂'} ${ag.servico_nome}</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;background:rgba(42,34,20,.4);">
              <td style="padding:12px 20px;font-size:11px;color:#a8956e;">Data</td>
              <td style="padding:12px 20px;font-size:13px;color:#f0e6d0;font-weight:600;">${formatarData(ag.data)}</td>
            </tr>
            <tr style="border-bottom:1px solid #2e2618;">
              <td style="padding:12px 20px;font-size:11px;color:#a8956e;">Horário</td>
              <td style="padding:12px 20px;font-size:18px;color:#c9a84c;font-weight:700;">${ag.hora}</td>
            </tr>
            <tr>
              <td style="padding:12px 20px;font-size:11px;color:#a8956e;">Valor</td>
              <td style="padding:12px 20px;font-size:18px;color:#c9a84c;font-weight:700;">R$ ${parseFloat(ag.preco).toFixed(2).replace('.',',')}</td>
            </tr>
          </table>

          <div style="margin-top:20px;padding:16px;background:rgba(201,168,76,.06);border:1px solid #2e2618;text-align:center;">
            <span style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a6230;">Código: </span>
            <span style="font-size:16px;color:#c9a84c;font-weight:700;letter-spacing:3px;">${ag.codigo}</span>
          </div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  console.log(`📧 Notificação barbeiro enviada → ${dest}`);
}

module.exports = { enviarConfirmacaoCliente, enviarNotificacaoBarbeiro };