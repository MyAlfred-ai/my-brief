/**
 * Marques des fournisseurs d'IA de l'onglet IA, par identifiant de fournisseur
 * (celui que sert l'API : `openai`, `mistral`…). Un fournisseur inconnu de
 * l'écran n'en a pas : il s'affiche par son nom seul.
 */
import OpenAiLogo from '../icons/OpenAiLogo.svelte';
import MistralLogo from '../icons/MistralLogo.svelte';
import SpeechmaticsLogo from '../icons/SpeechmaticsLogo.svelte';
import AssemblyAiLogo from '../icons/AssemblyAiLogo.svelte';

/** Marque carrée de chaque fournisseur (prop `size`). */
export const LOGOS = {
  openai: OpenAiLogo,
  mistral: MistralLogo,
  assemblyai: AssemblyAiLogo,
};

/**
 * Marques livrées en logo COMPLET (symbole et nom) et qui ne se recadrent
 * pas : affichées à la place du nom (prop `height`, cf. SpeechmaticsLogo).
 */
export const WORDMARKS = { speechmatics: SpeechmaticsLogo };
