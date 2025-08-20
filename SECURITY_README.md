# 🔒 **GUIA DE SEGURANÇA - GHL INTEGRATION APP**

## 🚨 **IMPORTANTE: Este servidor será público na internet!**

### **📋 Resumo das Medidas de Segurança Implementadas:**

## 🛡️ **1. PROTEÇÕES BÁSICAS**

### **✅ Headers de Segurança:**
- `X-Content-Type-Options: nosniff` - Previne MIME type sniffing
- `X-Frame-Options: DENY` - Previne clickjacking
- `X-XSS-Protection: 1; mode=block` - Proteção XSS básica
- `Strict-Transport-Security` - Força HTTPS
- `Referrer-Policy` - Controle de referrer
- `Permissions-Policy` - Restringe permissões do navegador
- `Content-Security-Policy` - Política de segurança de conteúdo

### **✅ CORS Restritivo:**
- Apenas origens específicas permitidas
- Métodos HTTP limitados
- Headers restritos
- Credenciais controladas

### **✅ Rate Limiting:**
- **Global**: 100 requests/IP/15min
- **Webhooks**: 50 requests/IP/15min  
- **Autenticação**: 5 tentativas/IP/15min

## 🔐 **2. AUTENTICAÇÃO E AUTORIZAÇÃO**

### **✅ API Keys Obrigatórias:**
- **INTERNAL_API_KEY**: Para todas as rotas de integração
- **ADMIN_API_KEY**: Para rotas administrativas (opcional)
- **READONLY_API_KEY**: Para rotas somente leitura (opcional)

### **✅ Validação de Webhooks:**
- **GHL_WEBHOOK_SECRET**: Para validar webhooks do GoHighLevel
- **EVOLUTION_WEBHOOK_SECRET**: Para validar webhooks da Evolution API
- Assinaturas HMAC-SHA256 obrigatórias

## 🌐 **3. VALIDAÇÃO DE ORIGEM**

### **✅ Whitelist de IPs:**
- **GHL_ALLOWED_IPS**: IPs permitidos para webhooks GHL
- **EVOLUTION_ALLOWED_IPS**: IPs permitidos para webhooks Evolution

### **✅ Validação de User-Agent:**
- Verifica se webhooks vêm de origens legítimas
- Bloqueia tentativas de spoofing

## 📝 **4. SANITIZAÇÃO E VALIDAÇÃO**

### **✅ Sanitização de Input:**
- Remove caracteres perigosos (`<>"'&`)
- Aplica em body, query e params
- Previne XSS e injection

### **✅ Validação de Payload:**
- Tamanho máximo: 10MB
- Content-Type restrito
- Validação de timestamp para evitar replay attacks

## 📊 **5. LOGGING E MONITORAMENTO**

### **✅ Logging Seguro:**
- Sem dados sensíveis nos logs
- IPs e User-Agents registrados
- Timestamps para auditoria
- Logs de tentativas suspeitas

### **✅ Monitoramento:**
- Health checks automáticos
- Alertas para atividade suspeita
- Métricas de segurança
- Threshold configurável

## ⚙️ **6. CONFIGURAÇÃO DE AMBIENTE**

### **🔑 Variáveis Obrigatórias:**

```bash
# API Keys (OBRIGATÓRIAS)
INTERNAL_API_KEY=your_super_secret_key_32_chars_min

# Webhook Secrets (OBRIGATÓRIOS)
GHL_WEBHOOK_SECRET=your_ghl_webhook_secret_32_chars_min
EVOLUTION_WEBHOOK_SECRET=your_evolution_webhook_secret_32_chars_min

# CORS
ALLOWED_ORIGINS=https://app.gohighlevel.com,https://marketplace.leadconnectorhq.com

# IPs Permitidos (RECOMENDADO)
GHL_ALLOWED_IPS=192.168.1.1,10.0.0.1
EVOLUTION_ALLOWED_IPS=192.168.1.2,10.0.0.2
```

### **🔑 Variáveis Opcionais:**

