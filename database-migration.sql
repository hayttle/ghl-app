-- Script de migração para a tabela installations
-- Execute este script para atualizar a estrutura da tabela existente

-- Adiciona novas colunas se não existirem
DO $$ 
BEGIN
    -- Adiciona coluna evolution_instance_name se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'installations' AND column_name = 'evolution_instance_name') THEN
        ALTER TABLE installations ADD COLUMN evolution_instance_name VARCHAR(255);
    END IF;

    -- Adiciona coluna integration_status se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'installations' AND column_name = 'integration_status') THEN
        ALTER TABLE installations ADD COLUMN integration_status VARCHAR(50) DEFAULT 'active';
    END IF;

    -- Adiciona coluna last_sync_at se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'installations' AND column_name = 'last_sync_at') THEN
        ALTER TABLE installations ADD COLUMN last_sync_at TIMESTAMP;
    END IF;

    -- Adiciona coluna created_at se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'installations' AND column_name = 'created_at') THEN
        ALTER TABLE installations ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
    END IF;

    -- Adiciona coluna updated_at se não existir
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'installations' AND column_name = 'updated_at') THEN
        ALTER TABLE installations ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Atualiza registros existentes com valores padrão
UPDATE installations 
SET 
    integration_status = 'active',
    created_at = COALESCE(created_at, NOW()),
    updated_at = COALESCE(updated_at, NOW())
WHERE integration_status IS NULL;

-- Cria constraints únicas
ALTER TABLE installations DROP CONSTRAINT IF EXISTS installations_location_id_key;
ALTER TABLE installations ADD CONSTRAINT installations_location_id_key UNIQUE (location_id);

-- Cria índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_installations_location_id ON installations(location_id);
CREATE INDEX IF NOT EXISTS idx_installations_company_id ON installations(company_id);
CREATE INDEX IF NOT EXISTS idx_installations_integration_status ON installations(integration_status);
CREATE INDEX IF NOT EXISTS idx_installations_conversation_provider_id ON installations(conversation_provider_id);

-- Comentários para documentar a estrutura
COMMENT ON TABLE installations IS 'Tabela para armazenar informações de instalação e integração entre GHL e Evolution API';
COMMENT ON COLUMN installations.location_id IS 'ID da localização no GoHighLevel';
COMMENT ON COLUMN installations.company_id IS 'ID da empresa no GoHighLevel';
COMMENT ON COLUMN installations.access_token IS 'Token de acesso para API do GoHighLevel';
COMMENT ON COLUMN installations.refresh_token IS 'Token de refresh para renovar o access_token';
COMMENT ON COLUMN installations.expires_in IS 'Tempo de expiração do token em segundos';
COMMENT ON COLUMN installations.scope IS 'Escopo de permissões da instalação';
COMMENT ON COLUMN installations.token_type IS 'Tipo do token (Bearer)';
COMMENT ON COLUMN installations.user_type IS 'Tipo de usuário (Company ou Location)';
COMMENT ON COLUMN installations.conversation_provider_id IS 'ID do provedor de conversa no GoHighLevel';
COMMENT ON COLUMN installations.evolution_instance_name IS 'Nome da instância no Evolution API';
COMMENT ON COLUMN installations.integration_status IS 'Status da integração (active, inactive, error, pending)';
COMMENT ON COLUMN installations.last_sync_at IS 'Data/hora da última sincronização';
COMMENT ON COLUMN installations.created_at IS 'Data/hora de criação do registro';
COMMENT ON COLUMN installations.updated_at IS 'Data/hora da última atualização';

-- Verifica a estrutura final
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'installations' 
ORDER BY ordinal_position;
