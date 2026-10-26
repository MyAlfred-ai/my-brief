/**
 * Erreur d'autorisation d'un compte externe.
 *
 * La lever a une conséquence concrète et coûteuse : l'appelant SUPPRIME la
 * connexion de l'utilisateur, qui devra refaire tout le flux d'autorisation
 * chez le fournisseur. Ne la lever que sur un signal non ambigu de retrait
 * d'accès (`invalid_grant` au rafraîchissement, 401 sur un appel fait avec un
 * jeton qui vient d'être émis) — jamais sur un quota, un 5xx ou une panne
 * réseau, qui se résolvent seuls.
 */
export class ConnectionAuthError extends Error {
  /**
   * @param {string} [message]
   * @param {{provider?: string}} [options]
   */
  constructor(message = 'connection_auth_revoked', { provider = '' } = {}) {
    super(message);
    this.name = 'ConnectionAuthError';
    this.provider = provider;
  }
}
