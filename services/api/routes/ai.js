/**
 * Routes IA : /tempkey (Realtime), /record (fichier), /actions (extraction),
 * /refine-transcript (relecture). La clé OpenAI ne quitte jamais le serveur —
 * ces routes existent précisément pour la tenir hors du client (rôle
 * historique des workflows n8n).
 *
 * Toutes exigent une identité résolue (`requireUser`). Le routeur Traefik de
 * la session native n'authentifie pas : il laisse passer toute requête qui
 * porte un cookie `mybrief_sess`, valide ou non, et c'est l'API qui juge. Sans
 * ce contrôle, un cookie inventé suffisait à dépenser la clé OpenAI de
 * l'installation, hors quota (refuseIfQuotaExhausted ne voit pas d'anonyme).
 */
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { isAudioTooLong, replyUpstreamError } from '../lib/openai.js';
import { runActionDetection } from '../lib/actionDetection.js';
import { refineTranscriptPrompt, parseRefineOutput } from '../lib/prompts.js';
import { fail } from '../lib/errors.js';
import { normalizeLang } from '../lib/text.js';
import { requireUser } from '../lib/rbac.js';

/**
 * Tranches d'un même import transcrites en même temps. Borné : chacune est un
 * appel OpenAI, et 100 min d'import en font 21 — trois à la fois divisent
 * l'attente sans rafale sur la clé de l'installation.
 */
const RECORD_CHUNK_CONCURRENCY = 3;

/**
 * `fn` sur chaque élément, `limit` à la fois, résultats dans l'ordre. Au
 * premier échec, plus rien ne part, et l'erreur n'est levée qu'une fois les
 * appels en vol revenus : les tranches qu'ils lisent sont effacées juste après.
 */
async function mapWithLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failure = null;
  async function worker() {
    while (!failure && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index]);
      } catch (err) {
        failure ??= err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure;
  return results;
}

