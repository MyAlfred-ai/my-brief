<script>
  /**
   * Le pont entre l'Aide IA et la réunion — sans rien à l'écran. Quand on
   * demande à l'IA de mettre en pause, de reprendre, de terminer ou de rédiger
   * le compte rendu, le store ne fait que poser le geste dans une file
   * (`aiHelpCommands`, stores/aiHelp.js) : l'enregistrement et le compte rendu
   * vivent dans App.svelte, plafonné, qui n'a pas à connaître l'Aide IA. Ce
   * composant reçoit d'App les MÊMES fonctions que les boutons de la barre de
   * réunion, et fait le geste comme si on avait cliqué.
   *
   * Monté par MobileMeetingOverlays, présent tant qu'une réunion est ouverte, à
   * l'ordinateur comme au téléphone — c'est déjà par lui que l'IA écrit une note.
   *
   * Ce qu'il tient, et que ni le modèle ni le serveur ne peuvent garantir :
   *  - rien ne se fait hors d'une réunion en cours (`live`) : un geste arrivé
   *    après l'arrêt est jeté ;
   *  - « pause » ne se rejoue pas sur une réunion en pause, « reprends » sur une
   *    réunion qui tourne : resumeRecording repartirait d'un chronomètre remis à
   *    zéro. L'état lu est celui d'App À L'INSTANT du geste, pas celui que le
   *    serveur a vu au moment de la question ;
   *  - « termine » range la réunion sans compte rendu — le geste d'« Enregistrer
   *    sans résumé », où rien n'est perdu. Supprimer n'existe pas ici.
   *
   * Il dit aussi au store quels templates l'écran propose, par leur nom dans la
   * langue affichée : c'est ce nom que l'IA lit, et qu'elle rend.
   */
  import { currentLanguageStore } from '../../store.js';
  import { aiHelpCommands, takeAiHelpCommands, setAiHelpTemplates } from '../../stores/aiHelp.js';

  /** Enregistrement ou pause : une réunion est en cours. */
  export let live = false;
  export let isPaused = false;
  export let onPause = () => {};
  export let onResume = () => {};
  /** « Enregistrer sans résumé » : arrêter, nommer, ranger. */
  export let onSave = () => {};
  /** Arrêter et rédiger : `onSummarize({ template })`, ou sans argument pour le template courant. */
  export let onSummarize = () => {};
  /** Les templates proposés (config/templates.js, `buildTemplateOptions`). */
  export let templateOptions = [];
  /** Le template courant d'App — lié : « à la fin, le compte rendu avec… » le change. */
  export let currentTemplate = '';

  $: setAiHelpTemplates(
    (templateOptions || []).map((option) => ({
      id: option.value,
      label: option.labels?.[$currentLanguageStore] || option.labels?.fr || option.value,
    })),
  );

  // Seule la file déclenche : `live` et `isPaused` sont lus tels qu'ils sont au
  // moment du geste, pas suivis.
  $: if ($aiHelpCommands.length) run();

  function run() {
    for (const command of takeAiHelpCommands()) {
      if (!live) continue;
      if (command.type === 'meeting') {
        if (command.do === 'pause' && !isPaused) onPause();
        else if (command.do === 'resume' && isPaused) onResume();
        else if (command.do === 'end') onSave();
      } else if (command.type === 'template') {
        if (command.template) currentTemplate = command.template;
      } else if (command.type === 'summary') {
        if (command.template) onSummarize({ template: command.template });
        else onSummarize();
      }
    }
  }
</script>
