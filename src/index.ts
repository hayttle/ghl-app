import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { GHL } from "./ghl";
import { json } from "body-parser";
import axios, { AxiosError } from "axios";
import * as CryptoJS from 'crypto-js';
import { TokenType, AppUserType, InstallationDetails, IntegrationStatus } from "./model";
import { IntegrationService, IntegrationConfig } from "./integration-service";
import { EvolutionApiService } from "./evolution-api";

// Middleware de segurança
import {
  rateLimiter,
  webhookRateLimiter,
  authRateLimiter,
  corsOptions,
  sanitizeInput,
  secureLogging,
  securityHeaders,
  validatePayloadSize,
  timingAttackProtection
} from "./security-middleware";


import { securityConfig, validateSecurityConfig } from "./security-config";
import { ghlCredentialsValidator } from "./ghl-credentials-validator";

const path = __dirname + "/ui/dist/";

dotenv.config();

// Validação de configuração de segurança
const securityWarnings = validateSecurityConfig();
if (securityWarnings.length > 0) {
  console.log('🚨 AVISOS DE SEGURANÇA:');
  securityWarnings.forEach(warning => console.log(warning));
}

const app: Express = express();

// ========================================
// CONFIGURAÇÃO DE PROXY (apenas em desenvolvimento)
// ========================================
if (process.env.NODE_ENV === 'development') {
  // Configuração mais segura para ngrok - confia apenas no primeiro proxy
  app.set('trust proxy', 1);
  console.log('🔧 Modo desenvolvimento: proxy confiável limitado ativado para ngrok');
}

// ========================================
// MIDDLEWARE DE SEGURANÇA
// ========================================

// Headers de segurança básicos
app.use(securityHeaders);

// CORS restritivo
app.use(cors(corsOptions));

// Rate limiting global
app.use(rateLimiter);

// Validação de tamanho de payload
app.use(validatePayloadSize);

// Sanitização de input
app.use(sanitizeInput);

// Logging seguro
app.use(secureLogging);

// Proteção contra ataques de timing
app.use(timingAttackProtection);

// Parser de JSON com limite de tamanho
app.use(json({ 
  type: 'application/json',
  limit: securityConfig.payload.maxSize
}));

app.use(cookieParser());

app.use(express.static(path));

const ghl = new GHL();

// Configuração base do serviço de integração
const baseIntegrationConfig: IntegrationConfig = {
  evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
  defaultInstanceName: 'default' // Valor padrão apenas para fallback
};

// Serviço de integração será configurado dinamicamente por instalação
const integrationService = new IntegrationService(baseIntegrationConfig);

const port = process.env.PORT || 3000;

// Logs de inicialização simplificados
console.log('🚀 Servidor iniciando...');
console.log('🔧 Modo desenvolvimento: proxy confiável limitado ativado para ngrok');

