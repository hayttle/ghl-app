# 📱 Integração GoHighLevel + Evolution API

## 🎯 Visão Geral

Sistema de integração bidirecional entre **GoHighLevel CRM** e **Evolution API** para sincronização automática de mensagens WhatsApp, contatos e conversas.

### ✨ Funcionalidades Principais

- **🔄 Sincronização Bidirecional**: WhatsApp ↔ GHL CRM
- **👤 Gestão Automática de Contatos**: Criação e busca automática
- **💬 Gestão de Conversas**: Criação e atualização automática
- **📨 Processamento de Mensagens**: Recebidas e enviadas
- **🛡️ Prevenção de Loops**: Sistema anti-repetição
- **📊 Monitoramento**: Status de integrações e sincronização
- **🔐 OAuth2 GHL**: Integração oficial com marketplace GoHighLevel
- **🆕 InstanceName Dinâmico**: Captura via rota intermediária e cookies
- **📱 Status de Mensagens**: Atualização automática para "delivered"
- **🗑️ Desinstalação Automática**: Via webhook GHL
- **🧹 Validação Robusta**: InstanceName obrigatório e validações de segurança

## 🏗️ Arquitetura

### Estrutura do Sistema

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │  Evolution API   │    │  GHL CRM        │
│                 │◄──►│                  │◄──►│                 │
│  (Cliente)      │    │  (Middleware)    │    │  (Sistema)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Webhook        │    │  Integration     │    │  Database       │
│  Evolution      │    │  Service         │    │  (PostgreSQL)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Componentes Principais

- **`IntegrationService`**: Orquestra a integração entre GHL e Evolution
- **`GHL`**: Gerencia autenticação e requisições para GoHighLevel
- **`EvolutionApiService`**: Gerencia comunicação com Evolution API
- **`Model`**: Gerencia persistência de dados no PostgreSQL

## 🚀 Instalação e Configuração

### Pré-requisitos

- Node.js 18+
- PostgreSQL 12+
- Conta GoHighLevel com permissões de API
- Instância Evolution API configurada

### 1. Clone e Instalação

```bash
git clone <repository-url>
cd ghl-app
npm install
```

### 2. Configuração de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# Configurações do Banco de Dados
DATABASE_URL=postgresql://usuario:senha@localhost:5432/ghl_integration

# Configurações GoHighLevel
GHL_APP_CLIENT_ID=seu_client_id
GHL_APP_CLIENT_SECRET=seu_client_secret
GHL_APP_REDIRECT_URI=http://localhost:3000/authorize-handler
GHL_API_DOMAIN=https://services.leadconnectorhq.com

# Configurações Evolution API
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_api_key

# Configurações do Servidor
PORT=3000
NODE_ENV=development
```

**⚠️ IMPORTANTE:** As seguintes variáveis de segurança **NÃO são mais necessárias**:
- ~~`INTERNAL_API_KEY`~~ - Substituída por validação de credenciais GHL
- ~~`GHL_WEBHOOK_SECRET`~~ - Substituída por validação de credenciais GHL
- ~~`EVOLUTION_WEBHOOK_SECRET`~~ - Substituída por validação de credenciais GHL
- ~~`ADMIN_API_KEY`~~ - Substituída por validação de credenciais GHL
- ~~`READONLY_API_KEY`~~ - Substituída por validação de credenciais GHL

### 3. Configuração do Banco de Dados

Execute o script de migração:

```bash
npm run db:migrate
```

### 4. Configuração GoHighLevel

1. **Acesse o [GoHighLevel Developer Portal](https://marketplace.leadconnectorhq.com/)**
2. **Crie uma nova aplicação**
3. **Configure as URLs de redirecionamento:**
   - **Redirect URI**: `http://localhost:3000/authorize-handler`
   - **Webhook URL**: `http://localhost:3000/webhook/ghl`
4. **Adicione os escopos necessários:**
   - `conversations.write`
   - `conversations.readonly`
   - `conversations/message.readonly`
   - `conversations/message.write`
   - `contacts.readonly`
   - `contacts.write`
   - `locations.readonly`
