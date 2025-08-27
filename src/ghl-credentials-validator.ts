import { Request, Response, NextFunction } from 'express';
import { Model } from './model';

export class GHLCredentialsValidator {
  private model: Model;

  constructor() {
    this.model = new Model();
  }

  /**
   * Middleware para validar credenciais GHL
   * Extrai locationId da requisição e valida client_id/client_secret dos headers
   */
  validateGHLCredentials = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Extrai locationId da requisição (pode vir de diferentes lugares)
      const locationId = this.extractLocationId(req);
      
      if (!locationId) {
        console.warn('🚨 Tentativa de acesso sem locationId');
        return res.status(400).json({ 
          success: false, 
          message: 'LocationId é obrigatório' 
        });
      }

      // Extrai credenciais dos headers
      const clientId = req.headers['x-ghl-client-id'] as string;
      const clientSecret = req.headers['x-ghl-client-secret'] as string;

      if (!clientId || !clientSecret) {
        console.warn(`🚨 Tentativa de acesso sem credenciais para locationId: ${locationId}`);
        return res.status(401).json({ 
          success: false, 
          message: 'Credenciais GHL são obrigatórias (x-ghl-client-id e x-ghl-client-secret)' 
        });
      }

      // Busca instalação no banco
      const installation = await this.model.getInstallationInfo(locationId);
      
      if (!installation) {
        console.warn(`🚨 Tentativa de acesso a locationId não instalado: ${locationId}`);
        return res.status(404).json({ 
          success: false, 
          message: 'Instalação não encontrada para este locationId' 
        });
      }

      // Valida credenciais
      if (installation.clientId !== clientId || installation.clientSecret !== clientSecret) {
        console.warn(`🚨 Credenciais inválidas para locationId: ${locationId}`);
        console.warn(`   Recebido: clientId=${clientId}, clientSecret=${clientSecret ? '***' : 'ausente'}`);
        console.warn(`   Esperado: clientId=${installation.clientId}, clientSecret=${installation.clientSecret ? '***' : 'ausente'}`);
        return res.status(401).json({ 
          success: false, 
          message: 'Credenciais GHL inválidas' 
        });
      }

      // Credenciais válidas - adiciona dados da instalação ao req para uso posterior
      (req as any).ghlInstallation = installation;
      (req as any).locationId = locationId;
      
