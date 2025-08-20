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
}

// Instância singleton
export const ghlCredentialsValidator = new GHLCredentialsValidator();