5. **⚠️ IMPORTANTE - Nova Segurança:**
   - **NÃO é necessário** configurar webhook secrets
   - **NÃO é necessário** configurar API keys
   - O sistema agora usa **validação automática de credenciais GHL**
   - As credenciais são capturadas automaticamente durante a instalação

### 5. Configuração Evolution API

1. Configure sua instância Evolution API
2. Configure o webhook para apontar para: `https://seu-dominio.com/webhook/evolution`
3. Certifique-se de que a instância está conectada

## 🔌 Endpoints da API

### Autenticação e Instalação



#### `GET /authorize/callback`
Callback para processar a autorização OAuth2.

**Parâmetros:**
- `code`: Código de autorização
- `state`: Estado da requisição

### Integração

#### `POST /integration/setup`
Configura uma nova integração entre GHL e Evolution API.

**Corpo da Requisição:**
```json
{
  "resourceId": "73NtQAAH2EvgoqRsx6qJ",
  "evolutionInstanceName": "backend_server"
}
```

**Resposta:**
```json
{
  "success": true,
  "message": "Integração configurada com sucesso",
  "data": {
    "instanceName": "backend_server",
    "resourceId": "73NtQAAH2EvgoqRsx6qJ"
  }
}
```

#### `POST /integration/sync-contacts`
Sincroniza contatos entre GHL e Evolution API.

**Corpo da Requisição:**
```json
{
  "resourceId": "73NtQAAH2EvgoqRsx6qJ"
}
```

#### `POST /integration/send-message`
Envia mensagem do GHL para WhatsApp via Evolution API.

**Corpo da Requisição:**
```json
{
  "resourceId": "73NtQAAH2EvgoqRsx6qJ",
  "contactId": "contact_id_aqui",
  "message": "Sua mensagem aqui"
}
```

#### `GET /integration/status`
Verifica o status de todas as integrações ativas.

**Resposta:**
```json
{
  "success": true,
  "message": "Status verificado para 1 integrações",
  "data": {
    "statusResults": [
      {
        "resourceId": "73NtQAAH2EvgoqRsx6qJ",
        "status": "active",
        "instanceName": "backend_server"
      }
    ]
  }
}
```

#### `DELETE /integration/uninstall/:resourceId`
Remove manualmente uma instalação do app.

**Parâmetros:**
- `resourceId`: ID da localização ou empresa

**Resposta:**
```json
{
  "success": true,
  "message": "App desinstalado com sucesso",
  "data": {
    "resourceId": "73NtQAAH2EvgoqRsx6qJ",
    "removedAt": "2025-08-19T17:54:34.442Z",
    "installationDetails": {
      "locationId": "73NtQAAH2EvgoqRsx6qJ",
      "companyId": null,
      "userType": "Location",
      "evolutionInstanceName": "backend_server"
    }
  }
}
```

#### `GET /integration/installations`
Lista todas as instalações ativas no sistema.

**Resposta:**
```json
{
  "success": true,
  "message": "2 instalações encontradas",
  "data": {
    "count": 2,
    "installations": [
      {
        "id": 1,
        "locationId": "73NtQAAH2EvgoqRsx6qJ",
        "companyId": null,
        "userType": "Location",
        "integrationStatus": "active",
        "evolutionInstanceName": "backend_server",
        "lastSyncAt": "2025-08-19T17:49:03.202Z",
        "createdAt": "2025-08-19T17:49:03.202Z",
        "updatedAt": "2025-08-19T17:49:03.202Z"
      }
    ]
  }
}
```

#### `PUT /integration/update-message-status/:resourceId/:messageId`

Atualiza o status de uma mensagem específica para "delivered" no GHL.

**Parâmetros:**
- `resourceId`: ID da subconta (location) ou empresa
- `messageId`: ID da mensagem a ser atualizada

**Payload:**
```json
{
  "status": "delivered"
}
```

**Headers:**
```
Version: 2021-04-15
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Status da mensagem atualizado para delivered",
  "data": {
    "status": "delivered"
  }
}
```

#### `GET /integration/update-message-status/:resourceId/:messageId`

**Mesma funcionalidade da rota PUT, mas via GET para facilitar testes.**

