/**
 * Bip de l'invite « Poursuivre / Arrêter » (cf. CONTINUE_PROMPT_* dans
 * config/constants.js). Réutilise le contexte audio de l'enregistrement quand il
 * existe ; sinon en ouvre un, le temps du bip. Extrait d'App.svelte, plafonné.
 * @param {AudioContext|null} audioContext - contexte de l'enregistrement en cours
 */
export function playContinuePromptSound(audioContext) {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const context = audioContext || new AudioContextClass();
    const shouldCloseContext = context !== audioContext;
    if (context.state === 'suspended' && context.resume) {
      context.resume().catch(() => {});
    }
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    // Bip DISCRET (gain 0.08, 0.5 s) : audible sans être intrusif si des
    // haut-parleurs sont ouverts en réunion.
    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.5);
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.5);
    oscillator.onended = () => {
      if (shouldCloseContext && context.close) {
        context.close();
      }
    };
  } catch (error) {
    console.warn("Impossible de jouer l'avertissement sonore:", error);
  }
}
