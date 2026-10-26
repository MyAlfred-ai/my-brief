<script>
  /**
   * Onglet « Crédit de temps » de l'administration : le crédit du mois de
   * chaque compte (stats/TeamCredits), et la page « Mes statistiques » d'un
   * compte au clic (stats/PersonalStats) — des volumes, jamais le contenu de
   * ses réunions.
   *
   * Il vivait dans « Mes statistiques », réservé aux administrateurs : une page
   * personnelle ne doit montrer que sa propre consommation, la vue de l'équipe
   * revient ici, à côté des groupes où se règle le quota.
   */
  import TeamCredits from '../stats/TeamCredits.svelte';
  import PersonalStats from '../stats/PersonalStats.svelte';

  /** Le compte ouvert : `{email, name}`, ou null (la liste). */
  let viewing = null;
</script>

{#if viewing}
  {#key viewing.email}
    <PersonalStats account={viewing} onBack={() => (viewing = null)} />
  {/key}
{:else}
  <TeamCredits onOpen={(account) => (viewing = account)} />
{/if}
