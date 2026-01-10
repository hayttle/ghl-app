# Fluxo de Criação de Mensagem FromMe e Atualização de Status no GHL

## Problema Identificado

Ao tentar criar mensagem fromMe e atualizar status no n8n, ocorre erro:
```
"You don't have access to the conversationProvider with id: 68a1f3cb0547607a9d820805"
```

## Requisições e Payloads Corretos

### 1. Criar Mensagem FromMe (POST)

**Endpoint:**
```
POST https://services.leadconnectorhq.com/conversations/messages
```

**Headers Obrigatórios:**
```
Accept: application/json
Content-Type: application/json
Authorization: Bearer {accessToken}
Version: 2021-04-15
```

**Body/Payload:**
```json
{
  "type": "Custom",
  "contactId": "{contactId}",
  "message": "{mensagem}",
  "conversationProviderId": "{conversationProviderId}"
}
```

**Exemplo para n8n (JSON Body):**
```json
{
  "type": "Custom",
  "message": "{{ $('Upload file audio to GHL1').item.json.message }}",
  "contactId": "{{ $json.conversations[0].contactId }}",
  "conversationProviderId": "{{ $('Get a row').item.json.conversation_provider_id }}"
}
```

**Resposta Esperada:**
```json
{
  "id": "messageId-aqui",
  "type": "Custom",
  "contactId": "...",
  "conversationProviderId": "...",
  ...
}
```

**Importante:** O `messageId` está em `response.data.id`

---

### 2. Atualizar Status da Mensagem (PUT)

**Endpoint:**
```
PUT https://services.leadconnectorhq.com/conversations/messages/{messageId}/status
```

**Headers Obrigatórios:**
```
Accept: application/json
Authorization: Bearer {accessToken}
locationId: {locationId}  ⚠️ CRÍTICO: Deve ser o mesmo locationId usado na criação
Version: 2021-04-15
```

**Body/Payload (x-www-form-urlencoded ou JSON):**
```json
{
  "status": "delivered"
}
```

**Exemplo para n8n (Body Parameters):**
```
status: delivered
```

**URL Dinâmica para n8n:**
```
https://services.leadconnectorhq.com/conversations/messages/{{ $json.id }}/status
```

**⚠️ CRÍTICO:** A resposta do POST retorna `{ "id": "...", ... }`, então use `{{ $json.id }}`, NÃO `{{ $json.messageId }}`

---

## ⚠️ Problema Crítico: Permissões do Token

### Causa Raiz do Erro

O erro `"You don't have access to the conversationProvider with id: 68a1f3cb0547607a9d820805"` ocorre porque:

1. **Token e LocationId não correspondem ao ConversationProviderId:**
   - O `conversationProviderId` (68a1f3cb0547607a9d820805) é da **subconta**
   - O `accessToken` e `locationId` usados podem ser da **conta principal** ou de outra subconta
   - O GHL valida que o token tem acesso ao `conversationProviderId` antes de permitir a atualização

2. **Solução:**
   - O `conversationProviderId` DEVE pertencer ao mesmo `locationId` que está sendo usado na autenticação
   - Ambos (criação e atualização) devem usar o mesmo `locationId` e `accessToken`
   - O `conversationProviderId` deve ser obtido da mesma instalação/subconta que está usando o token

---

## Configuração Correta no n8n

### Node 1: Add Message

**Configuração:**
- **Method:** `POST`
- **URL:** `https://services.leadconnectorhq.com/conversations/messages`
- **Authentication:** `Generic Credential Type` → `HTTP Header Auth`
- **Headers:**
  - `Accept: application/json`
  - `Version: 2021-04-15`
- **Body Type:** `JSON`
- **JSON Body:**
```json
{
  "type": "Custom",
  "message": "{{ $('Upload file audio to GHL1').item.json.message }}",
  "contactId": "{{ $json.conversations[0].contactId }}",
  "conversationProviderId": "{{ $('Get a row').item.json.conversation_provider_id }}"
}
```

**⚠️ IMPORTANTE:** 
- O `conversationProviderId` deve vir de uma fonte que corresponda ao `locationId` do token de autenticação
- Verifique se o `conversationProviderId` pertence à mesma instalação/subconta do token

### Node 2: Update Message Status

**Configuração:**
- **Method:** `PUT`
- **URL:** `https://services.leadconnectorhq.com/conversations/messages/{{ $json.id }}/status`
- **Authentication:** `Generic Credential Type` → `HTTP Header Auth` (MESMO token do Node 1)
- **Headers:**
  - `Accept: application/json`
  - `Version: 2021-04-15`
  - `locationId: {{ $('Get a row').item.json.location_id }}` ⚠️ ADICIONAR ESTE HEADER