**Parâmetros:**
- `resourceId`: ID da subconta (location) ou empresa
- `messageId`: ID da mensagem a ser atualizada

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Status da mensagem atualizado para delivered",
  "data": {
    "status": "delivered"
  }
}
```

### Webhooks

#### `POST /webhook/ghl`
Recebe eventos do GoHighLevel (instalação, desinstalação, mensagens).

**Eventos Suportados:**
- `INSTALL`: Nova instalação da aplicação
- `UNINSTALL`: Desinstalação da aplicação
- `OutboundMessage`: Mensagem enviada do GHL (status atualizado automaticamente para "delivered")

#### `POST /webhook/evolution`
Recebe mensagens do WhatsApp via Evolution API.

**Estrutura do Webhook:**
```json
{
  "event": "messages.upsert",
  "instance": "backend_server",
  "data": {
    "key": {
      "remoteJid": "557388389770@s.whatsapp.net",
      "fromMe": false
    },
    "pushName": "Hayttle",
    "message": {
      "conversation": "Mensagem recebida"
    }
  }
}
```

### Utilitários

#### `GET /health`
Verifica a saúde do sistema.

#### `GET /config`
Exibe as configurações atuais do sistema.

#### `POST /test-evolution`
Testa a conectividade com Evolution API.

## 🔧 Uso da Integração

### 1. Configuração Inicial

```bash
# 1. Configure as variáveis de ambiente
# 2. Execute a migração do banco
npm run db:migrate

# 3. Inicie o servidor
npm run dev
```

### 2. Autorização GoHighLevel

```bash
# 1. Use a rota intermediária para capturar instanceName:
curl "http://localhost:3000/authorize-start?instanceName=backend_server"

# 2. O sistema redirecionará para o OAuth do GHL preservando o instanceName
# 3. Complete o fluxo OAuth2 no navegador
# 4. O sistema capturará o instanceName e salvará no banco durante a autorização
# 5. A instância Evolution será configurada automaticamente com o nome personalizado
```

### 3. Configuração da Integração

```bash
# Configure a integração com Evolution API
curl -X POST "http://localhost:3000/integration/setup" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "73NtQAAH2EvgoqRsx6qJ",
    "evolutionInstanceName": "backend_server"
  }'
```

### 4. Envio de Mensagem

```bash
# Envie uma mensagem do GHL para WhatsApp
curl -X POST "http://localhost:3000/integration/send-message" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceId": "73NtQAAH2EvgoqRsx6qJ",
    "contactId": "contact_id_aqui",
    "message": "Olá! Esta é uma mensagem de teste."
  }'
```

### 5. Verificação de Status

```bash
# Verifique o status das integrações
curl "http://localhost:3000/integration/status"
```

## 🔄 Fluxo de Funcionamento

### Autenticação e Instalação

#### `GET /authorize-start`
Rota intermediária para capturar `instanceName` antes do OAuth GHL.

**Parâmetros:**
- `instanceName` (obrigatório): Nome da instância Evolution API

**Exemplo:**
```bash
GET /authorize-start?instanceName=backend_server
```

**Resposta:**
- Redireciona para OAuth GHL preservando o `instanceName`
- Armazena `instanceName` em cookie temporário

### Instalação com InstanceName Personalizado

```
1. Painel Bubble chama: /authorize-start?instanceName=ZZZ
2. Sistema armazena instanceName em cookie e redireciona para OAuth GHL
3. GHL redireciona para /authorize-handler com code
4. Sistema recupera instanceName do cookie e salva credenciais no banco
5. Integração configurada com instância Evolution personalizada
```

**⚠️ IMPORTANTE:** O parâmetro `instanceName` é **OBRIGATÓRIO** na rota `/authorize-start`!

### Mensagem WhatsApp → GHL CRM

```
1. Cliente envia mensagem pelo WhatsApp
2. Evolution API detecta a mensagem
3. Webhook é enviado para /webhook/evolution
4. Sistema extrai pushName e número do telefone
5. Busca ou cria contato no GHL usando /contacts
6. Busca ou cria conversa usando /conversations/search/
7. Posta mensagem usando /conversations/messages/inbound
8. Mensagem aparece no lado esquerdo do GHL (cliente)
```

### Mensagem GHL CRM → WhatsApp

```
1. Usuário envia mensagem pelo GHL
2. Webhook /webhook/ghl recebe evento OutboundMessage
3. Sistema verifica se é mensagem de saída (não inbound)
4. Busca informações do contato no GHL
5. Envia mensagem via Evolution API
6. Mensagem é entregue no WhatsApp
7. ✅ Status da mensagem é atualizado para "delivered" no GHL
```

## 📊 Monitoramento e Status

### Verificação de Integrações

```bash
# Status geral
npm run integration:status

