import axios, { InternalAxiosRequestConfig } from "axios";
import { createDecipheriv, createHash } from 'node:crypto';
import qs from "qs";

import { Model, TokenType, IntegrationStatus } from "./model";

export class GHL {
  public model: Model;

  constructor() {
    this.model = new Model();
  }



  async authorizationHandler(code: string, instanceName?: string) {
    if (!code) {
      console.warn(
        "Please provide code when making call to authorization Handler"
      );
    }
    
    if (!instanceName) {
      console.error('❌ ERRO: instanceName é obrigatório para configuração da instância Evolution!');
      console.error('❌ Para corrigir:');
      console.error('   1. Inclua instanceName na URL de instalação');
      console.error('   2. Exemplo: https://marketplace.gohighlevel.com/install?appId=XXX&locationId=YYY&instanceName=ZZZ');
      throw new Error('instanceName é obrigatório para configuração da instância Evolution');
    }
    
    // Logs de autorização simplificados
    console.log(`🔐 Iniciando autorização com instanceName: ${instanceName}`);
    await this.generateAccessTokenRefreshTokenPair(code, instanceName);
  }

  decryptSSOData(key: string) {
    try {
      const blockSize = 16;
      const keySize = 32;
      const ivSize = 16;
      const saltSize = 8;
      
      const rawEncryptedData = Buffer.from(key, 'base64');
      const salt = rawEncryptedData.subarray(saltSize, blockSize);
      const cipherText = rawEncryptedData.subarray(blockSize);
      
      let result = Buffer.alloc(0, 0);
      while (result.length < (keySize + ivSize)) {
        const hasher = createHash('md5');
        result = Buffer.concat([
          result,
          hasher.update(Buffer.concat([
            result.subarray(-ivSize),
            Buffer.from(process.env.GHL_APP_SSO_KEY as string, 'utf-8'),
            salt
          ])).digest()
        ]);
      }
      
      const decipher = createDecipheriv(
        'aes-256-cbc',
        result.subarray(0, keySize),
        result.subarray(keySize, keySize + ivSize)
      );
      
      const decrypted = decipher.update(cipherText);
      const finalDecrypted = Buffer.concat([decrypted, decipher.final()]);
      return JSON.parse(finalDecrypted.toString());
    } catch (error) {
      console.error('Error decrypting SSO data:', error);
      throw error;
    }
  }

