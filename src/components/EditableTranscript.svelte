<script>
  import { afterUpdate, createEventDispatcher } from 'svelte';

  import { uiText } from '../store.js';
  import { effectiveSpeakerLabels } from '../utils/transcriptAttribution.js';
  import { knownRemoteSpeakers } from '../utils/transcriptSpeakers.js';
  import SpeakerNamePopover from './SpeakerNamePopover.svelte';
  import TranscriptLine from './TranscriptLine.svelte';

  // Historique de transcription : [{ time, timestamp, author, text, isDelta, source, speaker }]
  export let items = [];
  // Nom de l'utilisateur (userInfo.name, non validé) : étiquette du canal micro.
  export let selfName = '';
  /**
   * Ce que l'Aide IA a pris pour elle dans une ligne : `(ligne) => { before,
   * word, after, label } | null`. `word` — son prénom, quand il l'a déclenchée —
   * s'écrit dans sa teinte. Fournie par LiveTranscript ; absente ailleurs
   * (une réunion rouverte ne sait plus quelles phrases l'ont appelée).
   * @type {((item: object) => {before: string, word: string, after: string, label: string} | null) | null}
   */
  export let aiMark = null;

  const dispatch = createEventDispatcher();

  const sourceOf = (t) => (t && t.source) || 'local';

  // Badge de locuteur : uniquement si la réunion a VRAIMENT tourné sur les deux
  // canaux (micro + audio système de la visio). Une réunion mono-flux garde
  // l'affichage d'avant, sans décoration inutile. Un seul passage, arrêté dès
  // les deux canaux vus : recalculé à chaque delta du direct.
  $: hasTwoSources = bothSources(items);
  function bothSources(list) {
    let local = false;
    let remote = false;
    for (const t of list) {
      const source = sourceOf(t);
      if (source === 'remote') remote = true;
      else if (source === 'local') local = true;
      if (local && remote) return true;
    }
    return false;
  }

  // Étiquette effective de chaque ligne — nom posé, héritage en direct,
  // « Visio » sinon : le MÊME calcul que le texte envoyé au modèle, ce que
  // l'utilisateur voit est ce que le compte rendu reçoit.
  $: labels = effectiveSpeakerLabels(items, selfName);
  // Les noms déjà donnés ne servent qu'au menu : rien à calculer menu fermé.
  $: knownNames = speakerMenu ? knownRemoteSpeakers(items, selfName) : [];
  $: TS = $uiText.transcription.speakers;

  /**
   * Le badge n'apparaît qu'au CHANGEMENT de locuteur (canal OU nom) : une
   * réplique de dix lignes ne le répète pas dix fois. `labels` et `twoSources`
   * sont passés en paramètres pour que le bloc `{@const}` les suive.
   */
  function badgeAt(labelList, twoSources, i) {
    if (!twoSources) return '';
    return i === 0 || labelList[i] !== labelList[i - 1] ? labelList[i] : '';
  }

  // ── Nommer une voix de la visio ─────────────────────────────────────────
  // Menu « Qui parle ici ? » ouvert sur UNE ligne, ancré sur le bouton cliqué
  // (pastille en tête de prise de parole, ou « d'ici » sur une ligne de
  // suite). La ligne live est admise : le nom survit à sa clôture.
  //
  // En direct, la liste bouge sous le menu : une finale s'insère DEVANT les
  // lignes en cours (le direct reste en bas, utils/transcriptLive.js), l'écho
  // retire des lignes. Suivi par sa seule position, le menu perdait son ancre
  // et se fermait dès que la visio parlait — ou visait la ligne voisine. Il
  // suit donc SA ligne, par son segment (itemId) ou son horodatage de
  // naissance, et ne se ferme que si elle a disparu.
  let speakerMenu = null;
  let popover;
  // Élément de chaque ligne, par position — rempli par TranscriptLine au
  // montage, lu seulement par afterUpdate (aucune réactivité attachée).
  const lineEls = [];
  const onLine = (i, el) => (lineEls[i] = el);

  const lineKey = (t) => {
    if (t?.itemId) return `seg:${sourceOf(t)}:${t.itemId}`;
    return t?.time || t?.timestamp ? `at:${sourceOf(t)}:${t.time}:${t.timestamp}` : '';
  };

  function toggleSpeakerMenu(e, i, align = 'start') {
    speakerMenu =
      speakerMenu && speakerMenu.index === i
        ? null
        : { index: i, key: lineKey(items[i]), anchor: e.currentTarget, align };
  }

  function onSpeakerPick(e) {
    const { index } = speakerMenu;
    speakerMenu = null;
    dispatch('speaker', { index, ...e.detail });
  }

  // Place actuelle de la ligne visée : même clé, au plus près de sa place
  // d'avant (deux lignes nées la même seconde restent distinctes). Sans clé
  // (réunion rouverte, qui ne bouge plus) : la position fait foi.
  function locateLine(list, { key, index }) {
    if (!key) return list[index] ? index : -1;
    let found = -1;
    list.forEach((t, j) => {
      if (lineKey(t) !== key) return;
      if (found === -1 || Math.abs(j - index) < Math.abs(found - index)) found = j;
    });
    return found;
  }

  $: if (speakerMenu) followSpeakerLine(items);
  function followSpeakerLine(list) {
    const index = locateLine(list, speakerMenu);
    if (index === -1) speakerMenu = null;
    else if (index !== speakerMenu.index) speakerMenu = { ...speakerMenu, index };
  }

  // Après chaque rendu, la ligne a pu changer d'élément (la liste n'est pas
  // keyée : l'état d'édition et le menu suivent une POSITION) ou de hauteur
  // sans que rien ne défile : réancrer, puis replacer.
  afterUpdate(() => {
    if (!speakerMenu) return;
    const line = lineEls[speakerMenu.index];
    const button = line?.querySelector(
      speakerMenu.align === 'end' ? '.transcript-speaker-split' : '.transcript-speaker-btn',
    );
    const anchor = button || line;
    if (anchor && anchor !== speakerMenu.anchor) speakerMenu = { ...speakerMenu, anchor };
    else popover?.place();
  });

  // LiveTranscript suspend le suivi du direct tant que le menu est ouvert.
  $: naming = !!speakerMenu;
  $: dispatch('naming', naming);

  let editingIndex = -1;

  // Double-clic sur une ligne FINALE → édition. La ligne live (isDelta) reste
  // verrouillée : elle est encore réécrite par les deltas → édition = race.
  // Le champ (TranscriptLine) se remplit et prend le focus à sa naissance.
  function startEdit(i, item) {
    if (item.isDelta) return;
    editingIndex = i;
  }

  // Écrasement simple : on remplace le texte. On ignore vide / inchangé pour
  // éviter d'effacer une ligne par accident (pas de suppression demandée).
  function commit(value) {
    if (editingIndex < 0) return;
    const i = editingIndex;
    const original = items[i] ? items[i].text : '';
    const next = String(value || '').trim();
    editingIndex = -1;
    if (next && next !== original) {
      dispatch('edit', { index: i, text: next });
    }
  }

  function cancel() {
    editingIndex = -1;
  }

  function onKeydown(e, value) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit(value); // Entrée = valider, Maj+Entrée = saut de ligne
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel(); // Échap = annuler
    }
  }
</script>

<!-- Non keyée, à dessein : l'édition et le menu suivent une position. Chaque
     ligne est un composant `immutable` — une ligne inchangée ne coûte rien
     quand un delta du direct remplace la liste. -->
{#each items as t, i}
  <TranscriptLine
    {t}
    index={i}
    badge={badgeAt(labels, hasTwoSources, i)}
    remote={sourceOf(t) === 'remote'}
    mark={aiMark ? aiMark(t) : null}
    twoSources={hasTwoSources}
    editing={editingIndex === i}
    menuOpen={speakerMenu?.index === i}
    {TS}
    editHint={$uiText.transcription.editHint}
    onStartEdit={startEdit}
    onEditKeydown={onKeydown}
    onEditBlur={commit}
    onToggleMenu={toggleSpeakerMenu}
    {onLine}
  />
{/each}

{#if speakerMenu}
  <SpeakerNamePopover
    bind:this={popover}
    anchor={speakerMenu.anchor}
    align={speakerMenu.align}
    current={labels[speakerMenu.index] || ''}
    names={knownNames}
    on:pick={onSpeakerPick}
    on:close={() => (speakerMenu = null)}
  />
{/if}
