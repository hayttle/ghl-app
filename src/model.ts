import pool from './db';

// eslint-disable-next-line no-unused-vars
export enum TokenType {
  Bearer = "Bearer",
}

// eslint-disable-next-line no-unused-vars
export enum IntegrationStatus {
  Active = "active",
  Error = "error",
  Pending = "pending"
}

export interface InstallationDetails {
  id?: number;
  access_token: string;
  token_type: TokenType.Bearer;
  expires_in: number;
  refresh_token: string;
  scope: string;
  userType: string;
  companyId?: string;
  locationId?: string;
  conversationProviderId?: string;
  evolutionInstanceName?: string;
  integrationStatus?: IntegrationStatus;
  lastSyncAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  clientId?: string;
  clientSecret?: string;
}

export interface ContactInfo {
  id: string;
  phone: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  locationId: string;
}

export interface MessageData {
  contactId: string;
  locationId: string;
  message: string;
  messageType: 'inbound' | 'outbound';
  conversationProviderId?: string;
  timestamp: Date;
}

export class Model {

  constructor() {}

  async saveInstallationInfo(details: InstallationDetails): Promise<void> {
    // Validação melhorada - permite companyId OU locationId
    if (!details.locationId && !details.companyId) {
      throw new Error("Location ID ou Company ID é obrigatório para salvar informações de instalação.");
    }
    
    const resourceId = details.locationId || details.companyId;
    console.log("💾 Salvando dados de instalação no DB para:", resourceId);

    const query = `
      INSERT INTO installations (
        location_id,
        company_id,
        access_token,
        refresh_token,
        expires_in,
        scope,
        token_type,
        user_type,
        conversation_provider_id,
        evolution_instance_name,
        integration_status,
        last_sync_at,
        client_id,
        client_secret,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
      ON CONFLICT (location_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_in = EXCLUDED.expires_in,
        scope = EXCLUDED.scope,
        token_type = EXCLUDED.token_type,
        user_type = EXCLUDED.user_type,
        conversation_provider_id = COALESCE(EXCLUDED.conversation_provider_id, installations.conversation_provider_id),
        evolution_instance_name = COALESCE(EXCLUDED.evolution_instance_name, installations.evolution_instance_name),
        integration_status = EXCLUDED.integration_status,
        last_sync_at = EXCLUDED.last_sync_at,
        client_id = COALESCE(EXCLUDED.client_id, installations.client_id),
        client_secret = COALESCE(EXCLUDED.client_secret, installations.client_secret),
        updated_at = NOW();
    `;

    const values = [
      details.locationId || null,
      details.companyId || null,
      details.access_token,
      details.refresh_token,
      details.expires_in,
      details.scope,
      details.token_type,
      details.userType,
      details.conversationProviderId || null,
      details.evolutionInstanceName || null,
      details.integrationStatus || IntegrationStatus.Active,
      details.lastSyncAt || new Date(),
      details.clientId || null,
      details.clientSecret || null
    ];

    try {
      await pool.query(query, values);
      console.log(`✅ Dados da instalação salvos no DB para o recurso: ${resourceId}`);
    } catch (error) {
      console.error('Erro ao salvar no banco de dados:', error);
      throw error;
    }
  }

  async getInstallationInfo(resourceId: string): Promise<InstallationDetails | undefined> {
    try {
      const result = await pool.query(
        'SELECT * FROM installations WHERE location_id = $1 OR company_id = $1',
        [resourceId]
      );
      
      if (result.rows.length === 0) {
        return undefined;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        access_token: row.access_token,
        token_type: row.token_type,
        expires_in: row.expires_in,
        refresh_token: row.refresh_token,
        scope: row.scope,
        userType: row.user_type,
        companyId: row.company_id,
        locationId: row.location_id,
        conversationProviderId: row.conversation_provider_id,
        evolutionInstanceName: row.evolution_instance_name,
        integrationStatus: row.integration_status,
        lastSyncAt: row.last_sync_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        clientId: row.client_id,
        clientSecret: row.client_secret
      };
    } catch (error) {
      console.error('Erro ao buscar detalhes da instalação no DB:', error);
      return undefined;
    }
  }

  async getAccessToken(resourceId: string): Promise<string | undefined> {
    try {
      const result = await pool.query(
        'SELECT access_token, expires_in, updated_at FROM installations WHERE location_id = $1 OR company_id = $1',
        [resourceId]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        const expiresAt = new Date(row.updated_at.getTime() + row.expires_in * 1000);
        if (expiresAt > new Date()) {
          return row.access_token;
        }
      }
      return undefined;
    } catch (error) {
      console.error('Erro ao buscar token no DB:', error);
      return undefined;
    }
  }

