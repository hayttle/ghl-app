-- ========================================
-- MIGRAÇÃO: ADICIONAR CREDENCIAIS GHL
-- ========================================
-- Data: 2025-08-20
-- Descrição: Adiciona colunas client_id e client_secret para validação de credenciais GHL

-- Adiciona as novas colunas
ALTER TABLE installations 
ADD COLUMN client_id VARCHAR(255),
ADD COLUMN client_secret VARCHAR(255);

-- Adiciona comentários para documentação
COMMENT ON COLUMN installations.client_id IS 'Client ID do GHL para esta instalação';
COMMENT ON COLUMN installations.client_secret IS 'Client Secret do GHL para esta instalação';

-- Cria índice para melhor performance nas consultas
CREATE INDEX idx_installations_client_credentials ON installations(client_id, client_secret);

-- Verifica se as colunas foram adicionadas
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'installations' 
AND column_name IN ('client_id', 'client_secret');

-- Mostra estrutura atual da tabela
\d installations;
