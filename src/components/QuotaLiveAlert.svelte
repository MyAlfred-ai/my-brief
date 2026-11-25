<script>
  /**
   * Crédit de temps épuisé PENDANT une réunion : une alerte, et rien d'autre.
   *
   * Le quota ne s'applique qu'au démarrage (services/api/lib/quota.js) : on ne
   * coupe pas une réunion entamée, elle va au bout et ses minutes comptent à
   * son arrêt. Sans ce composant, l'anneau de l'avatar passait au rouge sans
   * un mot, et l'utilisateur découvrait « Quota atteint » sur « Démarrer » à la
   * réunion suivante. L'alerte reste affichée jusqu'à ce qu'on la ferme : elle
   * part souvent quand personne ne regarde l'écran.
   *
   * Une fois par réunion : le crédit ne remonte pas en cours de route, sauf
   * quota relevé par l'administration — et s'il retombe ensuite, la réunion
   * est déjà prévenue. Réarmé à l'arrêt.
   *
   * Composant sans balisage plutôt que du code dans App.svelte : son cliquet
   * `max-lines` (cf. eslint.config.js) n'accepte pas de croissance.
   */
  import { quota, quotaNow } from '../stores/quota.js';
  import { isRecordingStore } from '../stores/recording.js';
  import { showToast } from '../stores/toasts.js';
  import { uiText, currentLanguageStore } from '../store.js';
  import { periodMonths } from '../utils/quotaFormat.js';
  import { fill } from '../utils/i18nFormat.js';

  let warned = false;

  $: if (!$isRecordingStore) warned = false;
  $: ranOut = $isRecordingStore && $quotaNow.limited && $quotaNow.tone === 'out';
  $: if (ranOut && !warned) warn();

  function warn() {
    warned = true;
    const month = periodMonths($quota.period, $currentLanguageStore).renewal;
    showToast(fill($uiText.quota.exhaustedLiveToast, { month }), 'warning', 0);
  }
</script>
