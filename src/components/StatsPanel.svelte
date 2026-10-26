<script>
  /**
   * « Mes statistiques » — panneau plein écran, monté comme « Ma
   * configuration » et l'administration (PanelShell, `#my-stats`). Ouvert par
   * le compteur de minutes, l'icône à côté de la roue crantée, ou le menu de
   * compte (téléphone).
   *
   * SA consommation, et rien d'autre — administrateur compris. Le crédit de
   * l'équipe vivait ici dans un onglet « Équipe » réservé aux administrateurs ;
   * il est passé dans l'administration (admin/CreditsTab), où vit tout ce qui
   * regarde les comptes des autres : une page « Mes … » ne montre que soi.
   */
  import { onDestroy } from 'svelte';
  import IconChart from '~icons/solar/chart-square-linear';
  import PanelShell from './PanelShell.svelte';
  import PersonalStats from './stats/PersonalStats.svelte';
  import { registerPanelNav, clearPanelNav } from '../stores/panels.js';
  import { uiText } from '../store.js';

  export let onClose = () => {};

  $: texts = $uiText.myStats;
  // Une seule section : la colonne de gauche garde son « Retour à l'accueil »,
  // comme pour les autres panneaux.
  $: registerPanelNav('stats', {
    title: texts.navTitle,
    items: [{ id: 'me', label: texts.navMe, icon: IconChart }],
    active: 'me',
  });
  onDestroy(() => clearPanelNav('stats'));
</script>

<PanelShell title={texts.title} icon={IconChart} {onClose} closeLabel={$uiText.buttons.close}>
  <div class="sp-body">
    <PersonalStats />
  </div>
</PanelShell>

<style>
  .sp-body {
    width: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    padding: 18px 22px 22px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
  }
  @media (max-width: 640px) {
    .sp-body {
      padding: 14px 16px 14px;
    }
  }
</style>
