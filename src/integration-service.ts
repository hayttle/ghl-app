import { GHL } from './ghl';
import { EvolutionApiService } from './evolution-api';
import { Model, IntegrationStatus } from './model';

export interface IntegrationConfig {
  evolutionApiUrl: string;
  evolutionApiKey: string;
  defaultInstanceName: string;
}

export interface SyncResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

export class IntegrationService {
  private ghl: GHL;
  private model: Model;
  private evolutionService: EvolutionApiService;
  private config: IntegrationConfig;

  constructor(config: IntegrationConfig) {
    this.ghl = new GHL();
    this.model = new Model();
    this.config = config;
    
    // Inicializa o serviço Evolution API com configuração padrão
    this.evolutionService = new EvolutionApiService({
      baseUrl: config.evolutionApiUrl,
      apiKey: config.evolutionApiKey,
      instanceName: config.defaultInstanceName
    });
  }

  /**
   * Configura uma nova integração entre GHL e Evolution API
   */
  async setupIntegration(
    resourceId: string, 
    evolutionInstanceName?: string
  ): Promise<SyncResult> {
    try {
      console.log(`Configurando integração para o recurso: ${resourceId}`);
      
      // Verifica se a instalação existe
      const installation = await this.model.getInstallationInfo(resourceId);
      if (!installation) {
        return {
          success: false,
          message: 'Instalação não encontrada',
          error: 'INSTALLATION_NOT_FOUND'
        };
      }

      // Atualiza o nome da instância Evolution
      const instanceName = evolutionInstanceName || this.config.defaultInstanceName;
      await this.model.saveInstallationInfo({
        ...installation,
        evolutionInstanceName: instanceName,
        integrationStatus: IntegrationStatus.Pending
      });

      // Verifica se a instância Evolution existe
      const evolutionService = new EvolutionApiService({
        baseUrl: this.config.evolutionApiUrl,
        apiKey: this.config.evolutionApiKey,
        instanceName: instanceName
      });

      const isConnected = await evolutionService.checkInstanceStatus();
      if (!isConnected) {
        // Tenta criar a instância se não existir
        const createResult = await evolutionService.createInstance();
        if (!createResult.success) {
          await this.model.updateIntegrationStatus(resourceId, IntegrationStatus.Error);
          return {
            success: false,
            message: 'Falha ao criar instância Evolution',
            error: createResult.error
          };
        }
      }

      // Atualiza status para ativo
      await this.model.updateIntegrationStatus(resourceId, IntegrationStatus.Active);
      
      return {
        success: true,
        message: 'Integração configurada com sucesso',
        data: { instanceName, resourceId }
      };

    } catch (error: unknown) {
      console.error('Erro ao configurar integração:', error);
      await this.model.updateIntegrationStatus(resourceId, IntegrationStatus.Error);
      
      return {
        success: false,
        message: 'Erro ao configurar integração',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Sincroniza contatos entre GHL e Evolution API
   */
  async syncContacts(resourceId: string): Promise<SyncResult> {
    try {
      console.log(`Sincronizando contatos para o recurso: ${resourceId}`);
      
      const installation = await this.model.getInstallationInfo(resourceId);
      if (!installation) {
        return {
          success: false,
          message: 'Instalação não encontrada',
          error: 'INSTALLATION_NOT_FOUND'
        };
      }

      // Busca contatos no GHL
      const ghlContacts = await this.getGHLContacts(resourceId);
      if (!ghlContacts.success) {
        return ghlContacts;
      }

      // Sincroniza com Evolution API
      const syncResults = [];
      for (const contact of ghlContacts.data) {
        try {
          const contactInfo = await this.evolutionService.getContactInfo(contact.phone);
          if (contactInfo.success) {
            syncResults.push({
              contactId: contact.id,
              phone: contact.phone,
              synced: true
            });
          } else {
            syncResults.push({
              contactId: contact.id,
              phone: contact.phone,
              synced: false,
              error: contactInfo.error
            });
          }
        } catch (error: unknown) {
          syncResults.push({
            contactId: contact.id,
            phone: contact.phone,
            synced: false,
            error: 'Erro na sincronização'
          });
        }
      }

      // Atualiza tempo de última sincronização
      await this.model.updateLastSyncTime(resourceId);

      return {
        success: true,
        message: `Sincronização concluída. ${syncResults.filter(r => r.synced).length} contatos sincronizados.`,
        data: { syncResults, totalContacts: ghlContacts.data.length }
      };

    } catch (error: unknown) {
      console.error('Erro na sincronização de contatos:', error);
      return {
        success: false,
        message: 'Erro na sincronização de contatos',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Envia mensagem do GHL para WhatsApp via Evolution API
   */
  async sendMessageToWhatsApp(
    resourceId: string,
    contactId: string,
    message: string,
    messageId?: string
  ): Promise<SyncResult> {
    try {
      console.log(`=== INÍCIO DO ENVIO DE MENSAGEM WHATSAPP ===`);
      console.log(`Enviando mensagem para WhatsApp via recurso: ${resourceId}`);
      console.log(`Contact ID: ${contactId}`);
      console.log(`Mensagem: ${message}`);
      console.log(`Message ID recebido: ${messageId}`);
      
      // Busca informações da instalação
      console.log(`Buscando informações da instalação para: ${resourceId}`);
      const installation = await this.model.getInstallationInfo(resourceId);
      if (!installation) {
        console.log(`Instalação não encontrada para: ${resourceId}`);
        return {
          success: false,
          message: 'Instalação não encontrada',
          error: 'INSTALLATION_NOT_FOUND'
        };
      }
      
      console.log(`Instalação encontrada:`, {
        locationId: installation.locationId,
        companyId: installation.companyId,
        evolutionInstanceName: installation.evolutionInstanceName,
        conversationProviderId: installation.conversationProviderId
      });

      // Busca informações do contato no GHL
      console.log(`Buscando informações do contato no GHL: ${contactId}`);
      const contactInfo = await this.getGHLContactInfo(resourceId, contactId);
      if (!contactInfo.success) {
        console.log(`Falha ao buscar contato:`, contactInfo);
        return contactInfo;
      }
      
      console.log(`Contato encontrado:`, {
        id: contactInfo.data.id,
        phone: contactInfo.data.phone
      });

      // Configura o serviço Evolution com a instância correta
      const instanceName = installation.evolutionInstanceName || this.config.defaultInstanceName;
      console.log(`Configurando Evolution API com instância: ${instanceName}`);
      console.log(`Configuração Evolution:`, {
        baseUrl: this.config.evolutionApiUrl,
        hasApiKey: !!this.config.evolutionApiKey,
        instanceName: instanceName
      });
      
      const evolutionService = new EvolutionApiService({
        baseUrl: this.config.evolutionApiUrl,
        apiKey: this.config.evolutionApiKey,
        instanceName: instanceName
      });

      // Envia a mensagem
      console.log(`Enviando mensagem via Evolution API para: ${contactInfo.data.phone}`);
      const sendResult = await evolutionService.sendTextMessage(
        contactInfo.data.phone,
        message
      );
      
      console.log(`Resultado do envio Evolution API:`, sendResult);

      if (sendResult.success) {
        // Atualiza status da mensagem para "delivered" no GHL se messageId foi fornecido
        if (messageId) {
          try {
            console.log(`🔄 Atualizando status da mensagem ${messageId} para "delivered" no GHL...`);
            
            const statusUpdateResponse = await this.ghl.requests(resourceId).put(
              `/conversations/messages/${messageId}/status`,
              { status: "delivered" },
              {
                headers: {
                  Version: "2021-04-15"
                }
              }
            );
            
            console.log(`✅ Status da mensagem atualizado para "delivered":`, statusUpdateResponse.data);
          } catch (statusError: any) {
            console.error("❌ Erro ao atualizar status da mensagem:", statusError.response?.data || statusError.message);
            // Não falha o envio por erro de atualização de status
          }
        } else {
          console.log("⚠️ MessageId não fornecido - não é possível atualizar status automaticamente");
        }

        // Atualiza tempo de última sincronização
        await this.model.updateLastSyncTime(resourceId);
        
        return {
          success: true,
          message: 'Mensagem enviada com sucesso',
          data: sendResult.data
        };
      } else {
        return {
          success: false,
          message: 'Falha ao enviar mensagem',
          error: sendResult.error
        };
      }

    } catch (error: unknown) {
      console.error('Erro ao enviar mensagem para WhatsApp:', error);
      return {
        success: false,
        message: 'Erro ao enviar mensagem para WhatsApp',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Processa mensagem recebida do WhatsApp e sincroniza com GHL
   */
  async processIncomingMessage(
    phoneNumber: string,
    message: string,
    resourceId: string,
    pushName?: string
  ): Promise<SyncResult> {
    try {
      console.log(`=== PROCESSANDO MENSAGEM RECEBIDA ===`);
      console.log(`Telefone: ${phoneNumber}`);
      console.log(`Mensagem: ${message}`);
      console.log(`Resource ID: ${resourceId}`);
      
      const installation = await this.model.getInstallationInfo(resourceId);
      if (!installation) {
        console.log('❌ Instalação não encontrada');
        return {
          success: false,
          message: 'Instalação não encontrada',
          error: 'INSTALLATION_NOT_FOUND'
        };
      }

      console.log('✅ Instalação encontrada:', {
        locationId: installation.locationId,
        companyId: installation.companyId,
        evolutionInstanceName: installation.evolutionInstanceName,
        conversationProviderId: installation.conversationProviderId,
        integrationStatus: installation.integrationStatus
      });

      // Busca ou cria contato no GHL
      const contactResult = await this.findOrCreateGHLContact(resourceId, phoneNumber, pushName);
      if (!contactResult.success) {
        console.log('❌ Falha ao buscar/criar contato:', contactResult);
        return contactResult;
      }

      console.log('✅ Contato processado:', {
        contactId: contactResult.data.id,
        phone: contactResult.data.phone || contactResult.data.phoneNumber
      });

      // Posta a mensagem no GHL
      console.log('📤 Postando mensagem no GHL com conversationId:', contactResult.data.conversationId);
      const postResult = await this.postMessageToGHL(
        resourceId,
        contactResult.data.id,
        message,
        contactResult.data.conversationId
      );

      if (postResult.success) {
        await this.model.updateLastSyncTime(resourceId);
        
        return {
          success: true,
          message: 'Mensagem processada e sincronizada com sucesso',
          data: {
            contactId: contactResult.data.id,
            messagePosted: true
          }
        };
      } else {
        return postResult;
      }

    } catch (error: unknown) {
      console.error('Erro ao processar mensagem recebida:', error);
      return {
        success: false,
        message: 'Erro ao processar mensagem recebida',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Busca contatos no GHL
   */
  private async getGHLContacts(resourceId: string): Promise<SyncResult> {
    try {
      const response = await this.ghl.requests(resourceId).get('/contacts/', {
        headers: { Version: "2021-04-15" }
      });

      const contacts = response.data.contacts || [];
      return {
        success: true,
        message: `${contacts.length} contatos encontrados`,
        data: contacts
      };
    } catch (error: unknown) {
      console.error('Erro ao buscar contatos no GHL:', error);
      return {
        success: false,
        message: 'Erro ao buscar contatos no GHL',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Busca informações de um contato específico no GHL
   */
  private async getGHLContactInfo(resourceId: string, contactId: string): Promise<SyncResult> {
    try {
      const response = await this.ghl.requests(resourceId).get(`/contacts/${contactId}`, {
        headers: { Version: "2021-04-15" }
      });

      return {
        success: true,
        message: 'Contato encontrado',
        data: response.data.contact
      };
    } catch (error: unknown) {
      console.error('Erro ao buscar informações do contato no GHL:', error);
      return {
        success: false,
        message: 'Erro ao buscar informações do contato no GHL',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Busca ou cria contato no GHL e retorna com conversationId
   */
  private async findOrCreateGHLContact(resourceId: string, phoneNumber: string, pushName?: string): Promise<SyncResult> {
    try {
      // Primeiro tenta buscar o contato usando o endpoint correto
      console.log('🔍 Buscando contato pelo telefone:', phoneNumber);
      console.log('🔍 Parâmetros da busca:', { locationId: resourceId, phone: phoneNumber });
      
      const searchResponse = await this.ghl.requests(resourceId).get('/contacts', {
        params: {
          locationId: resourceId,
          query: phoneNumber
        },
        headers: { Version: "2021-07-28" }
      });
      
      console.log('🔍 Resposta da busca de contato:', searchResponse.data);

      let contact;
      if (searchResponse.data.contacts && searchResponse.data.contacts.length > 0) {
        contact = searchResponse.data.contacts[0];
        console.log('✅ Contato existente encontrado:', contact.id);
      } else {
        // Se não encontrou, cria um novo contato
        console.log('📝 Criando novo contato para:', phoneNumber);
        
        // Prepara payload para criação do contato (apenas campos obrigatórios)
        const contactPayload = {
          locationId: resourceId,
          phone: phoneNumber,
          firstName: pushName || 'WhatsApp'
        };
        
        console.log('📝 Payload para criação do contato:', contactPayload);
        
        const createResponse = await this.ghl.requests(resourceId).post('/contacts/', contactPayload, {
          headers: { Version: "2021-07-28" }
        });
        
        console.log('📝 Resposta da criação do contato:', createResponse.data);
        contact = createResponse.data.contact;
        console.log('✅ Novo contato criado:', contact.id);
      }

      // Agora busca a conversa para este contato usando o endpoint correto
      console.log('🔍 Buscando conversa para o contato:', contact.id);
      const conversationResponse = await this.ghl.requests(resourceId).get('/conversations/search/', {
        params: {
          locationId: resourceId,
          contactId: contact.id
        },
        headers: { Version: "2021-04-15" }
      });

      let conversationId;
      if (conversationResponse.data.conversations && conversationResponse.data.conversations.length > 0) {
        conversationId = conversationResponse.data.conversations[0].id;
        console.log('✅ Conversa existente encontrada:', conversationId);
      } else {
        // Se não encontrou conversa, cria uma nova
        console.log('📝 Criando nova conversa para o contato:', contact.id);
        const newConversationResponse = await this.ghl.requests(resourceId).post('/conversations/', {
          contactId: contact.id,
          locationId: resourceId,
          type: 'SMS',
          status: 'Active'
        }, {
          headers: { Version: "2021-07-28" }
        });
        conversationId = newConversationResponse.data.conversation.id;
        console.log('✅ Nova conversa criada:', conversationId);
      }

      // Retorna contato com conversationId
      return {
        success: true,
        message: 'Contato e conversa processados',
        data: {
          ...contact,
          conversationId: conversationId
        }
      };

    } catch (error: unknown) {
      console.error('Erro ao buscar/criar contato e conversa no GHL:', error);
      
      // Log detalhado do erro
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error('🔴 Detalhes do erro GHL:');
        console.error('Status:', axiosError.response?.status);
        console.error('Status Text:', axiosError.response?.statusText);
        console.error('Data:', axiosError.response?.data);
        console.error('Headers:', axiosError.response?.headers);
      }
      
      return {
        success: false,
        message: 'Erro ao buscar/criar contato e conversa no GHL',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Posta mensagem no GHL usando conversationId já encontrado
   */
  private async postMessageToGHL(
    resourceId: string,
    contactId: string,
    message: string,
    conversationId: string
  ): Promise<SyncResult> {
    try {
      console.log(`=== POSTANDO MENSAGEM NO GHL ===`);
      console.log(`Resource ID: ${resourceId}`);
      console.log(`Contact ID: ${contactId}`);
      console.log(`Conversation ID: ${conversationId}`);
      
      // Endpoint específico para mensagens inbound (recebidas) segundo a documentação oficial
      const response = await this.ghl.requests(resourceId).post('/conversations/messages/inbound', {
        type: 'SMS',  // Tipo correto para mensagens WhatsApp
        message: message,
        conversationId: conversationId
      }, {
        headers: { Version: "2021-04-15" }
      });

      return {
        success: true,
        message: 'Mensagem postada no GHL com sucesso',
        data: response.data
      };

    } catch (error: unknown) {
      console.error('Erro ao postar mensagem no GHL:', error);
      return {
        success: false,
        message: 'Erro ao postar mensagem no GHL',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Verifica o status de todas as integrações
   */
  async checkIntegrationStatuses(): Promise<SyncResult> {
    try {
      const activeIntegrations = await this.model.getActiveIntegrations();
      const statusResults = [];

      for (const integration of activeIntegrations) {
        const resourceId = integration.locationId || integration.companyId;
        if (!resourceId) continue;

        try {
          const evolutionService = new EvolutionApiService({
            baseUrl: this.config.evolutionApiUrl,
            apiKey: this.config.evolutionApiKey,
            instanceName: integration.evolutionInstanceName || this.config.defaultInstanceName
          });

          const isConnected = await evolutionService.checkInstanceStatus();
          const status = isConnected ? IntegrationStatus.Active : IntegrationStatus.Error;
          
          await this.model.updateIntegrationStatus(resourceId, status);
          
          statusResults.push({
            resourceId,
            status,
            instanceName: integration.evolutionInstanceName
          });
        } catch (error: unknown) {
          await this.model.updateIntegrationStatus(resourceId, IntegrationStatus.Error);
          statusResults.push({
            resourceId,
            status: IntegrationStatus.Error,
            error: error instanceof Error ? error.message : 'Erro desconhecido'
          });
        }
      }

      return {
        success: true,
        message: `Status verificado para ${statusResults.length} integrações`,
        data: { statusResults }
      };

    } catch (error: unknown) {
      console.error('Erro ao verificar status das integrações:', error);
      return {
        success: false,
        message: 'Erro ao verificar status das integrações',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }
}