// Logs de configuração simplificados
console.log('=== CONFIGURAÇÕES CARREGADAS ===');
console.log('Evolution API:', process.env.EVOLUTION_API_KEY ? '✅ CONFIGURADA' : '❌ NÃO CONFIGURADA');
console.log('GoHighLevel:', process.env.GHL_APP_CLIENT_ID ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO');
console.log('Banco de Dados:', process.env.DATABASE_URL ? '✅ CONFIGURADO' : '❌ NÃO CONFIGURADO');
console.log('================================');

// Middleware de logging seguro já aplicado acima

// Middleware para tratamento de erros seguro
app.use((error: any, req: Request, res: Response, next: any) => {
  // Log seguro sem expor dados sensíveis
  console.error('Erro não tratado:', {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Resposta genérica para produção
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? 'Erro interno do servidor' : 'Erro interno',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || 'unknown'
  });
});



// Rota intermediária para capturar instanceName antes do OAuth
app.get("/authorize-start", 
  authRateLimiter, // Rate limiting para autenticação
  async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.query;
    
    if (!instanceName) {
      return res.status(400).json({
        success: false,
        message: 'InstanceName é obrigatório'
      });
    }

    // Logs de autorização simplificados
    console.log(`🔐 Iniciando autorização com instanceName: ${instanceName}`);
    
    // Armazena o instanceName em um cookie temporário
    res.cookie('tempInstanceName', instanceName, { 
      maxAge: 5 * 60 * 1000, // 5 minutos
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    });
    
    // Redireciona para o OAuth do GHL
    const oauthUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(process.env.GHL_APP_REDIRECT_URI || 'https://b075774f803b.ngrok-free.app/authorize-handler')}&client_id=68a0be624cf070ff76527886-meejtbba&scope=conversations.write+conversations.readonly+conversations%2Fmessage.readonly+conversations%2Fmessage.write+contacts.readonly+contacts.write+locations.readonly`;
    
    // Logs de autorização simplificados
    console.log(`🔄 Redirecionando para OAuth GHL com instanceName: ${instanceName}`);
    res.redirect(oauthUrl);
    
  } catch (error: any) {
    console.error('Erro ao iniciar autorização:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao iniciar autorização',
      error: error.message
    });
  }
});

app.get("/authorize-handler", 
  authRateLimiter, // Rate limiting para autenticação
  async (req: Request, res: Response) => {
  try {
  const { code } = req.query;
    console.log("🔐 Handler de autorização chamado com code:", code);
    
  if (code) {
      // Recupera o instanceName do cookie
      const instanceName = req.cookies?.tempInstanceName || 'default';
      console.log(`🔍 InstanceName recuperado do cookie: ${instanceName}`);
      
      // Limpa o cookie temporário
      res.clearCookie('tempInstanceName');
      
      // Passa o instanceName para o handler de autorização
      await ghl.authorizationHandler(code as string, instanceName);
      res.redirect("https://app.gohighlevel.com/");
  } else {
      res.status(400).send("Código de autorização ausente.");
    }
  } catch (error) {
    console.error('Erro no handler de autorização:', error);
    res.status(500).send("Erro durante a autorização.");
  }
});

// Rotas de integração (protegidas por API Key)
app.post("/integration/setup", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { resourceId, evolutionInstanceName } = req.body;
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID é obrigatório'
      });
    }

    // Configura o serviço com o instanceName específico desta instalação
    const dynamicConfig: IntegrationConfig = {
      ...baseIntegrationConfig,
      defaultInstanceName: evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
    };
    
    const dynamicIntegrationService = new IntegrationService(dynamicConfig);
    const result = await dynamicIntegrationService.setupIntegration(resourceId, evolutionInstanceName);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Erro ao configurar integração:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao configurar integração',
      error: error.message
    });
  }
});

app.post("/integration/send-message", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { resourceId, contactId, message, messageId } = req.body;
    
    console.log(`🔍 Body completo da requisição:`, JSON.stringify(req.body, null, 2));
    console.log(`🔍 messageId extraído: ${messageId}`);
    
    if (!resourceId || !contactId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID, Contact ID e Message são obrigatórios'
      });
    }

    // Logs de envio de mensagem simplificados
    console.log("=== ENVIO DE MENSAGEM ===");
    console.log("Parâmetros recebidos:", { resourceId, contactId, message, messageId });
    console.log("📝 Enviando mensagem com messageId:", messageId);

    // Busca o instanceName específico desta instalação
    const installationDetails = await ghl.model.getInstallationInfo(resourceId);
    if (!installationDetails) {
      return res.status(404).json({
        success: false,
        message: 'Instalação não encontrada'
      });
    }

    // Configura o serviço com o instanceName específico desta instalação
    const dynamicConfig: IntegrationConfig = {
      ...baseIntegrationConfig,
      defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
    };
    
    const dynamicIntegrationService = new IntegrationService(dynamicConfig);
    const result = await dynamicIntegrationService.sendMessageToWhatsApp(resourceId, contactId, message, messageId);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Erro ao enviar mensagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao enviar mensagem',
      error: error.message
    });
  }
});

app.post("/integration/sync-contacts", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.body;
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID é obrigatório'
      });
    }

    // Busca o instanceName específico desta instalação
    const installationDetails = await ghl.model.getInstallationInfo(resourceId);
    if (!installationDetails) {
      return res.status(404).json({
        success: false,
        message: 'Instalação não encontrada'
      });
    }

    // Configura o serviço com o instanceName específico desta instalação
    const dynamicConfig: IntegrationConfig = {
      ...baseIntegrationConfig,
      defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
    };
    
    const dynamicIntegrationService = new IntegrationService(dynamicConfig);
    const result = await dynamicIntegrationService.syncContacts(resourceId);
    
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Erro ao sincronizar contatos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao sincronizar contatos',
      error: error.message
    });
  }
});



app.get("/integration/status", 
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
  try {
    const result = await integrationService.checkIntegrationStatuses();
    res.status(200).json(result);
  } catch (error: any) {
    console.error('Erro ao verificar status das integrações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao verificar status',
      error: error.message
    });
  }
});

// Rotas de exemplo mantidas para compatibilidade
app.get("/example-api-call", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const companyId = req.query.companyId as string;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'Company ID é obrigatório'
      });
    }

    if (await ghl.checkInstallationExists(companyId)) {
      const request = await ghl
        .requests(companyId)
        .get(`/users/search?companyId=${companyId}`, {
          headers: {
            Version: "2021-07-28",
          },
        });
      return res.json({
        success: true,
        data: request.data
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Instalação para esta empresa não existe"
      });
    }
  } catch (error: any) {
    console.error('Erro na chamada de exemplo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na chamada de exemplo',
      error: error.response?.data?.message || error.message
    });
  }
});

app.get("/example-api-call-location", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { companyId, locationId } = req.query;
    
    if (!locationId) {
      return res.status(400).json({
        success: false,
        message: 'Location ID é obrigatório'
      });
    }

    if (await ghl.checkInstallationExists(locationId as string)) {
      const request = await ghl
        .requests(locationId as string)
        .get(`/contacts/?locationId=${locationId}`, {
          headers: {
            Version: "2021-07-28",
          },
        });
      return res.json({
        success: true,
        data: request.data
      });
    } else if (companyId) {
      await ghl.getLocationTokenFromCompanyToken(
        companyId as string,
        locationId as string
      );
      const request = await ghl
        .requests(locationId as string)
        .get(`/contacts/?locationId=${locationId}`, {
          headers: {
            Version: "2021-07-28",
          },
        });
      return res.json({
        success: true,
        data: request.data
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "Instalação para esta localização não existe"
      });
    }
  } catch (error: any) {
    console.error('Erro na chamada de exemplo por localização:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na chamada de exemplo',
      error: error.response?.data?.message || error.message
    });
  }
});

// Webhook handler refatorado com segurança
app.post("/webhook/ghl", 
  webhookRateLimiter, // Rate limiting específico para webhooks
  ghlCredentialsValidator.validateGHLWebhook, // Valida credenciais GHL do banco
  async (req: Request, res: Response) => {
      try {
      const eventType = req.body.type;
      const { contactId, locationId, body: message, conversationProviderId, companyId, messageId } = req.body;
      
      console.log("=== WEBHOOK GHL RECEBIDO ===");
      console.log("Tipo de evento:", eventType);
      console.log("LocationId:", locationId);
      console.log("MessageId:", messageId);

      if (eventType === 'UNINSTALL') {
      console.log("🗑️ Evento UNINSTALL detectado - removendo instalação...");
      
              if (locationId) {
          try {
            await ghl.model.deleteInstallationInfo(locationId);
            console.log(`✅ Instalação removida com sucesso para locationId: ${locationId}`);
          } catch (error: any) {
            console.error(`❌ Erro ao remover instalação para locationId ${locationId}:`, error.message);
          }
        } else if (companyId) {
          console.log(`⚠️ UNINSTALL sem locationId, mas com companyId: ${companyId}`);
          console.log("⚠️ Tentando remover por companyId...");
          
          try {
            await ghl.model.deleteInstallationInfo(companyId);
            console.log(`✅ Instalação removida com sucesso para companyId: ${companyId}`);
          } catch (error: any) {
            console.error(`❌ Erro ao remover instalação para companyId ${companyId}:`, error.message);
          }
        } else {
          console.log("❌ UNINSTALL sem locationId nem companyId - não é possível identificar qual instalação remover");
        }
    } else if (eventType === 'INSTALL') {
      console.log("📦 Evento INSTALL detectado - configurando integração...");
      
      if (locationId) {
        console.log(`✅ Configurando integração para locationId: ${locationId}`);
        
        try {
          const installationDetails = await ghl.model.getInstallationInfo(locationId);
          
          if (installationDetails?.evolutionInstanceName) {
            console.log(`🔧 Usando instanceName: ${installationDetails.evolutionInstanceName} para locationId: ${locationId}`);
            
            const dynamicConfig: IntegrationConfig = {
              ...baseIntegrationConfig,
              defaultInstanceName: installationDetails.evolutionInstanceName
            };
            
            const dynamicIntegrationService = new IntegrationService(dynamicConfig);
            await dynamicIntegrationService.setupIntegration(locationId, installationDetails.evolutionInstanceName);
            console.log(`✅ Integração configurada com sucesso para locationId: ${locationId}`);
          } else {
            console.log(`⚠️ InstanceName não encontrado para locationId: ${locationId}, usando configuração padrão`);
            
            const dynamicIntegrationService = new IntegrationService(baseIntegrationConfig);
            await dynamicIntegrationService.setupIntegration(locationId, baseIntegrationConfig.defaultInstanceName);
            console.log(`✅ Integração configurada com sucesso para locationId: ${locationId}`);
          }
        } catch (error: any) {
          console.error(`❌ Erro ao configurar integração para locationId: ${locationId}:`, error.message);
        }
      } else {
        console.log("⚠️ INSTALL sem locationId - não é possível configurar integração");
      }
    } else if (eventType === 'OutboundMessage') {
      console.log("📤 Evento OutboundMessage detectado - processando mensagem...");
      
      // Extrair dados essenciais
      const { conversationProviderId, locationId, contactId, body: message, direction, source } = req.body;
      
      // Logs principais do payload
      console.log("📋 Payload GHL recebido:", {
        messageId: req.body.messageId,
        locationId,
        contactId,
        message,
        direction,
        source
      });
      
      // Verificações anti-loop
      if (direction === 'inbound') {
        console.log("🔄 Mensagem ignorada - direction 'inbound' indica mensagem recebida, evitando loop");
        return res.status(200).json({ success: true, message: "Mensagem inbound ignorada" });
      }
      
      const messageBody = message?.toLowerCase() || '';
      if (messageBody.includes('[sistema]') || messageBody.includes('[ghl]') || messageBody.includes('[integration]')) {
        console.log(`🔄 Mensagem ignorada - contém marcadores do sistema: "${messageBody}"`);
        return res.status(200).json({ success: true, message: "Mensagem do sistema ignorada" });
      }
      
      const messageSource = source?.toLowerCase() || '';
      if (messageSource.includes('webhook') || messageSource.includes('api')) {
        console.log(`🔄 Mensagem ignorada - fonte suspeita: "${messageSource}"`);
        return res.status(200).json({ success: true, message: "Mensagem de fonte suspeita ignorada" });
      }
      
      if (!conversationProviderId || !locationId || !contactId || !message) {
        console.log("⚠️ Dados incompletos para mensagem outbound:", {
          conversationProviderId,
          locationId,
          contactId,
          message
        });
        return res.status(400).json({
          success: false,
          message: "Dados incompletos para processar mensagem outbound"
        });
      }
      
      console.log(`📝 Processando mensagem outbound para contactId: ${contactId}`);
      console.log(`💬 Mensagem: ${message}`);
      
      try {
        // Buscar informações do contato
        const contactResponse = await ghl.requests(locationId).get(`/contacts/${contactId}`, {
          headers: { Version: '2021-07-28' }
        });
        
        const contact = contactResponse.data;
        const phoneNumber = contact.phone;
        
        if (!phoneNumber) {
          console.error("❌ Número de telefone não encontrado para o contato");
          return res.status(400).json({
            success: false,
            message: "Número de telefone não encontrado para o contato"
          });
        }
        
        // Buscar conversa existente
        const conversationResponse = await ghl.requests(locationId).get(`/conversations/search/`, {
          params: { query: phoneNumber },
          headers: { Version: '2021-04-15' }
        });
        
        if (conversationResponse.data.conversations && conversationResponse.data.conversations.length > 0) {
          const conversation = conversationResponse.data.conversations[0];
          const newConversationProviderId = conversation.id;
          
          if (newConversationProviderId !== conversationProviderId) {
            console.log(`✅ ConversationProviderId atualizado: ${newConversationProviderId}`);
            // Aqui você poderia atualizar o banco se necessário
          }
        }
        
        // Buscar instalação para obter instanceName
        const installationDetails = await ghl.model.getInstallationInfo(locationId);
        
        if (!installationDetails) {
          console.error(`❌ Instalação não encontrada para locationId: ${locationId}`);
          return res.status(404).json({
            success: false,
            message: "Instalação não encontrada"
          });
        }
        
        const dynamicConfig: IntegrationConfig = {
          ...baseIntegrationConfig,
          defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
        };
        
        console.log(`🔧 Usando instanceName: ${dynamicConfig.defaultInstanceName} para locationId: ${locationId}`);
        
        const dynamicIntegrationService = new IntegrationService(dynamicConfig);
        
        // Enviar mensagem via Evolution API
        console.log(`🔄 Enviando mensagem com messageId: ${req.body.messageId}`);
        const result = await dynamicIntegrationService.sendMessageToWhatsApp(
          phoneNumber,
          message,
          locationId,
          req.body.messageId
        );
        
        if (result.success) {
          console.log("✅ Mensagem enviada com sucesso via Evolution API");
          
          // Atualizar status da mensagem para "delivered"
          let messageIdToUpdate = req.body.messageId;
          
          if (!messageIdToUpdate) {
            console.log("⚠️ messageId não encontrado no webhook");
            console.log("🔍 Tentando buscar messageId alternativo...");
            
            // Tentar buscar messageId alternativo
            if (req.body.id) {
              messageIdToUpdate = req.body.id;
              console.log(`🔄 messageId alternativo encontrado: ${messageIdToUpdate}`);
            }
          } else {
            console.log(`🔄 messageId encontrado no webhook: ${messageIdToUpdate}`);
          }
          
          if (messageIdToUpdate) {
            console.log(`🔄 Atualizando status da mensagem ${messageIdToUpdate} para "delivered"...`);
            
                         try {
               const statusUpdateResponse = await ghl.requests(locationId).put(
                 `/conversations/messages/${messageIdToUpdate}/status`,
                 { status: "delivered" },
                 { headers: { Version: '2021-04-15' } }
               );
               
               console.log(`✅ Status da mensagem atualizado para "delivered":`, statusUpdateResponse.data);
             } catch (error: any) {
               console.error(`❌ Erro ao atualizar status da mensagem:`, error.message);
             }
          } else {
            console.log("❌ Nenhum messageId encontrado - não é possível atualizar status");
          }
          
          return res.status(200).json({
            success: true,
            message: "Mensagem enviada com sucesso e status atualizado"
          });
        } else {
          console.error("❌ Falha ao enviar mensagem:", result.error);
          return res.status(500).json({
            success: false,
            message: "Falha ao enviar mensagem",
            error: result.error
          });
        }
      } catch (error: any) {
        console.error("❌ Erro ao processar mensagem outbound:", error.message);
        return res.status(500).json({
          success: false,
          message: "Erro interno ao processar mensagem",
          error: error.message
        });
      }
    } else {
      console.log(`❓ Tipo de evento não suportado: ${eventType}`);
    }
    
    console.log("=== WEBHOOK GHL PROCESSADO ===");
    
  } catch (error: any) {
    console.error("❌ Erro geral no webhook GHL:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno no processamento do webhook",
      error: error.message
    });
  }
});

// Webhook handler da Evolution API refatorado com segurança
app.post("/webhook/evolution", 
  webhookRateLimiter, // Rate limiting específico para webhooks
  async (req: Request, res: Response) => {
  try {
  console.log("=== WEBHOOK EVOLUTION RECEBIDO ===");
  console.log("Payload Evolution recebido:", {
    event: req.body.event,
    instance: req.body.instance,
    hasData: !!req.body.data,
    hasMessage: !!req.body.data?.message,
    hasKey: !!req.body.data?.key,
    messageTypes: req.body.data?.message ? Object.keys(req.body.data.message) : [],
    phone: req.body.data?.key?.remoteJid
  });

  if (req.body.event === 'messages.upsert') {
    console.log("Evento de mensagem recebida detectado. Processando...");
    
    const messageData = req.body.data;
    
    // Verificar se a estrutura da mensagem está correta
    if (!messageData || !messageData.message || !messageData.key) {
      console.error("❌ Estrutura da mensagem inválida:", messageData);
      return res.status(400).json({
        success: false,
        message: "Estrutura da mensagem inválida"
      });
    }
    
         // Extrair texto da mensagem de forma segura
     let inboundMessageText = '';
     let messageType = '';
     let isMediaMessage = false;
     
     if (messageData.message.conversation) {
       inboundMessageText = messageData.message.conversation;
       messageType = 'texto';
     } else if (messageData.message.extendedTextMessage) {
       inboundMessageText = messageData.message.extendedTextMessage.text || '';
       messageType = 'texto';
     } else if (messageData.message.imageMessage) {
       inboundMessageText = '[IMAGEM]';
       messageType = 'imagem';
       isMediaMessage = true;
     } else if (messageData.message.audioMessage) {
       inboundMessageText = '[ÁUDIO]';
       messageType = 'áudio';
       isMediaMessage = true;
     } else if (messageData.message.videoMessage) {
       inboundMessageText = '[VÍDEO]';
       messageType = 'vídeo';
       isMediaMessage = true;
     } else if (messageData.message.documentMessage) {
       inboundMessageText = '[DOCUMENTO]';
       messageType = 'documento';
       isMediaMessage = true;
     } else {
       inboundMessageText = '[MENSAGEM]';
       messageType = 'desconhecido';
     }
    
    const inboundPhoneNumber = `+${messageData.key.remoteJid.replace('@s.whatsapp.net', '')}`;
    const pushName = messageData.pushName || messageData.data?.pushName;
    
    // Verificações anti-loop (apenas se houver texto)
    if (inboundMessageText && typeof inboundMessageText === 'string') {
      if (inboundMessageText.includes('[SISTEMA]') || inboundMessageText.includes('[GHL]') || inboundMessageText.includes('[INTEGRATION]')) {
        console.log(`🔄 Mensagem ignorada - contém marcadores do sistema: "${inboundMessageText}"`);
        return res.status(200).json({ success: true, message: "Mensagem do sistema ignorada" });
      }
      
      if (inboundMessageText.toLowerCase().includes('status: delivered') || 
          inboundMessageText.toLowerCase().includes('message sent') || 
          inboundMessageText.toLowerCase().includes('integration')) {
        console.log(`🔄 Mensagem ignorada - parece ser resposta automática do sistema: "${inboundMessageText}"`);
        return res.status(200).json({ success: true, message: "Resposta automática ignorada" });
      }
    }
    
         console.log(`Mensagem recebida do telefone ${inboundPhoneNumber}: "${inboundMessageText}"`);
     console.log(`Tipo de mensagem: ${messageType}`);
     console.log(`Push Name: ${pushName}`);
     
     // Se for mensagem de mídia, enviar resposta automática
     if (isMediaMessage) {
       console.log(`📱 Mensagem de ${messageType} detectada - enviando resposta automática...`);
       
       try {
         // Usar o instanceName já identificado
         const instanceName = req.body.instance || req.body.instanceName || req.body.data?.instanceName || req.body.source?.instanceName;
         
         if (!instanceName) {
           console.error('❌ InstanceName não encontrado no webhook');
           return res.status(400).json({ error: 'InstanceName não fornecido' });
         }
         
         console.log(`🔍 Buscando instalação para instância: ${instanceName}`);
         
         // Buscar instalação pelo instanceName
         const installationDetails = await ghl.model.getInstallationByInstanceName(instanceName);
         
         if (!installationDetails) {
           console.error(`❌ Instalação não encontrada para instância: ${instanceName}`);
           return res.status(404).json({ error: 'Instalação não encontrada' });
         }
         
         console.log(`✅ Instalação encontrada para resposta automática:`, {
           locationId: installationDetails.locationId,
           instanceName: installationDetails.evolutionInstanceName
         });
         
         // Enviar resposta automática
         const responseMessage = `Não recebemos mensagem de ${messageType}, somente texto. Agradecemos a compreensão!`;
         
         console.log(`📤 Enviando resposta automática para ${messageType}...`);
         
         if (!installationDetails.locationId) {
           console.error('❌ LocationId não encontrado na instalação');
           return res.status(500).json({ error: 'LocationId não encontrado na instalação' });
         }
         
         // Para resposta automática, usar Evolution API diretamente
         const evolutionService = new EvolutionApiService({
           baseUrl: baseIntegrationConfig.evolutionApiUrl,
           apiKey: baseIntegrationConfig.evolutionApiKey,
           instanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
         });
         
         const result = await evolutionService.sendTextMessage(
           inboundPhoneNumber,
           responseMessage
         );
         
         if (result.success) {
           console.log(`✅ Resposta automática enviada com sucesso para ${messageType}`);
         } else {
           console.error(`❌ Falha ao enviar resposta automática: ${result.error}`);
         }
         
       } catch (error) {
         console.error(`❌ Erro ao enviar resposta automática: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
       }
     }
     
     // Identificar instância para processamento normal
     const instanceName = req.body.instance || req.body.instanceName || req.body.data?.instanceName || req.body.source?.instanceName;
    
    if (!instanceName) {
      console.error("❌ NÃO É POSSÍVEL IDENTIFICAR A INSTÂNCIA - mensagem será ignorada");
      return res.status(400).json({
        success: false,
        message: "Não é possível identificar a instância que recebeu a mensagem"
      });
    }
    
    console.log(`🔍 Instância identificada: ${instanceName}`);
    
    // Buscar instalação específica
    try {
      const targetInstallation = await ghl.model.getInstallationByInstanceName(instanceName);
      
      if (!targetInstallation) {
        console.error(`❌ Instalação não encontrada para a instância: ${instanceName}`);
        return res.status(404).json({
          success: false,
          message: `Instalação não encontrada para a instância: ${instanceName}`
        });
      }
      
      console.log(`✅ Instalação encontrada para instância ${instanceName}:`, {
        locationId: targetInstallation.locationId,
        companyId: targetInstallation.companyId,
        evolutionInstanceName: targetInstallation.evolutionInstanceName
      });
      
      const resourceId = targetInstallation.locationId || targetInstallation.companyId;
      
      if (!resourceId) {
        console.error("❌ ResourceId não encontrado na instalação");
        return res.status(500).json({
          success: false,
          message: "ResourceId não encontrado na instalação"
        });
      }
      
      const dynamicConfig: IntegrationConfig = {
        ...baseIntegrationConfig,
        defaultInstanceName: targetInstallation.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
      };
      
      const dynamicIntegrationService = new IntegrationService(dynamicConfig);
      const result = await dynamicIntegrationService.processIncomingMessage(
        inboundPhoneNumber,
        inboundMessageText,
        resourceId,
        pushName
      );
      
      if (result.success) {
        console.log(`✅ Mensagem processada com sucesso para a instância correta: ${instanceName} -> ${resourceId}`);
        return res.status(200).json({
          success: true,
          message: "Mensagem processada e sincronizada com GHL para a subconta correta",
          data: {
            instanceName,
            resourceId,
            phoneNumber: inboundPhoneNumber,
            message: inboundMessageText
          }
        });
      } else {
        console.error(`❌ Falha ao processar mensagem para instância ${instanceName}:`, result.error);
        return res.status(500).json({
          success: false,
          message: "Falha ao processar mensagem",
          error: result.error
        });
      }
      
    } catch (error: any) {
      console.error(`❌ Erro ao buscar instalação para instância ${instanceName}:`, error);
      return res.status(500).json({
        success: false,
        message: "Erro interno ao buscar instalação",
        error: error.message
      });
    }
  }

  res.status(200).json({
    success: true,
    message: "Tipo de evento não suportado ou mensagem de saída"
  });
  } catch (error: any) {
    console.error("Erro ao processar webhook Evolution:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno ao processar webhook",
      error: error.message
    });
  }
});