      // Logs de validação simplificados
      console.log(`✅ Credenciais GHL validadas para locationId: ${locationId}`);
      next();

    } catch (error: any) {
      console.error('❌ Erro na validação de credenciais GHL:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Erro interno na validação' 
      });
    }
  };

  /**
   * Extrai locationId da requisição
   * Pode vir de: params, body, query ou headers
   */
  private extractLocationId(req: Request): string | null {
    // 1. Params (ex: /integration/setup/:resourceId)
    if (req.params.resourceId) {
      return req.params.resourceId;
    }

    // 2. Body (ex: POST com locationId no corpo)
    if (req.body && req.body.locationId) {
      return req.body.locationId;
    }

    // 3. Query (ex: ?locationId=XXX)
    if (req.query && req.query.locationId) {
      return req.query.locationId as string;
    }

    // 4. Headers (ex: x-ghl-location-id)
    if (req.headers['x-ghl-location-id']) {
      return req.headers['x-ghl-location-id'] as string;
    }

    return null;
  }

  /**
   * Middleware para rotas que não precisam de validação completa
   * Apenas verifica se a instalação existe
   */
  validateInstallationExists = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const locationId = this.extractLocationId(req);
      
      if (!locationId) {
        return res.status(400).json({ 
          success: false, 
          message: 'LocationId é obrigatório' 
        });
      }

      const installation = await this.model.getInstallationInfo(locationId);
      
      if (!installation) {
        return res.status(404).json({ 
          success: false, 
          message: 'Instalação não encontrada' 
        });
      }

      (req as any).ghlInstallation = installation;
      (req as any).locationId = locationId;
      
      next();

    } catch (error: any) {
      console.error('❌ Erro na validação de instalação:', error);
      return res.status(500).json({ 
        success: false, 
        message: 'Erro interno na validação' 
      });
    }
  };

  /**
   * Valida webhooks do GHL usando client_id e client_secret armazenados
   * Extrai locationId do body do webhook e valida as credenciais
   * ✅ CORREÇÃO: Permite eventos UNINSTALL mesmo quando instalação não existe
   */
  validateGHLWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const eventType = req.body?.type;
      const locationId = req.body?.locationId;
      
      // ✅ CORREÇÃO: Permitir eventos UNINSTALL mesmo sem locationId válido
      if (eventType === 'UNINSTALL') {
        console.log(`🔓 Evento UNINSTALL detectado - permitindo sem validação rigorosa`);
        console.log(`📋 Payload do webhook UNINSTALL:`, {
          type: req.body.type,
          locationId: req.body.locationId,
          companyId: req.body.companyId
        });
        
        // Para UNINSTALL, permitir continuar mesmo sem validação completa
        (req as any).ghlInstallation = null;
        (req as any).locationId = locationId;
        (req as any).isUninstallEvent = true;
        
        console.log(`✅ Webhook UNINSTALL permitido para processamento`);
        return next();
      }
      
      if (!locationId) {
        console.error('❌ LocationId não encontrado no webhook GHL');
        return res.status(400).json({
          success: false,
          message: 'LocationId obrigatório no webhook'
        });
      }

      // Logs de webhook simplificados
      console.log(`🔍 Validando webhook GHL para locationId: ${locationId}`);
      console.log(`📋 Payload do webhook:`, {
        type: req.body.type,
        locationId: req.body.locationId,
        companyId: req.body.companyId,
        messageId: req.body.messageId
      });

      // Busca as credenciais armazenadas para esta instalação
      const installationDetails = await this.model.getInstallationInfo(locationId);
      
      if (!installationDetails) {
        console.error(`❌ Instalação não encontrada para locationId: ${locationId}`);
        
        // Debug: vamos ver todas as instalações no banco
        try {
          const allInstallations = await this.model.getAllInstallations();
          console.log(`🔍 Total de instalações no banco: ${allInstallations.length}`);
          console.log(`🔍 Instalações disponíveis:`, allInstallations.map(inst => ({
            locationId: inst.locationId,
            companyId: inst.companyId,
            evolutionInstanceName: inst.evolutionInstanceName
          })));
        } catch (debugError) {
          console.error('❌ Erro ao buscar todas as instalações para debug:', debugError);
        }
        
        return res.status(404).json({
          success: false,
          message: 'Instalação não encontrada'
        });
      }

      if (!installationDetails.clientId || !installationDetails.clientSecret) {
        console.error(`❌ Credenciais GHL não encontradas para locationId: ${locationId}`);
        return res.status(401).json({
          success: false,
          message: 'Credenciais GHL não configuradas para esta instalação'
        });
      }

      // Valida se as credenciais correspondem às do ambiente (app)
      if (installationDetails.clientId !== process.env.GHL_APP_CLIENT_ID || 
          installationDetails.clientSecret !== process.env.GHL_APP_CLIENT_SECRET) {
        console.error(`❌ Credenciais GHL inválidas para locationId: ${locationId}`);
        console.error(`   DB clientId: ${installationDetails.clientId}`);
        console.error(`   ENV clientId: ${process.env.GHL_APP_CLIENT_ID}`);
        return res.status(401).json({
          success: false,
          message: 'Credenciais GHL inválidas'
        });
      }

      // Adiciona dados da instalação ao req para uso posterior
      (req as any).ghlInstallation = installationDetails;
      (req as any).locationId = locationId;
      (req as any).isUninstallEvent = false;

      console.log(`✅ Webhook GHL validado com sucesso para locationId: ${locationId}`);
      next();
      
    } catch (error) {
      console.error('❌ Erro na validação do webhook GHL:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno na validação do webhook'
      });
    }
  };

  /**
   * ✅ NOVO: Valida consistência de conexões GHL entre módulos
   * Garante que todos os módulos de um cenário Make usem a mesma subconta
   */
  validateGHLConnectionConsistency = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { resourceId, previousResourceId, connectionValidation } = req.body;
      
      // Se não houver validação de consistência solicitada, continua normalmente
      if (!connectionValidation) {
        return next();
      }

      console.log('🔍 Validando consistência de conexões GHL entre módulos...');
      console.log('📋 Dados de validação:', {
        currentResourceId: resourceId,
        previousResourceId,
        connectionValidation
      });

      // Validar se resourceId atual existe
      if (!resourceId) {
        console.error('❌ ResourceId atual não fornecido para validação de consistência');
        return res.status(400).json({
          success: false,
          message: 'ResourceId atual é obrigatório para validação de consistência',
          error: 'MISSING_CURRENT_RESOURCE_ID'
        });
      }

      // Se houver resourceId anterior, validar consistência
      if (previousResourceId && previousResourceId !== resourceId) {
        console.error('❌ INCONSISTÊNCIA DE CONEXÃO DETECTADA!');
        console.error('   ResourceId anterior:', previousResourceId);
        console.error('   ResourceId atual:', resourceId);
        console.error('   ⚠️  Todos os módulos GHL devem usar a MESMA conexão/subconta!');

        // Buscar informações das instalações para debug
        try {
          const previousInstallation = await this.model.getInstallationInfo(previousResourceId);
          const currentInstallation = await this.model.getInstallationInfo(resourceId);
          
          console.error('🔍 Detalhes da instalação anterior:', {
            resourceId: previousResourceId,
            locationId: previousInstallation?.locationId,
            companyId: previousInstallation?.companyId,
            evolutionInstanceName: previousInstallation?.evolutionInstanceName
          });
          
          console.error('🔍 Detalhes da instalação atual:', {
            resourceId: resourceId,
            locationId: currentInstallation?.locationId,
            companyId: currentInstallation?.companyId,
            evolutionInstanceName: currentInstallation?.evolutionInstanceName
          });
        } catch (debugError) {
          console.error('❌ Erro ao buscar detalhes das instalações para debug:', debugError);
        }

        return res.status(400).json({
          success: false,
          message: 'Inconsistência de conexão GHL detectada',
          error: 'CONNECTION_INCONSISTENCY',
          details: {
            previousResourceId,
            currentResourceId: resourceId,
            message: 'Todos os módulos GHL devem usar a mesma conexão/subconta. Verifique se todos os módulos do cenário Make estão configurados com a mesma conexão GHL.'
          },
          solution: {
            step1: 'Verifique se todos os módulos GHL do cenário Make estão usando a mesma conexão',
            step2: 'Certifique-se de que todos os módulos apontem para a mesma subconta (locationId)',
            step3: 'Se necessário, reconfigure os módulos para usar a conexão correta',
            step4: 'Teste novamente o cenário após a correção'
          }
        });
      }

      // Validar se a instalação atual existe e está ativa
      const currentInstallation = await this.model.getInstallationInfo(resourceId);
      if (!currentInstallation) {
        console.error(`❌ Instalação não encontrada para resourceId: ${resourceId}`);
        return res.status(404).json({
          success: false,
          message: 'Instalação não encontrada',
          error: 'INSTALLATION_NOT_FOUND',
          resourceId
        });
      }

      // Validar se a instalação tem credenciais válidas
      if (!currentInstallation.access_token) {
        console.error(`❌ Token de acesso não encontrado para resourceId: ${resourceId}`);
        return res.status(401).json({
          success: false,
          message: 'Token de acesso não encontrado',
          error: 'MISSING_ACCESS_TOKEN',
          resourceId
        });
      }

      // Log de sucesso na validação
      console.log('✅ Consistência de conexões GHL validada com sucesso!');
      console.log('📋 Detalhes da instalação:', {
        resourceId: resourceId,
        locationId: currentInstallation.locationId,
        companyId: currentInstallation.companyId,
        evolutionInstanceName: currentInstallation.evolutionInstanceName,
        hasAccessToken: !!currentInstallation.access_token,
        hasRefreshToken: !!currentInstallation.refresh_token
      });

      // Adiciona informações da instalação ao req para uso posterior
      (req as any).ghlInstallation = currentInstallation;
      (req as any).resourceId = resourceId;

      next();
      
    } catch (error: any) {
      console.error('❌ Erro na validação de consistência de conexões GHL:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno na validação de consistência',
        error: error.message
      });
    }
  };

  /**
   * ✅ NOVO: Valida se um resourceId específico é válido para uma operação
   * Útil para validar mapeamentos de campos entre módulos
   */
  validateResourceIdForOperation = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { resourceId, operation, fieldMapping } = req.body;
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'ResourceId é obrigatório',
          error: 'MISSING_RESOURCE_ID'
        });
      }

      console.log(`🔍 Validando resourceId para operação: ${operation || 'N/A'}`);
      console.log('📋 Dados de validação:', { resourceId, operation, fieldMapping });

      // Buscar instalação
      const installation = await this.model.getInstallationInfo(resourceId);
      if (!installation) {
        console.error(`❌ Instalação não encontrada para resourceId: ${resourceId}`);
        return res.status(404).json({
          success: false,
          message: 'Instalação não encontrada',
          error: 'INSTALLATION_NOT_FOUND',
          resourceId
        });
      }

      // Validar se a instalação está ativa
      if (!installation.access_token) {
        console.error(`❌ Token de acesso não encontrado para resourceId: ${resourceId}`);
        return res.status(401).json({
          success: false,
          message: 'Token de acesso não encontrado',
          error: 'MISSING_ACCESS_TOKEN',
          resourceId
        });
      }

      // Se houver mapeamento de campos, validar se os campos são compatíveis
      if (fieldMapping && typeof fieldMapping === 'object') {
        console.log('🔍 Validando mapeamento de campos:', fieldMapping);
        
        // Aqui você pode adicionar validações específicas para campos
        // Por exemplo, verificar se contactId, messageId, etc. são válidos
        const requiredFields = ['contactId', 'message'];
        const missingFields = requiredFields.filter(field => !fieldMapping[field]);
        
        if (missingFields.length > 0) {
          console.error(`❌ Campos obrigatórios ausentes no mapeamento: ${missingFields.join(', ')}`);
          return res.status(400).json({
            success: false,
            message: 'Campos obrigatórios ausentes no mapeamento',
            error: 'MISSING_REQUIRED_FIELDS',
            missingFields
          });
        }
      }

      console.log('✅ ResourceId validado com sucesso para a operação');
      
      // Adiciona informações da instalação ao req
      (req as any).ghlInstallation = installation;
      (req as any).resourceId = resourceId;

      next();
      
    } catch (error: any) {
      console.error('❌ Erro na validação do resourceId:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno na validação',
        error: error.message
      });
    }
  };
}

// Instância singleton
export const ghlCredentialsValidator = new GHLCredentialsValidator();