- **Body Type:** `Body Parameters` ou `JSON`
- **Body Parameters:**
  - `status: delivered`

**⚠️ CRÍTICO:**
- Use o **MESMO token** e **MESMO locationId** que foram usados na criação da mensagem
- O header `locationId` é **OBRIGATÓRIO** e deve corresponder ao `conversationProviderId` usado

---

## Verificação e Debug

### 1. Verificar ConversationProviderId

Para verificar se o `conversationProviderId` pertence à instalação:
- Acesse o banco de dados e verifique a tabela de instalações
- Confirme que o `conversation_provider_id` corresponde ao `location_id` da mesma linha

### 2. Verificar Token

Para verificar se o token tem acesso:
- Use o mesmo token e `locationId` em ambas as requisições
- Confirme que o token foi gerado para a mesma instalação/subconta do `conversationProviderId`

### 3. Logs do Sistema

O sistema atual registra:
```typescript
console.log(`✅ Mensagem criada no GHL com sucesso:`, {
  status: messageResponse.status,
  statusText: messageResponse.statusText,
  data: messageResponse.data,
  messageId: messageResponse.data?.id  // ⚠️ Use este ID para atualizar status
})
```

---

## Exemplo Completo de Fluxo

### Passo 1: Criar Mensagem
```http
POST https://services.leadconnectorhq.com/conversations/messages
Authorization: Bearer {token-da-mesma-instalacao}
Accept: application/json
Version: 2021-04-15

{
  "type": "Custom",
  "contactId": "contact-id-123",
  "message": "Mensagem de teste",
  "conversationProviderId": "68a1f3cb0547607a9d820805"  // Deve pertencer ao token usado
}
```

**Resposta:**
```json
{
  "id": "message-id-abc123",
  "type": "Custom",
  "contactId": "contact-id-123",
  "conversationProviderId": "68a1f3cb0547607a9d820805",
  ...
}
```

### Passo 2: Atualizar Status
```http
PUT https://services.leadconnectorhq.com/conversations/messages/message-id-abc123/status
Authorization: Bearer {token-da-mesma-instalacao}  // ⚠️ MESMO token
locationId: location-id-que-pertence-ao-conversationProviderId  // ⚠️ CRÍTICO
Accept: application/json
Version: 2021-04-15

{
  "status": "delivered"
}
```

---

## ⚠️ CORREÇÃO PARA O ERRO: "Não atualiza o status"

### Problema Identificado

Quando a criação de mensagem funciona mas o status não é atualizado, geralmente é porque:

1. **URL incorreta no segundo node:**
   - ❌ ERRADO: `{{ $json.messageId }}`
   - ✅ CORRETO: `{{ $json.id }}`

2. **Resposta do POST `/conversations/messages`:**
   ```json
   {
     "id": "abc123...",  // ⚠️ Campo é "id", não "messageId"
     "type": "Custom",
     "contactId": "...",
     ...
   }
   ```

### Solução Completa

**Node 2 - Update Message Status (Configuração Corrigida):**

```json
{
  "method": "PUT",
  "url": "https://services.leadconnectorhq.com/conversations/messages/{{ $json.id }}/status",
  "headers": {
    "Accept": "application/json",
    "Version": "2021-04-15",
    "locationId": "{{ $('Get a row').item.json.location_id }}",
    "Authorization": "Bearer {{ $('Get a row').item.json.access_token }}"
  },
  "body": {
    "status": "delivered"
  }
}
```

**Ou no n8n (Body como JSON):**

- **Body Type:** `JSON` (não Body Parameters)
- **JSON Body:**
```json
{
  "status": "delivered"
}
```

**Se usar Body Parameters, mantenha:**
- **Body Type:** `Body Parameters`
- **Parameters:**
  - `status: delivered`

### Debug: Verificar Resposta do Primeiro Node

Para debugar, adicione um node intermediário entre "Add Message" e "Update Status" para ver a resposta:

**Node Debug (opcional):**
```json
{
  "type": "n8n-nodes-base.code",
  "parameters": {
    "jsCode": "// Verificar estrutura da resposta\nconsole.log('Resposta completa:', $input.all());\nconsole.log('ID da mensagem:', $json.id);\nreturn $input.all();"
  }
}
```

Isso vai mostrar exatamente qual campo contém o ID da mensagem na resposta.

---

## Referências do Código

- **Criação de Mensagem:** `src/index.ts:1038-1054`
- **Atualização de Status:** `src/index.ts:793-799`
- **GHL Requests:** `src/ghl.ts:72-100`

