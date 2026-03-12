# 🪒 Blade & Steel — Barbearia Premium
### Integração Mercado Pago: PIX + Cartão de Crédito

---

## 🚀 Instalação em 3 passos

```bash
# 1. Instalar dependências
cd backend && npm install

# 2. Configurar credenciais
cp ../.env.example .env
# Edite .env com seus tokens do Mercado Pago

# 3. Iniciar
npm start  →  http://localhost:3001
```

---

## 🔑 Configurando o Mercado Pago

### Passo 1 — Obter credenciais
Acesse: **mercadopago.com.br/developers/panel/credentials**

| Chave | Onde vai | Visibilidade |
|---|---|---|
| `Access Token` | `.env` backend | 🔒 Privado — nunca expor |
| `Public Key` | `frontend/index.html` | ✅ Público por design |

### Passo 2 — Preencher o `.env`
```env
MP_ACCESS_TOKEN=TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MP_WEBHOOK_URL=https://seudominio.com/api/webhooks/mercadopago
MP_WEBHOOK_SECRET=chave_gerada_no_painel_mp
```

### Passo 3 — Colocar a Public Key no frontend
Em `frontend/index.html`, linha ~135:
```javascript
const MP_PUBLIC_KEY = 'TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';
```

### Passo 4 — Configurar Webhook no painel MP
1. Painel MP → **Configurações → Webhooks → Adicionar**
2. URL: `https://seudominio.com/api/webhooks/mercadopago`
3. Evento: ✅ **Pagamentos**
4. Copie a chave secreta gerada → coloque em `MP_WEBHOOK_SECRET`

> **Teste local com webhook:** use o [ngrok](https://ngrok.com)
> ```bash
> ngrok http 3001
> # Use: https://abc123.ngrok.io/api/webhooks/mercadopago
> ```

---

## 💳 Fluxo de Pagamento

### PIX
```
Cliente confirma → Backend cria agendamento
→ POST /api/pagamentos/pix → MP gera QR Code
→ QR exibido com timer 30min
→ Cliente paga no banco
→ MP dispara webhook → backend confirma automaticamente
→ Cliente clica "Verificar Pagamento" → Sucesso ✓
```

### Cartão de Crédito
```
Cliente confirma → Backend cria agendamento
→ Brick MP tokeniza cartão no browser (dados nunca passam pelo servidor)
→ Token enviado para POST /api/pagamentos/cartao
→ Backend processa com MP → resposta imediata
→ approved → confirmado | rejected → mensagem traduzida em pt-BR
```

---

## 🧪 Cartões de Teste (Sandbox)

| Número | CVV | Validade | Resultado |
|---|---|---|---|
| `5031 4332 1540 6351` | `123` | `11/25` | ✅ Aprovado |
| `4235 6477 2802 5682` | `123` | `11/25` | ✅ Aprovado |
| `3743 781877 55283`   | `1234`| `11/25` | ✅ Aprovado (Amex) |
| `5031 4332 1540 6351` | `123` | `11/24` | ❌ Data inválida |

Docs completos: mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards

---

## 📁 Estrutura

```
barbearia/
├── .env.example
├── README.md
├── backend/
│   ├── server.js          ← API (Express + SQLite + rotas MP)
│   ├── mercadopago.js     ← Módulo PIX, Cartão, Webhook
│   ├── package.json       ← inclui: mercadopago ^2.0
│   └── barbearia.db       ← Gerado automaticamente
└── frontend/
    └── index.html         ← Site + MP Brick (tokenização segura)
```

---

## 🔌 Endpoints de Pagamento

```
POST /api/pagamentos/pix
     { codigo_agendamento }
     → { qr_code, qr_code_base64, ticket_url, expiracao }

POST /api/pagamentos/cartao
     { codigo_agendamento, token, parcelas, cliente_cpf }
     → { status, mensagem }

GET  /api/pagamentos/:codigo/status
     → { status, pago_em }

POST /api/webhooks/mercadopago
     ← Disparado automaticamente pelo MP
```

---

## 🛡️ Segurança

- ✅ Dados do cartão **nunca passam pelo servidor** (tokenizados pelo Brick MP)
- ✅ Webhook valida assinatura HMAC-SHA256
- ✅ Access Token somente no backend via `.env`
- ⚠️ Adicione autenticação nas rotas `/api/admin/*` antes de ir a produção

---

## 📦 Stack

| Pacote | Uso |
|---|---|
| `express` | Servidor HTTP |
| `better-sqlite3` | Banco de dados |
| `mercadopago` | SDK oficial v2 |
| `cors` | Cross-Origin |
| `dotenv` | Variáveis de ambiente |

*Blade & Steel © 2026 — Powered by Mercado Pago ✦*