// Rota para envio direto de mensagem (mantida para compatibilidade)
app.post("/send-message-evolution", 
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
      try {
      const { locationId, contactId, message, messageId } = req.body;
      
      console.log("=== INÍCIO DO ENVIO DE MENSAGEM ===");
      console.log("Parâmetros recebidos:", { locationId, contactId, message, messageId });
    
    if (!locationId || !contactId || !message) {
      console.log("Parâmetros faltando:", { locationId, contactId, message });
      return res.status(400).json({
        success: false,
        message: "Faltando parâmetros: locationId, contactId e message são obrigatórios"
      });
    }

    // Busca o instanceName específico desta instalação
    const installationDetails = await ghl.model.getInstallationInfo(locationId);
    if (!installationDetails) {
      return res.status(404).json({
        success: false,
        message: 'Instalação não encontrada'
      });
    }

    console.log("Parâmetros recebidos:", { locationId, contactId, message, messageId });
    console.log("Configuração Evolution API:", {
      url: baseIntegrationConfig.evolutionApiUrl,
      instanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName,
      hasApiKey: !!baseIntegrationConfig.evolutionApiKey
    });

    // Configura o serviço com o instanceName específico desta instalação
    const dynamicConfig: IntegrationConfig = {
      ...baseIntegrationConfig,
      defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
    };
    
    const dynamicIntegrationService = new IntegrationService(dynamicConfig);
    const result = await dynamicIntegrationService.sendMessageToWhatsApp(locationId, contactId, message, messageId);
    
    console.log("Resultado do envio:", result);
    console.log("=== FIM DO ENVIO DE MENSAGEM ===");
    
    if (result.success) {
      res.json(result);
  } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error("Erro ao enviar mensagem para Evolution API:", error);
    res.status(500).json({
      success: false,
      message: "Erro interno ao enviar mensagem",
      error: error.message
    });
  } finally {
    console.log("=== FIM DO ENVIO DE MENSAGEM ===");
  }
});