# Verificação de saúde
npm run health

# Logs em tempo real
npm run dev
```

## 🆕 **Funcionalidades Implementadas - Resumo**

### ✅ **Sistema de Autorização OAuth2**
- **Rota `/authorize-start`**: Captura `instanceName` antes do OAuth
- **Sistema de Cookies**: Preserva dados durante redirecionamentos
- **Validação Obrigatória**: `instanceName` é obrigatório para instalação
- **Integração Oficial GHL**: Usa marketplace oficial do GoHighLevel

### ✅ **Gestão de InstanceName Dinâmico**
- **Captura Personalizada**: Cada cliente pode ter sua instância Evolution
- **Armazenamento Seguro**: Via cookies temporários (5 minutos)
- **Fallback Inteligente**: Valor padrão se necessário
- **Validação Robusta**: Erro claro se `instanceName` não for fornecido

### ✅ **Sincronização Bidirecional**
- **WhatsApp → GHL**: Mensagens recebidas aparecem no lado esquerdo
- **GHL → WhatsApp**: Mensagens enviadas com status "delivered" automático
- **Prevenção de Loops**: Sistema anti-repetição implementado
- **Gestão Automática**: Contatos e conversas criados automaticamente

### ✅ **Webhooks e Automação**
- **Webhook GHL**: Instalação, desinstalação e mensagens
- **Webhook Evolution**: Mensagens recebidas do WhatsApp

## 🛡️ **Sistema de Segurança Simplificado**

### **🔐 Nova Abordagem de Segurança**

O sistema agora utiliza **validação de credenciais GHL** em vez de chaves de API complexas, tornando-o **mais simples e seguro**.

#### **Como Funciona:**

1. **Durante a Instalação**: O sistema captura e armazena automaticamente:
   - `client_id` do GHL
   - `client_secret` do GHL
   - `location_id` da subconta

2. **Durante as Requisições**: O cliente deve incluir nos headers:
   - `X-GHL-Client-ID`: Seu client_id do GHL
   - `X-GHL-Client-Secret`: Seu client_secret do GHL

3. **Validação**: O sistema compara as credenciais recebidas com as armazenadas no banco para aquele `location_id`

#### **Vantagens:**

- ✅ **Simplicidade**: Sem necessidade de configurar webhook secrets
- ✅ **Segurança**: Cada subconta tem suas próprias credenciais únicas
- ✅ **Isolamento**: Total separação entre diferentes instalações
- ✅ **Manutenção**: Sem necessidade de gerenciar múltiplas chaves de API

#### **Exemplo de Uso:**

```bash
# Enviar mensagem via API
curl -X POST "http://localhost:3000/integration/send-message" \
  -H "Content-Type: application/json" \
  -H "X-GHL-Client-ID: seu_client_id_aqui" \
  -H "X-GHL-Client-Secret: seu_client_secret_aqui" \
  -d '{
    "resourceId": "73NtQAAH2EvgoqRsx6qJ",
    "contactId": "qaFHmtsgftGT4pMQnq6R",
    "message": "Olá! Como posso ajudar?",
    "messageId": "msg_123"
  }'
