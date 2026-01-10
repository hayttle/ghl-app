# Comportamento do Evolution API com Mensagens FromMe

## 🔍 Questão Crítica

**Pergunta:** O Evolution API quando recebe uma mensagem vinda do aparelho (fromMe=true), ele envia automaticamente para o outro aparelho, mesmo estando com o webhook configurado para enviar para o app?

## ✅ Resposta

**NÃO.** O Evolution API **NÃO envia automaticamente** mensagens when detecta fromMe=true. O comportamento é:

### Comportamento Real do Evolution API

1. **Mensagem já foi enviada pelo WhatsApp:**
   - Quando uma mensagem fromMe=true é detectada, ela **JÁ FOI ENVIADA** pelo próprio WhatsApp
   - O WhatsApp **já entregou** a mensagem ao destinatário diretamente
   - O Evolution API apenas **detecta e notifica** via webhook

2. **O Evolution API apenas NOTIFICA:**
   - Quando detecta uma mensagem fromMe=true, o Evolution API:
     - ✅ Detecta a mensagem
     - ✅ Dispara webhook para o app (`/webhook/evolution`)
     - ❌ **NÃO envia automaticamente** para o destinatário (já foi enviado pelo WhatsApp)

3. **O webhook é apenas uma NOTIFICAÇÃO:**
   - O webhook Evolution informa ao app que uma mensagem foi enviada
   - O app deve apenas **sincronizar no GHL**, não enviar novamente

## ⚠️ Problema de Duplicação Identificado

O problema de duplicação não vem do Evolution API enviando automaticamente, mas sim do **fluxo de sincronização**:

### Fluxo Atual (COM Duplicação)

```
1. Mensagem fromMe enviada pelo WhatsApp
   ↓ (já foi entregue ao destinatário pelo WhatsApp)
   
2. Evolution API detecta e dispara webhook
   POST /webhook/evolution (fromMe=true)
   ↓
   
3. App recebe webhook Evolution
   ↓
4. App cria mensagem no GHL via POST /conversations/messages
   ↓
   
5. GHL vê mensagem criada via API
   ↓
6. GHL dispara webhook OutboundMessage
   POST /webhook/ghl (OutboundMessage)
   ↓
   
7. App recebe webhook GHL
   ↓
8. App tenta enviar via Evolution API ❌ (DUPLICAÇÃO!)
   POST /message/sendText/{instance}
```

### Fluxo Correto (SEM Duplicação)

```
1. Mensagem fromMe enviada pelo WhatsApp
   ↓ (já foi entregue ao destinatário pelo WhatsApp)
   
2. Evolution API detecta e dispara webhook
   POST /webhook/evolution (fromMe=true)
   ↓
   
3. App recebe webhook Evolution
   ✅ Marca no cache: fromme_{telefone}_{hash}
   ↓
4. App cria mensagem no GHL via POST /conversations/messages
   (apenas para sincronizar no CRM)
   ↓
   
5. GHL vê mensagem criada via API
   ↓
6. GHL dispara webhook OutboundMessage
   POST /webhook/ghl (OutboundMessage)
   ↓
   
7. App recebe webhook GHL
   ✅ Verifica cache: fromme_{telefone}_{hash}
   ✅ ENCONTRA no cache → IGNORA (evita duplicação)
   ❌ NÃO envia via Evolution API
```

## 🔧 Solução Implementada

### 1. Marcação no Cache (Webhook Evolution)

Quando recebe mensagem fromMe=true, o app:
- ✅ Marca no cache ANTES de criar no GHL
- ✅ Usa chave: `fromme_{telefone_normalizado}_{hash_mensagem}`
- ✅ Não inclui timestamp para permitir verificação independente do tempo

### 2. Verificação no Cache (Webhook GHL)

Quando recebe webhook OutboundMessage do GHL, o app:
- ✅ Verifica se a mensagem está no cache
- ✅ Se encontrar, IGNORA e não envia via Evolution API
- ✅ Loga detalhes para debug

### 3. Verificação Adicional de Segurança

- ✅ Se mensagem criada há menos de 10 segundos e não está no cache
- ✅ Verifica se há mensagens recentes para o mesmo telefone
- ✅ Se encontrar, ignora para evitar race conditions

## 📊 Configuração do Evolution API

O Evolution API está configurado para:
- ✅ Receber webhooks (`webhookByEvents: false`)
- ✅ Notificar eventos `messages.upsert`
- ❌ **NÃO** enviar mensagens automaticamente

A configuração está em `src/evolution-api.ts`:

```typescript
webhook: process.env.EVOLUTION_WEBHOOK_URL || '',
webhookByEvents: false,  // Notifica todos os eventos, não apenas por tipo
webhookBase64: false     // Envia JSON, não Base64
```

## ✅ Conclusão

**O Evolution API NÃO envia automaticamente mensagens fromMe.** Ele apenas:
1. Detecta que uma mensagem foi enviada pelo WhatsApp
2. Notifica o app via webhook
3. O app sincroniza no GHL (e isso está correto)

**A duplicação ocorre porque:**
- O GHL vê a mensagem criada via API
- Dispara webhook OutboundMessage
- O app (antes da correção) tentava enviar novamente via Evolution API

**Com a correção implementada:**
- ✅ App marca no cache antes de criar no GHL
- ✅ App verifica cache quando recebe webhook GHL
- ✅ Se encontrar, ignora e não envia novamente
- ✅ Elimina a duplicação