  async getRefreshToken(resourceId: string): Promise<string | undefined> {
    try {
      const result = await pool.query(
        'SELECT refresh_token FROM installations WHERE location_id = $1 OR company_id = $1',
        [resourceId]
      );
      return result.rows[0]?.refresh_token;
    } catch (error) {
      console.error('Erro ao buscar refresh token no DB:', error);
      return undefined;
    }
  }

  async deleteInstallationInfo(resourceId: string): Promise<void> {
    try {
      await pool.query(
        'DELETE FROM installations WHERE location_id = $1 OR company_id = $1', 
        [resourceId]
      );
      console.log(`🗑️ Instalação deletada do DB para o recurso: ${resourceId}`);
    } catch (error) {
      console.error('Erro ao deletar instalação no banco de dados:', error);
      throw error;
    }
  }

  async checkInstallationExists(resourceId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT 1 FROM installations WHERE location_id = $1 OR company_id = $1 LIMIT 1',
        [resourceId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Erro ao verificar instalação no DB:', error);
      return false;
    }
  }

  async updateIntegrationStatus(resourceId: string, status: IntegrationStatus): Promise<void> {
    try {
      await pool.query(
        'UPDATE installations SET integration_status = $1, updated_at = NOW() WHERE location_id = $2 OR company_id = $2',
        [status, resourceId]
      );
      console.log(`✅ Status de integração atualizado para ${status} no recurso: ${resourceId}`);
    } catch (error) {
      console.error('Erro ao atualizar status de integração:', error);
      throw error;
    }
  }

  async updateLastSyncTime(resourceId: string): Promise<void> {
    try {
      await pool.query(
        'UPDATE installations SET last_sync_at = NOW(), updated_at = NOW() WHERE location_id = $1 OR company_id = $1',
        [resourceId]
      );
    } catch (error) {
      console.error('Erro ao atualizar tempo de última sincronização:', error);
      throw error;
    }
  }

  async getActiveIntegrations(): Promise<InstallationDetails[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM installations WHERE integration_status = $1',
        [IntegrationStatus.Active]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        access_token: row.access_token,
        token_type: row.token_type,
        expires_in: row.expires_in,
        refresh_token: row.refresh_token,
        scope: row.scope,
        userType: row.user_type,
        companyId: row.company_id,
        locationId: row.location_id,
        conversationProviderId: row.conversation_provider_id,
        evolutionInstanceName: row.evolution_instance_name,
        integrationStatus: row.integration_status,
        lastSyncAt: row.last_sync_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Erro ao buscar integrações ativas:', error);
      return [];
    }
  }

  async getAllInstallations(): Promise<InstallationDetails[]> {
    try {
      const result = await pool.query('SELECT * FROM installations');
      
      return result.rows.map(row => ({
        id: row.id,
        access_token: row.access_token,
        token_type: row.token_type,
        expires_in: row.expires_in,
        refresh_token: row.refresh_token,
        scope: row.scope,
        userType: row.user_type,
        companyId: row.company_id,
        locationId: row.location_id,
        conversationProviderId: row.conversation_provider_id,
        evolutionInstanceName: row.evolution_instance_name,
        integrationStatus: row.integration_status,
        lastSyncAt: row.last_sync_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Erro ao buscar todas as instalações:', error);
      return [];
    }
  }

  async getInstallationByInstanceName(instanceName: string): Promise<InstallationDetails | null> {
    try {
      const result = await pool.query(
        'SELECT * FROM installations WHERE evolution_instance_name = $1 LIMIT 1',
        [instanceName]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const row = result.rows[0];
      return {
        id: row.id,
        access_token: row.access_token,
        token_type: row.token_type,
        expires_in: row.expires_in,
        refresh_token: row.refresh_token,
        scope: row.scope,
        userType: row.user_type,
        companyId: row.company_id,
        locationId: row.location_id,
        conversationProviderId: row.conversation_provider_id,
        evolutionInstanceName: row.evolution_instance_name,
        integrationStatus: row.integration_status,
        lastSyncAt: row.last_sync_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    } catch (error) {
      console.error('Erro ao buscar instalação por instanceName:', error);
      return null;
    }
  }

  // ✅ NOVO: Método para atualizar conversationProviderId
  async updateConversationProviderId(resourceId: string, conversationProviderId: string): Promise<void> {
    try {
      console.log(`💾 Atualizando conversationProviderId para ${resourceId}: ${conversationProviderId}`);
      
      const result = await pool.query(
        `UPDATE installations 
         SET conversation_provider_id = $1, updated_at = NOW() 
         WHERE location_id = $2 OR company_id = $2`,
        [conversationProviderId, resourceId]
      );
      
      if (result.rowCount === 0) {
        throw new Error(`Instalação não encontrada para resourceId: ${resourceId}`);
      }
      
      console.log(`✅ ConversationProviderId atualizado com sucesso para ${resourceId}`);
    } catch (error) {
      console.error('Erro ao atualizar conversationProviderId:', error);
      throw error;
    }
  }
}