import axios, {InternalAxiosRequestConfig} from "axios"
import {createDecipheriv, createHash} from "node:crypto"
import qs from "qs"

import {Model, TokenType, IntegrationStatus} from "./model"

export class GHL {
  public model: Model

  constructor() {
    this.model = new Model()
  }

  async authorizationHandler(code: string, instanceName?: string, tag?: string) {
    if (!code) {
      console.warn("Please provide code when making call to authorization Handler")
    }

    if (!instanceName) {
      console.error("❌ ERRO: instanceName é obrigatório para configuração da instância Evolution!")
      console.error("❌ Para corrigir:")
      console.error("   1. Inclua instanceName na URL de instalação")
      console.error(
        "   2. Exemplo: https://marketplace.gohighlevel.com/install?appId=XXX&locationId=YYY&instanceName=ZZZ"
      )
      throw new Error("instanceName é obrigatório para configuração da instância Evolution")
    }

    // Logs de autorização simplificados
    console.log(`🔐 Iniciando autorização com instanceName: ${instanceName}${tag ? ` e tag: ${tag}` : ""}`)
    await this.generateAccessTokenRefreshTokenPair(code, instanceName, tag)
  }

  decryptSSOData(key: string) {
    try {
      const blockSize = 16
      const keySize = 32
      const ivSize = 16
      const saltSize = 8

      const rawEncryptedData = Buffer.from(key, "base64")
      const salt = rawEncryptedData.subarray(saltSize, blockSize)
      const cipherText = rawEncryptedData.subarray(blockSize)

      let result = Buffer.alloc(0, 0)
      while (result.length < keySize + ivSize) {
        const hasher = createHash("md5")
        result = Buffer.concat([
          result,
          hasher
            .update(
              Buffer.concat([
                result.subarray(-ivSize),
                Buffer.from(process.env.GHL_APP_SSO_KEY as string, "utf-8"),
                salt
              ])
            )
            .digest()
        ])
      }

      const decipher = createDecipheriv(
        "aes-256-cbc",
        result.subarray(0, keySize),
        result.subarray(keySize, keySize + ivSize)
      )

      const decrypted = decipher.update(cipherText)
      const finalDecrypted = Buffer.concat([decrypted, decipher.final()])
      return JSON.parse(finalDecrypted.toString())
    } catch (error) {
      console.error("Error decrypting SSO data:", error)
      throw error
    }
  }

