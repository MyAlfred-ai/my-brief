<script>
  // Feuille d'infographie — le SQUELETTE commun aux six gabarits :
  //   - couverture en dégradé de la marque : le logo de l'ENTREPRISE, toujours
  //     en haut à gauche, sur un badge blanc (aucun logo ne disparaît sur sa
  //     propre couleur) — à défaut, celui de l'application ; à droite le
  //     gabarit et la date ; le titre et le sous-titre écrits par l'IA ;
  //   - le corps du gabarit choisi (Tpl*.svelte) ;
  //   - les actions, posées par le CODE telles que l'écran les montre ;
  //   - pied, bandeau sombre : les participants NOMMÉS (prénom et nom, pas
  //     d'initiales : on doit pouvoir lire qui était là), la prochaine étape,
  //     et — discret, toujours en bas à droite — le logo de l'APPLICATION avec
  //     « myBrief ».
  //
  // Une page A4, toujours. Tout est mesuré en unités de page (1 % de la
  // largeur) : la même feuille s'affiche en miniature de 86 px, en grand dans
  // la visionneuse, et se rend en PNG de 1 080 px (exportPng.js). Montée, elle
  // se mesure et réduit l'échelle de son contenu jusqu'à tenir dans la page
  // (`fit`, cf. src/lib/infographic/fit.js) — l'export attend cet ajustement.
  //
  // Les libellés suivent la langue de l'INFOGRAPHIE (`layout.langue`), pas
  // celle de l'écran : ils doivent parler la langue des textes de l'IA.
  import { onMount, tick } from 'svelte';
  import './infographic.css';
  import Icon from './Icon.svelte';
  import GradIcon from './GradIcon.svelte';
  import SectionTitle from './SectionTitle.svelte';
  import TplSynthese from './TplSynthese.svelte';
  import TplDecision from './TplDecision.svelte';
  import TplFeuilleDeRoute from './TplFeuilleDeRoute.svelte';
  import TplTableauDeBord from './TplTableauDeBord.svelte';
  import TplAtelier from './TplAtelier.svelte';
  import TplBilan from './TplBilan.svelte';
  import { uiTextData } from '../../config/uiText.js';
  import { fill } from '../../utils/i18nFormat.js';
  import { TEMPLATE_ICONS, templateOf } from '../../lib/infographic/catalog.js';
  import { infographicPalette, paletteStyle } from '../../lib/infographic/palette.js';
  import { fitScale } from '../../lib/infographic/fit.js';
  import {
    formatDue,
    formatDuration,
    formatMeetingDate,
    plural,
  } from '../../lib/infographic/format.js';

  /** Contenu (contrat de services/api/lib/infographicLayout.js). */
  export let layout;
  /** Couleurs de l'Apparence : { primaryColor, secondaryColor } (store `branding`). */
  export let brand = {};
  /** Logo de l'entreprise (Marque & apparence) — vide : celui de l'application le remplace. */
  export let companyLogo = '';
  /** Logo de l'application (réglé, ou intégré) : pied de page, et en-tête à défaut. */
  export let appLogo = '';
  /**
   * Logo du TAG de la réunion — le client ou le projet (« Mes tags ») — en
   * médaillon blanc dans la colonne de droite de la couverture, à la place du
   * pictogramme du gabarit, au centre de l'anneau. Le titre s'arrête déjà
   * avant cette colonne : aucun corps de gabarit ne bouge. Vide : pictogramme.
   */
  export let tagLogo = '';
  /** Miniature : la feuille n'est qu'une image pour les lecteurs d'écran. */
  export let decorative = false;

  const MAX_ACTIONS = 4;
  /** Au-delà, le titre passe en corps réduit : il tient en trois lignes dans
   *  ses deux tiers de largeur (le serveur le borne à 90 caractères). */
  const LONG_TITLE = 56;
  /** Participants nommés au pied ; au-delà, « et N autres » (le serveur en garde 10). */
  const MAX_PEOPLE = 8;

  /** Trame de points de la couverture (8 × 5), en coordonnées du viewBox. */
  const DOTS = Array.from({ length: 40 }, (_, i) => ({
    x: 4 + (i % 8) * 8,
    y: 4 + Math.floor(i / 8) * 8,
  }));

  const BODIES = {
    synthese: TplSynthese,
    decision: TplDecision,
    feuille_de_route: TplFeuilleDeRoute,
    tableau_de_bord: TplTableauDeBord,
    atelier: TplAtelier,
    bilan: TplBilan,
  };

  $: lang = layout?.langue === 'en' ? 'en' : 'fr';
  $: L = uiTextData[lang].infographic.sheet;
  $: tpl = templateOf(layout);
  $: pal = infographicPalette(brand);
  $: vars = paletteStyle(pal);
  $: headLogo = companyLogo || appLogo;
  $: when = [formatMeetingDate(layout?.date, lang), formatDuration(layout?.dureeSec, lang)]
    .filter(Boolean)
    .join(' · ');
  // Quatre actions au plus SUR la page A4 : au-delà, une ligne renvoie au
  // compte rendu — l'infographie se lit d'un coup d'œil, la liste est ailleurs.
  $: actions = (layout?.actions || []).slice(0, MAX_ACTIONS);
  $: hidden = Math.max(0, (layout?.actionsTotal || 0) - actions.length);
  $: people = layout?.participants || [];
  $: shownPeople = people.slice(0, MAX_PEOPLE);
  $: hiddenPeople = people.length - shownPeople.length;

  /** La page (élément mesuré) et l'échelle retenue pour qu'elle tienne. */
  let sheetEl;
  let mounted = false;
  let run = 0;

  /**
   * Ajuste l'échelle du contenu à la page A4, polices chargées. Appelée au
   * montage et à chaque changement de contenu ; l'export PNG l'attend avant
   * la photo. Sous jsdom (aucune mise en page), rien ne déborde : échelle 1.
   * @param {unknown} [_deps] - ignoré : nomme ce qui déclenche le réajustement
   * @returns {Promise<number>} l'échelle retenue
   */
  export async function fit(_deps) {
    const current = (run += 1);
    await tick();
    if (typeof document !== 'undefined' && document.fonts?.ready) await document.fonts.ready;
    if (!sheetEl || current !== run) return 1;
    const overflows = (scale) => {
      sheetEl.style.setProperty('--ig-k', String(scale));
      return sheetEl.scrollHeight > sheetEl.clientHeight + 1;
    };
    const scale = fitScale(overflows);
    sheetEl.style.setProperty('--ig-k', String(scale));
    sheetEl.dataset.scale = String(scale);
    return scale;
  }

  onMount(() => {
    mounted = true;
  });

  // Contenu, langue ou logos changés : la page se réajuste.
  $: if (mounted) fit([layout, companyLogo, appLogo, tagLogo]);