```bash
# Rate Limiting
MAX_REQUESTS_PER_IP=100
MAX_WEBHOOKS_PER_IP=50
MAX_AUTH_ATTEMPTS_PER_IP=5

# Logging
LOG_LEVEL=info
MASK_SENSITIVE_DATA=true

# Monitoramento
ALERT_ON_SUSPICIOUS_ACTIVITY=true
SUSPICIOUS_ACTIVITY_THRESHOLD=10
```

## 🚀 **7. IMPLEMENTAÇÃO**

### **✅ Passos para Ativar Segurança:**

1. **Configure as variáveis obrigatórias no .env**
2. **Gere chaves seguras:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. **Configure IPs permitidos para webhooks**
4. **Teste todas as rotas protegidas**
5. **Monitore logs de segurança**

### **✅ Teste de Segurança:**

```bash
# Teste sem API Key (deve retornar 401)
curl -X POST http://localhost:3000/integration/setup

# Teste com API Key válida
curl -X POST http://localhost:3000/integration/setup \
  -H "X-API-Key: your_internal_api_key" \
  -H "Content-Type: application/json" \
  -d '{"resourceId":"test"}'

# Teste de rate limiting
for i in {1..101}; do curl http://localhost:3000/health; done
```

## 🚨 **8. RISCOS E MITIGAÇÕES**

### **❌ Riscos Identificados:**

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **DDoS** | Alta | Alto | Rate limiting, IP whitelist |
| **Injection** | Média | Alto | Sanitização, validação |
| **XSS** | Média | Médio | Headers de segurança, CSP |
| **CSRF** | Baixa | Médio | CORS restritivo, validação de origem |
| **Brute Force** | Média | Médio | Rate limiting de auth, lockout |
| **Replay Attacks** | Baixa | Médio | Timestamps, nonces |

### **✅ Mitigações Implementadas:**

- **Rate Limiting** em todas as rotas
- **Validação de assinatura** para webhooks
- **Sanitização automática** de todos os inputs
- **Headers de segurança** em todas as respostas
- **Logging seguro** sem dados sensíveis
- **Monitoramento** de atividade suspeita

## 📋 **9. CHECKLIST DE SEGURANÇA**

### **🔒 Pré-Produção:**
- [ ] Todas as variáveis obrigatórias configuradas
- [ ] API Keys geradas com 32+ caracteres
- [ ] Webhook secrets configurados
- [ ] IPs permitidos configurados
- [ ] CORS restritivo configurado
- [ ] Rate limiting testado
- [ ] Logs de segurança verificados

### **🔒 Produção:**
- [ ] HTTPS habilitado
- [ ] Firewall configurado
- [ ] Monitoramento ativo
- [ ] Logs centralizados
- [ ] Backup de configurações
- [ ] Plano de resposta a incidentes

## 🆘 **10. EMERGÊNCIAS DE SEGURANÇA**

### **🚨 Se detectar atividade suspeita:**

1. **Imediato:**
   - Bloqueie IPs suspeitos
   - Revogue API keys se necessário
   - Ative modo de emergência

2. **Investigação:**
   - Analise logs de segurança
   - Identifique origem do ataque
   - Documente incidente

3. **Recuperação:**
   - Gere novas chaves
   - Atualize IPs permitidos
   - Revise configurações

### **📞 Contatos de Emergência:**
- **Email**: security@yourdomain.com
- **Webhook**: https://your-security-monitoring.com/webhook
- **Slack**: #security-alerts

## 📚 **11. RECURSOS ADICIONAIS**

### **🔗 Documentação:**
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practices-security.html)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)

### **🛠️ Ferramentas:**
- **Auditoria**: `npm audit`
- **Dependências**: `npm outdated`
- **Vulnerabilidades**: `snyk test`

---

## ⚠️ **AVISO FINAL**

**Este servidor será exposto à internet. Todas as medidas de segurança devem ser implementadas ANTES da publicação.**

**A segurança é responsabilidade de todos. Revise regularmente e mantenha-se atualizado sobre novas ameaças.**
