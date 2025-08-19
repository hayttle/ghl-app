import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { GHL } from "./ghl";
import { json } from "body-parser";
import axios, { AxiosError } from "axios";
import * as CryptoJS from 'crypto-js';
import { TokenType, AppUserType, InstallationDetails, IntegrationStatus } from "./model";
import { IntegrationService, IntegrationConfig } from "./integration-service";
import { EvolutionApiService } from "./evolution-api";

const path = __dirname + "/ui/dist/";

dotenv.config();
const app: Express = express();
app.use(json({ type: 'application/json' }))

app.use(express.static(path));

const ghl = new GHL();

// Configuração do serviço de integração - MOVIDA PARA DEPOIS DO dotenv.config()
const integrationConfig: IntegrationConfig = {
  evolutionApiUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
  evolutionApiKey: process.env.EVOLUTION_API_KEY || '',
  defaultInstanceName: process.env.EVOLUTION_INSTANCE_NAME || 'ghl_integration'
};

const integrationService = new IntegrationService(integrationConfig);

const port = process.env.PORT || 3000;

// Log das configurações carregadas
console.log('=== CONFIGURAÇÕES CARREGADAS ===');
console.log('Variáveis de ambiente EVOLUTION:');
console.log('  EVOLUTION_API_URL:', process.env.EVOLUTION_API_URL);
console.log('  EVOLUTION_API_KEY:', process.env.EVOLUTION_API_KEY ? '***CONFIGURADA***' : 'NÃO CONFIGURADA');
console.log('  EVOLUTION_INSTANCE_NAME:', process.env.EVOLUTION_INSTANCE_NAME);
console.log('');

console.log('Servidor:', {
  port: port,
  environment: process.env.NODE_ENV || 'development'
});
console.log('Banco de Dados:', {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || '5432',
  database: process.env.DB_NAME || 'ghl_integration',
  user: process.env.DB_USER || 'não configurado',
  hasPassword: !!process.env.DB_PASSWORD
});
console.log('Evolution API:', {
  url: integrationConfig.evolutionApiUrl,
  instanceName: integrationConfig.defaultInstanceName,
  hasApiKey: !!integrationConfig.evolutionApiKey
});
console.log('GoHighLevel:', {
  apiDomain: process.env.GHL_API_DOMAIN || 'não configurado',
  hasClientId: !!process.env.GHL_APP_CLIENT_ID,
  hasClientSecret: !!process.env.GHL_APP_CLIENT_SECRET,
  hasSSOKey: !!process.env.GHL_APP_SSO_KEY
});
console.log('================================');

// Middleware para logging
app.use((req: Request, res: Response, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Middleware para tratamento de erros
app.use((error: any, req: Request, res: Response, next: any) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
  });
});

app.get("/authorize-handler", async (req: Request, res: Response) => {
  try {
    const { code } = req.query;
    if (code) {
      await ghl.authorizationHandler(code as string);
      res.redirect("https://app.gohighlevel.com/");
    } else {
      res.status(400).send("Código de autorização ausente.");
    }
  } catch (error) {
    console.error('Erro no handler de autorização:', error);
    res.status(500).send("Erro durante a autorização.");
  }
});

// Rotas de integração
app.post("/integration/setup", async (req: Request, res: Response) => {
  try {
    const { resourceId, evolutionInstanceName } = req.body;
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID é obrigatório'
      });
    }

    const result = await integrationService.setupIntegration(resourceId, evolutionInstanceName);
    
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

app.post("/integration/sync-contacts", async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.body;
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID é obrigatório'
      });
    }

    const result = await integrationService.syncContacts(resourceId);
    
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

