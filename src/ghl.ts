import qs from "qs";
import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from "axios";
import { createDecipheriv, createHash } from 'node:crypto';

import { Model, TokenType, AppUserType, InstallationDetails } from "./model";

export class GHL {
  public model: Model;

  constructor() {
    this.model = new Model();
  }

  async authorizationHandler(code: string) {
    if (!code) {
      console.warn(
        "Please provide code when making call to authorization Handler"
      );
    }
    await this.generateAccessTokenRefreshTokenPair(code);
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
    locationId: string
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
        evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME || 'default',
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('💾 Salvando dados de instalação:', installationData);
      
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
      
    } catch (error: any) {
      console.error('❌ Erro ao renovar token:', error?.response?.data || error);
      throw error;
    }
  }

  private async generateAccessTokenRefreshTokenPair(code: string) {
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
      
      console.log('📡 Resposta da API GHL:', resp.data);
      
      // Extrai os dados da resposta
      const tokenData = resp.data;
      
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
        evolutionInstanceName: process.env.EVOLUTION_INSTANCE_NAME || 'default',
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      console.log('💾 Salvando dados de instalação:', installationData);
      
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