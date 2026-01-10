# Pontos Onde Mensagens São Enviadas para Evolution API

## 📍 Análise Completa

### 1. **Webhook GHL - OutboundMessage** (src/index.ts:860)

**Quando é chamado:**
- Quando o GHL dispara um webhook `OutboundMessage`
- Geralmente quando uma mensagem é criada no GHL via API ou UI

**Função:** `sendMessageToWhatsApp(phoneNumber, message, locationId, messageId)`

**Verificação implementada:**
- ✅ Verifica cache de deduplicação `fromme_{telefone}_{hash}`
- ✅ Se encontrar no cache, **BLOQUEIA** envio para Evolution API
- ✅ Verifica mensagens recentes (<30s) para o mesmo telefone
- ✅ Se encontrar, **BLOQUEIA** envio para Evolution API

**Status:** ✅ BLOQUEADO para mensagens fromMe

---

### 2. **Rota /integration/send-message** (src/index.ts:372)

**Quando é chamado:**
- Quando é feita uma requisição POST para `/integration/send-message`
- Geralmente usado para enviar mensagens do GHL UI para WhatsApp

**Função:** `sendMessageToWhatsApp(resourceId, contactId, message, messageId)`

**Verificação:**
- ❌ **NÃO tem verificação de fromMe** - sempre envia para Evolution API
- ✅ Isso está correto - esta rota é para mensagens do GHL UI, não fromMe

**Status:** ✅ OK - esta rota não processa mensagens fromMe

---

### 3. **Rota /send-message-evolution** (src/index.ts:1642)

**Quando é chamado:**
- Rota legada/compatibilidade para envio direto de mensagens
- Requisição POST para `/send-message-evolution`

**Função:** `sendMessageToWhatsApp(locationId, contactId, message, messageId)`

**Verificação:**
- ❌ **NÃO tem verificação de fromMe** - sempre envia para Evolution API
- ✅ Isso está correto - esta rota é para envio manual, não fromMe

**Status:** ✅ OK - esta rota não processa mensagens fromMe

---

### 4. **Webhook Evolution - FromMe** (src/index.ts:1458)

**Quando é chamado:**
- Quando Evolution API detecta mensagem fromMe=true
- Webhook `POST /webhook/evolution` com `event: messages.upsert`

**Função:** `processOutboundMessageFromWhatsApp(instanceName, phoneNumber, message)`

**O que faz:**
- ✅ **APENAS cria mensagem no GHL** via `POST /conversations/messages`
- ❌ **NÃO envia para Evolution API** - mensagem já foi enviada pelo WhatsApp
- ✅ Marca no cache: `fromme_{telefone}_{hash}` ANTES de criar no GHL

**Status:** ✅ CORRETO - não envia para Evolution API, apenas sincroniza no GHL

---

## 🔍 Fluxo Completo de Mensagem FromMe

```
1. Mensagem fromMe enviada pelo WhatsApp
   ↓ (já foi entregue ao destinatário pelo WhatsApp)
   
2. Evolution API detecta e dispara webhook
   POST /webhook/evolution (fromMe=true, event: messages.upsert)
   ↓
   
3. Webhook Evolution recebe (src/index.ts:1187)
   ✅ Detecta fromMe=true
   ✅ Marca no cache: fromme_{telefone}_{hash} (ANTES de criar)
   ✅ Chama processOutboundMessageFromWhatsApp()
   ↓
   
4. processOutboundMessageFromWhatsApp() (src/index.ts:960)
   ✅ Busca contato no GHL
   ✅ Cria mensagem no GHL via POST /conversations/messages
   ❌ NÃO envia para Evolution API (correto!)
   ↓
   
5. GHL vê mensagem criada via API
   ↓
6. GHL dispara webhook OutboundMessage
   POST /webhook/ghl (OutboundMessage)
   ↓
   
7. Webhook GHL recebe (src/index.ts:647)
   ✅ Verifica cache: fromme_{telefone}_{hash}
   ✅ Se encontrar, BLOQUEIA envio para Evolution API
   ✅ Se mensagem <30s e telefone similar, BLOQUEIA envio
   ❌ NÃO envia para Evolution API (bloqueado!)
```

---

## ⚠️ Problema Identificado

A verificação no webhook GHL pode não estar funcionando corretamente devido a:

1. **Timing/race condition:**
   - Cache pode não estar sendo preenchido antes do webhook GHL chegar
   - Webhook GHL pode chegar antes da marcação no cache

2. **Normalização inconsistente:**
   - Telefone ou hash podem estar diferentes entre webhooks
   - Formatação pode estar inconsistente

3. **Verificação insuficiente:**
   - Verificação atual pode estar muito restritiva ou muito permissiva

---

## ✅ Solução Implementada

### Correções Aplicadas:

1. **Chave de deduplicação sem timestamp:**
   - Antes: `fromme_{telefone}_{hash}_{timestamp}`
   - Agora: `fromme_{telefone}_{hash}` (sem timestamp)

2. **Marcação no cache ANTES de criar no GHL:**
   - Garante que a chave já está no cache quando o webhook GHL chegar

3. **Verificação sempre ativa no webhook GHL:**
   - Não apenas mensagens recentes - sempre verifica o cache

4. **Verificação adicional por telefone:**
   - Se mensagem <30s e há mensagens fromMe recentes para o mesmo telefone
   - Bloqueia para evitar race conditions

5. **Logs detalhados:**
   - Adicionados logs extensivos para debug

---

## 📊 Verificação Final

Para garantir que mensagens fromMe não são enviadas para Evolution API:

1. ✅ Webhook Evolution (fromMe=true) → NÃO envia para Evolution API ✅
2. ✅ Webhook GHL (OutboundMessage) → Verifica cache e BLOQUEIA se fromMe ✅
3. ✅ Rota /integration/send-message → OK (não processa fromMe) ✅
4. ✅ Rota /send-message-evolution → OK (não processa fromMe) ✅

**Status:** ✅ Correção implementada - mensagens fromMe não devem mais ser enviadas para Evolution API

