/**
 * Carte d'erreur IA de l'onglet Résumé — la projection { kind, provider } →
 * { cls, icon, title, body } que rend components/AiErrorNotice.svelte.
 *
 * Sortie d'App.svelte (plafonné par `max-lines`) : une fonction pure, qui ne
 * décide ni QUAND la carte s'affiche ni POUR QUELLE réunion — App garde cela,
 * la notice étant rattachée à la réunion dont la rédaction a échoué.
 *
 * `t` et `formatMessage` sont ceux d'App : la résolution des textes reste chez
 * l'appelant, qui connaît la langue courante.
 */

/** Suffixe « (fournisseur) » des messages de crédit épuisé — vide sans fournisseur. */
export const providerSuffix = (provider) => (provider ? ` (${provider})` : '');

/**
 * @param {{kind: 'credit'|'service'|'network', provider?: string}} notice
 * @param {{t: (path: string) => string,
 *   formatMessage: (path: string, replacements: Object) => string}} i18n
 * @returns {{cls: string, icon: string, title: string, body: string}}
 */
export function buildAiErrorNoticeView(notice, { t, formatMessage }) {
  if (notice.kind === 'credit') {
    return {
      cls: 'credit',
      icon: '🔌',
      title: t('aiNotice.creditTitle'),
      body: formatMessage('messages.aiCreditExhausted', {
        provider: providerSuffix(notice.provider),
      }),
    };
  }
  if (notice.kind === 'network') {
    return {
      cls: 'network',
      icon: '📡',
      title: t('aiNotice.networkTitle'),
      body: t('messages.aiNetworkError'),
    };
  }
  return {
    cls: 'service',
    icon: '⚠️',
    title: t('aiNotice.serviceTitle'),
    body: t('messages.aiServiceError'),
  };
}
