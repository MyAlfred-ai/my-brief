<svelte:options immutable />

<script>
  /**
   * Une ligne de transcription — l'état (édition, menu « Qui parle ici ? »)
   * reste dans EditableTranscript, qui la pilote par position.
   *
   * Pourquoi un composant `immutable` : en direct, chaque delta produit un
   * nouveau tableau de lignes. Rendue dans la boucle du parent, CHAQUE ligne
   * repassait ses classes, son texte et ses attributs dans le DOM à chaque
   * delta — mesuré : 15,8 ms par delta à 2 000 lignes, CPU bridé ×4. Ici, une
   * ligne dont l'objet n'a pas changé ne fait plus rien : seules la ligne en
   * cours et la nouvelle venue se mettent à jour.
   *
   * Contrat qui rend `immutable` sûr : une ligne n'est JAMAIS modifiée en
   * place — utils/transcriptLive.js, transcriptSpeakers.js et App.svelte la
   * remplacent par une copie (`{ ...it, text }`). Un futur `item.text = …`
   * resterait invisible ici.
   */
  import IconPen from '~icons/solar/pen-linear';
  import IconUserSpeak from '~icons/solar/user-speak-rounded-linear';

  /** La ligne : { time, timestamp, text, isDelta, source, speaker, refineFlash, offlineGapId } */
  export let t;
  export let index;
  /** Pastille de locuteur en tête de réplique ('' : pas de changement de locuteur). */
  export let badge = '';
  export let remote = false;
  /** Prénom qui a déclenché l'Aide IA : { before, word, after, label } | null. */
  export let mark = null;
  /** La réunion a tourné sur les deux canaux (micro + visio). */
  export let twoSources = false;
  export let editing = false;
  export let menuOpen = false;
  /** Textes $uiText.transcription.speakers. */
  export let TS = {};
  export let editHint = '';
  export let onStartEdit = () => {};
  /** (événement, texte du champ) — Entrée valide, Échap annule. */
  export let onEditKeydown = () => {};
  /** (texte du champ) — quitter le champ valide. */
  export let onEditBlur = () => {};
  export let onToggleMenu = () => {};
  /** Reçoit (position, élément) au montage : le menu s'y réancre. */
  export let onLine = () => {};

  function autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }

  // Le champ n'existe que pendant l'édition : sa naissance EST le début de
  // l'édition — texte de la ligne, focus, tout sélectionné, hauteur au
  // contenu. Le texte n'est posé qu'ici, une fois : une copie de la ligne
  // arrivée pendant la frappe (relecture, nom de voix) n'écrase pas le champ.
  function startEditing(el, text) {
    el.value = text;
    el.focus();
    el.select();
    autoGrow(el);
  }

  // Boucle non keyée chez le parent : le composant de la position i reste
  // celui de la position i, l'élément enregistré au montage aussi.
  function register(el) {
    onLine(index, el);
  }
</script>

<div
  class="transcript-item"
  class:transcript-delta={t.isDelta}
  class:transcript-remote={remote}
  use:register
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
  {#if editing}
    <textarea
      class="transcript-text transcript-edit"
      use:startEditing={t.text}
      on:keydown={(e) => onEditKeydown(e, e.currentTarget.value)}
      on:blur={(e) => onEditBlur(e.currentTarget.value)}
      on:input={(e) => autoGrow(e.currentTarget)}
      rows="1"
    ></textarea>
  {:else}
    <span
      class="transcript-text"
      class:transcript-editable={!t.isDelta}
      role={t.isDelta ? undefined : 'button'}
      tabindex={t.isDelta ? undefined : 0}
      title={t.isDelta ? undefined : editHint}
      on:dblclick={() => onStartEdit(index, t)}
      on:keydown={(e) => {
        if (!t.isDelta && e.key === 'Enter') {
          e.preventDefault();
          onStartEdit(index, t);
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
          class:transcript-speaker-open={menuOpen}
          title={TS.nameBadge}
          aria-label="{badge} — {TS.nameBadge}"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          on:click|stopPropagation={(e) => onToggleMenu(e, index)}
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
        >{:else if mark}<!-- Le prénom qui a déclenché l'Aide IA, dans sa teinte :
          on voit qu'elle a pris la phrase pour elle. -->{mark.before}<span
          class="transcript-ai-mark"
          title={mark.label}>{mark.word}</span
        >{mark.after}{:else}{t.text}{/if}</span
    >
  {/if}
  {#if t.isDelta}
    <span class="transcript-delta-indicator">...</span>
  {/if}
  <!-- Ligne de suite d'une voix distante (sans pastille) : « autre
       participant à partir d'ici ». Révélé au survol de la ligne, posé en
       absolu à droite pour ne jamais faire bouger le texte. -->
  {#if twoSources && remote && !badge && !t.offlineGapId && !editing}
    <button
      type="button"
      class="transcript-speaker-split"
      class:transcript-speaker-open={menuOpen}
      title={TS.splitHere}
      aria-label={TS.splitHere}
      aria-haspopup="dialog"
      aria-expanded={menuOpen}
      on:click|stopPropagation={(e) => onToggleMenu(e, index, 'end')}
    >
      <IconUserSpeak width="13" height="13" aria-hidden="true" />
    </button>
  {/if}
</div>