```

#### **Rotas Protegidas:**

**🔒 Validação Completa (credenciais GHL):**
- `POST /integration/setup`
- `POST /integration/send-message`
- `POST /integration/sync-contacts`
- `DELETE /integration/uninstall/:resourceId`
- `PUT /integration/update-message-status/:resourceId/:messageId`
- `POST /send-message-evolution`
- `POST /decrypt-sso`
- `GET /example-api-call`
- `GET /example-api-call-location`

**🔓 Validação Simples (apenas instalação existe):**
- `GET /integration/status`
- `GET /integration/installations`
- `GET /test-evolution`
- **Desinstalação Automática**: Limpeza automática do banco
- **Status de Mensagens**: Atualização automática para "delivered"

### ✅ **Segurança e Validação**
- **Validação de LocationId**: Apenas instalações em subcontas
- **Tratamento de Erros**: Logs detalhados e mensagens claras
- **Middleware de Segurança**: Interceptadores para tokens e autenticação
- **Validação de Dados**: Verificação de parâmetros obrigatórios

## 🔧 **Troubleshooting e Solução de Problemas**

### ❌ **Erros Comuns e Soluções**

#### 1. **"instanceName é obrigatório"**
**Problema**: Erro durante autorização
**Solução**: 
- Use a rota `/authorize-start?instanceName=seu_nome`
- Não use diretamente a rota `/authorize-handler`

#### 2. **"App deve ser instalado em subconta (location)"**
**Problema**: Instalação em empresa principal
**Solução**:
- Desinstale o app da empresa
- Instale diretamente na subconta desejada

#### 3. **Mensagens aparecendo no lado errado**
**Problema**: Posicionamento incorreto no GHL
**Solução**:
- Sistema já corrigido automaticamente
- Mensagens recebidas aparecem à esquerda
- Mensagens enviadas aparecem à direita

#### 4. **Status de mensagem não atualiza para "delivered"**
**Problema**: Status permanece "pending"
**Solução**:
- Verifique se `messageId` está sendo passado
- Sistema atualiza automaticamente após envio via Evolution API

### 📝 **Logs Importantes**

O sistema gera logs detalhados para cada operação:

- 🔍 **Busca de contatos**: Parâmetros e resultados
- 📝 **Criação de contatos**: Dados do novo contato
- 🔍 **Busca de conversas**: ID da conversa encontrada
- 📤 **Postagem de mensagens**: Confirmação de sucesso
- ⚠️ **Erros**: Detalhes completos para debugging

## 🛡️ Segurança e Prevenção de Loops

### Prevenção de Loops Infinitos

- **Verificação de Direção**: Mensagens com `direction: 'inbound'` são ignoradas
- **Filtro de Eventos**: Apenas mensagens recebidas são processadas
- **Validação de Origem**: Sistema não re-processa suas próprias mensagens

### Segurança

- **OAuth2**: Autenticação segura com GoHighLevel
- **Validação de Credenciais GHL**: Sistema automático de validação por subconta
- **Tokens**: Refresh automático de tokens expirados
- **Validação**: Verificação de parâmetros e permissões
- **Logs**: Auditoria completa de todas as operações
- **Isolamento**: Cada subconta tem suas próprias credenciais únicas

## 🔧 Troubleshooting

### Problemas Comuns

#### 1. Erro 422 na Busca de Contatos
**Sintoma**: `Request failed with status code 422`
**Solução**: Verificar se está usando o parâmetro `query` (não `phone`)

#### 2. Mensagens Aparecem no Lado Errado
**Sintoma**: Mensagens do cliente aparecem à direita
**Solução**: Verificar se está usando `/conversations/messages/inbound` com `type: "SMS"`

#### 3. Loop Infinito de Mensagens
**Sintoma**: Mensagens sendo re-enviadas
**Solução**: Verificar se o webhook GHL está filtrando mensagens `inbound`

#### 4. Contato Não Encontrado
**Sintoma**: `Contact not found`
**Solução**: Verificar se o `conversationId` está sendo buscado dinamicamente

### Logs de Debug

```bash
# Ativar logs detalhados
DEBUG=* npm run dev

# Verificar configurações
curl "http://localhost:3000/config"

