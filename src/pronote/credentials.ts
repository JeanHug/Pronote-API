/**
 * Garde-fou anti-publication d'identifiants ENT.
 *
 * Le runner reçoit username/password en clair pour la connexion SSO. Aucun de
 * ces champs ne doit jamais aboutir dans un commentaire GitHub, un artefact
 * Actions ou un log de workflow. Ce module centralise la détection pour que
 * `scripts/publish-response.ts` et les tests partagent exactement la même
 * logique.
 */

/**
 * Clés (insensibles à la casse, espaces périphériques ignorés) dont la
 * simple présence disqualifie un objet. Comparaison EXACTE : « pass » bloque
 * un champ d'appareil nommé « pass » sans bloquer « passeport » ou
 * « passerelle ».
 */
export const FORBIDDEN_CREDENTIAL_KEYS: ReadonlySet<string> = new Set([
  'username',
  'password',
  'pass',
  'ent_id',
  'ent_pass',
  'entid',
  'entpass',
]);

/** Retourne la première clé interdite trouvée (à n'importe quelle profondeur), sinon null. */
export function findCredentialKey(
  value: unknown,
  forbidden: ReadonlySet<string> = FORBIDDEN_CREDENTIAL_KEYS,
): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findCredentialKey(item, forbidden);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key.trim().toLowerCase())) return key;
    const hit = findCredentialKey(nested, forbidden);
    if (hit !== null) return hit;
  }
  return null;
}

/** Lève si l'objet (ou l'un de ses enfants) porte une clé d'identification. */
export function assertNoCredentialKeys(value: unknown): void {
  const key = findCredentialKey(value);
  if (key !== null) {
    throw new Error(`Publication annulée : clé d’identification interdite détectée (${key}).`);
  }
}
