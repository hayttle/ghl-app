import express, {Express, Request, Response} from "express"
import dotenv from "dotenv"
import cookieParser from "cookie-parser"
import cors from "cors"
import {GHL} from "./ghl"
import {json} from "body-parser"
import {IntegrationStatus} from "./model"
import {IntegrationService, IntegrationConfig} from "./integration-service"
import {EvolutionApiService} from "./evolution-api"
import axios from "axios"

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
} from "./security-middleware"

import {securityConfig, validateSecurityConfig} from "./security-config"
import {ghlCredentialsValidator} from "./ghl-credentials-validator"
import {getSenderPhoneNumber, formatPhoneNumber} from "./evolution-webhook-helper"

const path = __dirname + "/ui/dist/"

// Carregar variáveis de ambiente
dotenv.config()

// ✅ NOVO: Declaração de tipo para o cache global de deduplicação
declare global {
  // eslint-disable-next-line no-unused-vars
  var recentProcessedMessages: {[key: string]: string} | undefined
}

// Inicializar cache global de deduplicação
global.recentProcessedMessages = {}

// Validação de configuração de segurança
const securityWarnings = validateSecurityConfig()
if (securityWarnings.length > 0) {
  console.log("🚨 AVISOS DE SEGURANÇA:")
  securityWarnings.forEach((warning) => console.log(warning))
}

const app: Express = express()

// ========================================
// CONFIGURAÇÃO DE PROXY (para produção e desenvolvimento)
// ========================================
// Em produção, confia no proxy para rate-limit funcionar corretamente
app.set("trust proxy", true)
if (process.env.NODE_ENV === "development") {
  console.log("🔧 Modo desenvolvimento: proxy confiável ativado para ngrok")
} else {
  console.log("🔧 Modo produção: proxy confiável ativado para rate-limit")
}

// ========================================
// MIDDLEWARE DE SEGURANÇA
// ========================================

// Headers de segurança básicos
app.use(securityHeaders)

// CORS restritivo
app.use(cors(corsOptions))

// Rate limiting global
app.use(rateLimiter)

// Validação de tamanho de payload
app.use(validatePayloadSize)

// Sanitização de input
app.use(sanitizeInput)

// Logging seguro
app.use(secureLogging)

// Proteção contra ataques de timing
app.use(timingAttackProtection)

// Parser de JSON com limite de tamanho
app.use(
  json({
    type: "application/json",
    limit: securityConfig.payload.maxSize
  })
)

app.use(cookieParser())

app.use(express.static(path))

const ghl = new GHL()

// Configuração base do serviço de integração
const baseIntegrationConfig: IntegrationConfig = {
  evolutionApiUrl: process.env.EVOLUTION_API_URL || "http://localhost:8080",
  evolutionApiKey: process.env.EVOLUTION_API_KEY || "",
  defaultInstanceName: "default" // Valor padrão apenas para fallback
}

// Serviço de integração será configurado dinamicamente por instalação
const integrationService = new IntegrationService(baseIntegrationConfig)

const port = process.env.PORT || 3000

// Logs de inicialização simplificados
console.log("🚀 Servidor iniciando...")
console.log("🔧 Modo desenvolvimento: proxy confiável limitado ativado para ngrok")

// Logs de configuração simplificados
console.log("=== CONFIGURAÇÕES CARREGADAS ===")
console.log("Evolution API:", process.env.EVOLUTION_API_KEY ? "✅ CONFIGURADA" : "❌ NÃO CONFIGURADA")
console.log("GoHighLevel:", process.env.GHL_APP_CLIENT_ID ? "✅ CONFIGURADO" : "❌ NÃO CONFIGURADO")
console.log(
  "Banco de Dados:",
  process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME
    ? "✅ CONFIGURADO"
    : "❌ NÃO CONFIGURADO"
)
console.log("================================")

// Middleware de logging seguro já aplicado acima

// Rota intermediária para capturar instanceName e tag antes do OAuth
app.get(
  "/authorize-start",
  authRateLimiter, // Rate limiting para autenticação
  async (req: Request, res: Response) => {
    try {
      const {instanceName, tag} = req.query

      if (!instanceName) {
        return res.status(400).json({
          success: false,
          message: "InstanceName é obrigatório"
        })
      }

      // Logs de autorização simplificados
      console.log(`🔐 Iniciando autorização com instanceName: ${instanceName}${tag ? ` e tag: ${tag}` : ""}`)

      // Armazena o instanceName e tag em cookies temporários
      res.cookie("tempInstanceName", instanceName, {
        maxAge: 5 * 60 * 1000, // 5 minutos
        httpOnly: false, // Mudado para false para debug
        secure: false, // Mudado para false para debug
        sameSite: "lax"
      })

      if (tag) {
        res.cookie("tempTag", tag, {
          maxAge: 5 * 60 * 1000, // 5 minutos
          httpOnly: false, // Mudado para false para debug
          secure: false, // Mudado para false para debug
          sameSite: "lax"
        })
      }

      // Logs de debug para cookies
      console.log(`🍪 Cookie tempInstanceName definido: ${instanceName}`)
      console.log(`🍪 Cookie tempTag definido: ${tag || "não definido"}`)

      // Redireciona para o OAuth do GHL
      const redirectUri = process.env.GHL_APP_REDIRECT_URI || "http://localhost:3000/authorize-handler"
      const oauthUrl = `https://marketplace.leadconnectorhq.com/oauth/chooselocation?response_type=code&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_id=${
        process.env.GHL_APP_CLIENT_ID
      }&scope=conversations.write+conversations.readonly+conversations%2Fmessage.readonly+conversations%2Fmessage.write+contacts.readonly+contacts.write+locations.readonly`

      // ✅ NOVO: Logs detalhados da URL de autorização
      console.log("🔍 === URL DE AUTORIZAÇÃO GERADA ===")
      console.log("🔍 Redirect URI:", redirectUri)
      console.log("🔍 Client ID:", process.env.GHL_APP_CLIENT_ID)
      console.log("🔍 URL completa:", oauthUrl)
      console.log("🔍 ================================")

      console.log(`🔄 Redirecionando para OAuth GHL com instanceName: ${instanceName}`)
      res.redirect(oauthUrl)
    } catch (error: any) {
      console.error("Erro ao iniciar autorização:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao iniciar autorização",
        error: error.message
      })
    }
  }
)

app.get(
  "/authorize-handler",
  authRateLimiter, // Rate limiting para autenticação
  async (req: Request, res: Response) => {
    try {
      const {code, error, error_description} = req.query
      console.log("🔐 Handler de autorização chamado")
      console.log("🔍 === PARÂMETROS RECEBIDOS ===")
      console.log("🔍 Code:", code ? `✅ ${code.toString().substring(0, 10)}...` : "❌ AUSENTE")
      console.log("🔍 Error:", error || "✅ Nenhum")
      console.log("🔍 Error Description:", error_description || "✅ Nenhum")
      console.log("🔍 ===========================")

      // ✅ NOVO: Verificar se há erro do OAuth
      if (error) {
        console.error("❌ === ERRO DO OAUTH GHL ===")
        console.error("❌ Error:", error)
        console.error("❌ Description:", error_description)
        console.error("❌ ========================")

        return res.status(400).json({
          success: false,
          message: `Erro de autorização: ${error}`,
          error_description: error_description
        })
      }

      if (code) {
        // Logs de debug para cookies recebidos
        console.log(`🍪 === COOKIES RECEBIDOS ===`)
        console.log(`🍪 Cookies completos:`, req.cookies)
        console.log(`🍪 tempInstanceName:`, req.cookies?.tempInstanceName)
        console.log(`🍪 tempTag:`, req.cookies?.tempTag)
        console.log(`🍪 ========================`)

        // Recupera o instanceName e tag dos cookies
        const instanceName = req.cookies?.tempInstanceName || "default"
        const tag = req.cookies?.tempTag || null
        console.log(`🔍 === DADOS RECUPERADOS ===`)
        console.log(`🔍 InstanceName recuperado do cookie: ${instanceName}`)
        console.log(`🔍 Tag recuperada do cookie: ${tag || "não fornecida"}`)
        console.log(`🔍 ========================`)

        // Limpa os cookies temporários
        res.clearCookie("tempInstanceName")
        res.clearCookie("tempTag")

        // Passa o instanceName e tag para o handler de autorização
        await ghl.authorizationHandler(code as string, instanceName, tag)
        res.redirect("https://app.gohighlevel.com/")
      } else {
        console.error("❌ Código de autorização ausente na requisição")
        res.status(400).send("Código de autorização ausente.")
      }
    } catch (error: any) {
      console.error("Erro no handler de autorização:", error)

      // ✅ NOVO: Tratamento específico para erros de código inválido
      if (error?.message?.includes("Código de autorização já foi usado")) {
        console.error("❌ === ERRO DE CÓDIGO JÁ USADO ===")
        console.error("❌ Usuário tentou reutilizar um código de autorização")
        console.error("❌ Solução: Iniciar nova instalação")
        console.error("❌ =================================")

        res.status(400).json({
          success: false,
          message: "Código de autorização já foi usado. Por favor, inicie uma nova instalação.",
          error: "AUTHORIZATION_CODE_ALREADY_USED",
          solution: "Inicie uma nova instalação do app"
        })
      } else if (error?.message?.includes("expirou")) {
        res.status(400).json({
          success: false,
          message: "Código de autorização expirou. Por favor, inicie uma nova instalação.",
          error: "AUTHORIZATION_CODE_EXPIRED",
          solution: "Inicie uma nova instalação do app"
        })
      } else if (error?.message?.includes("Erro de banco de dados")) {
        res.status(500).json({
          success: false,
          message: "Erro de configuração do banco de dados. A coluna 'tag' não existe.",
          error: "DATABASE_SCHEMA_ERROR",
          solution: "Execute o script SQL para adicionar a coluna 'tag' na tabela installations"
        })
      } else {
        res.status(500).json({
          success: false,
          message: "Erro durante a autorização. Tente novamente.",
          error: "AUTHORIZATION_ERROR"
        })
      }
    }
  }
)

