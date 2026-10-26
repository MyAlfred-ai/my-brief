/**
 * Résolution de l'origine API depuis VITE_API_BASE_URL.
 *
 * Sémantique = ORIGINE (ex: https://mybrief.example.test), PAS le chemin
 * complet — c'est ce que docker/docker-compose.yml passe comme build arg.
 *
 * Vide/absent => '' => toutes les URLs API restent RELATIVES : c'est le cas
 * partout aujourd'hui, l'app native chargeant le site déployé (mode
 * server.url). Seul un bundle embarqué devrait la fixer : dans une WebView
 * servie depuis capacitor://localhost, un chemin relatif n'atteint jamais le
 * serveur.
 */
export function resolveApiOrigin(raw) {
  const v = String(raw || '')
    .trim()
    .replace(/\/+$/, '');
  if (!v) return '';
  // Tolère un chemin passé par erreur ("…/api") : on ne garde que l'origine.
  return v.replace(/\/api$/, '');
}
