<script>
  import { afterUpdate, createEventDispatcher, tick } from 'svelte';

  import { uiText } from '../store.js';
  import { effectiveSpeakerLabels } from '../utils/transcriptAttribution.js';
  import { knownRemoteSpeakers } from '../utils/transcriptSpeakers.js';
  import SpeakerNamePopover from './SpeakerNamePopover.svelte';
  import IconPen from '~icons/solar/pen-linear';
  import IconUserSpeak from '~icons/solar/user-speak-rounded-linear';

  // Historique de transcription : [{ time, timestamp, author, text, isDelta, source, speaker }]
  export let items = [];
  // Nom de l'utilisateur (userInfo.name, non validé) : étiquette du canal micro.
  export let selfName = '';

  const dispatch = createEventDispatcher();

  const sourceOf = (t) => (t && t.source) || 'local';

  // Badge de locuteur : uniquement si la réunion a VRAIMENT tourné sur les deux
  // canaux (micro + audio système de la visio). Une réunion mono-flux garde
  // l'affichage d'avant, sans décoration inutile.
  $: hasTwoSources =
    items.some((t) => sourceOf(t) === 'local') && items.some((t) => sourceOf(t) === 'remote');

  // Étiquette effective de chaque ligne — nom posé, héritage en direct,
  // « Visio » sinon : le MÊME calcul que le texte envoyé au modèle, ce que
  // l'utilisateur voit est ce que le compte rendu reçoit.
  $: labels = effectiveSpeakerLabels(items, selfName);
  $: knownNames = knownRemoteSpeakers(items, selfName);
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
  let lineEls = [];

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
  // keyée) ou de hauteur sans que rien ne défile : réancrer, puis replacer.
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
  let editValue = '';
  let textareaEl;

  // Double-clic sur une ligne FINALE → édition. La ligne live (isDelta) reste
  // verrouillée : elle est encore réécrite par les deltas → édition = race.
  async function startEdit(i, item) {
    if (item.isDelta) return;
    editingIndex = i;
    editValue = item.text;
    await tick();
    if (textareaEl) {
      textareaEl.focus();
      textareaEl.select();
      autoGrow(textareaEl);
    }
  }

  // Écrasement simple : on remplace le texte. On ignore vide / inchangé pour
  // éviter d'effacer une ligne par accident (pas de suppression demandée).
  function commit() {
    if (editingIndex < 0) return;
    const i = editingIndex;
    const original = items[i] ? items[i].text : '';
    const next = editValue.trim();
    editingIndex = -1;
    if (next && next !== original) {
      dispatch('edit', { index: i, text: next });
    }
  }

  function cancel() {
    editingIndex = -1;
  }

  function onKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit(); // Entrée = valider, Maj+Entrée = saut de ligne
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel(); // Échap = annuler
    }
  }

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
</script>

{#each items as t, i}
  {@const badge = badgeAt(labels, hasTwoSources, i)}
  {@const remote = sourceOf(t) === 'remote'}
  <div
    class="transcript-item"
    class:transcript-delta={t.isDelta}
    class:transcript-remote={remote}
    bind:this={lineEls[i]}
  >
    <!-- Colonne d'heure UNIQUEMENT quand la ligne en porte une (le direct :
         écoulé + horloge). Une réunion rouverte n'a plus d'heure par ligne
         (cf. utils/historySelection.js) : la colonne disparaît au lieu
         d'afficher une date ISO illisible en marge. -->
    {#if t.time || t.timestamp}
      <div class="transcript-time-container">
        <span class="transcript-time">{t.time}</span>
        {#if t.timestamp}
          <span class="transcript-timestamp">{t.timestamp}</span>
        {/if}
      </div>
    {/if}
    {#if editingIndex === i}
      <textarea
        class="transcript-text transcript-edit"
        bind:this={textareaEl}
        bind:value={editValue}
        on:keydown={onKeydown}
        on:blur={commit}
        on:input={(e) => autoGrow(e.target)}
        rows="1"
      ></textarea>
    {:else}
      <span
        class="transcript-text"
        class:transcript-editable={!t.isDelta}
        role={t.isDelta ? undefined : 'button'}
        tabindex={t.isDelta ? undefined : 0}
        title={t.isDelta ? undefined : $uiText.transcription.editHint}
        on:dblclick={() => startEdit(i, t)}
        on:keydown={(e) => {
          if (!t.isDelta && e.key === 'Enter') {
            e.preventDefault();
            startEdit(i, t);
          }
        }}
        ><!-- Étiquette de locuteur DANS le fil du texte, au changement de
            locuteur : une pastille inline en tête de réplique, au lieu d'une
            ligne dédiée qui espaçait verticalement chaque prise de parole.
            Voix de la visio : la pastille est un bouton — nommer le
            participant. Ses événements ne remontent pas à la ligne (double-clic
            = édition, Entrée = édition). -->{#if badge && remote}<button
            type="button"
            class="transcript-speaker transcript-speaker-remote transcript-speaker-btn"
            class:transcript-speaker-open={speakerMenu?.index === i}
            title={TS.nameBadge}
            aria-label="{badge} — {TS.nameBadge}"
            aria-haspopup="dialog"
            aria-expanded={speakerMenu?.index === i}
            on:click|stopPropagation={(e) => toggleSpeakerMenu(e, i)}
            on:dblclick|stopPropagation
            on:keydown|stopPropagation
            >{badge}<IconPen
              class="transcript-speaker-pen"
              width="10"
              height="10"
              aria-hidden="true"
            /></button
          >{:else if badge}<span class="transcript-speaker">{badge}</span
          >{/if}{#if t.refineFlash}<!-- Relecture par les notes : les mots corrigés
            s'allument le temps de l'animation (marqueur transitoire posé par
            flashRefinedWords, jamais persisté), puis la ligne redevient du
            texte brut. --><span
            class="transcript-refined-line"
            >{#each t.refineFlash.tokens as tok, k}{#if k > 0}{' '}{/if}<span
                class="word-refined"
                class:word-refined-changed={tok.changed}>{tok.word}</span
              >{/each}</span
          >{:else}{t.text}{/if}</span
      >
    {/if}
    {#if t.isDelta}
      <span class="transcript-delta-indicator">...</span>
    {/if}
    <!-- Ligne de suite d'une voix distante (sans pastille) : « autre
         participant à partir d'ici ». Révélé au survol de la ligne, posé en
         absolu à droite pour ne jamais faire bouger le texte. -->
    {#if hasTwoSources && remote && !badge && !t.offlineGapId && editingIndex !== i}
      <button
        type="button"
        class="transcript-speaker-split"
        class:transcript-speaker-open={speakerMenu?.index === i}
        title={TS.splitHere}
        aria-label={TS.splitHere}
        aria-haspopup="dialog"
        aria-expanded={speakerMenu?.index === i}
        on:click|stopPropagation={(e) => toggleSpeakerMenu(e, i, 'end')}
      >
        <IconUserSpeak width="13" height="13" aria-hidden="true" />
      </button>
    {/if}
  </div>
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
