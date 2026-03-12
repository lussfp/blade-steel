const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || 'SEM_TOKEN',
  options: { timeout: 10000 },
});

const preference = new Preference(client);
const payment    = new Payment(client);

/**
 * Cria uma Preference (Checkout Pro)
 * Retorna URL para redirecionar o cliente
 */
async function criarPreference({ valor, descricao, codigoAgendamento, clienteEmail }) {
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

  const result = await preference.create({ body: {
    items: [{
      title:      descricao || 'Blade & Steel — Agendamento',
      quantity:   1,
      unit_price: parseFloat(valor),
      currency_id: 'BRL',
    }],
    payer: {
      email: clienteEmail || 'cliente@blade-steel.com.br',
    },
    external_reference: codigoAgendamento,
    back_urls: {
      success: `${BASE_URL}/pagamento/sucesso?codigo=${codigoAgendamento}`,
      failure: `${BASE_URL}/pagamento/falha?codigo=${codigoAgendamento}`,
      pending: `${BASE_URL}/pagamento/pendente?codigo=${codigoAgendamento}`,
    },
    auto_return:        'approved',
    notification_url:   process.env.MP_WEBHOOK_URL,
    statement_descriptor: 'BLADE E STEEL',
    payment_methods: {
      excluded_payment_types: [], // aceita tudo: PIX, cartão, boleto
      installments: 3,            // até 3x no cartão
    },
  }});

  return {
    preference_id: result.id,
    url_checkout:  result.init_point,        // produção
    url_sandbox:   result.sandbox_init_point, // testes
  };
}

async function consultarPagamento(id) {
  const result = await payment.get({ id });
  return {
    id:         result.id,
    status:     result.status,
    referencia: result.external_reference,
    pago_em:    result.date_approved,
  };
}

module.exports = { criarPreference, consultarPagamento };
