/**
 * Corrections automatiques de la transcription — réglées dans Administration →
 * Configuration, appliquées aux réunions de tous les comptes (moteur :
 * utils/transcriptCorrections.js).
 *
 * Le direct ne passe jamais par le serveur (le navigateur parle à OpenAI) : la
 * liste doit donc descendre jusqu'ici. Elle arrive avec les templates
 * transverses (`GET /api/templates`), comme le vocabulaire de l'organisation
 * (stores/orgContext.js) et pour la même raison — un appel de plus serait un
 * moment d'échec de plus. Jamais par /api/auth/config, qui est publique.
 *
 * La liste est COMPILÉE une fois par changement, pas à chaque ligne : le
 * correcteur tourne à chaque phrase bouclée de chaque réunion.
 */
import { writable } from 'svelte/store';
import { compileCorrections, normalizeRules } from '../utils/transcriptCorrections.js';

/** Liste en vigueur : `[{ from: string[], to: string }]`. */
export const transcriptCorrections = writable([]);

let compiled = compileCorrections([]);
transcriptCorrections.subscribe((rules) => {
  compiled = compileCorrections(rules);
});

/** @param {unknown} value - `transcriptCorrections` de la réponse /api/templates */
export function setTranscriptCorrections(value) {
  transcriptCorrections.set(normalizeRules(value));
}

/**
 * Texte définitif → texte corrigé. Lu à CHAQUE appel : une liste enregistrée
 * par l'administrateur pendant sa propre réunion s'applique à la phrase
 * suivante, sans redémarrer.
 *
 * @param {string} text
 * @returns {string}
 */
export function correctTranscript(text) {
  return compiled.apply(text);
}