app.post("/decrypt-sso", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { key } = req.body || {};
    
    if (!key) {
      return res.status(400).json({
        success: false,
        message: "Please send valid key"
      });
    }

    const data = ghl.decryptSSOData(key);
    res.json({
      success: true,
      data: data
    });
  } catch (error: any) {
    console.error('Erro ao descriptografar SSO:', error);
    res.status(400).json({
      success: false,
      message: "Invalid Key",
      error: error.message
    });
  }
});

app.get("/", function (req, res) {
  res.sendFile(path + "index.html");
});

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Servidor funcionando",
    timestamp: new Date().toISOString(),
    version: "2.0.0"
  });
});

// Endpoint para verificar configurações
app.get("/config", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Configurações do servidor",
    config: {
      server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || 'development'
      },
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || '5432',
        database: process.env.DB_NAME || 'ghl_integration',
        user: process.env.DB_USER || 'não configurado',
        hasPassword: !!process.env.DB_PASSWORD
      },
      evolutionApi: {
  url: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  instanceName: 'DINÂMICO (por instalação)',
  hasApiKey: !!process.env.EVOLUTION_API_KEY
},
      goHighLevel: {
        apiDomain: process.env.GHL_API_DOMAIN || 'não configurado',
        hasClientId: !!process.env.GHL_APP_CLIENT_ID,
        hasClientSecret: !!process.env.GHL_APP_CLIENT_SECRET,
        hasSSOKey: !!process.env.GHL_APP_SSO_KEY
      }
    },
    timestamp: new Date().toISOString()
  });
});

