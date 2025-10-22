-- Script para adicionar a coluna 'tag' na tabela installations
-- Execute este script no banco de dados PostgreSQL

-- Adicionar a coluna tag se ela não existir
DO $$ 
BEGIN
    -- Verificar se a coluna já existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'installations' 
        AND column_name = 'tag'
    ) THEN
        -- Adicionar a coluna tag
        ALTER TABLE installations 
        ADD COLUMN tag VARCHAR(255);
        
        RAISE NOTICE 'Coluna tag adicionada com sucesso na tabela installations';
    ELSE
        RAISE NOTICE 'Coluna tag já existe na tabela installations';
    END IF;
END $$;

-- Verificar se a coluna foi criada
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'installations' 
AND column_name = 'tag';
