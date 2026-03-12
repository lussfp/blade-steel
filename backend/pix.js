/**
 * pix.js — Gerador de PIX Estático (BR Code / EMV)
 * Sem API externa, sem homologação, padrão BACEN
 */

function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++)
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  }
  
  function f(id, valor) {
    return `${id}${String(valor.length).padStart(2, '0')}${valor}`;
  }
  
  function removerAcentos(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '');
  }
  
  /**
   * Gera payload PIX BR Code (QR Code estático)
   */
  function gerarPixPayload({ chave, valor, nome, cidade, txid = 'BLADESTEEL', descricao = '' }) {
    const nomeLimpo   = removerAcentos(nome).slice(0, 25).toUpperCase();
    const cidadeLimpa = removerAcentos(cidade).slice(0, 15).toUpperCase();
    const txidLimpo   = txid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'BLADESTEEL';
    const valorStr    = parseFloat(valor).toFixed(2);
  
    // Campo 26 — Merchant Account Info
    const gui  = f('00', 'BR.GOV.BCB.PIX');
    const pChave = f('01', chave);
    const pDesc  = descricao ? f('02', descricao.slice(0, 72)) : '';
    const mai  = f('26', gui + pChave + pDesc);
  
    // Monta sem CRC
    const payload =
      f('00', '01')       +  // Payload Format Indicator
      f('01', '12')       +  // Point of Initiation (12 = reutilizável)
      mai                 +  // Merchant Account Info
      f('52', '0000')     +  // Merchant Category Code
      f('53', '986')      +  // Transaction Currency (BRL)
      f('54', valorStr)   +  // Transaction Amount
      f('58', 'BR')       +  // Country Code
      f('59', nomeLimpo)  +  // Merchant Name
      f('60', cidadeLimpa)+  // Merchant City
      f('62', f('05', txidLimpo)) + // Additional Data
      '6304';                // CRC placeholder
  
    return payload + crc16(payload);
  }
  
  // ─── CONFIGURAÇÃO DA BARBEARIA ────────────────────────────────────────────────
  const CONFIG = {
    chave_telefone:  '+5514998016347',
    chave_aleatoria: '78ce6fe2-6efc-4829-9996-b45e8948954b',
    nome:            'LUIS GUSTAVO MAGOSSO',
    cidade:          'SALTO GRANDE',
  };
  
  /**
   * Gera os dados de pagamento PIX para um agendamento
   */
  function gerarDadosPix({ valor, descricao, txid }) {
    const payloadTelefone  = gerarPixPayload({ chave: CONFIG.chave_telefone,  valor, nome: CONFIG.nome, cidade: CONFIG.cidade, txid, descricao });
    const payloadAleatoria = gerarPixPayload({ chave: CONFIG.chave_aleatoria, valor, nome: CONFIG.nome, cidade: CONFIG.cidade, txid, descricao });
  
    return {
      // QR Code (chave telefone)
      qr_payload:      payloadTelefone,
      // Chave aleatória para copia e cola
      chave_aleatoria: CONFIG.chave_aleatoria,
      // Chave telefone formatada para exibição
      chave_telefone:  '(14) 99801-6347',
      // Nome e valor
      nome_recebedor:  CONFIG.nome,
      valor:           parseFloat(valor).toFixed(2),
    };
  }
  
  module.exports = { gerarDadosPix };