// Rotas de integração (protegidas por API Key)
app.post(
  "/integration/setup",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {resourceId, evolutionInstanceName} = req.body

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: "Resource ID é obrigatório"
        })
      }

      // Configura o serviço com o instanceName específico desta instalação
      const dynamicConfig: IntegrationConfig = {
        ...baseIntegrationConfig,
        defaultInstanceName: evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
      }

      const dynamicIntegrationService = new IntegrationService(dynamicConfig)
      const result = await dynamicIntegrationService.setupIntegration(resourceId, evolutionInstanceName)

      if (result.success) {
        res.status(200).json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error: any) {
      console.error("Erro ao configurar integração:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao configurar integração",
        error: error.message
      })
    }
  }
)

app.post(
  "/integration/send-message",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {resourceId, contactId, message, messageId} = req.body

      console.log(`🔍 Body completo da requisição:`, JSON.stringify(req.body, null, 2))
      console.log(`🔍 messageId extraído: ${messageId}`)

      if (!resourceId || !contactId || !message) {
        return res.status(400).json({
          success: false,
          message: "Resource ID, Contact ID e Message são obrigatórios"
        })
      }

      // Logs de envio de mensagem simplificados
      console.log("=== ENVIO DE MENSAGEM ===")
      console.log("Parâmetros recebidos:", {resourceId, contactId, message, messageId})
      console.log("📝 Enviando mensagem com messageId:", messageId)

      // Busca o instanceName específico desta instalação
      const installationDetails = await ghl.model.getInstallationInfo(resourceId)
      if (!installationDetails) {
        return res.status(404).json({
          success: false,
          message: "Instalação não encontrada"
        })
      }

      // Configura o serviço com o instanceName específico desta instalação
      const dynamicConfig: IntegrationConfig = {
        ...baseIntegrationConfig,
        defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
      }

      const dynamicIntegrationService = new IntegrationService(dynamicConfig)
      const result = await dynamicIntegrationService.sendMessageToWhatsApp(resourceId, contactId, message, messageId)

      if (result.success) {
        res.status(200).json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error: any) {
      console.error("Erro ao enviar mensagem:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao enviar mensagem",
        error: error.message
      })
    }
  }
)

app.post(
  "/integration/sync-contacts",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {resourceId} = req.body

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: "Resource ID é obrigatório"
        })
      }

      // Busca o instanceName específico desta instalação
      const installationDetails = await ghl.model.getInstallationInfo(resourceId)
      if (!installationDetails) {
        return res.status(404).json({
          success: false,
          message: "Instalação não encontrada"
        })
      }

      // Configura o serviço com o instanceName específico desta instalação
      const dynamicConfig: IntegrationConfig = {
        ...baseIntegrationConfig,
        defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
      }

      const dynamicIntegrationService = new IntegrationService(dynamicConfig)
      const result = await dynamicIntegrationService.syncContacts(resourceId)

      if (result.success) {
        res.status(200).json(result)
      } else {
        res.status(400).json(result)
      }
    } catch (error: any) {
      console.error("Erro ao sincronizar contatos:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao sincronizar contatos",
        error: error.message
      })
    }
  }
)

app.get(
  "/integration/status",
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
    try {
      const result = await integrationService.checkIntegrationStatuses()
      res.status(200).json(result)
    } catch (error: any) {
      console.error("Erro ao verificar status das integrações:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao verificar status",
        error: error.message
      })
    }
  }
)

// Rotas de exemplo mantidas para compatibilidade
app.get(
  "/example-api-call",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const companyId = req.query.companyId as string
      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "Company ID é obrigatório"
        })
      }

      if (await ghl.checkInstallationExists(companyId)) {
        const request = await ghl.requests(companyId).get(`/users/search?companyId=${companyId}`, {
          headers: {
            Version: "2021-07-28"
          }
        })
        return res.json({
          success: true,
          data: request.data
        })
      } else {
        return res.status(404).json({
          success: false,
          message: "Instalação para esta empresa não existe"
        })
      }
    } catch (error: any) {
      console.error("Erro na chamada de exemplo:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno na chamada de exemplo",
        error: error.response?.data?.message || error.message
      })
    }
  }
)

app.get(
  "/example-api-call-location",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {companyId, locationId} = req.query

      if (!locationId) {
        return res.status(400).json({
          success: false,
          message: "Location ID é obrigatório"
        })
      }

      if (await ghl.checkInstallationExists(locationId as string)) {
        const request = await ghl.requests(locationId as string).get(`/contacts/?locationId=${locationId}`, {
          headers: {
            Version: "2021-07-28"
          }
        })
        return res.json({
          success: true,
          data: request.data
        })
      } else if (companyId) {
        await ghl.getLocationTokenFromCompanyToken(companyId as string, locationId as string)
        const request = await ghl.requests(locationId as string).get(`/contacts/?locationId=${locationId}`, {
          headers: {
            Version: "2021-07-28"
          }
        })
        return res.json({
          success: true,
          data: request.data
        })
      } else {
        return res.status(404).json({
          success: false,
          message: "Instalação para esta localização não existe"
        })
      }
    } catch (error: any) {
      console.error("Erro na chamada de exemplo por localização:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno na chamada de exemplo",
        error: error.response?.data?.message || error.message
      })
    }
  }
)