// Endpoint temporário para atualizar status de integração
app.post("/debug/update-integration-status", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { resourceId, status } = req.body;
    
    if (!resourceId || !status) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID e status são obrigatórios'
      });
    }

    await ghl.model.updateIntegrationStatus(resourceId, status as IntegrationStatus);
    
    res.json({
      success: true,
      message: `Status atualizado para ${status}`,
      resourceId
    });
  } catch (error: any) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao atualizar status',
      error: error.message
    });
  }
});

// Rota para desinstalação manual do app
app.delete("/integration/uninstall/:resourceId", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.params;
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID é obrigatório'
      });
    }

    // Logs de desinstalação simplificados
    console.log(`🗑️ Desinstalação manual solicitada para: ${resourceId}`);

    // Verifica se a instalação existe
    const exists = await ghl.checkInstallationExists(resourceId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: 'Instalação não encontrada',
        data: { resourceId }
      });
    }

    // Busca informações da instalação antes de deletar
    const installationDetails = await ghl.model.getInstallationInfo(resourceId);
    
    // Remove a instalação
    await ghl.deleteInstallationInfo(resourceId);
    
    // Logs de desinstalação simplificados
    console.log(`✅ Instalação removida com sucesso: ${resourceId}`);
    
    res.status(200).json({
      success: true,
      message: 'App desinstalado com sucesso',
      data: {
        resourceId,
        removedAt: new Date().toISOString(),
        installationDetails: installationDetails ? {
          locationId: installationDetails.locationId,
          companyId: installationDetails.companyId,
          userType: installationDetails.userType,
          evolutionInstanceName: installationDetails.evolutionInstanceName
        } : null
      }
    });

  } catch (error: any) {
    console.error('❌ Erro na desinstalação manual:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno na desinstalação',
      error: error.message
    });
  }
});

