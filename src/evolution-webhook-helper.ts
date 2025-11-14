/**
 * Helper para processar webhooks da Evolution API
 */

export interface SenderInfo {
  phoneNumber: string
  source: string
}

export interface EvolutionKey {
  addressingMode?: string
  remoteJid?: string
  remoteJidAlt?: string
  participant?: string
  fromMe?: boolean
  id?: string
}

/**
 * Extrai o número do sender baseado no addressingMode da Evolution API
 *
 * Regras:
 * - addressingMode === "lid": usa remoteJidAlt (com fallback para remoteJid)
 * - addressingMode === "pn": usa remoteJid
 * - Caso contrário: usa remoteJid como fallback
 *
 * @param key - Objeto key do webhook da Evolution API
 * @returns Objeto com phoneNumber e source (para logs)
 */
export function getSenderPhoneNumber(key: EvolutionKey): SenderInfo {
  const addressingMode = key.addressingMode
  let phoneNumber: string
  let source: string

  if (addressingMode === "lid") {
    // Quando addressingMode é "lid", usar remoteJidAlt
    phoneNumber = key.remoteJidAlt || key.remoteJid || ""
    source = key.remoteJidAlt ? "remoteJidAlt (addressingMode: lid)" : "remoteJid (fallback - remoteJidAlt ausente)"
  } else if (addressingMode === "pn") {
    // Quando addressingMode é "pn", usar remoteJid
    phoneNumber = key.remoteJid || ""
    source = "remoteJid (addressingMode: pn)"
  } else {
    // Fallback: usar remoteJid quando addressingMode não é "pn" nem "lid"
    phoneNumber = key.remoteJid || ""
    source = `remoteJid (fallback - addressingMode: ${addressingMode || "ausente"})`
  }

  return {phoneNumber, source}
}

/**
 * Formata número de telefone removendo sufixos do WhatsApp
 * Remove @s.whatsapp.net e @lid
 *
 * @param phoneNumber - Número de telefone com sufixo
 * @returns Número formatado com prefixo +
 */
export function formatPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber) return ""
  return `+${phoneNumber.replace("@s.whatsapp.net", "").replace("@lid", "")}`
}