app.post("/integration/send-message", async (req: Request, res: Response) => {
  try {
    const { resourceId, contactId, message } = req.body;
    
    if (!resourceId || !contactId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID, Contact ID e Message são obrigatórios'
      });
    }

    const result = await integrationService.sendMessageToWhatsApp(resourceId, contactId, message);
    
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

app.get("/integration/status", async (req: Request, res: Response) => {
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
app.get("/example-api-call", async (req: Request, res: Response) => {
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

app.get("/example-api-call-location", async (req: Request, res: Response) => {
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

// Webhook handler refatorado
app.post("/webhook/ghl", async (req: Request, res: Response) => {
  try {
    console.log("=== WEBHOOK GHL RECEBIDO ===");
    console.log("Body completo:", JSON.stringify(req.body, null, 2));
    
    const eventType = req.body.type;
    const { contactId, locationId, message, conversationProviderId, companyId } = req.body;

    console.log(`📡 Tipo de evento: ${eventType}`);
    console.log(`📍 LocationId: ${locationId}`);
    console.log(`🏢 CompanyId: ${companyId}`);

    switch (eventType) {
      case 'UNINSTALL':
        console.log("🗑️ Evento UNINSTALL detectado - removendo instalação...");
        
        if (locationId) {
          try {
            // Verifica se a instalação existe antes de deletar
            const exists = await ghl.checkInstallationExists(locationId);
            if (exists) {
              await ghl.deleteInstallationInfo(locationId);
              console.log(`✅ Instalação removida com sucesso para locationId: ${locationId}`);
            } else {
              console.log(`⚠️ Instalação não encontrada para locationId: ${locationId}`);
            }
          } catch (error: any) {
            console.error(`❌ Erro ao remover instalação para locationId ${locationId}:`, error);
          }
        } else if (companyId) {
          console.log(`⚠️ UNINSTALL sem locationId, mas com companyId: ${companyId}`);
          console.log("⚠️ Tentando remover por companyId...");
          try {
            const exists = await ghl.checkInstallationExists(companyId);
            if (exists) {
              await ghl.deleteInstallationInfo(companyId);
              console.log(`✅ Instalação removida com sucesso para companyId: ${companyId}`);
            } else {
              console.log(`⚠️ Instalação não encontrada para companyId: ${companyId}`);
            }
          } catch (error: any) {
            console.error(`❌ Erro ao remover instalação para companyId ${companyId}:`, error);
          }
        } else {
          console.log("❌ UNINSTALL sem locationId nem companyId - não é possível identificar qual instalação remover");
        }
        
        res.status(200).json({ 
          success: true, 
          message: "Desinstalação processada",
          data: { locationId, companyId, eventType }
        });
        break;

      case 'INSTALL':
        console.log("📦 Evento INSTALL detectado - configurando integração...");
        
        if (locationId) {
          console.log(`✅ Configurando integração para locationId: ${locationId}`);
          try {
            await integrationService.setupIntegration(locationId);
            console.log(`✅ Integração configurada com sucesso para locationId: ${locationId}`);
          } catch (error: any) {
            console.error(`❌ Erro ao configurar integração para locationId ${locationId}:`, error);
          }
        } else {
          console.log("⚠️ INSTALL sem locationId - não é possível configurar integração");
        }
        
        res.status(200).json({ 
          success: true, 
          message: "Evento de instalação processado",
          data: { locationId, companyId, eventType }
        });
        break;

      case "OutboundMessage":
        console.log("📤 Evento OutboundMessage detectado - processando mensagem...");
        
        if (conversationProviderId && locationId && contactId && message) {
          try {
            // Verifica se a mensagem não veio do próprio sistema (WhatsApp)
            const messageDirection = req.body.direction;
            if (messageDirection === 'inbound') {
              console.log("🔄 Mensagem ignorada - direction 'inbound' indica mensagem recebida, evitando loop");
              res.status(200).json({
                success: true,
                message: "Mensagem recebida ignorada para evitar loop"
              });
              break;
            }

            console.log(`📝 Processando mensagem outbound para contactId: ${contactId}`);
            console.log(`💬 Mensagem: ${message}`);

            // Atualiza conversationProviderId na instalação
            const installationDetails = await ghl.model.getInstallationInfo(locationId);
            if (installationDetails) {
              await ghl.model.saveInstallationInfo({
                ...installationDetails,
                conversationProviderId: conversationProviderId
              });
              console.log(`✅ ConversationProviderId atualizado: ${conversationProviderId}`);
            }

            // Envia mensagem via Evolution API
            const result = await integrationService.sendMessageToWhatsApp(
              locationId,
              contactId,
              message
            );

            if (result.success) {
              console.log("✅ Mensagem enviada com sucesso via Evolution API");
              res.status(200).json({
                success: true,
                message: "Webhook processado e mensagem enviada"
              });
            } else {
              console.error("❌ Falha ao enviar mensagem:", result.error);
              res.status(500).json({
                success: false,
                message: "Webhook processado, mas falha ao enviar mensagem",
                error: result.error
              });
            }
          } catch (error: any) {
            console.error("❌ Erro ao processar mensagem outbound:", error);
            res.status(500).json({
              success: false,
              message: "Erro ao processar webhook",
              error: error.message
            });
          }
        } else {
          console.log("⚠️ Dados incompletos para mensagem outbound:");
          console.log(`  - conversationProviderId: ${conversationProviderId}`);
          console.log(`  - locationId: ${locationId}`);
          console.log(`  - contactId: ${contactId}`);
          console.log(`  - message: ${message}`);
          
          res.status(200).json({
            success: true,
            message: "Webhook processado, mas dados incompletos"
          });
        }
        break;

      default:
        console.log(`❓ Tipo de evento não suportado: ${eventType}`);
        res.status(200).json({
          success: true,
          message: "Tipo de evento não suportado"
        });
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

// Webhook handler da Evolution API refatorado
app.post("/webhook/evolution", async (req: Request, res: Response) => {
  try {
    console.log("Webhook da Evolution API recebido:", req.body);
    
    const evolutionEvent = req.body;
    
    if (evolutionEvent.event === "messages.upsert" && evolutionEvent.data.key.fromMe === false) {
      console.log("Evento de mensagem recebida detectado. Processando...");
      
      const messageData = evolutionEvent.data;
      const inboundMessageText = messageData.message.conversation;
      const inboundPhoneNumber = `+${messageData.key.remoteJid.replace('@s.whatsapp.net', '')}`;
      const pushName = messageData.pushName || messageData.data?.pushName;
      
      console.log(`Mensagem recebida do telefone ${inboundPhoneNumber}: "${inboundMessageText}"`);
      console.log(`Push Name: ${pushName}`);
      
      // Debug: Verificar todas as integrações no banco
      try {
        const allIntegrations = await ghl.model.getAllInstallations();
        console.log('Todas as integrações no banco:', JSON.stringify(allIntegrations, null, 2));
      } catch (error) {
        console.error('Erro ao buscar todas as integrações:', error);
      }
      
      // Busca por integrações ativas
      const activeIntegrations = await ghl.model.getActiveIntegrations();
      console.log(`Integrações ativas encontradas: ${activeIntegrations.length}`);
      console.log('Detalhes das integrações:', JSON.stringify(activeIntegrations, null, 2));
      
      for (const integration of activeIntegrations) {
        const resourceId = integration.locationId || integration.companyId;
        if (!resourceId) continue;

        try {
          const result = await integrationService.processIncomingMessage(
            inboundPhoneNumber,
            inboundMessageText,
            resourceId,
            pushName
          );

          if (result.success) {
            console.log(`Mensagem processada com sucesso para o recurso: ${resourceId}`);
            return res.status(200).json({
              success: true,
              message: "Mensagem processada e sincronizada com GHL"
            });
          }
        } catch (error) {
          console.error(`Erro ao processar mensagem para o recurso ${resourceId}:`, error);
          continue;
        }
      }

      console.log("Nenhuma integração ativa encontrada para processar a mensagem");
      res.status(200).json({
        success: true,
        message: "Mensagem recebida, mas nenhuma integração ativa encontrada"
      });
    } else {
      res.status(200).json({
        success: true,
        message: "Tipo de evento não suportado ou mensagem de saída"
      });
    }
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
app.post("/send-message-evolution", async (req: Request, res: Response) => {
  try {
    console.log("=== INÍCIO DO ENVIO DE MENSAGEM ===");
    console.log("Corpo da requisição:", req.body);
    
    const { locationId, contactId, message } = req.body;
    
    if (!locationId || !contactId || !message) {
      console.log("Parâmetros faltando:", { locationId, contactId, message });
      return res.status(400).json({
        success: false,
        message: "Faltando parâmetros: locationId, contactId e message são obrigatórios"
      });
    }

    console.log("Parâmetros recebidos:", { locationId, contactId, message });
    console.log("Configuração Evolution API:", {
      url: integrationConfig.evolutionApiUrl,
      instanceName: integrationConfig.defaultInstanceName,
      hasApiKey: !!integrationConfig.evolutionApiKey
    });

    const result = await integrationService.sendMessageToWhatsApp(locationId, contactId, message);
    
    console.log("Resultado do envio:", result);
    
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

app.post("/decrypt-sso", async (req: Request, res: Response) => {
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
        instanceName: process.env.EVOLUTION_INSTANCE_NAME || 'ghl_integration',
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
app.post("/debug/update-integration-status", async (req: Request, res: Response) => {
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
app.delete("/integration/uninstall/:resourceId", async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.params;
    
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: 'Resource ID é obrigatório'
      });
    }

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
app.get("/integration/installations", async (req: Request, res: Response) => {
  try {
    console.log('📋 Listando todas as instalações...');
    
    const installations = await ghl.model.getAllInstallations();
    
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
app.get("/test-evolution", async (req: Request, res: Response) => {
  try {
    console.log('=== TESTE DE CONECTIVIDADE EVOLUTION API ===');
    console.log('Configuração:', {
      url: integrationConfig.evolutionApiUrl,
      instanceName: integrationConfig.defaultInstanceName,
      hasApiKey: !!integrationConfig.evolutionApiKey
    });

    // Teste direto na API para ver o status real
    console.log('Testando status direto na API...');
    const axios = require('axios');
    const directResponse = await axios.get(
      `${integrationConfig.evolutionApiUrl}/instance/connectionState/${integrationConfig.defaultInstanceName}`,
      {
        headers: {
          'apikey': integrationConfig.evolutionApiKey
        }
      }
    );
    
    console.log('Resposta direta da API:', directResponse.data);
    const directStatus = directResponse.data.state;
    
    const evolutionService = new EvolutionApiService({
      baseUrl: integrationConfig.evolutionApiUrl,
      apiKey: integrationConfig.evolutionApiKey,
      instanceName: integrationConfig.defaultInstanceName
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
        url: integrationConfig.evolutionApiUrl,
        instanceName: integrationConfig.defaultInstanceName,
        hasApiKey: !!integrationConfig.evolutionApiKey
      },
      directApiResponse: directResponse.data,
      directStatus: directStatus,
      serviceStatus: isConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Erro no teste de conectividade:', error);
    res.status(500).json({
      success: false,
      message: "Erro ao testar Evolution API",
      error: error.message,
      config: {
        url: integrationConfig.evolutionApiUrl,
        instanceName: integrationConfig.defaultInstanceName,
        hasApiKey: !!integrationConfig.evolutionApiKey
      },
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(port, () => {
  console.log(`GHL Integration App listening on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Evolution API URL: ${integrationConfig.evolutionApiUrl}`);
});