export default function aiRoutes(app) {
  /**
   * Porte du quota de minutes (lib/quota.js) : refuse quand le compte n'a plus
   * de minutes ce mois-ci. 409 et non 429 : le client inspecte le corps des
   * réponses de /tempkey pour y reconnaître un « crédit IA épuisé » relayé
   * d'OpenAI (429), et le quota de l'organisation n'est pas une panne du
   * service. Le corps porte l'état pour que l'écran l'affiche sans relecture.
   * @returns {Promise<boolean>} vrai si le refus est parti
   */
  async function refuseIfQuotaExhausted(req, reply) {
    const quota = await app.quota.statusFor(req.user);
    if (!quota.exhausted) return false;
    fail(reply, 409, 'quota_exhausted', { quota });
    return true;
  }

  /**
   * Jeton éphémère OpenAI Realtime pour la transcription live : le navigateur
   * ouvre ensuite un WebSocket/WebRTC DIRECT vers OpenAI avec ce jeton —
   * l'audio ne transite pas par ce service.
   * Fix vs n8n : la langue vient de ?lang= (le frontend l'envoyait déjà,
   * n8n codait "fr" en dur).
   *
   * C'est ici que le quota s'applique au démarrage d'une réunion. Les
   * rotations de jeton EN COURS de réunion passent aussi par là, sans risque :
   * une réunion ne compte qu'à son arrêt, l'état ne change donc pas pendant
   * qu'elle tourne.
   */
  app.get('/tempkey', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    if (await refuseIfQuotaExhausted(req, reply)) return;
    const lang = normalizeLang(req.query?.lang);
    // Le modèle est choisi dans Administration → IA. Il est renvoyé au client :
    // le navigateur envoie un `session.update` sur son WebSocket et DOIT y
    // mettre le même modèle, sinon la session repartirait sur le modèle par
    // défaut d'OpenAI et le réglage n'aurait aucun effet visible.
    const model = await app.settings.resolveTranscriptionModel(
      app.config.openai?.models?.transcription || '',
    );
    try {
      const data = await app.openai.realtimeClientSecret(lang, model);
      // Deux parseurs coexistent côté client : App.svelte lit `.value`,
      // utils/peerConnection.js lit `.client_secret.value`. On garantit les
      // deux formes quel que soit le format renvoyé par OpenAI.
      if (data && typeof data === 'object') {
        if (data.value === undefined && data.client_secret?.value !== undefined) {
          data.value = data.client_secret.value;
        } else if (data.client_secret === undefined && data.value !== undefined) {
          data.client_secret = { value: data.value };
        }
        data.transcriptionModel = model;
      }
      return data;
    } catch (err) {
      req.log.warn({ err: err.message }, '/tempkey : échec amont OpenAI');
      return replyUpstreamError(reply, err);
    }
  });

  /** Transcriptions de fichier en cours dans CE process — cf. /record. */
  let recordsInFlight = 0;

  /**
   * Transcription batch d'un fichier audio (import manuel, ou segments capturés
   * hors ligne par l'app mobile). Multipart, champ `data`.
   *
   * Le quota s'applique à l'IMPORT, pas aux segments hors ligne
   * (`?source=offline`) : ils appartiennent à une réunion déjà commencée, dont
   * le quota a été vérifié au démarrage, et les refuser perdrait ce qui a été
   * dit. Vérifié AVANT de lire le fichier : un refus n'a pas à attendre
   * plusieurs Mo d'audio.
   *
   * Le fichier passe par le DISQUE, jamais en entier en mémoire. Avant,
   * `part.toBuffer()` puis le Blob du FormData en faisaient deux copies, et
   * fetch en retenait une troisième jusqu'à la réponse (cf. lib/openai.js) :
   * ~70 Mo de RAM pour un segment de 16 Mo, mesuré le 2026-10-13. Trois imports simultanés tuaient l'API limitée à 256 Mo
   * (limite d'une installation en production), et son redémarrage emportait les requêtes en vol des autres
   * utilisateurs, /resume compris. Le flux multipart est maintenant écrit dans
   * os.tmpdir(), puis confié à OpenAI sous forme de Blob adossé au fichier
   * (lib/openai.js `transcribe({path})`), lu par morceaux à l'envoi. Même banc
   * (Node 20, 256 Mo, borne levée) : 8 segments de 16 Mo simultanés passent
   * sous 101 Mo de RSS, 16 sans OOM — contre 236 Mo pour 2 avant.
   *
   * Écartés :
   *   - relayer le flux multipart tel quel jusqu'à OpenAI : withRetry rejoue
   *     l'appel sur 429/5xx, et un flux consommé ne se rejoue pas — la relance
   *     partirait sans audio. Le fichier, lui, se relit à chaque tentative ;
   *   - un buffer unique conservé pour les relances : une copie au lieu de
   *     deux, mais la RAM croît encore avec la taille et le nombre d'imports.
   * Coût : jusqu'à FILE_LIMIT (25 Mo) d'écriture disque par import, supprimés
   * en fin de requête, succès ou échec. Seul un process tué en pleine requête
   * laisse son fichier, dans le /tmp du conteneur, effacé à sa recréation.
   *
   * Au-delà de `recordMaxInFlight` transcriptions simultanées : 503
   * `record_busy` immédiat, avant de lire le moindre octet. Garde-fou de la
   * RAM et du disque face à une rafale (reconnexion de plusieurs téléphones),
   * qui ne doit pas faire tomber l'API pour tout le monde. Sans perte : les
   * segments hors ligne retentent seuls (src/platform/offlineRecording.js) ;
   * l'import manuel affiche l'erreur et se relance à la main.
   *
   * Au-delà de 5 min, l'audio est coupé en tranches égales (lib/audioChunks.js)
   * transcrites séparément puis remises bout à bout : gpt-transcribe a hérité
   * de sa famille un plafond de durée et une sortie tronquée en silence vers
   * 8-11 min, que whisper-1 n'avait pas. Les segments hors ligne (5 min)
   * partent entiers. Une tranche en échec fait échouer l'import ENTIER : un
   * texte à trous passerait pour complet. La place de /record est tenue
   * jusqu'à la dernière tranche.
   *
   * Un audio refusé pour sa DURÉE (cf. isAudioTooLong) répond 413
   * `audio_too_long`, comme un fichier trop lourd : relayé tel quel, ce serait
   * un 502 qui cite OpenAI en anglais, sans dire qu'il suffit de couper le
   * fichier. N'arrive plus qu'à un fichier parti entier : sans ffmpeg, ou
   * illisible pour lui.
   */
  app.post('/record', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    if (req.query?.source !== 'offline' && (await refuseIfQuotaExhausted(req, reply))) return;
    if (recordsInFlight >= app.config.recordMaxInFlight) {
      req.log.warn({ inFlight: recordsInFlight }, '/record : limite de concurrence atteinte');
      return fail(reply, 503, 'record_busy');
    }
    recordsInFlight += 1;
    // Lu à chaque requête, et non au chargement du module : les tests
    // pointent TMPDIR sur un dossier à eux pour vérifier le nettoyage.
    const tmpPath = join(tmpdir(), `mybrief-record-${randomUUID()}`);
    try {
      const part = await req.file();
      if (!part) return fail(reply, 400, 'missing_file');
      await pipeline(part.file, createWriteStream(tmpPath, { flags: 'wx' }));
      // Au-delà de FILE_LIMIT, busboy tronque le flux sans le faire échouer :
      // un fichier tronqué n'est pas transcrit.
      if (part.file.truncated) return fail(reply, 413, 'file_too_large');
      const chunks = await app.audioChunker.split(tmpPath);
      try {
        const results = await mapWithLimit(chunks.paths, RECORD_CHUNK_CONCURRENCY, (path) =>
          app.openai.transcribe({
            path,
            // Une tranche porte son extension (part000.m4a) : OpenAI en déduit
            // le format, comme du nom du fichier envoyé.
            filename: path === tmpPath ? part.filename || 'audio.webm' : basename(path),
            mimetype: part.mimetype || 'application/octet-stream',
          }),
        );
        // Une tranche s'arrête où le temps le dit, pas en fin de phrase :
        // l'espace recolle les deux moitiés d'une phrase coupée.
        const text = results
          .map((result) => result.text.trim())
          .filter(Boolean)
          .join(' ');
        return { text };
      } catch (err) {
        req.log.warn({ err: err.message }, '/record : échec amont OpenAI');
        if (isAudioTooLong(err)) return fail(reply, 413, 'audio_too_long');
        return replyUpstreamError(reply, err);
      } finally {
        await chunks
          .cleanup()
          .catch((err) => req.log.warn({ err: err.message }, '/record : tranches non supprimées'));
      }
    } finally {
      recordsInFlight -= 1;
      await rm(tmpPath, { force: true }).catch((err) =>
        req.log.warn({ err: err.message }, '/record : fichier temporaire non supprimé'),
      );
    }
  });

  /**
   * Extraction d'actions au fil de la transcription. Appelée en continu
   * pendant la réunion : le modèle reçoit les actions déjà détectées AVEC leur
   * id, et renvoie les nouvelles ainsi que celles qu'il affine (l'id désigne
   * alors la mise à jour). `dismissed` porte celles que l'utilisateur a
   * supprimées, à ne plus proposer.
   */
  app.post('/actions', async (req, reply) => {
    const user = requireUser(req, reply);
    if (!user) return;
    const body = req.body || {};
    try {
      // Réglages de CE compte : la détection n'a plus de réglage
      // d'installation, chacun décide de ce qu'elle cherche et à quel rythme.
      // Relus à chaque appel, sans cache : même parti pris que la clé OpenAI et
      // le modèle de transcription. Un réglage changé s'applique à la réunion
      // en cours, sans redémarrage.
      const settings = await app.userActions.getDetection(user.email);
      // Détection coupée par l'utilisateur : ne pas dépenser un appel modèle.
      // Le client cesse d'appeler de son côté ; ceci ferme la porte pour un
      // onglet resté ouvert.
      if (!settings.enabled) return { actions: [] };

      const { actions } = await runActionDetection({
        openai: app.openai,
        model: app.config.openai.models.actions,
        content: body.content,
        actions: body.actions,
        dismissed: body.dismissed,
        // Langue de l'interface, celle du compte rendu : sans elle, la
        // consigne en français faisait écrire les actions en français.
        language: body.language,
        // Le vocabulaire de l'organisation (Administration → Templates) sert
        // aussi ici : un modèle qui ignore que « ADV » désigne
        // l'administration des ventes écorche le sigle dans l'action comme
        // dans le compte rendu. Il est SERVEUR, il ne vient jamais du corps.
        settings: { ...settings, businessContext: await app.settings.orgContextText() },
      });
      return { actions };
    } catch (err) {
      req.log.warn({ err: err.message }, '/actions : échec amont OpenAI');
      return replyUpstreamError(reply, err);
    }
  });

  /**
   * Relecture des dernières phrases transcrites à la lumière des notes de
   * réunion : le client envoie les 2 dernières phrases finalisées + les notes,
   * et réapplique les graphies corrigées dans la transcription affichée
   * (src/utils/transcriptRefine.js). Bornes serrées : la charge utile est par
   * nature minuscule, tout dépassement est un mésusage, pas un cas limite.
   * Sortie du modèle illisible ou mal alignée -> phrases d'origine, inchangées.
   */
  app.post('/refine-transcript', async (req, reply) => {
    if (!requireUser(req, reply)) return;
    const body = req.body || {};
    const notes = String(body.notes || '')
      .trim()
      .slice(0, 4000);
    const sentences = (Array.isArray(body.sentences) ? body.sentences : [])
      .filter((s) => typeof s === 'string' && s.trim())
      .slice(0, 4)
      .map((s) => s.trim().slice(0, 1200));
    if (!notes || !sentences.length) return { sentences };
    try {
      const raw = await app.openai.chat({
        model: app.config.openai.models.refine,
        // Appelé en continu pendant la réunion : la latence prime, et
        // gpt-6-luna raisonne en « medium » si on ne lui dit rien.
        reasoningEffort: 'none',
        messages: [{ role: 'user', content: refineTranscriptPrompt({ sentences, notes }) }],
      });
      return { sentences: parseRefineOutput(raw, sentences.length) || sentences };
    } catch (err) {
      req.log.warn({ err: err.message }, '/refine-transcript : échec amont OpenAI');
      return replyUpstreamError(reply, err);
    }
  });
}