// Rota para listar todas as instalações (útil para debug)
app.get("/integration/installations", 
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
  try {
    // Logs de listagem simplificados
    console.log('📋 Listando todas as instalações...');
    
    const installations = await ghl.model.getAllInstallations();
    
    // Logs de listagem simplificados
    console.log(`✅ ${installations.length} instalações encontradas`);
    
    res.status(200).json({
      success: true,
      message: `${installations.length} instalações encontradas`,
      data: {
        count: installations.length,
        installations: installations.map(inst => ({
          id: inst.id,
          locationId: inst.locationId,
          companyId: inst.companyId,
          userType: inst.userType,
          integrationStatus: inst.integrationStatus,
          evolutionInstanceName: inst.evolutionInstanceName,
          lastSyncAt: inst.lastSyncAt,
          createdAt: inst.createdAt,
          updatedAt: inst.updatedAt
        }))
      }
    });

  } catch (error: any) {
    console.error('❌ Erro ao listar instalações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao listar instalações',
      error: error.message
    });
  }
});

// Teste de conectividade com Evolution API
app.get("/test-evolution", 
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
  try {
    // Logs de teste simplificados
    console.log('=== TESTE DE CONECTIVIDADE EVOLUTION API ===');
console.log('Configuração:', {
  url: baseIntegrationConfig.evolutionApiUrl,
  instanceName: 'DINÂMICO (por instalação)',
  hasApiKey: !!baseIntegrationConfig.evolutionApiKey
});

// Teste direto na API para ver o status real
console.log('Testando status direto na API...');
console.log('⚠️ AVISO: Teste usando instanceName padrão - em produção use instanceName específico da instalação');
const axios = require('axios');
const directResponse = await axios.get(
  `${baseIntegrationConfig.evolutionApiUrl}/instance/connectionState/${baseIntegrationConfig.defaultInstanceName}`,
  {
    headers: {
      'apikey': baseIntegrationConfig.evolutionApiKey
    }
  }
);
    
    console.log('Resposta direta da API:', directResponse.data);
    const directStatus = directResponse.data.state;
    
    const evolutionService = new EvolutionApiService({
  baseUrl: baseIntegrationConfig.evolutionApiUrl,
  apiKey: baseIntegrationConfig.evolutionApiKey,
  instanceName: baseIntegrationConfig.defaultInstanceName // Usa padrão apenas para teste
});

    // Testa se consegue conectar
    console.log('Testando conectividade via serviço...');
    const isConnected = await evolutionService.checkInstanceStatus();
    
    console.log('Resultado do teste direto:', directStatus);
    console.log('Resultado do teste via serviço:', isConnected ? 'CONECTADO' : 'DESCONECTADO');
    
    res.json({
  success: true,
  message: "Teste de conectividade com Evolution API",
  config: {
    url: baseIntegrationConfig.evolutionApiUrl,
    instanceName: 'DINÂMICO (por instalação)',
    hasApiKey: !!baseIntegrationConfig.evolutionApiKey
  },
  directApiResponse: directResponse.data,
  directStatus: directStatus,
  serviceStatus: isConnected ? 'connected' : 'disconnected',
  timestamp: new Date().toISOString(),
  note: "Teste usa instanceName padrão - em produção cada instalação tem seu próprio instanceName"
});
  } catch (error: any) {
    console.error('Erro no teste de conectividade:', error);
    res.status(500).json({
  success: false,
  message: "Erro ao testar Evolution API",
  error: error.message,
  config: {
    url: baseIntegrationConfig.evolutionApiUrl,
    instanceName: 'DINÂMICO (por instalação)',
    hasApiKey: !!baseIntegrationConfig.evolutionApiKey
  },
  timestamp: new Date().toISOString()
});
  }
});