  requests(resourceId: string) {
    const baseUrl = process.env.GHL_API_DOMAIN;
    const model = this.model;

    const axiosInstance = axios.create({
        baseURL: baseUrl,
    });

    axiosInstance.interceptors.request.use(
        async (requestConfig: InternalAxiosRequestConfig) => {
            try {
                requestConfig.headers["Authorization"] = `${TokenType.Bearer} ${await model.getAccessToken(resourceId)}`;
                requestConfig.headers["locationId"] = resourceId;
            } catch (e) {
                console.error(e);
            }
            return requestConfig;
        }
    );

    axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config;
            if (error.response.status === 401 && !originalRequest._retry) {
                originalRequest._retry = true;
                await this.refreshAccessToken(resourceId);
                originalRequest.headers.Authorization = `Bearer ${await model.getAccessToken(resourceId)}`;
                return axios(originalRequest);
            }
            return Promise.reject(error);
        }
    );
    return axiosInstance;
  }

  async checkInstallationExists(resourceId: string): Promise<boolean>{
    return await this.model.checkInstallationExists(resourceId)
  }

  async deleteInstallationInfo(locationId: string) {
    await this.model.deleteInstallationInfo(locationId);
  }

  async getLocationTokenFromCompanyToken(
    companyId: string,
    locationId: string,
    instanceName?: string
  ) {
    try {
      console.log('🔄 Obtendo token de localização para:', { companyId, locationId });
      
      const res = await this.requests(companyId).post(
        "/oauth/locationToken",
        {
          companyId,
          locationId,
        },
        {
          headers: {
            Version: "2021-07-28",
          },
        }
      );
      
      console.log('📡 Token de localização obtido com sucesso');
      
      const installationData = {
        ...res.data,
        locationId: locationId,
        companyId: companyId,
        userType: 'Location',
        integrationStatus: 'active',
        evolutionInstanceName: instanceName || 'default',
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('💾 Salvando dados de instalação:', {
        locationId: installationData.locationId,
        companyId: installationData.companyId,
        evolutionInstanceName: installationData.evolutionInstanceName
      });
      
      await this.model.saveInstallationInfo(installationData);
      
      console.log('✅ Instalação de localização salva com sucesso');
      
    } catch (error: any) {
      console.error('❌ Erro ao obter token de localização:', error?.response?.data || error);
      throw error;
    }
  }

  private async refreshAccessToken(resourceId: string) {
    try {
      console.log('🔄 Renovando token de acesso para:', resourceId);
      
      const resp = await axios.post(
        `${process.env.GHL_API_DOMAIN}/oauth/token`,
        qs.stringify({
          client_id: process.env.GHL_APP_CLIENT_ID,
          client_secret: process.env.GHL_APP_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: await this.model.getRefreshToken(resourceId),
        }),
        { headers: { "content-type": "application/x-www-form-urlencoded" } }
      );
      
      console.log('📡 Token renovado com sucesso');
      
      await this.model.saveInstallationInfo({
        ...resp.data,
        locationId: resourceId,
        updatedAt: new Date().toISOString()
      });
      
      console.log('✅ Token renovado salvo no banco');
      
             // ✅ NOVO: Verificar se o token renovado tem as permissões necessárias
       console.log('🔍 Verificando permissões do token renovado...');
       try {
         // ✅ NOVO: Usar chamada direta para evitar loop infinito
         const accessToken = await this.model.getAccessToken(resourceId);
         await axios.get(
           `${process.env.GHL_API_DOMAIN}/users/me`,
           {
             headers: {
               'Authorization': `Bearer ${accessToken}`,
               'locationId': resourceId,
               'Version': '2021-07-28'
             }
           }
         );
         console.log('✅ Token renovado tem permissões válidas');
       } catch (testError: any) {
         if (testError.response?.status === 401) {
           console.error('❌ Token renovado não tem permissões suficientes');
           console.error('❌ Erro:', testError.response?.data?.message || testError.message);
           console.error('🔄 Solução: Reinstale o app para obter novas permissões');
           
           // ✅ NOVO: Marcar instalação como com erro de permissões
           await this.model.updateIntegrationStatus(resourceId, IntegrationStatus.Error);
           
           throw new Error('Token renovado não tem permissões suficientes. Reinstale o app.');
         }
         throw testError;
       }
      
    } catch (error: any) {
      console.error('❌ Erro ao renovar token:', error?.response?.data || error);
      throw error;
    }
  }

  private async generateAccessTokenRefreshTokenPair(code: string, instanceName?: string) {
    try {
      console.log('🔄 Gerando par de tokens de acesso...');
      
      const resp = await axios.post(
        `${process.env.GHL_API_DOMAIN}/oauth/token`,
        qs.stringify({
          client_id: process.env.GHL_APP_CLIENT_ID,
          client_secret: process.env.GHL_APP_CLIENT_SECRET,
          grant_type: "authorization_code",
          code,
        }),
        { headers: { "content-type": "application/x-www-form-urlencoded" } }
      );
      
      // ✅ NOVO: Logs detalhados da resposta da API GHL
      console.log('📡 === RESPOSTA COMPLETA DA API GHL ===');
      console.log('📡 Status:', resp.status);
      console.log('📡 Headers:', JSON.stringify(resp.headers, null, 2));
      console.log('📡 Data completa:', JSON.stringify(resp.data, null, 2));
      console.log('📡 ======================================');
      
      // ✅ NOVO: Logs específicos dos campos importantes
      console.log('🔍 === CAMPOS IMPORTANTES DA INSTALAÇÃO ===');
      console.log('🔍 access_token:', resp.data.access_token ? '***CONFIGURADO***' : 'NÃO CONFIGURADO');
      console.log('🔍 refresh_token:', resp.data.refresh_token ? '***CONFIGURADO***' : 'NÃO CONFIGURADO');
      console.log('🔍 token_type:', resp.data.token_type || 'NÃO CONFIGURADO');
      console.log('🔍 expires_in:', resp.data.expires_in || 'NÃO CONFIGURADO');
      console.log('🔍 scope:', resp.data.scope || 'NÃO CONFIGURADO');
      console.log('🔍 locationId:', resp.data.locationId || 'NÃO CONFIGURADO');
      console.log('🔍 companyId:', resp.data.companyId || 'NÃO CONFIGURADO');
      console.log('🔍 conversationProviderId:', resp.data.conversationProviderId || 'NÃO CONFIGURADO');
      console.log('🔍 appId:', resp.data.appId || 'NÃO CONFIGURADO');
      console.log('🔍 userId:', resp.data.userId || 'NÃO CONFIGURADO');
      console.log('🔍 locationName:', resp.data.locationName || 'NÃO CONFIGURADO');
      console.log('🔍 companyName:', resp.data.companyName || 'NÃO CONFIGURADO');
      console.log('🔍 ===========================================');
      
      // ✅ NOVO: Logs de todos os campos disponíveis
      console.log('🔍 === TODOS OS CAMPOS DISPONÍVEIS ===');
      Object.keys(resp.data).forEach(key => {
        const value = resp.data[key];
        if (typeof value === 'string' && value.length > 100) {
          console.log(`🔍 ${key}: [STRING LONGA - ${value.length} caracteres]`);
        } else if (typeof value === 'object') {
          console.log(`🔍 ${key}: [OBJETO] ${JSON.stringify(value, null, 2)}`);
        } else {
          console.log(`🔍 ${key}: ${value}`);
        }
      });
      console.log('🔍 ======================================');
      
      // ✅ NOVO: Decodificar JWT token para extrair conversationProviderId
      console.log('🔍 === DECODIFICANDO JWT TOKEN ===');
      
      // Extrai os dados da resposta
      const tokenData = resp.data;
      
      // ✅ CORREÇÃO: ConversationProviderId deve ser configurado manualmente
      // O sourceId do JWT NÃO é o conversationProviderId que precisamos
      console.log('🔍 === CONFIGURANDO CONVERSATIONPROVIDERID ===');
      
      // ✅ OPÇÃO 1: Usar variável de ambiente se configurada
      if (process.env.GHL_CONVERSATION_PROVIDER_ID) {
        tokenData.conversationProviderId = process.env.GHL_CONVERSATION_PROVIDER_ID;
        console.log('✅ ConversationProviderId configurado via variável de ambiente:', tokenData.conversationProviderId);
      } else {
        // ✅ OPÇÃO 2: Usar o ID correto identificado pelo usuário
        tokenData.conversationProviderId = "68a1f3cb0547607a9d820805";
        console.log('✅ ConversationProviderId usando ID fixo identificado:', tokenData.conversationProviderId);
        console.log('⚠️ Para personalizar, configure GHL_CONVERSATION_PROVIDER_ID no .env');
      }
      
      console.log('🔍 ======================================');
      
      // Para integração com Evolution API, precisamos SEMPRE de um locationId
      // O app deve ser instalado diretamente na subconta (location), não na empresa
      if (!tokenData.locationId) {
        console.error('❌ ERRO: Esta instalação não tem locationId!');
        console.error('❌ O app deve ser instalado diretamente na SUBCONTA (location), não na empresa principal');
        console.error('❌ Para corrigir:');
        console.error('   1. Desinstale o app da empresa');
        console.error('   2. Instale o app diretamente na subconta desejada');
        console.error('   3. Isso garantirá que o webhook funcione corretamente');
        throw new Error('App deve ser instalado em subconta (location), não em empresa principal');
      }
      
      // Se chegou aqui, temos um locationId válido
      const resourceId = tokenData.locationId;
      const userType = 'Location';
      
      console.log('📍 Instalação de Subconta (Location) detectada ✅');
      console.log('📍 LocationId:', tokenData.locationId);
      console.log('📍 ResourceId:', resourceId);
      
      // Prepara dados para salvar
      const installationData = {
        ...tokenData,
        locationId: tokenData.locationId,
        companyId: tokenData.companyId || null,
        userType: userType,
        integrationStatus: 'active',
        evolutionInstanceName: instanceName || 'default',
        clientId: process.env.GHL_APP_CLIENT_ID,
        clientSecret: process.env.GHL_APP_CLIENT_SECRET,
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('💾 === DADOS QUE SERÃO SALVOS NO BANCO ===');
      console.log('💾 locationId:', installationData.locationId);
      console.log('💾 companyId:', installationData.companyId);
      console.log('💾 evolutionInstanceName:', installationData.evolutionInstanceName);
      console.log('💾 conversationProviderId:', installationData.conversationProviderId);
      console.log('💾 appId:', installationData.appId);
      console.log('💾 userId:', installationData.userId);
      console.log('💾 ===========================================');
      
      await this.model.saveInstallationInfo(installationData);
      
      console.log('✅ Instalação salva com sucesso para a subconta:', resourceId);
      console.log('📍 LocationId armazenado:', tokenData.locationId);
      console.log('🚀 Webhook configurado e pronto para receber mensagens!');
      
    } catch (error: any) {
      console.error('❌ Erro ao gerar tokens:', error?.response?.data || error);
      throw error;
    }
  }
}