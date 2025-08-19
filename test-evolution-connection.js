// Script de teste para verificar conectividade com Evolution API
const axios = require('axios');

// Configurações (ajuste conforme necessário)
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const INSTANCE_NAME = process.env.EVOLUTION_INSTANCE_NAME || 'ghl_integration';

console.log('=== TESTE DE CONECTIVIDADE EVOLUTION API ===');
console.log('URL:', EVOLUTION_API_URL);
console.log('Instance:', INSTANCE_NAME);
console.log('API Key configurada:', !!EVOLUTION_API_KEY);
console.log('');

async function testConnection() {
  try {
    // Teste 1: Verificar se a API está respondendo
    console.log('1. Testando conectividade básica...');
    const response = await axios.get(`${EVOLUTION_API_URL}/instance/connectionState/${INSTANCE_NAME}`, {
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ API respondeu:', response.status);
    console.log('Dados:', response.data);
    
    // Teste 2: Verificar status da instância
    if (response.data && response.data.state) {
      console.log(`✅ Status da instância: ${response.data.state}`);
    } else {
      console.log('⚠️ Status da instância não encontrado');
    }
    
  } catch (error) {
    console.log('❌ Erro na conexão:');
    
    if (error.code === 'ECONNREFUSED') {
      console.log('   - Servidor não está rodando ou porta incorreta');
    } else if (error.code === 'ENOTFOUND') {
      console.log('   - URL não encontrada');
    } else if (error.response) {
      console.log('   - Status:', error.response.status);
      console.log('   - Dados:', error.response.data);
    } else {
      console.log('   - Erro:', error.message);
    }
  }
}

async function testSendMessage() {
  try {
    console.log('\n2. Testando envio de mensagem...');
    
    const testPhone = '+5511999999999'; // Número de teste
    const testMessage = 'Teste de integração GHL + Evolution API';
    
    const response = await axios.post(`${EVOLUTION_API_URL}/message/sendText/${INSTANCE_NAME}`, {
      number: testPhone.replace('+', '') + '@s.whatsapp.net',
      text: testMessage
    }, {
      headers: {
        'apikey': EVOLUTION_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Mensagem enviada com sucesso:', response.status);
    console.log('Resposta:', response.data);
    
  } catch (error) {
    console.log('❌ Erro ao enviar mensagem:');
    
    if (error.response) {
      console.log('   - Status:', error.response.status);
      console.log('   - Dados:', error.response.data);
    } else {
      console.log('   - Erro:', error.message);
    }
  }
}

async function runTests() {
  await testConnection();
  await testSendMessage();
  
  console.log('\n=== FIM DOS TESTES ===');
  console.log('\nPara executar este teste:');
  console.log('1. Configure as variáveis de ambiente EVOLUTION_API_URL e EVOLUTION_API_KEY');
  console.log('2. Execute: node test-evolution-connection.js');
}

runTests().catch(console.error);