// Rota para testar atualização de status de mensagem (PUT)
app.put("/integration/update-message-status/:resourceId/:messageId", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { resourceId, messageId } = req.params;
    
    if (!resourceId || !messageId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID e Message ID são obrigatórios'
      });
    }

    console.log(`🔄 Testando atualização de status da mensagem ${messageId} para "delivered"...`);
    
    const statusUpdateResponse = await ghl.requests(resourceId).put(
      `/conversations/messages/${messageId}/status`,
      { status: "delivered" },
      {
        headers: {
          Version: "2021-04-15"
        }
      }
    );
    
    console.log(`✅ Status da mensagem atualizado com sucesso:`, statusUpdateResponse.data);
    
    res.json({
      success: true,
      message: "Status da mensagem atualizado para delivered",
      data: statusUpdateResponse.data
    });
  } catch (error: any) {
    console.error('Erro ao atualizar status da mensagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao atualizar status da mensagem',
      error: error.response?.data || error.message
    });
  }
});

// Rota para testar atualização de status de mensagem (GET - para facilitar testes)
app.get("/integration/update-message-status/:resourceId/:messageId", 
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
  try {
    const { resourceId, messageId } = req.params;
    
    if (!resourceId || !messageId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID e Message ID são obrigatórios'
      });
    }

    console.log(`🔄 Testando atualização de status da mensagem ${messageId} para "delivered"...`);
    
    const statusUpdateResponse = await ghl.requests(resourceId).put(
      `/conversations/messages/${messageId}/status`,
      { status: "delivered" },
      {
        headers: {
          Version: "2021-04-15"
        }
      }
    );
    
    console.log(`✅ Status da mensagem atualizado com sucesso:`, statusUpdateResponse.data);
    
    res.json({
      success: true,
      message: "Status da mensagem atualizado para delivered",
      data: statusUpdateResponse.data
    });
  } catch (error: any) {
    console.error('Erro ao atualizar status da mensagem:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao atualizar status da mensagem',
      error: error.response?.data || error.message
    });
  }
});

app.listen(port, () => {
  console.log(`GHL Integration App listening on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Evolution API URL: ${baseIntegrationConfig.evolutionApiUrl}`);
});