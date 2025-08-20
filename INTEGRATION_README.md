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
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ghl_integration
DB_USER=seu_usuario
DB_PASSWORD=sua_senha

# Configurações GoHighLevel
GHL_CLIENT_ID=seu_client_id
GHL_CLIENT_SECRET=seu_client_secret
GHL_REDIRECT_URI=http://localhost:3000/authorize

# Configurações Evolution API
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_api_key
EVOLUTION_INSTANCE_NAME=instancia_padrao

# Configurações do Servidor
PORT=3000
NODE_ENV=development
```

### 3. Configuração do Banco de Dados

Execute o script de migração:

```bash
npm run db:migrate
```

### 4. Configuração GoHighLevel

1. Acesse o [GoHighLevel Developer Portal](https://marketplace.gohighlevel.com/)
2. Crie uma nova aplicação
3. Configure as URLs de redirecionamento
4. Adicione os escopos necessários:
   - `conversations.write`
   - `conversations.readonly`
   - `conversations/message.readonly`
   - `conversations/message.write`
   - `contacts.readonly`
   - `contacts.write`

### 5. Configuração Evolution API

1. Configure sua instância Evolution API
2. Configure o webhook para apontar para: `https://seu-dominio.com/webhook/evolution`
3. Certifique-se de que a instância está conectada

## 🔌 Endpoints da API

### Autenticação e Instalação

#### `GET /authorize`
Inicia o fluxo de autorização OAuth2 com GoHighLevel.

**Parâmetros:**
- `companyId` (opcional): ID da empresa
- `locationId` (opcional): ID da localização

**Resposta:**
```json
{
  "success": true,
  "message": "Redirecionando para autorização GoHighLevel",
  "authUrl": "https://marketplace.gohighlevel.com/..."
}
```

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
# Acesse a URL de autorização
curl "http://localhost:3000/authorize?locationId=73NtQAAH2EvgoqRsx6qJ"

# Complete o fluxo OAuth2 no navegador
# O sistema salvará automaticamente as credenciais
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

### Logs Importantes

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
- **Tokens**: Refresh automático de tokens expirados
- **Validação**: Verificação de parâmetros e permissões
- **Logs**: Auditoria completa de todas as operações

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