// Webhook handler refatorado com segurança
app.post(
  "/webhook/ghl",
  webhookRateLimiter, // Rate limiting específico para webhooks
  ghlCredentialsValidator.validateGHLWebhook, // Valida credenciais GHL do banco
  async (req: Request, res: Response) => {
    try {
      const eventType = req.body.type
      const {locationId, companyId, messageId} = req.body

      console.log("=== WEBHOOK GHL RECEBIDO ===")
      console.log("Tipo de evento:", eventType)
      console.log("LocationId:", locationId)
      console.log("CompanyId:", companyId)
      console.log("MessageId:", messageId)

      if (eventType === "UNINSTALL") {
        console.log("🗑️ Evento UNINSTALL detectado - removendo instalação...")

        if (locationId) {
          try {
            // ✅ CORREÇÃO: Verificar se a instalação existe antes de tentar deletar
            const installationExists = await ghl.model.checkInstallationExists(locationId)

            if (installationExists) {
              await ghl.model.deleteInstallationInfo(locationId)
              console.log(`✅ Instalação removida com sucesso para locationId: ${locationId}`)
            } else {
              console.log(
                `⚠️ Instalação já não existe para locationId: ${locationId} - pode ter sido removida anteriormente`
              )
            }
          } catch (error: any) {
            console.error(`❌ Erro ao remover instalação para locationId ${locationId}:`, error.message)
          }
        } else if (companyId) {
          console.log(`⚠️ UNINSTALL sem locationId, mas com companyId: ${companyId}`)
          console.log("⚠️ Tentando remover por companyId...")

          try {
            // ✅ CORREÇÃO: Verificar se a instalação existe antes de tentar deletar
            const installationExists = await ghl.model.checkInstallationExists(companyId)

            if (installationExists) {
              await ghl.model.deleteInstallationInfo(companyId)
              console.log(`✅ Instalação removida com sucesso para companyId: ${companyId}`)
            } else {
              console.log(
                `⚠️ Instalação já não existe para companyId: ${companyId} - pode ter sido removida anteriormente`
              )
            }
          } catch (error: any) {
            console.error(`❌ Erro ao remover instalação para companyId ${companyId}:`, error.message)
          }
        } else {
          console.log("❌ UNINSTALL sem locationId nem companyId - não é possível identificar qual instalação remover")
        }

        // ✅ CORREÇÃO: Sempre retornar sucesso para UNINSTALL, mesmo se não encontrar instalação
        return res.status(200).json({
          success: true,
          message: "Evento UNINSTALL processado com sucesso"
        })
      } else if (eventType === "INSTALL") {
        console.log("📦 Evento INSTALL detectado - configurando integração...")

        if (locationId) {
          console.log(`✅ Configurando integração para locationId: ${locationId}`)

          try {
            const installationDetails = await ghl.model.getInstallationInfo(locationId)

            if (installationDetails?.evolutionInstanceName) {
              console.log(
                `🔧 Usando instanceName: ${installationDetails.evolutionInstanceName} para locationId: ${locationId}`
              )

              const dynamicConfig: IntegrationConfig = {
                ...baseIntegrationConfig,
                defaultInstanceName: installationDetails.evolutionInstanceName
              }

              const dynamicIntegrationService = new IntegrationService(dynamicConfig)
              await dynamicIntegrationService.setupIntegration(locationId, installationDetails.evolutionInstanceName)
              console.log(`✅ Integração configurada com sucesso para locationId: ${locationId}`)
            } else {
              console.log(`⚠️ InstanceName não encontrado para locationId: ${locationId}, usando configuração padrão`)

              const dynamicIntegrationService = new IntegrationService(baseIntegrationConfig)
              await dynamicIntegrationService.setupIntegration(locationId, baseIntegrationConfig.defaultInstanceName)
              console.log(`✅ Integração configurada com sucesso para locationId: ${locationId}`)
            }
          } catch (error: any) {
            console.error(`❌ Erro ao configurar integração para locationId: ${locationId}:`, error.message)
          }
        } else {
          console.log("⚠️ INSTALL sem locationId - não é possível configurar integração")
        }
      } else if (eventType === "OutboundMessage") {
        console.log("📤 Evento OutboundMessage detectado - processando mensagem...")

        // Extrair dados essenciais
        const {conversationProviderId, locationId, contactId, body: message, direction, source} = req.body

        // Logs principais do payload
        console.log("📋 Payload GHL recebido:", {
          messageId: req.body.messageId,
          locationId,
          contactId,
          message,
          direction,
          source
        })

        // Verificações anti-loop
        if (direction === "inbound") {
          console.log("🔄 Mensagem ignorada - direction 'inbound' indica mensagem recebida, evitando loop")
          return res.status(200).json({success: true, message: "Mensagem inbound ignorada"})
        }

        const messageBody = message?.toLowerCase() || ""
        if (
          messageBody.includes("[sistema]") ||
          messageBody.includes("[ghl]") ||
          messageBody.includes("[integration]")
        ) {
          console.log(`🔄 Mensagem ignorada - contém marcadores do sistema: "${messageBody}"`)
          return res.status(200).json({success: true, message: "Mensagem do sistema ignorada"})
        }

        const messageSource = source?.toLowerCase() || ""
        if (messageSource.includes("webhook") || messageSource.includes("api")) {
          console.log(`🔄 Mensagem ignorada - fonte suspeita: "${messageSource}"`)
          return res.status(200).json({success: true, message: "Mensagem de fonte suspeita ignorada"})
        }

        if (!conversationProviderId || !locationId || !contactId || !message) {
          console.log("⚠️ Dados incompletos para mensagem outbound:", {
            conversationProviderId,
            locationId,
            contactId,
            message
          })
          return res.status(400).json({
            success: false,
            message: "Dados incompletos para processar mensagem outbound"
          })
        }

        console.log(`📝 Processando mensagem outbound para contactId: ${contactId}`)
        console.log(`💬 Mensagem: ${message}`)

        try {
          // Buscar informações do contato
          const contactResponse = await ghl.requests(locationId).get(`/contacts/${contactId}`, {
            headers: {Version: "2021-07-28"}
          })

          const contact = contactResponse.data
          const phoneNumber = contact.phone

          if (!phoneNumber) {
            console.error("❌ Número de telefone não encontrado para o contato")
            return res.status(400).json({
              success: false,
              message: "Número de telefone não encontrado para o contato"
            })
          }

          // ✅ CORREÇÃO: Verificar se esta mensagem foi criada recentemente via API (fromMe)
          // Quando criamos uma mensagem no GHL via POST /conversations/messages (de uma mensagem fromMe),
          // o GHL dispara um webhook OutboundMessage. Precisamos detectar e ignorar isso.
          const messageTimestamp = req.body.timestamp || req.body.createdAt || Date.now()
          const now = Date.now()
          const timeDiff =
            typeof messageTimestamp === "string"
              ? now - new Date(messageTimestamp).getTime()
              : now - (messageTimestamp || now)

          // ✅ CORREÇÃO CRÍTICA: Verificar se esta mensagem veio de um webhook fromMe
          // Quando uma mensagem fromMe é enviada pelo WhatsApp:
          // 1. Evolution API detecta e dispara webhook Evolution (fromMe=true)
          // 2. Webhook Evolution cria mensagem no GHL via POST /conversations/messages
          // 3. GHL dispara webhook OutboundMessage
          // 4. Webhook GHL recebe e tenta enviar via Evolution API ❌ (DUPLICAÇÃO!)
          //
          // SOLUÇÃO: Se a mensagem está no cache de deduplicação do webhook Evolution,
          // significa que veio de um fromMe e JÁ FOI ENVIADA pelo WhatsApp.
          // NÃO devemos enviar novamente via Evolution API - apenas ignorar.

          // Criar a mesma chave usada no webhook Evolution (SEM timestamp)
          // Normalizar mensagem e telefone da mesma forma que no webhook Evolution
          const normalizedMessage = (message || "").trim().toLowerCase()
          const messageHash = Buffer.from(normalizedMessage).toString("base64").substring(0, 20)
          // Normalizar telefone removendo todos caracteres não numéricos (incluindo +)
          const formattedPhone = phoneNumber.replace(/\D/g, "")
          const dedupKeyToCheck = `fromme_${formattedPhone}_${messageHash}`

          console.log(`🔍 === VERIFICANDO SE MENSAGEM VEIO DE FROMME ===`)
          console.log(`🔍 Chave de verificação: ${dedupKeyToCheck}`)
          console.log(`🔍 Telefone normalizado: ${formattedPhone}`)
          console.log(`🔍 Hash da mensagem: ${messageHash}`)
          console.log(`🔍 Mensagem original: ${message.substring(0, 50)}...`)
          console.log(`⏰ Mensagem criada há ${Math.round(timeDiff / 1000)}s`)
          console.log(`📊 Total de chaves no cache: ${Object.keys(global.recentProcessedMessages || {}).length}`)
          console.log(
            `📊 Chaves fromMe no cache: ${
              Object.keys(global.recentProcessedMessages || {}).filter((k) => k.startsWith("fromme_")).length
            }`
          )

          // ✅ BLOQUEIO CRÍTICO: Verificar se esta mensagem veio de um webhook fromMe
          // Se estiver no cache, significa que foi criada via webhook Evolution (fromMe)
          // e JÁ FOI ENVIADA pelo WhatsApp. NÃO devemos enviar novamente.
          if (global.recentProcessedMessages && global.recentProcessedMessages[dedupKeyToCheck]) {
            const lastProcessedTime = new Date(global.recentProcessedMessages[dedupKeyToCheck])
            const timeSinceLastProcessed = now - lastProcessedTime.getTime()

            console.log(`🚫 === MENSAGEM FROMME DETECTADA - BLOQUEANDO ENVIO ===`)
            console.log(`🚫 Chave encontrada no cache: ${dedupKeyToCheck}`)
            console.log(
              `🚫 Última processada: ${lastProcessedTime.toISOString()} (${Math.round(
                timeSinceLastProcessed / 1000
              )}s atrás)`
            )
            console.log(`🚫 Esta mensagem JÁ FOI ENVIADA pelo WhatsApp (fromMe=true)`)
            console.log(`🚫 NÃO enviando via Evolution API para evitar duplicação`)
            console.log(`🚫 Detalhes: telefone=${phoneNumber}, hash=${messageHash}`)
            console.log(`🚫 Mensagem original: ${message.substring(0, 50)}...`)

            // ✅ NÃO ENVIAR PARA EVOLUTION API - mensagem já foi enviada pelo WhatsApp
            // ✅ Apenas retornar sucesso para sincronizar no GHL (já foi feito no webhook Evolution)
            return res.status(200).json({
              success: true,
              message:
                "Mensagem fromMe ignorada - já foi enviada pelo WhatsApp. Não enviando via Evolution API para evitar duplicação",
              reason: "fromMe_already_sent",
              action: "blocked_evolution_api_send",
              dedupKey: dedupKeyToCheck,
              lastProcessed: lastProcessedTime.toISOString(),
              timeSinceLastProcessed: Math.round(timeSinceLastProcessed / 1000)
            })
          }

          // ✅ VERIFICAÇÃO CRÍTICA: Mensagens criadas há menos de 10 segundos SEMPRE BLOQUEAR
          // Mensagens fromMe são sempre criadas IMEDIATAMENTE após o webhook Evolution (<5s)
          // Se a mensagem foi criada há menos de 10 segundos, é CERTEZA que é fromMe
          // SEMPRE bloquear para evitar duplicação - mensagens do GHL UI não são criadas tão rapidamente
          if (timeDiff > 0 && timeDiff < 10000) {
            console.log(`🚫 === MENSAGEM MUITO RECENTE DETECTADA (<10s) ===`)
            console.log(`🚫 Mensagem criada há apenas ${Math.round(timeDiff / 1000)}s`)
            console.log(`🚫 CERTEZA de ser mensagem fromMe - criada imediatamente após webhook Evolution`)
            console.log(`🚫 BLOQUEANDO envio para Evolution API - mensagem já foi enviada pelo WhatsApp`)
            console.log(`🚫 Timestamp recebido: ${req.body.timestamp || req.body.createdAt || "não fornecido"}`)

            // Verificar se há mensagens fromMe no cache (qualquer uma recente)
            if (global.recentProcessedMessages) {
              const fromMeKeys = Object.keys(global.recentProcessedMessages).filter((k) => k.startsWith("fromme_"))
              console.log(`🚫 Total de mensagens fromMe no cache: ${fromMeKeys.length}`)
              if (fromMeKeys.length > 0) {
                console.log(`🚫 Confirmado: há mensagens fromMe recentes no cache`)
              }
            }

            return res.status(200).json({
              success: true,
              message:
                "Mensagem muito recente bloqueada (<10s) - não enviando via Evolution API. Mensagem fromMe já foi enviada pelo WhatsApp.",
              reason: "fromMe_too_recent_certain",
              action: "blocked_evolution_api_send",
              timeDiff: Math.round(timeDiff / 1000),
              threshold: "10 segundos",
              timestamp: req.body.timestamp || req.body.createdAt || null
            })
          }

          // ✅ VERIFICAÇÃO ADICIONAL: Mensagens criadas há menos de 30 segundos com mensagens fromMe recentes
          // Se há mensagens fromMe recentes para o mesmo telefone, bloquear também
          if (timeDiff > 0 && timeDiff < 30000) {
            console.log(`⚠️ Mensagem muito recente (${Math.round(timeDiff / 1000)}s) - Verificando se é fromMe...`)

            // Verificar se há mensagens fromMe recentes para o mesmo telefone
            if (global.recentProcessedMessages) {
              const cacheMessages = global.recentProcessedMessages
              const similarPhoneKeys = Object.keys(cacheMessages).filter((key) => {
                if (key.startsWith("fromme_")) {
                  const keyParts = key.split("_")
                  if (keyParts.length >= 3) {
                    const keyPhone = keyParts[1]
                    // Verificar se tem o mesmo telefone (independente do hash)
                    if (keyPhone === formattedPhone) {
                      // Verificar quando foi processada
                      const lastProcessed = cacheMessages[key]
                      if (lastProcessed) {
                        const lastProcessedTime = new Date(lastProcessed)
                        const timeSinceProcessed = now - lastProcessedTime.getTime()
                        // Mensagem processada há menos de 60 segundos
                        return timeSinceProcessed < 60000
                      }
                      return true // Mesmo telefone, sem verificação de timestamp
                    }
                  }
                }
                return false
              })

              if (similarPhoneKeys.length > 0) {
                console.log(`🚫 Mensagens fromMe recentes para o mesmo telefone encontradas:`, similarPhoneKeys)
                console.log(`🚫 Mensagem criada há apenas ${Math.round(timeDiff / 1000)}s`)
                console.log(`🚫 BLOQUEANDO envio para Evolution API - alta probabilidade de ser mensagem fromMe`)
                console.log(`🚫 Telefone: ${formattedPhone}, Mensagens similares: ${similarPhoneKeys.length}`)

                return res.status(200).json({
                  success: true,
                  message:
                    "Mensagem muito recente bloqueada - não enviando via Evolution API. Provável mensagem fromMe já enviada pelo WhatsApp",
                  reason: "fromMe_probable_recent",
                  action: "blocked_evolution_api_send",
                  similarPhoneKeys: similarPhoneKeys.length,
                  timeDiff: Math.round(timeDiff / 1000),
                  threshold: "30 segundos"
                })
              } else {
                console.log(`ℹ️ Nenhuma mensagem fromMe encontrada para o mesmo telefone nos últimos 60s`)
                console.log(`ℹ️ Mensagem criada há ${Math.round(timeDiff / 1000)}s - pode ser mensagem do GHL UI`)
              }
            }
          }

          // Se não encontrou no cache e mensagem não é muito recente, continuar com o fluxo normal (mensagem vinda do GHL UI)
          console.log(`✅ Mensagem NÃO encontrada no cache de fromMe`)
          console.log(`✅ Mensagem criada há ${Math.round(timeDiff / 1000)}s (não é muito recente ou não é fromMe)`)
          console.log(`✅ Continuando fluxo normal - mensagem veio do GHL UI (não é fromMe)`)
          console.log(`✅ Telefone: ${formattedPhone}, Hash: ${messageHash}`)
          console.log(
            `✅ Chaves fromMe no cache para debug:`,
            Object.keys(global.recentProcessedMessages || {}).filter((k) => k.startsWith("fromme_"))
          )

          // Buscar conversa existente
          const conversationResponse = await ghl.requests(locationId).get(`/conversations/search/`, {
            params: {query: phoneNumber},
            headers: {Version: "2021-04-15"}
          })

          if (conversationResponse.data.conversations && conversationResponse.data.conversations.length > 0) {
            const conversation = conversationResponse.data.conversations[0]
            const newConversationProviderId = conversation.id

            if (newConversationProviderId !== conversationProviderId) {
              console.log(`✅ ConversationProviderId atualizado: ${newConversationProviderId}`)

              // ✅ NOVO: Atualizar o conversationProviderId no banco de dados
              try {
                await ghl.model.updateConversationProviderId(locationId, newConversationProviderId)
                console.log(`💾 ConversationProviderId salvo no banco: ${newConversationProviderId}`)
              } catch (error: any) {
                console.error(`❌ Erro ao salvar conversationProviderId no banco:`, error.message)
              }
            }
          }

          // Buscar instalação para obter instanceName
          const installationDetails = await ghl.model.getInstallationInfo(locationId)

          if (!installationDetails) {
            console.error(`❌ Instalação não encontrada para locationId: ${locationId}`)
            return res.status(404).json({
              success: false,
              message: "Instalação não encontrada"
            })
          }

          const dynamicConfig: IntegrationConfig = {
            ...baseIntegrationConfig,
            defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
          }

          console.log(`🔧 Usando instanceName: ${dynamicConfig.defaultInstanceName} para locationId: ${locationId}`)

          const dynamicIntegrationService = new IntegrationService(dynamicConfig)

          // Enviar mensagem via Evolution API
          console.log(`🔄 Enviando mensagem com messageId: ${req.body.messageId}`)
          const result = await dynamicIntegrationService.sendMessageToWhatsApp(
            phoneNumber,
            message,
            locationId,
            req.body.messageId
          )

          if (result.success) {
            console.log("✅ Mensagem enviada com sucesso via Evolution API")

            // Atualizar status da mensagem para "delivered"
            let messageIdToUpdate = req.body.messageId

            if (!messageIdToUpdate) {
              console.log("⚠️ messageId não encontrado no webhook")
              console.log("🔍 Tentando buscar messageId alternativo...")

              // Tentar buscar messageId alternativo
              if (req.body.id) {
                messageIdToUpdate = req.body.id
                console.log(`🔄 messageId alternativo encontrado: ${messageIdToUpdate}`)
              }
            } else {
              console.log(`🔄 messageId encontrado no webhook: ${messageIdToUpdate}`)
            }

            if (messageIdToUpdate) {
              console.log(`🔄 Atualizando status da mensagem ${messageIdToUpdate} para "delivered"...`)

              try {
                const statusUpdateResponse = await ghl
                  .requests(locationId)
                  .put(
                    `/conversations/messages/${messageIdToUpdate}/status`,
                    {status: "delivered"},
                    {headers: {Version: "2021-04-15"}}
                  )

                console.log(`✅ Status da mensagem atualizado para "delivered":`, statusUpdateResponse.data)
              } catch (error: any) {
                console.error(`❌ Erro ao atualizar status da mensagem:`, error.message)
              }
            } else {
              console.log("❌ Nenhum messageId encontrado - não é possível atualizar status")
            }

            return res.status(200).json({
              success: true,
              message: "Mensagem enviada com sucesso e status atualizado"
            })
          } else {
            console.error("❌ Falha ao enviar mensagem:", result.error)
            return res.status(500).json({
              success: false,
              message: "Falha ao enviar mensagem",
              error: result.error
            })
          }
        } catch (error: any) {
          console.error("❌ Erro ao processar mensagem outbound:", error.message)
          return res.status(500).json({
            success: false,
            message: "Erro interno ao processar mensagem",
            error: error.message
          })
        }
      } else {
        console.log(`❓ Tipo de evento não suportado: ${eventType}`)
      }

      console.log("=== WEBHOOK GHL PROCESSADO ===")
    } catch (error: any) {
      console.error("❌ Erro geral no webhook GHL:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno no processamento do webhook",
        error: error.message
      })
    }
  }
)

