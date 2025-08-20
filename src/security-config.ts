// Configurações de segurança para o servidor
export const securityConfig = {
  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // máximo 100 requests por IP
    webhookMax: 50, // máximo 50 webhooks por IP
    authMax: 5, // máximo 5 tentativas de auth por IP
  },
  
  // CORS
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
      'https://app.gohighlevel.com',
      'https://marketplace.leadconnectorhq.com',
      'https://b075774f803b.ngrok-free.app' // Seu domínio atual
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Timestamp'],
    credentials: true,
    maxAge: 86400 // 24 horas
  },
  
  // Webhooks
  webhooks: {
    ghl: {
      secret: process.env.GHL_WEBHOOK_SECRET || '',
      signatureHeader: 'x-ghl-signature',
      allowedIPs: process.env.GHL_ALLOWED_IPS?.split(',') || [],
      maxAgeMinutes: 5
    },
    evolution: {
      secret: process.env.EVOLUTION_WEBHOOK_SECRET || '',
      signatureHeader: 'x-evolution-signature',
      allowedIPs: process.env.EVOLUTION_ALLOWED_IPS?.split(',') || [],
      maxAgeMinutes: 5
    }
  },
  
  // API Keys
  apiKeys: {
    internal: process.env.INTERNAL_API_KEY || '',
    admin: process.env.ADMIN_API_KEY || '',
    readonly: process.env.READONLY_API_KEY || ''
  },
  
  // Headers de Segurança
  securityHeaders: {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
  },
  
  // Validação de Payload
  payload: {
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedContentTypes: ['application/json', 'application/x-www-form-urlencoded']
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    maskSensitiveData: true,
    logIPs: true,
    logUserAgents: false
  },
  
  // Autenticação
  auth: {
    sessionTimeout: 30 * 60 * 1000, // 30 minutos
    maxLoginAttempts: 5,
    lockoutDuration: 15 * 60 * 1000, // 15 minutos
    requireMFA: process.env.REQUIRE_MFA === 'true'
  },
  
  // Monitoramento
  monitoring: {
    enableHealthChecks: true,
    enableMetrics: true,
    alertOnSuspiciousActivity: true,
    suspiciousActivityThreshold: 10 // tentativas por minuto
  }
};

// Função para validar configuração de segurança
export const validateSecurityConfig = (): string[] => {
  const warnings: string[] = [];
  
  // Verifica webhook secrets
  if (!securityConfig.webhooks.ghl.secret) {
    warnings.push('⚠️ GHL_WEBHOOK_SECRET não configurado - webhooks GHL não serão validados');
  }
  
  if (!securityConfig.webhooks.evolution.secret) {
    warnings.push('⚠️ EVOLUTION_WEBHOOK_SECRET não configurado - webhooks Evolution não serão validados');
  }
  
  // Verifica API keys
  if (!securityConfig.apiKeys.internal) {
    warnings.push('⚠️ INTERNAL_API_KEY não configurado - rotas internas ficarão desprotegidas');
  }
  
  // Verifica CORS
  if (securityConfig.cors.allowedOrigins.includes('*')) {
    warnings.push('🚨 CORS configurado para aceitar qualquer origem - RISCO DE SEGURANÇA');
  }
  
  // Verifica rate limiting
  if (securityConfig.rateLimit.max > 1000) {
    warnings.push('⚠️ Rate limit muito alto configurado - pode ser vulnerável a DDoS');
  }
  
  return warnings;
};

// Função para obter configuração baseada no ambiente
export const getEnvironmentConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    return {
      ...securityConfig,
      cors: {
        ...securityConfig.cors,
        allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [
          'https://app.gohighlevel.com',
          'https://marketplace.leadconnectorhq.com'
        ]
      },
      logging: {
        ...securityConfig.logging,
        level: 'warn',
        maskSensitiveData: true
      }
    };
  }
  
  return securityConfig;
};
