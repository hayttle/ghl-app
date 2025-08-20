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
  
  // Verifica CORS
  if (securityConfig.cors.allowedOrigins.includes('*')) {
    warnings.push('🚨 CORS configurado para aceitar qualquer origem - RISCO DE SEGURANÇA');
  }
  
  // Verifica rate limiting
  if (securityConfig.rateLimit.max > 1000) {
    warnings.push('⚠️ Rate limit muito alto configurado - pode ser vulnerável a DDoS');
  }
  
  // Verifica se as credenciais GHL estão configuradas
  if (!process.env.GHL_APP_CLIENT_ID || !process.env.GHL_APP_CLIENT_SECRET) {
    warnings.push('⚠️ GHL_APP_CLIENT_ID ou GHL_APP_CLIENT_SECRET não configurados - instalação não funcionará');
  }
  
  // Verifica se a Evolution API está configurada
  if (!process.env.EVOLUTION_API_URL || !process.env.EVOLUTION_API_KEY) {
    warnings.push('⚠️ EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados - integração não funcionará');
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