</script>

<div class="igx" style={vars} aria-hidden={decorative ? 'true' : undefined}>
  <article class="ig-sheet ig-tpl-{tpl}" {lang} bind:this={sheetEl}>
    <!-- Couverture : un dégradé pleine largeur de la marque, des formes de
         verre, le pictogramme du gabarit en médaillon, une vague qui ouvre le
         corps. Le logo de l'entreprise y reste en haut à gauche, sur un badge
         blanc — lisible quelle que soit sa couleur. Aucune forme ne croise un
         texte : le titre tient dans les deux tiers de gauche, le médaillon
         occupe le dernier, sous la date. -->
    <header class="ig-cover" class:ig-cover-tagged={!!tagLogo}>
      <span class="ig-cover-blob"></span>
      <span class="ig-cover-ring"></span>
      {#if tagLogo}
        <span class="ig-cover-medal"><img src={tagLogo} alt={L.tagLogoAlt} /></span>
      {:else}
        <span class="ig-cover-ghost">
          <Icon name={TEMPLATE_ICONS[tpl]} color={pal.glassStrong} size={24} strokeWidth={1.5} />
        </span>
      {/if}
      <!-- Couleur pleine, pas d'opacité : l'export PNG perd `fill-opacity`. -->
      <svg class="ig-cover-dots" viewBox="0 0 64 40" aria-hidden="true">
        {#each DOTS as dot, i (i)}
          <circle cx={dot.x} cy={dot.y} r="1.6" fill={pal.glassStrong} />
        {/each}
      </svg>
      <div class="ig-cover-top">
        <div class="ig-logo-badge">
          {#if headLogo}<img src={headLogo} alt={L.logoAlt} />{/if}
        </div>
        <div class="ig-meta">
          <span class="ig-kind">
            <Icon name={TEMPLATE_ICONS[tpl]} color={pal.onHero} size={2.4} strokeWidth={2} />
            {L.templates[tpl]}
          </span>
          {#if when}<span class="ig-when">{when}</span>{/if}
        </div>
      </div>
      <div class="ig-cover-title">
        <p class="ig-h" class:ig-h-long={(layout.titre || '').length > LONG_TITLE}>
          {layout.titre || L.untitled}
        </p>
        {#if layout.sousTitre}<p class="ig-sub">{layout.sousTitre}</p>{/if}
      </div>
      <svg class="ig-wave" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 7 C 18 1, 34 1, 52 6 S 84 12, 100 4 L 100 12 L 0 12 Z" fill={pal.paper} />
      </svg>
    </header>

    <div class="ig-body">
      <svelte:component this={BODIES[tpl]} {layout} {pal} {L} {lang} />

      {#if actions.length}
        <section class="ig-section">
          <SectionTitle title={L.actions} icon="fusee" tone="s" {pal} />
          <ul class="ig-actions">
            {#each actions as action, i (i)}
              <li class="ig-action">
                <GradIcon
                  name={action.responsable ? 'personne' : 'point'}
                  tone="s"
                  {pal}
                  size={4}
                  shape="round"
                />
                <span class="ig-action-text">
                  {action.texte}
                  {#if action.responsable}<small>{action.responsable}</small>{/if}
                </span>
                {#if action.echeance}
                  <span class="ig-due">
                    <Icon name="calendrier" color={pal.pInk} size={2.2} strokeWidth={2} />
                    {formatDue(action.echeance, lang)}
                  </span>
                {/if}
              </li>
            {/each}
          </ul>
          {#if hidden}
            <p class="ig-more">
              {fill(plural(hidden, L.moreActionOne, L.moreActionMany), { count: hidden })}
            </p>
          {/if}
        </section>
      {/if}
    </div>

    <footer class="ig-foot">
      <div class="ig-foot-main">
        {#if people.length}
          <span class="ig-people" title={people.join(', ')}>
            <GradIcon name="equipe" {pal} size={3.4} shape="round" />
            <span
              ><b>{L.participants}</b> · {shownPeople.join(', ')}{#if hiddenPeople}{' '}{fill(
                  plural(hiddenPeople, L.morePeopleOne, L.morePeopleMany),
                  { count: hiddenPeople },
                )}{/if}</span
            >
          </span>
        {/if}
        {#if layout.prochaineEtape}
          <span class="ig-next">
            <GradIcon name="drapeau" {pal} size={3.4} shape="round" />
            <span><b>{L.nextStep}</b> · {layout.prochaineEtape}</span>
          </span>
        {/if}
      </div>
      <span class="ig-made">
        {#if appLogo}<span class="ig-made-badge"><img src={appLogo} alt={L.appLogoAlt} /></span
          >{/if}
        <span>{L.madeWith}</span>
      </span>
    </footer>
  </article>
</div>