// ✅ NOVA FUNÇÃO: Processar mensagens fromMe=true com logs detalhados
async function processOutboundMessageFromWhatsApp(instanceName: string, phoneNumber: string, message: string) {
  try {
    console.log("🔄 Processando mensagem fromMe=true para sincronização no GHL...")
    console.log("📋 Dados recebidos:", {instanceName, phoneNumber, message})

    // 1. Buscar instalação pelo instanceName
    console.log("🔍 Buscando instalação pelo instanceName...")
    const targetInstallation = await ghl.model.getInstallationByInstanceName(instanceName)

    if (!targetInstallation) {
      throw new Error(`Instalação não encontrada para a instância: ${instanceName}`)
    }

    console.log("📋 Instalação encontrada no banco:", {
      id: targetInstallation.id,
      locationId: targetInstallation.locationId,
      companyId: targetInstallation.companyId,
      evolutionInstanceName: targetInstallation.evolutionInstanceName,
      conversationProviderId: targetInstallation.conversationProviderId,
      integrationStatus: targetInstallation.integrationStatus,
      hasAccessToken: !!targetInstallation.access_token,
      hasRefreshToken: !!targetInstallation.refresh_token
    })

    // ✅ CORREÇÃO: SEMPRE usar locationId, nunca companyId
    const resourceId = targetInstallation.locationId
    if (!resourceId) {
      throw new Error("LocationId não encontrado na instalação")
    }

    console.log(`✅ ResourceId identificado: ${resourceId} (locationId)`)

    // ✅ NOVO: Verificar se o token está válido antes de fazer chamadas para a API
    console.log("🔍 Verificando se a instalação está ativa...")
    if (!targetInstallation.access_token) {
      throw new Error("Token de acesso não encontrado na instalação")
    }
    console.log("✅ Token de acesso encontrado na instalação")

    // ✅ CORREÇÃO: Testar acesso direto à localização
    console.log("🔍 Testando acesso direto à localização...")
    const accessToken = targetInstallation.access_token

    try {
      const locationTestResponse = await axios.get(`${process.env.GHL_API_DOMAIN}/locations/${resourceId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-07-28"
        }
      })
      console.log("✅ Token tem acesso à localização:", {
        status: locationTestResponse.status,
        locationId: resourceId
      })
    } catch (locationError: any) {
      console.error("❌ Token NÃO tem acesso à localização:", {
        status: locationError.response?.status,
        message: locationError.response?.data?.message,
        locationId: resourceId
      })
      throw new Error(`Token não tem acesso à localização ${resourceId}. Reinstale o app com as permissões corretas.`)
    }

    console.log(`🔄 Usando resourceId: ${resourceId}`)

    // 2. Buscar contato pelo telefone usando o endpoint correto
    console.log(`🔍 Buscando contato pelo telefone: ${phoneNumber}`)
    console.log(`📤 Request para /contacts/ com params:`, {locationId: resourceId, query: phoneNumber})
    console.log(`📤 Request com headers:`, {
      Accept: "application/json",
      Version: "2021-07-28",
      Authorization: `Bearer ${accessToken.substring(0, 50)}...`
    })
    console.log(`📤 Request com resourceId:`, resourceId)

    let contactSearchResponse: any
    try {
      // ✅ CORREÇÃO: Endpoint correto do GHL - /contacts/ com locationId nos params
      // ✅ CORREÇÃO: Headers exatamente como no curl que funciona
      contactSearchResponse = await axios.get(`${process.env.GHL_API_DOMAIN}/contacts/`, {
        params: {
          locationId: resourceId,
          query: phoneNumber
        },
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          Version: "2021-07-28"
        }
      })

      console.log(`✅ Response da busca de contato:`, {
        status: contactSearchResponse.status,
        statusText: contactSearchResponse.statusText,
        data: contactSearchResponse.data,
        contactsCount: contactSearchResponse.data?.contacts?.length || 0
      })
    } catch (contactError: any) {
      console.error(`❌ Erro detalhado na busca de contato:`, {
        status: contactError.response?.status,
        statusText: contactError.response?.statusText,
        data: contactError.response?.data,
        message: contactError.message,
        config: {
          url: contactError.config?.url,
          method: contactError.config?.method,
          headers: contactError.config?.headers,
          params: contactError.config?.params
        }
      })
      throw contactError
    }

    let contactId: string

    if (contactSearchResponse.data.contacts && contactSearchResponse.data.contacts.length > 0) {
      // ✅ Contato existente encontrado
      const existingContact = contactSearchResponse.data.contacts[0]
      contactId = existingContact.id
      console.log(`✅ Contato existente encontrado: ${contactId} para telefone: ${phoneNumber}`)
      console.log("📋 Dados do contato:", {
        id: existingContact.id,
        phone: existingContact.phone,
        firstName: existingContact.firstName,
        lastName: existingContact.lastName,
        tags: existingContact.tags
      })

      // Contato existente - não aplica tag (apenas para contatos novos)
      console.log("🏷️ Contato existente encontrado - tag não será aplicada (apenas para contatos novos)")
    } else {
      // ❌ Contato não encontrado - criar novo
      console.log(`🔄 Contato não encontrado, criando novo para telefone: ${phoneNumber}`)
      console.log("📤 Request para criar contato:", {
        phone: phoneNumber,
        firstName: "Contato",
        lastName: "WhatsApp"
      })

      // Busca a tag da instalação para adicionar ao contato
      const installationDetails = await ghl.model.getInstallationInfo(resourceId)
      const installationTag = installationDetails?.tag

      console.log("🏷️ Tag da instalação encontrada:", installationTag || "nenhuma")

      // ✅ CORREÇÃO: Usar axios diretamente com o token da instalação
      // ✅ CORREÇÃO: URL correta para GHL - /contacts/ com locationId no body
      const newContactResponse = await axios.post(
        `${process.env.GHL_API_DOMAIN}/contacts/`,
        {
          phone: phoneNumber,
          firstName: "Contato",
          lastName: "WhatsApp",
          locationId: resourceId,
          ...(installationTag && {tags: [installationTag]})
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Version: "2021-07-28"
          }
        }
      )

      contactId = newContactResponse.data.id
      console.log(`✅ Novo contato criado: ${contactId} para telefone: ${phoneNumber}`)
      console.log("📋 Dados do novo contato:", newContactResponse.data)
    }

    // 3. Usar conversationProviderId armazenado no banco
    const conversationProviderId = targetInstallation.conversationProviderId

    if (!conversationProviderId) {
      throw new Error(
        `ConversationProviderId não encontrado na instalação para instância: ${instanceName}. Este é o ID do aplicativo instalado e deve ser configurado durante a instalação.`
      )
    }

    console.log(`✅ ConversationProviderId encontrado: ${conversationProviderId}`)

    // 4. Enviar mensagem diretamente para o GHL (sem precisar de conversa)
    console.log(`📤 Enviando mensagem para o GHL...`)
    console.log(`📋 Payload da mensagem:`, {
      type: "Custom",
      contactId: contactId,
      message: message,
      conversationProviderId: conversationProviderId
    })

    try {
      // ✅ CORREÇÃO: Endpoint correto do GHL - /conversations/messages
      // ✅ CORREÇÃO: Payload exatamente como no curl que funciona
      const messageResponse = await axios.post(
        `${process.env.GHL_API_DOMAIN}/conversations/messages`,
        {
          type: "Custom",
          contactId: contactId,
          message: message,
          conversationProviderId: conversationProviderId
        },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
            Version: "2021-04-15"
          }
        }
      )

      console.log(`✅ Mensagem criada no GHL com sucesso:`, {
        status: messageResponse.status,
        statusText: messageResponse.statusText,
        data: messageResponse.data,
        messageId: messageResponse.data?.id
      })

      console.log(`🎉 Mensagem fromMe=true sincronizada com sucesso no GHL!`)
      return {success: true, message: "Mensagem sincronizada com sucesso"}
    } catch (messageError: any) {
      console.error(`❌ Erro ao criar mensagem no GHL:`, {
        status: messageError.response?.status,
        message: messageError.message,
        response: messageError.response?.data
      })
      throw new Error(`Falha ao criar mensagem no GHL: ${messageError.message}`)
    }
  } catch (error: any) {
    console.error("❌ Erro ao processar mensagem fromMe=true:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data,
      status: error.response?.status
    })
    return {
      success: false,
      message: "Falha ao processar mensagem fromMe=true",
      error: error.message
    }
  }
}

// Webhook handler da Evolution API refatorado com segurança
app.post(
  "/webhook/evolution",
  webhookRateLimiter, // Rate limiting específico para webhooks
  async (req: Request, res: Response) => {
    try {
      // ✅ NOVO: Log detalhado do webhook recebido
      console.log("🔔 WEBHOOK EVOLUTION RECEBIDO:")
      console.log(
        "🔍 ID único da requisição:",
        req.headers["x-request-id"] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      )
      console.log("🔍 IP do remetente:", req.ip || req.connection.remoteAddress)
      console.log("🔍 User-Agent:", req.headers["user-agent"])
      console.log("🔍 Timestamp recebimento:", new Date().toISOString())
      console.log("📋 Headers:", {
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"],
        "x-forwarded-for": req.headers["x-forwarded-for"],
        "x-real-ip": req.headers["x-real-ip"],
        "x-request-id": req.headers["x-request-id"]
      })
      console.log("📋 Body completo:", JSON.stringify(req.body, null, 2))

      // ✅ NOVO: Verificar se é um evento de mensagem
      if (req.body.event !== "messages.upsert") {
        console.log(`ℹ️ Evento ignorado: ${req.body.event}`)
        return res.status(200).json({
          success: true,
          message: `Evento ${req.body.event} ignorado`
        })
      }

      console.log(`✅ Evento válido: ${req.body.event}`)

      // ✅ NOVO: Verificar se há dados da mensagem
      if (!req.body.data) {
        console.error("❌ Webhook sem dados da mensagem")
        return res.status(400).json({
          success: false,
          message: "Webhook sem dados da mensagem"
        })
      }

      console.log("✅ Dados da mensagem encontrados")

      const messageData = req.body.data

      // Verificar se a estrutura da mensagem está correta
      if (!messageData || !messageData.message || !messageData.key) {
        console.error("❌ Estrutura da mensagem inválida:", messageData)
        return res.status(400).json({
          success: false,
          message: "Estrutura da mensagem inválida"
        })
      }

      // ✅ NOVO: Detectar se é mensagem enviada pela empresa (fromMe=true)
      const isFromMe = messageData.key.fromMe === true

      if (isFromMe) {
        console.log("📤 MENSAGEM FROM_ME DETECTADA - Processando como mensagem da empresa...")

        // Extrair dados da mensagem enviada pela empresa
        let outboundMessageText = ""

        if (messageData.message.conversation) {
          outboundMessageText = messageData.message.conversation
        } else if (messageData.message.extendedTextMessage) {
          outboundMessageText = messageData.message.extendedTextMessage.text || ""
        } else if (messageData.message.imageMessage) {
          outboundMessageText = "[IMAGEM]"
        } else if (messageData.message.audioMessage) {
          outboundMessageText = "[ÁUDIO]"
        } else if (messageData.message.videoMessage) {
          outboundMessageText = "[VÍDEO]"
        } else if (messageData.message.documentMessage) {
          outboundMessageText = "[DOCUMENTO]"
        } else {
          outboundMessageText = "[MENSAGEM]"
        }

        // ✅ NOVO: Extrair telefone do destinatário baseado em addressingMode
        // Para fromMe=true, o destinatário é quem recebe a mensagem (participant ou sender baseado em addressingMode)
        const recipientInfo = getSenderPhoneNumber(messageData.key)
        const participant = messageData.key.participant || recipientInfo.phoneNumber
        if (!participant) {
          console.error("❌ Não foi possível identificar o destinatário da mensagem")
          return res.status(400).json({
            success: false,
            message: "Destinatário não identificado"
          })
        }

        console.log(`🔍 Destinatário extraído: ${participant} (participant ou ${recipientInfo.source})`)
        const recipientPhoneNumber = formatPhoneNumber(participant)

        // ✅ CRÍTICO: Criar chave de deduplicação ANTES de qualquer processamento
        // Usar a MESMA chave que será usada no webhook GHL: fromme_{telefone}_{hash}
        // Normalizar telefone (remover + e caracteres não numéricos) e criar hash da mensagem
        const normalizedPhone = recipientPhoneNumber.replace(/\D/g, "")
        const normalizedMessage = outboundMessageText.trim().toLowerCase()
        const messageHash = Buffer.from(normalizedMessage).toString("base64").substring(0, 20)
        // Chave sem timestamp: apenas telefone + hash - permite verificação independente do tempo
        const dedupKeyGHL = `fromme_${normalizedPhone}_${messageHash}`

        console.log(`🔍 Verificando duplicação - Chave: ${dedupKeyGHL}`)
        console.log(`📋 Detalhes:`, {
          messageId: messageData.key.id,
          recipientPhone: normalizedPhone,
          messageHash: messageHash,
          messageText: outboundMessageText.substring(0, 50),
          fromMe: messageData.key.fromMe
        })

        if (!global.recentProcessedMessages) {
          global.recentProcessedMessages = {}
        }

        // ✅ CRÍTICO: Verificar se já existe uma mensagem idêntica ANTES de processar
        // Se já foi processada recentemente, NÃO criar no GHL para evitar duplicação
        if (global.recentProcessedMessages[dedupKeyGHL]) {
          const lastProcessedTime = new Date(global.recentProcessedMessages[dedupKeyGHL])
          const timeSinceLastProcessed = Date.now() - lastProcessedTime.getTime()

          console.log(`🔄 MENSAGEM DUPLICADA DETECTADA - Chave: ${dedupKeyGHL}`)
          console.log(
            `🔄 Última processada: ${lastProcessedTime.toISOString()} (${Math.round(
              timeSinceLastProcessed / 1000
            )}s atrás)`
          )
          console.log(`🔄 Ignorando para evitar duplicação no GHL - esta mensagem já foi processada`)

          // Se foi processada nos últimos 5 minutos, ignorar completamente
          if (timeSinceLastProcessed < 300000) {
            return res.status(200).json({
              success: true,
              message: "Mensagem duplicada ignorada - já foi processada recentemente",
              dedupKey: dedupKeyGHL,
              lastProcessed: lastProcessedTime.toISOString(),
              timeSinceLastProcessed: Math.round(timeSinceLastProcessed / 1000)
            })
          } else {
            // Se foi processada há mais de 5 minutos, limpar e permitir processamento
            console.log(`ℹ️ Mensagem antiga detectada (>5min), permitindo reprocessamento`)
            delete global.recentProcessedMessages[dedupKeyGHL]
          }
        }

        // ✅ CRÍTICO: Marcar NO CACHE ANTES de criar no GHL para evitar race condition
        // Quando criamos no GHL, o GHL dispara webhook OutboundMessage imediatamente
        // Precisamos garantir que a chave já esteja no cache antes disso acontecer
        global.recentProcessedMessages[dedupKeyGHL] = new Date().toISOString()
        console.log(`✅ === MENSAGEM MARCADA NO CACHE ANTES DE CRIAR NO GHL ===`)
        console.log(`✅ Chave: ${dedupKeyGHL}`)
        console.log(`✅ Telefone normalizado: ${normalizedPhone}`)
        console.log(`✅ Hash da mensagem: ${messageHash}`)
        console.log(`✅ Mensagem original: ${outboundMessageText.substring(0, 50)}...`)
        console.log(`✅ Timestamp: ${new Date().toISOString()}`)

        // Limpar após 5 minutos para permitir reprocessamento de mensagens antigas
        setTimeout(() => {
          if (global.recentProcessedMessages && global.recentProcessedMessages[dedupKeyGHL]) {
            delete global.recentProcessedMessages[dedupKeyGHL]
            console.log(`🧹 Chave de deduplicação removida após 5 minutos: ${dedupKeyGHL}`)
          }
        }, 300000) // 5 minutos

        console.log(`📊 Total de mensagens em cache: ${Object.keys(global.recentProcessedMessages).length}`)
        console.log(
          `📊 Chaves fromMe no cache:`,
          Object.keys(global.recentProcessedMessages).filter((k) => k.startsWith("fromme_"))
        )

        const instanceName = req.body.instance

        // ✅ A verificação e marcação no cache já foi feita acima
        // A chave dedupKeyGHL já foi criada e marcada no cache ANTES de processar
        // As variáveis outboundMessageText e recipientPhoneNumber já foram extraídas acima

        // ✅ IMPORTANTE: Esta função APENAS cria a mensagem no GHL para sincronizar
        // NÃO envia para Evolution API - a mensagem JÁ FOI ENVIADA pelo WhatsApp
        console.log(`📤 Processando mensagem fromMe - APENAS criando no GHL para sincronizar`)
        console.log(`📤 NÃO enviando para Evolution API - mensagem já foi enviada pelo WhatsApp`)
        const result = await processOutboundMessageFromWhatsApp(instanceName, recipientPhoneNumber, outboundMessageText)

        if (result.success) {
          console.log("✅ Mensagem da empresa processada com sucesso no GHL")
          return res.status(200).json({
            success: true,
            message: "Mensagem da empresa sincronizada com sucesso"
          })
        } else {
          console.error("❌ Falha ao processar mensagem da empresa:", result.error)
          return res.status(500).json({
            success: false,
            message: "Falha ao processar mensagem da empresa",
            error: result.error
          })
        }
      } else {
        // Processamento normal para mensagens recebidas
        console.log("📥 MENSAGEM RECEBIDA - Processando normalmente...")

        // Extrair texto da mensagem de forma segura
        let inboundMessageText = ""
        let messageType = ""

        if (messageData.message.conversation) {
          inboundMessageText = messageData.message.conversation
          messageType = "texto"
        } else if (messageData.message.extendedTextMessage) {
          inboundMessageText = messageData.message.extendedTextMessage.text || ""
          messageType = "texto"
        } else if (messageData.message.imageMessage) {
          inboundMessageText = "[IMAGEM]"
          messageType = "imagem"
        } else if (messageData.message.audioMessage) {
          inboundMessageText = "[ÁUDIO]"
          messageType = "áudio"
        } else if (messageData.message.videoMessage) {
          inboundMessageText = "[VÍDEO]"
          messageType = "vídeo"
        } else if (messageData.message.documentMessage) {
          inboundMessageText = "[DOCUMENTO]"
          messageType = "documento"
        } else {
          inboundMessageText = "[MENSAGEM]"
          messageType = "desconhecido"
        }

        console.log(`📥 Mensagem recebida: ${messageType} - ${inboundMessageText}`)

        // ✅ NOVO: Extrair telefone do remetente baseado em addressingMode
        const senderInfo = getSenderPhoneNumber(messageData.key)
        const senderPhoneNumber = senderInfo.phoneNumber
        console.log(`🔍 Remetente extraído: ${senderPhoneNumber} (${senderInfo.source})`)

        if (!senderPhoneNumber) {
          console.error("❌ Não foi possível identificar o remetente da mensagem")
          return res.status(400).json({
            success: false,
            message: "Remetente não identificado"
          })
        }

        const inboundPhoneNumber = formatPhoneNumber(senderPhoneNumber)
        const instanceName = req.body.instance
        const pushName = messageData.pushName || "Contato WhatsApp"

        console.log(`📥 Mensagem de: ${inboundPhoneNumber} (${pushName})`)
        console.log(`💬 Conteúdo: ${inboundMessageText}`)
        console.log(`🏢 Instância: ${instanceName}`)

        // Buscar instalação específica
        try {
          const targetInstallation = await ghl.model.getInstallationByInstanceName(instanceName)

          if (!targetInstallation) {
            console.error(`❌ Instalação não encontrada para a instância: ${instanceName}`)
            return res.status(404).json({
              success: false,
              message: `Instalação não encontrada para a instância: ${instanceName}`
            })
          }

          console.log(`✅ Instalação encontrada para instância ${instanceName}:`, {
            locationId: targetInstallation.locationId,
            companyId: targetInstallation.companyId,
            evolutionInstanceName: targetInstallation.evolutionInstanceName
          })

          const resourceId = targetInstallation.locationId || targetInstallation.companyId

          if (!resourceId) {
            console.error("❌ ResourceId não encontrado na instalação")
            return res.status(500).json({
              success: false,
              message: "ResourceId não encontrado na instalação"
            })
          }

          const dynamicConfig: IntegrationConfig = {
            ...baseIntegrationConfig,
            defaultInstanceName: targetInstallation.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
          }

          const dynamicIntegrationService = new IntegrationService(dynamicConfig)
          const result = await dynamicIntegrationService.processIncomingMessage(
            inboundPhoneNumber,
            inboundMessageText,
            resourceId,
            pushName
          )

          if (result.success) {
            console.log(`✅ Mensagem processada com sucesso para a instância correta: ${instanceName} -> ${resourceId}`)
            return res.status(200).json({
              success: true,
              message: "Mensagem processada e sincronizada com GHL para a subconta correta",
              data: {
                instanceName,
                resourceId,
                phoneNumber: inboundPhoneNumber,
                message: inboundMessageText
              }
            })
          } else {
            console.error(`❌ Falha ao processar mensagem para instância ${instanceName}:`, result.error)
            return res.status(500).json({
              success: false,
              message: "Falha ao processar mensagem",
              error: result.error
            })
          }
        } catch (error: any) {
          console.error(`❌ Erro ao buscar instalação para instância ${instanceName}:`, error)
          return res.status(500).json({
            success: false,
            message: "Erro interno ao buscar instalação",
            error: error.message
          })
        }
      }

      // ✅ NOVO: Se chegou até aqui, é um evento não suportado
      // eslint-disable-next-line no-unreachable
      console.log(`ℹ️ Evento não suportado ou processado com sucesso`)
      return res.status(200).json({
        success: true,
        message: "Evento processado com sucesso"
      })
    } catch (error: any) {
      console.error("Erro ao processar webhook Evolution:", error)
      return res.status(500).json({
        success: false,
        message: "Erro interno ao processar webhook",
        error: error.message
      })
    }
  }
)

// Rota para envio direto de mensagem (mantida para compatibilidade)
app.post(
  "/send-message-evolution",
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
    try {
      const {locationId, contactId, message, messageId} = req.body

      console.log("=== INÍCIO DO ENVIO DE MENSAGEM ===")
      console.log("Parâmetros recebidos:", {locationId, contactId, message, messageId})

      if (!locationId || !contactId || !message) {
        console.log("Parâmetros faltando:", {locationId, contactId, message})
        return res.status(400).json({
          success: false,
          message: "Faltando parâmetros: locationId, contactId e message são obrigatórios"
        })
      }

      // ✅ CRÍTICO: Verificar se esta mensagem veio de um webhook fromMe ANTES de enviar
      // Quando o GHL cria uma mensagem via API (de um webhook fromMe), ele pode chamar esta rota
      // Precisamos verificar o cache de deduplicação para evitar enviar novamente
      console.log(`🔍 === INÍCIO VERIFICAÇÃO DEDUPLICAÇÃO /send-message-evolution ===`)
      console.log(`🔍 LocationId: ${locationId}, ContactId: ${contactId}, Message: ${message}`)
      console.log(
        `🔍 Cache atual:`,
        global.recentProcessedMessages
          ? Object.keys(global.recentProcessedMessages).filter((k) => k.startsWith("fromme_"))
          : "vazio"
      )

      try {
        // Buscar informações do contato para obter o telefone
        console.log(`🔍 Buscando contato ${contactId} para verificação de deduplicação...`)
        const contactResponse = await ghl.requests(locationId).get(`/contacts/${contactId}`, {
          headers: {Version: "2021-07-28"}
        })

        console.log(`🔍 Resposta completa do contato:`, JSON.stringify(contactResponse.data, null, 2))
        // ✅ CORREÇÃO: A API do GHL pode retornar { contact: {...} } ou {...} dependendo do endpoint
        const contact = contactResponse.data.contact || contactResponse.data
        const phoneNumber = contact?.phone

        console.log(`🔍 Estrutura do contato:`, {
          hasContact: !!contactResponse.data.contact,
          hasData: !!contactResponse.data,
          dataKeys: contactResponse.data ? Object.keys(contactResponse.data) : [],
          contactKeys: contact ? Object.keys(contact) : [],
          phoneNumber: phoneNumber
        })
        console.log(`🔍 Telefone encontrado: ${phoneNumber}`)

        if (phoneNumber) {
          // Criar a mesma chave usada no webhook Evolution: fromme_{telefone}_{hash}
          const normalizedMessage = (message || "").trim().toLowerCase()
          const messageHash = Buffer.from(normalizedMessage).toString("base64").substring(0, 20)
          const formattedPhone = phoneNumber.replace(/\D/g, "")
          const dedupKeyToCheck = `fromme_${formattedPhone}_${messageHash}`

          console.log(`🔍 Verificando duplicação na rota /send-message-evolution`)
          console.log(`🔍 Chave: ${dedupKeyToCheck}`)
          console.log(`🔍 Telefone normalizado: ${formattedPhone}`)
          console.log(`🔍 Hash da mensagem: ${messageHash}`)
          console.log(`🔍 Mensagem normalizada: ${normalizedMessage}`)
          console.log(
            `🔍 Chaves fromMe no cache:`,
            global.recentProcessedMessages
              ? Object.keys(global.recentProcessedMessages).filter((k) => k.startsWith("fromme_"))
              : []
          )

          // Verificar se esta mensagem está no cache de deduplicação (vem de fromMe)
          if (global.recentProcessedMessages && global.recentProcessedMessages[dedupKeyToCheck]) {
            const lastProcessedTime = new Date(global.recentProcessedMessages[dedupKeyToCheck])
            const timeSinceLastProcessed = Date.now() - lastProcessedTime.getTime()

            console.log(`🚫 === MENSAGEM FROMME DETECTADA NA ROTA /send-message-evolution ===`)
            console.log(`🚫 Chave encontrada no cache: ${dedupKeyToCheck}`)
            console.log(
              `🚫 Última processada: ${lastProcessedTime.toISOString()} (${Math.round(
                timeSinceLastProcessed / 1000
              )}s atrás)`
            )
            console.log(`🚫 Esta mensagem JÁ FOI ENVIADA pelo WhatsApp (fromMe=true)`)
            console.log(`🚫 BLOQUEANDO envio via Evolution API para evitar duplicação`)

            if (timeSinceLastProcessed < 300000) {
              // Mensagem foi processada há menos de 5 minutos - bloquear envio
              console.log(`🚫 RETORNANDO - Mensagem bloqueada por estar no cache`)
              return res.status(200).json({
                success: true,
                message:
                  "Mensagem fromMe ignorada - já foi enviada pelo WhatsApp. Não enviando via Evolution API para evitar duplicação",
                reason: "fromMe_already_sent",
                action: "blocked_evolution_api_send",
                dedupKey: dedupKeyToCheck,
                lastProcessed: lastProcessedTime.toISOString(),
                timeSinceLastProcessed: Math.round(timeSinceLastProcessed / 1000)
              })
            } else {
              console.log(
                `ℹ️ Mensagem no cache mas muito antiga (${Math.round(
                  timeSinceLastProcessed / 1000
                )}s) - permitindo envio`
              )
            }
          } else {
            console.log(`✅ Mensagem NÃO encontrada no cache exato - continuando verificação adicional...`)
          }

          // ✅ Verificação adicional: se mensagem foi criada recentemente (<10s), pode ser fromMe
          // Mesmo que não esteja no cache (race condition), bloquear mensagens muito recentes
          const messageTimestamp = req.body.timestamp || req.body.createdAt || Date.now()
          const now = Date.now()
          const timeDiff =
            typeof messageTimestamp === "string"
              ? now - new Date(messageTimestamp).getTime()
              : now - (messageTimestamp || now)

          console.log(`🔍 Verificação adicional - TimeDiff: ${Math.round(timeDiff / 1000)}s`)

          if (timeDiff > 0 && timeDiff < 10000) {
            console.log(`🚫 Mensagem muito recente (${Math.round(timeDiff / 1000)}s) na rota /send-message-evolution`)
            console.log(`🚫 Provável mensagem fromMe - verificando mensagens similares...`)

            // Verificar se há mensagens fromMe recentes para o mesmo telefone
            if (global.recentProcessedMessages) {
              const fromMeKeys = Object.keys(global.recentProcessedMessages).filter((key) => {
                if (key.startsWith("fromme_")) {
                  const keyParts = key.split("_")
                  if (keyParts.length >= 3) {
                    const keyPhone = keyParts[1]
                    return keyPhone === formattedPhone
                  }
                }
                return false
              })

              console.log(`🔍 Mensagens fromMe encontradas para o mesmo telefone: ${fromMeKeys.length}`)
              console.log(`🔍 Chaves:`, fromMeKeys)

              if (fromMeKeys.length > 0) {
                console.log(`🚫 Mensagens fromMe recentes encontradas para o mesmo telefone:`, fromMeKeys.length)
                console.log(`🚫 BLOQUEANDO envio para evitar duplicação`)
                return res.status(200).json({
                  success: true,
                  message:
                    "Mensagem muito recente bloqueada (<10s) - não enviando via Evolution API. Provável mensagem fromMe já enviada pelo WhatsApp",
                  reason: "fromMe_too_recent_route_check",
                  action: "blocked_evolution_api_send",
                  timeDiff: Math.round(timeDiff / 1000),
                  threshold: "10 segundos",
                  similarKeys: fromMeKeys.length
                })
              }
            }
          } else {
            console.log(`✅ Mensagem não é muito recente (${Math.round(timeDiff / 1000)}s) - continuando fluxo normal`)
          }

          console.log(`✅ Verificação de deduplicação concluída - nenhuma duplicação detectada`)
        } else {
          console.log(`⚠️ Telefone não encontrado no contato - continuando fluxo normal`)
        }
      } catch (checkError: any) {
        // Se houver erro ao verificar, continuar com o fluxo normal (não bloquear)
        console.error(`❌ Erro ao verificar deduplicação:`, checkError.message)
        console.error(`❌ Stack:`, checkError.stack)
        console.log(`⚠️ Continuando fluxo normal devido ao erro na verificação`)
      }

      console.log(`🔍 === FIM VERIFICAÇÃO DEDUPLICAÇÃO /send-message-evolution ===`)

      // Busca o instanceName específico desta instalação
      const installationDetails = await ghl.model.getInstallationInfo(locationId)
      if (!installationDetails) {
        return res.status(404).json({
          success: false,
          message: "Instalação não encontrada"
        })
      }

      console.log("Parâmetros recebidos:", {locationId, contactId, message, messageId})
      console.log("Configuração Evolution API:", {
        url: baseIntegrationConfig.evolutionApiUrl,
        instanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName,
        hasApiKey: !!baseIntegrationConfig.evolutionApiKey
      })

      // Configura o serviço com o instanceName específico desta instalação
      const dynamicConfig: IntegrationConfig = {
        ...baseIntegrationConfig,
        defaultInstanceName: installationDetails.evolutionInstanceName || baseIntegrationConfig.defaultInstanceName
      }

      const dynamicIntegrationService = new IntegrationService(dynamicConfig)
      const result = await dynamicIntegrationService.sendMessageToWhatsApp(locationId, contactId, message, messageId)

      console.log("Resultado do envio:", result)
      console.log("=== FIM DO ENVIO DE MENSAGEM ===")

      if (result.success) {
        res.json(result)
      } else {
        // Tratamento específico para erro de sessão da Evolution API
        if (result.error && result.error.includes("SessionError: No sessions")) {
          console.error("❌ ERRO DE SESSÃO EVOLUTION API - Instância desconectada")
          return res.status(503).json({
            success: false,
            message: "Instância do WhatsApp desconectada",
            error:
              "A instância 'centalgoias' não possui sessões ativas. Verifique se o WhatsApp está conectado no painel da Evolution API.",
            details: {
              instanceName: installationDetails.evolutionInstanceName,
              locationId: locationId,
              suggestion: "Reconecte a instância no painel da Evolution API ou escaneie o QR Code novamente"
            }
          })
        }

        res.status(400).json(result)
      }
    } catch (error: any) {
      console.error("Erro ao enviar mensagem para Evolution API:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao enviar mensagem",
        error: error.message
      })
    } finally {
      console.log("=== FIM DO ENVIO DE MENSAGEM ===")
    }
  }
)

app.post(
  "/decrypt-sso",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {key} = req.body || {}

      if (!key) {
        return res.status(400).json({
          success: false,
          message: "Please send valid key"
        })
      }

      const data = ghl.decryptSSOData(key)
      res.json({
        success: true,
        data: data
      })
    } catch (error: any) {
      console.error("Erro ao descriptografar SSO:", error)
      res.status(400).json({
        success: false,
        message: "Invalid Key",
        error: error.message
      })
    }
  }
)

app.get("/", function (req, res) {
  res.sendFile(path + "index.html")
})

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Servidor funcionando",
    timestamp: new Date().toISOString(),
    version: "2.0.0"
  })
})

// Endpoint para verificar status da instância Evolution API
app.get("/evolution-status/:instanceName", async (req: Request, res: Response) => {
  try {
    const {instanceName} = req.params

    if (!instanceName) {
      return res.status(400).json({
        success: false,
        message: "InstanceName é obrigatório"
      })
    }

    const axios = require("axios")

    // Verifica status da instância
    const statusResponse = await axios.get(
      `${baseIntegrationConfig.evolutionApiUrl}/instance/connectionState/${instanceName}`,
      {
        headers: {
          apikey: baseIntegrationConfig.evolutionApiKey
        },
        timeout: 10000
      }
    )

    console.log(`📊 Status da instância ${instanceName}:`, statusResponse.data)

    res.json({
      success: true,
      instanceName: instanceName,
      status: statusResponse.data,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error(`❌ Erro ao verificar status da instância ${req.params.instanceName}:`, error.message)

    res.status(500).json({
      success: false,
      message: "Erro ao verificar status da instância",
      error: error.message,
      instanceName: req.params.instanceName
    })
  }
})

// Endpoint para verificar configurações
app.get("/config", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Configurações do servidor",
    config: {
      server: {
        port: process.env.PORT || 3000,
        environment: process.env.NODE_ENV || "development"
      },
      database: {
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || "5432",
        database: process.env.DB_NAME || "ghl_integration",
        user: process.env.DB_USER || "não configurado",
        hasPassword: !!process.env.DB_PASSWORD
      },
      evolutionApi: {
        url: process.env.EVOLUTION_API_URL || "http://localhost:8080",
        instanceName: "DINÂMICO (por instalação)",
        hasApiKey: !!process.env.EVOLUTION_API_KEY
      },
      goHighLevel: {
        apiDomain: process.env.GHL_API_DOMAIN || "não configurado",
        hasClientId: !!process.env.GHL_APP_CLIENT_ID,
        hasClientSecret: !!process.env.GHL_APP_CLIENT_SECRET,
        hasSSOKey: !!process.env.GHL_APP_SSO_KEY
      }
    },
    timestamp: new Date().toISOString()
  })
})

// Endpoint temporário para atualizar status de integração
app.post(
  "/debug/update-integration-status",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {resourceId, status} = req.body

      if (!resourceId || !status) {
        return res.status(400).json({
          success: false,
          message: "Resource ID e status são obrigatórios"
        })
      }

      await ghl.model.updateIntegrationStatus(resourceId, status as IntegrationStatus)

      res.json({
        success: true,
        message: `Status atualizado para ${status}`,
        resourceId
      })
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error)
      res.status(500).json({
        success: false,
        message: "Erro ao atualizar status",
        error: error.message
      })
    }
  }
)

// Rota para desinstalação manual do app
app.delete(
  "/integration/uninstall/:resourceId",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {resourceId} = req.params

      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: "Resource ID é obrigatório"
        })
      }

      // Logs de desinstalação simplificados
      console.log(`🗑️ Desinstalação manual solicitada para: ${resourceId}`)

      // Verifica se a instalação existe
      const exists = await ghl.checkInstallationExists(resourceId)
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: "Instalação não encontrada",
          data: {resourceId}
        })
      }

      // Busca informações da instalação antes de deletar
      const installationDetails = await ghl.model.getInstallationInfo(resourceId)

      // Remove a instalação
      await ghl.deleteInstallationInfo(resourceId)

      // Logs de desinstalação simplificados
      console.log(`✅ Instalação removida com sucesso: ${resourceId}`)

      res.status(200).json({
        success: true,
        message: "App desinstalado com sucesso",
        data: {
          resourceId,
          removedAt: new Date().toISOString(),
          installationDetails: installationDetails
            ? {
                locationId: installationDetails.locationId,
                companyId: installationDetails.companyId,
                userType: installationDetails.userType,
                evolutionInstanceName: installationDetails.evolutionInstanceName,
                tag: installationDetails.tag
              }
            : null
        }
      })
    } catch (error: any) {
      console.error("❌ Erro na desinstalação manual:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno na desinstalação",
        error: error.message
      })
    }
  }
)

// Rota para listar todas as instalações (útil para debug)
app.get(
  "/integration/installations",
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
    try {
      // Logs de listagem simplificados
      console.log("📋 Listando todas as instalações...")

      const installations = await ghl.model.getAllInstallations()

      // Logs de listagem simplificados
      console.log(`✅ ${installations.length} instalações encontradas`)

      res.status(200).json({
        success: true,
        message: `${installations.length} instalações encontradas`,
        data: {
          count: installations.length,
          installations: installations.map((inst) => ({
            id: inst.id,
            locationId: inst.locationId,
            companyId: inst.companyId,
            userType: inst.userType,
            integrationStatus: inst.integrationStatus,
            evolutionInstanceName: inst.evolutionInstanceName,
            conversationProviderId: inst.conversationProviderId,
            tag: inst.tag,
            scope: inst.scope,
            expiresIn: inst.expires_in,
            lastSyncAt: inst.lastSyncAt,
            createdAt: inst.createdAt,
            updatedAt: inst.updatedAt
          }))
        }
      })
    } catch (error: any) {
      console.error("❌ Erro ao listar instalações:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao listar instalações",
        error: error.message
      })
    }
  }
)

// Teste de conectividade com Evolution API
app.get(
  "/test-evolution",
  ghlCredentialsValidator.validateInstallationExists, // Requer apenas que a instalação exista
  async (req: Request, res: Response) => {
    try {
      // Logs de teste simplificados
      console.log("=== TESTE DE CONECTIVIDADE EVOLUTION API ===")
      console.log("Configuração:", {
        url: baseIntegrationConfig.evolutionApiUrl,
        instanceName: "DINÂMICO (por instalação)",
        hasApiKey: !!baseIntegrationConfig.evolutionApiKey
      })

      // Teste direto na API para ver o status real
      console.log("Testando status direto na API...")
      console.log("⚠️ AVISO: Teste usando instanceName padrão - em produção use instanceName específico da instalação")
      const axios = require("axios")
      const directResponse = await axios.get(
        `${baseIntegrationConfig.evolutionApiUrl}/instance/connectionState/${baseIntegrationConfig.defaultInstanceName}`,
        {
          headers: {
            apikey: baseIntegrationConfig.evolutionApiKey
          }
        }
      )

      console.log("Resposta direta da API:", directResponse.data)
      const directStatus = directResponse.data.state

      const evolutionService = new EvolutionApiService({
        baseUrl: baseIntegrationConfig.evolutionApiUrl,
        apiKey: baseIntegrationConfig.evolutionApiKey,
        instanceName: baseIntegrationConfig.defaultInstanceName // Usa padrão apenas para teste
      })

      // Testa se consegue conectar
      console.log("Testando conectividade via serviço...")
      const isConnected = await evolutionService.checkInstanceStatus()

      console.log("Resultado do teste direto:", directStatus)
      console.log("Resultado do teste via serviço:", isConnected ? "CONECTADO" : "DESCONECTADO")

      res.json({
        success: true,
        message: "Teste de conectividade com Evolution API",
        config: {
          url: baseIntegrationConfig.evolutionApiUrl,
          instanceName: "DINÂMICO (por instalação)",
          hasApiKey: !!baseIntegrationConfig.evolutionApiKey
        },
        directApiResponse: directResponse.data,
        directStatus: directStatus,
        serviceStatus: isConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString(),
        note: "Teste usa instanceName padrão - em produção cada instalação tem seu próprio instanceName"
      })
    } catch (error: any) {
      console.error("Erro no teste de conectividade:", error)
      res.status(500).json({
        success: false,
        message: "Erro ao testar Evolution API",
        error: error.message,
        config: {
          url: baseIntegrationConfig.evolutionApiUrl,
          instanceName: "DINÂMICO (por instalação)",
          hasApiKey: !!baseIntegrationConfig.evolutionApiKey
        },
        timestamp: new Date().toISOString()
      })
    }
  }
)

// Rota para testar atualização de status de mensagem (PUT)
app.put(
  "/integration/update-message-status/:resourceId/:messageId",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {resourceId, messageId} = req.params

      if (!resourceId || !messageId) {
        return res.status(400).json({
          success: false,
          message: "Resource ID e Message ID são obrigatórios"
        })
      }

      console.log(`🔄 Testando atualização de status da mensagem ${messageId} para "delivered"...`)

      const statusUpdateResponse = await ghl.requests(resourceId).put(
        `/conversations/messages/${messageId}/status`,
        {status: "delivered"},
        {
          headers: {
            Version: "2021-04-15"
          }
        }
      )

      console.log(`✅ Status da mensagem atualizado com sucesso:`, statusUpdateResponse.data)

      res.json({
        success: true,
        message: "Status da mensagem atualizado para delivered",
        data: statusUpdateResponse.data
      })
    } catch (error: any) {
      console.error("Erro ao atualizar status da mensagem:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao atualizar status da mensagem",
        error: error.response?.data || error.message
      })
    }
  }
)

// Rota para testar atualização de status de mensagem (GET - para facilitar testes)
app.get(
  "/integration/update-message-status/:resourceId/:messageId",
  ghlCredentialsValidator.validateGHLCredentials, // Requer credenciais GHL válidas
  async (req: Request, res: Response) => {
    try {
      const {resourceId, messageId} = req.params

      if (!resourceId || !messageId) {
        return res.status(400).json({
          success: false,
          message: "Resource ID e Message ID são obrigatórios"
        })
      }

      console.log(`🔄 Testando atualização de status da mensagem ${messageId} para "delivered"...`)

      const statusUpdateResponse = await ghl.requests(resourceId).put(
        `/conversations/messages/${messageId}/status`,
        {status: "delivered"},
        {
          headers: {
            Version: "2021-04-15"
          }
        }
      )

      console.log(`✅ Status da mensagem atualizado com sucesso:`, statusUpdateResponse.data)

      res.json({
        success: true,
        message: "Status da mensagem atualizado para delivered",
        data: statusUpdateResponse.data
      })
    } catch (error: any) {
      console.error("Erro ao atualizar status da mensagem:", error)
      res.status(500).json({
        success: false,
        message: "Erro interno ao atualizar status da mensagem",
        error: error.response?.data || error.message
      })
    }
  }
)

// Middleware para tratamento de erros seguro (DEVE SER O ÚLTIMO)
app.use((error: any, req: Request, res: Response) => {
  // Log seguro sem expor dados sensíveis
  console.error("Erro não tratado:", {
    message: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    path: req.path,
    method: req.method,
    ip: req.ip,
    timestamp: new Date().toISOString()
  })

  // Resposta genérica para produção
  if (res && typeof res.status === "function") {
    res.status(500).json({
      success: false,
      message: process.env.NODE_ENV === "development" ? "Erro interno do servidor" : "Erro interno",
      error: process.env.NODE_ENV === "development" ? error.message : "Erro interno",
      timestamp: new Date().toISOString(),
      requestId: req.headers["x-request-id"] || "unknown"
    })
  } else {
    console.error("Erro crítico: objeto res não é válido:", res)
  }
})

app.listen(port, () => {
  console.log(`GHL Integration App listening on port ${port}`)
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`Evolution API URL: ${baseIntegrationConfig.evolutionApiUrl}`)
}) // Production deploy - Wed, Aug 20, 2025  6:22:40 PM