  requests(resourceId: string) {
    const baseUrl = process.env.GHL_API_DOMAIN
    const model = this.model

    const axiosInstance = axios.create({
      baseURL: baseUrl
    })

    axiosInstance.interceptors.request.use(async (requestConfig: InternalAxiosRequestConfig) => {
      try {
        requestConfig.headers["Authorization"] = `${TokenType.Bearer} ${await model.getAccessToken(resourceId)}`
        requestConfig.headers["locationId"] = resourceId
      } catch (e) {
        console.error(e)
      }
      return requestConfig
    })

    axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config
        if (error.response.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true
          await this.refreshAccessToken(resourceId)
          originalRequest.headers.Authorization = `Bearer ${await model.getAccessToken(resourceId)}`
          return axios(originalRequest)
        }
        return Promise.reject(error)
      }
    )
    return axiosInstance
  }

  async checkInstallationExists(resourceId: string): Promise<boolean> {
    return await this.model.checkInstallationExists(resourceId)
  }

  async deleteInstallationInfo(locationId: string) {
    await this.model.deleteInstallationInfo(locationId)
  }

  async getLocationTokenFromCompanyToken(companyId: string, locationId: string, instanceName?: string) {
    try {
      console.log("🔄 Obtendo token de localização para:", {companyId, locationId})

      const res = await this.requests(companyId).post(
        "/oauth/locationToken",
        {
          companyId,
          locationId
        },
        {
          headers: {
            Version: "2021-07-28"
          }
        }
      )

      console.log("📡 Token de localização obtido com sucesso")

      const installationData = {
        ...res.data,
        locationId: locationId,
        companyId: companyId,
        userType: "Location",
        integrationStatus: "active",
        evolutionInstanceName: instanceName || "default",
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log("💾 Salvando dados de instalação:", {
        locationId: installationData.locationId,
        companyId: installationData.companyId,
        evolutionInstanceName: installationData.evolutionInstanceName
      })

      await this.model.saveInstallationInfo(installationData)

      console.log("✅ Instalação de localização salva com sucesso")
    } catch (error: any) {
      console.error("❌ Erro ao obter token de localização:", error?.response?.data || error)
      throw error
    }
  }

  private async refreshAccessToken(resourceId: string) {
    try {
      console.log("🔄 Renovando token de acesso para:", resourceId)

      const resp = await axios.post(
        `${process.env.GHL_API_DOMAIN}/oauth/token`,
        qs.stringify({
          client_id: process.env.GHL_APP_CLIENT_ID,
          client_secret: process.env.GHL_APP_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: await this.model.getRefreshToken(resourceId)
        }),
        {headers: {"content-type": "application/x-www-form-urlencoded"}}
      )

      console.log("📡 Token renovado com sucesso")

      await this.model.saveInstallationInfo({
        ...resp.data,
        locationId: resourceId,
        updatedAt: new Date().toISOString()
      })

      console.log("✅ Token renovado salvo no banco")

      // ✅ NOVO: Verificar se o token renovado tem as permissões necessárias
      console.log("🔍 Verificando permissões do token renovado...")
      try {
        // ✅ NOVO: Usar chamada direta para evitar loop infinito
        const accessToken = await this.model.getAccessToken(resourceId)
        await axios.get(`${process.env.GHL_API_DOMAIN}/users/me`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            locationId: resourceId,
            Version: "2021-07-28"
          }
        })
        console.log("✅ Token renovado tem permissões válidas")
      } catch (testError: any) {
        if (testError.response?.status === 401) {
          console.error("❌ Token renovado não tem permissões suficientes")
          console.error("❌ Erro:", testError.response?.data?.message || testError.message)
          console.error("🔄 Solução: Reinstale o app para obter novas permissões")

          // ✅ NOVO: Marcar instalação como com erro de permissões
          await this.model.updateIntegrationStatus(resourceId, IntegrationStatus.Error)

          throw new Error("Token renovado não tem permissões suficientes. Reinstale o app.")
        }
        throw testError
      }
    } catch (error: any) {
      console.error("❌ Erro ao renovar token:", error?.response?.data || error)
      throw error
    }
  }

  private async generateAccessTokenRefreshTokenPair(code: string, instanceName?: string, tag?: string) {
    try {
      console.log("🔄 Gerando par de tokens de acesso...")

      // ✅ NOVO: Validação das variáveis de ambiente antes da requisição
      console.log("🔍 === VALIDAÇÃO DE VARIÁVEIS DE AMBIENTE ===")
      console.log("🔍 GHL_API_DOMAIN:", process.env.GHL_API_DOMAIN || "❌ NÃO CONFIGURADO")
      console.log("🔍 GHL_APP_CLIENT_ID:", process.env.GHL_APP_CLIENT_ID ? "✅ CONFIGURADO" : "❌ NÃO CONFIGURADO")
      console.log(
        "🔍 GHL_APP_CLIENT_SECRET:",
        process.env.GHL_APP_CLIENT_SECRET ? "✅ CONFIGURADO" : "❌ NÃO CONFIGURADO"
      )
      console.log("🔍 GHL_APP_REDIRECT_URI:", process.env.GHL_APP_REDIRECT_URI || "❌ NÃO CONFIGURADO")
      console.log("🔍 ========================================")

      // ✅ NOVO: Validação do código de autorização
      console.log("🔍 === VALIDAÇÃO DO CÓDIGO DE AUTORIZAÇÃO ===")
      console.log("🔍 Código recebido:", code ? `✅ ${code.substring(0, 10)}...` : "❌ CÓDIGO VAZIO")
      console.log("🔍 Tamanho do código:", code?.length || 0)
      console.log("🔍 ==========================================")

      const requestData = {
        client_id: process.env.GHL_APP_CLIENT_ID,
        client_secret: process.env.GHL_APP_CLIENT_SECRET,
        grant_type: "authorization_code",
        code
      }

      console.log("🔍 === DADOS DA REQUISIÇÃO ===")
      console.log("🔍 URL:", `${process.env.GHL_API_DOMAIN}/oauth/token`)
      console.log("🔍 client_id:", requestData.client_id)
      console.log("🔍 client_secret:", requestData.client_secret ? "***CONFIGURADO***" : "❌ NÃO CONFIGURADO")
      console.log("🔍 grant_type:", requestData.grant_type)
      console.log("🔍 code:", requestData.code ? `***${requestData.code.substring(0, 10)}...***` : "❌ VAZIO")
      console.log("🔍 ==========================")

      const resp = await axios.post(`${process.env.GHL_API_DOMAIN}/oauth/token`, qs.stringify(requestData), {
        headers: {"content-type": "application/x-www-form-urlencoded"}
      })

      // ✅ NOVO: Logs detalhados da resposta da API GHL
      console.log("📡 === RESPOSTA COMPLETA DA API GHL ===")
      console.log("📡 Status:", resp.status)
      console.log("📡 Headers:", JSON.stringify(resp.headers, null, 2))
      console.log("📡 Data completa:", JSON.stringify(resp.data, null, 2))
      console.log("📡 ======================================")

      // ✅ NOVO: Logs específicos dos campos importantes
      console.log("🔍 === CAMPOS IMPORTANTES DA INSTALAÇÃO ===")
      console.log("🔍 access_token:", resp.data.access_token ? "***CONFIGURADO***" : "NÃO CONFIGURADO")
      console.log("🔍 refresh_token:", resp.data.refresh_token ? "***CONFIGURADO***" : "NÃO CONFIGURADO")
      console.log("🔍 token_type:", resp.data.token_type || "NÃO CONFIGURADO")
      console.log("🔍 expires_in:", resp.data.expires_in || "NÃO CONFIGURADO")
      console.log("🔍 scope:", resp.data.scope || "NÃO CONFIGURADO")
      console.log("🔍 locationId:", resp.data.locationId || "NÃO CONFIGURADO")
      console.log("🔍 companyId:", resp.data.companyId || "NÃO CONFIGURADO")
      console.log("🔍 conversationProviderId:", resp.data.conversationProviderId || "NÃO CONFIGURADO")
      console.log("🔍 appId:", resp.data.appId || "NÃO CONFIGURADO")
      console.log("🔍 userId:", resp.data.userId || "NÃO CONFIGURADO")
      console.log("🔍 locationName:", resp.data.locationName || "NÃO CONFIGURADO")
      console.log("🔍 companyName:", resp.data.companyName || "NÃO CONFIGURADO")
      console.log("🔍 ===========================================")

      // ✅ NOVO: Logs de todos os campos disponíveis
      console.log("🔍 === TODOS OS CAMPOS DISPONÍVEIS ===")
      Object.keys(resp.data).forEach((key) => {
        const value = resp.data[key]
        if (typeof value === "string" && value.length > 100) {
          console.log(`🔍 ${key}: [STRING LONGA - ${value.length} caracteres]`)
        } else if (typeof value === "object") {
          console.log(`🔍 ${key}: [OBJETO] ${JSON.stringify(value, null, 2)}`)
        } else {
          console.log(`🔍 ${key}: ${value}`)
        }
      })
      console.log("🔍 ======================================")

      // ✅ NOVO: Decodificar JWT token para extrair conversationProviderId
      console.log("🔍 === DECODIFICANDO JWT TOKEN ===")

      // Extrai os dados da resposta
      const tokenData = resp.data

      // ✅ CORREÇÃO: ConversationProviderId deve ser configurado manualmente
      // O sourceId do JWT NÃO é o conversationProviderId que precisamos
      console.log("🔍 === CONFIGURANDO CONVERSATIONPROVIDERID ===")

      // ✅ OPÇÃO 1: Usar variável de ambiente se configurada
      if (process.env.GHL_CONVERSATION_PROVIDER_ID) {
        tokenData.conversationProviderId = process.env.GHL_CONVERSATION_PROVIDER_ID
        console.log("✅ ConversationProviderId configurado via variável de ambiente:", tokenData.conversationProviderId)
      } else {
        // ✅ OPÇÃO 2: Usar o ID correto identificado pelo usuário
        tokenData.conversationProviderId = "68a1f3cb0547607a9d820805"
        console.log("✅ ConversationProviderId usando ID fixo identificado:", tokenData.conversationProviderId)
        console.log("⚠️ Para personalizar, configure GHL_CONVERSATION_PROVIDER_ID no .env")
      }

      console.log("🔍 ======================================")

      // Para integração com Evolution API, precisamos SEMPRE de um locationId
      // O app deve ser instalado diretamente na subconta (location), não na empresa
      if (!tokenData.locationId) {
        console.error("❌ ERRO: Esta instalação não tem locationId!")
        console.error("❌ O app deve ser instalado diretamente na SUBCONTA (location), não na empresa principal")
        console.error("❌ Para corrigir:")
        console.error("   1. Desinstale o app da empresa")
        console.error("   2. Instale o app diretamente na subconta desejada")
        console.error("   3. Isso garantirá que o webhook funcione corretamente")
        throw new Error("App deve ser instalado em subconta (location), não em empresa principal")
      }

      // Se chegou aqui, temos um locationId válido
      const resourceId = tokenData.locationId
      const userType = "Location"

      console.log("📍 Instalação de Subconta (Location) detectada ✅")
      console.log("📍 LocationId:", tokenData.locationId)
      console.log("📍 ResourceId:", resourceId)

      // Prepara dados para salvar
      const installationData = {
        ...tokenData,
        locationId: tokenData.locationId,
        companyId: tokenData.companyId || null,
        userType: userType,
        integrationStatus: "active",
        evolutionInstanceName: instanceName || "default",
        clientId: process.env.GHL_APP_CLIENT_ID,
        clientSecret: process.env.GHL_APP_CLIENT_SECRET,
        tag: tag || null,
        lastSyncAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      console.log("💾 === DADOS QUE SERÃO SALVOS NO BANCO ===")
      console.log("💾 locationId:", installationData.locationId)
      console.log("💾 companyId:", installationData.companyId)
      console.log("💾 evolutionInstanceName:", installationData.evolutionInstanceName)
      console.log("💾 conversationProviderId:", installationData.conversationProviderId)
      console.log("💾 tag:", installationData.tag)
      console.log("💾 appId:", installationData.appId)
      console.log("💾 userId:", installationData.userId)
      console.log("💾 ===========================================")

      await this.model.saveInstallationInfo(installationData)

      console.log("✅ Instalação salva com sucesso para a subconta:", resourceId)
      console.log("📍 LocationId armazenado:", tokenData.locationId)
      console.log("🚀 Webhook configurado e pronto para receber mensagens!")
    } catch (error: any) {
      console.error("❌ Erro ao gerar tokens:", error?.response?.data || error)

      // ✅ NOVO: Tratamento específico para diferentes tipos de erro
      if (error?.response?.status === 400) {
        const errorData = error.response.data
        console.error("❌ === ERRO 400 - BAD REQUEST ===")
        console.error("❌ Erro completo:", JSON.stringify(errorData, null, 2))

        if (
          errorData?.error === "invalid_grant" ||
          errorData?.error_description?.includes("invalid") ||
          errorData?.error_description?.includes("expired")
        ) {
          console.error("❌ PROBLEMA IDENTIFICADO: Código de autorização inválido!")
          console.error("❌ Erro específico:", errorData?.error_description || errorData?.error)
          console.error("❌ ======================================")
          console.error("❌ DIAGNÓSTICO:")
          console.error("   🔍 Código recebido:", code ? `${code.substring(0, 10)}...` : "NENHUM")
          console.error("   🔍 Client ID:", process.env.GHL_APP_CLIENT_ID ? "✅ Configurado" : "❌ Não configurado")
          console.error("   🔍 Client Secret:", process.env.GHL_APP_CLIENT_SECRET ? "✅ Configurado" : "❌ Não configurado")
          console.error("   🔍 Redirect URI:", process.env.GHL_APP_REDIRECT_URI || "❌ Não configurado")
          console.error("❌ ======================================")
          console.error("❌ POSSÍVEIS CAUSAS:")
          console.error("   1. 🚨 CÓDIGO JÁ USADO (mais provável) - Códigos OAuth2 são single-use")
          console.error("   2. ⏰ Código expirado (válido por poucos minutos)")
          console.error("   3. 🔗 Redirect URI incorreto")
          console.error("   4. 🔑 Credenciais incorretas")
          console.error("❌ ======================================")
          console.error("❌ SOLUÇÃO:")
          console.error("   📝 O usuário deve iniciar uma NOVA instalação")
          console.error("   📝 Não reutilizar o mesmo link de autorização")
          console.error("   📝 Completar o fluxo OAuth2 em uma única sessão")
          console.error("❌ ======================================")

          // ✅ NOVO: Erro mais específico baseado na descrição
          if (errorData?.error_description?.includes("invalid")) {
            throw new Error("Código de autorização já foi usado ou é inválido. Inicie uma nova instalação.")
          } else if (errorData?.error_description?.includes("expired")) {
            throw new Error("Código de autorização expirou. Inicie uma nova instalação.")
          } else {
            throw new Error(`Código de autorização inválido: ${errorData?.error_description || "Código já usado ou expirado"}`)
          }
        } else if (errorData?.error === "invalid_client") {
          console.error("❌ PROBLEMA IDENTIFICADO: Client ID ou Client Secret incorretos!")
          console.error("❌ Verifique as variáveis de ambiente:")
          console.error("   - GHL_APP_CLIENT_ID")
          console.error("   - GHL_APP_CLIENT_SECRET")
          throw new Error("Client ID ou Client Secret incorretos")
        } else {
          console.error("❌ ERRO 400 não identificado:", errorData)
          throw new Error(
            `Erro de autorização: ${errorData?.error_description || errorData?.error || "Erro desconhecido"}`
          )
        }
      } else if (error?.response?.status === 401) {
        console.error("❌ === ERRO 401 - UNAUTHORIZED ===")
        console.error("❌ Client ID ou Client Secret incorretos ou app não autorizado")
        throw new Error("Credenciais inválidas - verifique Client ID e Client Secret")
      } else if (error?.response?.status >= 500) {
        console.error("❌ === ERRO DO SERVIDOR GHL ===")
        console.error("❌ Problema no servidor do GoHighLevel")
        throw new Error("Erro temporário do servidor GoHighLevel - tente novamente")
      } else {
        console.error("❌ === ERRO DESCONHECIDO ===")
        console.error("❌ Status:", error?.response?.status)
        console.error("❌ Dados:", error?.response?.data)
        throw error
      }
    }
  }
}