# Testar conectividade Evolution
curl "http://localhost:3000/test-evolution"
```

## 🔄 **Migração do Sistema Antigo**

### **Para Usuários Existentes:**

Se você já estava usando o sistema anterior com `INTERNAL_API_KEY`, `GHL_WEBHOOK_SECRET`, etc., **não é necessário fazer nada**:

1. **O sistema continua funcionando** normalmente
2. **As novas validações** são aplicadas automaticamente
3. **Suas instalações existentes** continuam ativas
4. **Os novos campos** (`client_id`, `client_secret`) são preenchidos automaticamente

### **O que Mudou:**

- ✅ **Segurança mais simples**: Sem necessidade de configurar webhook secrets
- ✅ **Validação automática**: Credenciais GHL são capturadas durante instalação
- ✅ **Isolamento total**: Cada subconta tem suas próprias credenciais
- ✅ **Manutenção reduzida**: Menos variáveis de ambiente para gerenciar

### **Para Novas Instalações:**

- **NÃO é necessário** configurar webhook secrets no marketplace GHL
- **NÃO é necessário** configurar `INTERNAL_API_KEY` no `.env`
- **O sistema captura automaticamente** as credenciais necessárias

---

## 🚀 **Exemplos Práticos de Uso**

### **Implementação no Bubble.io**

```javascript
// 1. Botão de instalação no painel Bubble
const instanceName = 'instancia_cliente_123';
const authUrl = `https://seu-servidor.ngrok-free.app/authorize-start?instanceName=${instanceName}`;

// 2. Abrir URL de autorização
window.open(authUrl, '_blank');

// 3. Usuário completa OAuth no GHL
// 4. Sistema salva automaticamente o instanceName
// 5. Integração configurada e funcionando!
```

### **Teste Manual da Integração**

```bash
# 1. Teste de autorização
curl "http://localhost:3000/authorize-start?instanceName=teste_manual"

# 2. Verificar instalações
curl "http://localhost:3000/integration/installations"

# 3. Testar envio de mensagem
curl -X POST "http://localhost:3000/integration/send-message" \
  -H "Content-Type: application/json" \
  -H "X-GHL-Client-ID: seu_client_id_aqui" \
  -H "X-GHL-Client-Secret: seu_client_secret_aqui" \
  -d '{
    "resourceId": "73NtQAAH2EvgoqRsx6qJ",
    "contactId": "contact_id_aqui",
    "message": "Teste de integração funcionando!",
    "messageId": "msg_123"
  }'

# 4. Verificar status
curl "http://localhost:3000/integration/status"
```

### **Monitoramento em Produção**

```bash
# Logs em tempo real
npm run dev

# Verificar saúde do sistema
curl "http://localhost:3000/health"

# Status das integrações
curl "http://localhost:3000/integration/status"
```

## 📚 Referências da API

### GoHighLevel API

- **Base URL**: `https://services.leadconnectorhq.com`
- **Versões por Endpoint**:
  - `/contacts`: `2021-07-28`
  - `/conversations/search/`: `2021-04-15`
  - `/conversations/messages/inbound`: `2021-04-15`
  - `/conversations/messages/{messageId}/status`: `2021-04-15`

### Evolution API

- **Webhook**: `POST /webhook/evolution`
- **Eventos**: `messages.upsert`
- **Campos Importantes**: `pushName`, `remoteJid`, `conversation`

## 🚀 Próximos Passos

### Melhorias Sugeridas

1. **📊 Dashboard Web**: Interface para monitoramento
2. **🔔 Notificações**: Alertas para falhas de integração
3. **📈 Métricas**: Estatísticas de mensagens e contatos
4. **🔄 Sincronização em Lote**: Processamento de múltiplos contatos
5. **📱 Múltiplas Instâncias**: Suporte a várias instâncias Evolution

### Escalabilidade

- **Cache Redis**: Para tokens e dados frequentemente acessados
- **Queue System**: Para processamento assíncrono de mensagens
- **Load Balancer**: Para múltiplas instâncias do sistema
- **Monitoring**: APM e alertas automáticos

---

## 📞 Suporte

Para dúvidas ou problemas:

1. **Verifique os logs** do sistema
2. **Consulte esta documentação**
3. **Teste os endpoints** de diagnóstico
4. **Verifique as configurações** de ambiente

---

**Versão**: 2.0.0  
**Última Atualização**: Agosto 2025  
**Status**: ✅ Produção
