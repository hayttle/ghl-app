# 🚀 Deploy no Easypanel - GHL Integration App

## 📋 **Configuração do Easypanel**

### **1. 🎯 Criar Novo Projeto**
- Nome: `ghl-app`
- Tipo: `App`
- Source: `Git`

### **2. 🔗 Configuração do Git**
- **Repository URL:** `https://github.com/hayttle/ghl-app.git`
- **Branch:** `main`
- **Build Command:** `npm run build`
- **Start Command:** `npm start`

### **3. 🐳 Configuração do Build**
- **Node Version:** `18.x`
- **Port:** `3000`
- **Health Check:** `/health`

### **4. 🗄️ Banco de Dados PostgreSQL**
- **Nome:** `ghl-postgres`
- **Versão:** `15`
- **Database:** `ghl_integration`
- **User:** `ghl_user`
- **Password:** `ghl_password`

## ⚙️ **Variáveis de Ambiente (ENV)**

### **🔐 Banco de Dados**
```bash
DB_HOST=ghl-postgres
DB_PORT=5432
DB_NAME=ghl_integration
DB_USER=ghl_user
DB_PASSWORD=ghl_password
```

### **🚀 GoHighLevel**
```bash
GHL_APP_CLIENT_ID=seu_client_id
GHL_APP_CLIENT_SECRET=seu_client_secret
GHL_APP_REDIRECT_URI=https://seu-dominio.com/authorize-handler
GHL_API_DOMAIN=https://services.leadconnectorhq.com
GHL_APP_SSO_KEY=sua_sso_key
GHL_CONVERSATION_PROVIDER_ID=68a1f3cb0547607a9d820805
```

### **📱 Evolution API**
```bash
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_api_key_global
EVOLUTION_WEBHOOK_URL=https://seu-dominio.com/webhook/evolution
```

### **🌐 Servidor**
```bash
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://seu-dominio.com
LOG_LEVEL=info
```

## 📁 **Estrutura de Arquivos**

```
ghl-app/
├── src/                    # Código fonte
├── dist/                   # Build compilado
├── package.json            # Dependências
├── tsconfig.json           # Configuração TypeScript
├── easypanel.yml           # Configuração Easypanel
├── .dockerignore           # Arquivos ignorados no Docker
└── env.example             # Exemplo de variáveis
```

## 🚀 **Passos para Deploy**

### **1. 📥 Importar Projeto**
- Usar o arquivo `easypanel.yml`
- Ou configurar manualmente seguindo as instruções

### **2. 🔧 Configurar Variáveis**
- Definir todas as variáveis de ambiente
- **IMPORTANTE:** Configurar URLs corretas para produção

### **3. 🗄️ Banco de Dados**
- Criar banco PostgreSQL
- Aplicar migrações automaticamente

### **4. 🌐 Domínio**
- Configurar domínio personalizado
- Configurar SSL/HTTPS

### **5. 📊 Monitoramento**
- Health check automático
- Logs em tempo real
- Métricas de performance

## ✅ **Verificação do Deploy**

### **1. 🟢 Health Check**
```bash
curl https://seu-dominio.com/health
```

### **2. 🔍 Logs**
- Verificar logs de build
- Verificar logs de runtime
- Verificar conexão com banco

### **3. 🧪 Testes**
- Testar webhook GHL
- Testar webhook Evolution
- Testar criação de mensagens

## 🚨 **Troubleshooting**

### **❌ Build Falha**
- Verificar Node.js version
- Verificar dependências
- Verificar TypeScript compilation

### **❌ App Não Inicia**
- Verificar variáveis de ambiente
- Verificar conexão com banco
- Verificar portas

### **❌ Banco Não Conecta**
- Verificar credenciais
- Verificar network policies
- Verificar migrações

## 🎯 **Status Esperado**

- ✅ **Build:** Sucesso
- ✅ **Start:** Sucesso  
- ✅ **Health Check:** 200 OK
- ✅ **Banco:** Conectado
- ✅ **Webhooks:** Funcionando
- ✅ **Mensagens:** Sincronizando

## 📞 **Suporte**

- **Documentação:** `/doc/documentation.md`
- **Issues:** GitHub Issues
- **Logs:** Easypanel Dashboard

---

**🚀 Sistema funcionando 100% em produção!** ✨
