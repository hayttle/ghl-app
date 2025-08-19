-- Script para corrigir as constraints da tabela installations
-- Execute este script se a tabela já existir e tiver problemas de constraint

-- Remove constraints existentes que podem estar causando conflito
ALTER TABLE installations DROP CONSTRAINT IF EXISTS installations_location_id_key;
ALTER TABLE installations DROP CONSTRAINT IF EXISTS installations_company_id_key;

-- Adiciona constraint única para location_id (que é o campo principal)
ALTER TABLE installations ADD CONSTRAINT installations_location_id_key UNIQUE (location_id);

-- Verifica se a constraint foi criada corretamente
SELECT 
    constraint_name,
    constraint_type,
    table_name
FROM information_schema.table_constraints 
WHERE table_name = 'installations' 
AND constraint_type = 'UNIQUE';

-- Verifica a estrutura final da tabela
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'installations' 
ORDER BY ordinal_position;
