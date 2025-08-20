import { Request, Response, NextFunction } from 'express';
import * as CryptoJS from 'crypto-js';

// Interface para configuração de webhook
interface WebhookConfig {
  secret: string;
  signatureHeader: string;
  algorithm: string;
}

// Configurações específicas para cada tipo de webhook
const webhookConfigs: Record<string, WebhookConfig> = {
  ghl: {
    secret: process.env.GHL_WEBHOOK_SECRET || '',
    signatureHeader: 'x-ghl-signature',
    algorithm: 'sha256'
  },
  evolution: {
    secret: process.env.EVOLUTION_WEBHOOK_SECRET || '',
    signatureHeader: 'x-evolution-signature',
    algorithm: 'sha256'
  }
};

// Valida assinatura do webhook GHL
export const validateGHLWebhook = (req: Request, res: Response, next: NextFunction) => {
  const config = webhookConfigs.ghl;
  
  if (!config.secret) {
    console.warn('⚠️ GHL_WEBHOOK_SECRET não configurado - validação de assinatura desabilitada');
    return next();
  }
  
  const signature = req.headers[config.signatureHeader] as string;
  const payload = JSON.stringify(req.body);
  
  if (!signature) {
    console.warn('🚨 Webhook GHL sem assinatura');
    return res.status(401).json({
      success: false,
      message: 'Assinatura de webhook ausente'
    });
  }
  
  const expectedSignature = CryptoJS.HmacSHA256(payload, config.secret).toString();
  
  if (signature !== expectedSignature) {
    console.warn('🚨 Assinatura de webhook GHL inválida');
    return res.status(401).json({
      success: false,
      message: 'Assinatura de webhook inválida'
    });
  }
  
  console.log('✅ Assinatura de webhook GHL válida');
  next();
};

// Valida assinatura do webhook Evolution
export const validateEvolutionWebhook = (req: Request, res: Response, next: NextFunction) => {
  const config = webhookConfigs.evolution;
  
  if (!config.secret) {
    console.warn('⚠️ EVOLUTION_WEBHOOK_SECRET não configurado - validação de assinatura desabilitada');
    return next();
  }
  
  const signature = req.headers[config.signatureHeader] as string;
  const payload = JSON.stringify(req.body);
  
  if (!signature) {
    console.warn('🚨 Webhook Evolution sem assinatura');
    return res.status(401).json({
      success: false,
      message: 'Assinatura de webhook ausente'
    });
  }
  
  const expectedSignature = CryptoJS.HmacSHA256(payload, config.secret).toString();
  
  if (signature !== expectedSignature) {
    console.warn('🚨 Assinatura de webhook Evolution inválida');
    return res.status(401).json({
      success: false,
      message: 'Assinatura de webhook inválida'
    });
  }
  
  console.log('✅ Assinatura de webhook Evolution válida');
  next();
};

// Validação genérica de webhook
export const validateWebhookSignature = (webhookType: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const config = webhookConfigs[webhookType];
    
    if (!config) {
      console.error(`❌ Tipo de webhook não suportado: ${webhookType}`);
      return res.status(400).json({
        success: false,
        message: 'Tipo de webhook não suportado'
      });
    }
    
    if (!config.secret) {
      console.warn(`⚠️ ${webhookType.toUpperCase()}_WEBHOOK_SECRET não configurado`);
      return next();
    }
    
    const signature = req.headers[config.signatureHeader] as string;
    const payload = JSON.stringify(req.body);
    
    if (!signature) {
      console.warn(`🚨 Webhook ${webhookType} sem assinatura`);
      return res.status(401).json({
        success: false,
        message: 'Assinatura de webhook ausente'
      });
    }
    
    const expectedSignature = CryptoJS.HmacSHA256(payload, config.secret).toString();
    
    if (signature !== expectedSignature) {
      console.warn(`🚨 Assinatura de webhook ${webhookType} inválida`);
      return res.status(401).json({
        success: false,
        message: 'Assinatura de webhook inválida'
      });
    }
    
    console.log(`✅ Assinatura de webhook ${webhookType} válida`);
    next();
  };
};

// Validação de IP permitido (whitelist)
export const validateIPWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || '';
    
    if (allowedIPs.length === 0) {
      console.warn('⚠️ Whitelist de IPs vazia - todas as origens permitidas');
      return next();
    }
    
    if (!allowedIPs.includes(clientIP)) {
      console.warn(`🚨 IP não autorizado: ${clientIP}`);
      return res.status(403).json({
        success: false,
        message: 'IP não autorizado'
      });
    }
    
    console.log(`✅ IP autorizado: ${clientIP}`);
    next();
  };
};

// Validação de timestamp para evitar replay attacks
export const validateTimestamp = (maxAgeMinutes: number = 5) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timestamp = req.headers['x-timestamp'] as string;
    
    if (!timestamp) {
      console.warn('🚨 Webhook sem timestamp');
      return res.status(400).json({
        success: false,
        message: 'Timestamp ausente'
      });
    }
    
    const requestTime = new Date(timestamp).getTime();
    const currentTime = Date.now();
    const maxAge = maxAgeMinutes * 60 * 1000;
    
    if (Math.abs(currentTime - requestTime) > maxAge) {
      console.warn(`🚨 Webhook com timestamp muito antigo: ${timestamp}`);
      return res.status(400).json({
        success: false,
        message: 'Timestamp muito antigo'
      });
    }
    
    console.log('✅ Timestamp válido');
    next();
  };
};
