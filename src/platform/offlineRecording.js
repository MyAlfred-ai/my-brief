/**
 * Capture audio hors ligne (app native uniquement) — filet « tout terrain ».
 *
 * Un 2e MediaRecorder, indépendant de celui de l'export, découpe le mix en
 * SEGMENTS autonomes écrits immédiatement sur le Filesystem natif :
 *  - rotation forcée quand la transcription live tombe/revient : les segments
 *    d'une même coupure forment un « gap » à transcrire en différé ;
 *  - rotation périodique (SEGMENT_MAX_MS) pour rester sous les plafonds
 *    d'upload (Whisper 25 Mo côté OpenAI, 25 Mo côté API) et borner la perte RAM en
 *    cas de crash au segment courant.
 *
 * Les segments couverts par le live ne servent que de filet crash : supprimés
 * à la fin propre de la session. Les segments d'un gap partent vers
 * /api/record (Whisper batch, endpoint de l'import manuel) via une
 * file avec retry — déclenchée au retour réseau, à la reconnexion du live, à
 * l'arrêt, et par un tick périodique. Le texte remonte à App.svelte par gap
 * COMPLET (onGapTranscribed) pour remplacer le marqueur ⟨hors ligne⟩.
 *
 * L'auth des uploads est portée par l'intercepteur fetch global (Bearer natif,
 * cf. httpErrorHandler.js) : aucun header à gérer ici. Web : no-op intégral
 * (isOfflineCaptureSupported() = false).
 */

import { isNative, nativePlugin } from './index.js';
import { baseUrl } from '../config/constants.js';
import { extractTranscriptionText } from '../utils/audioProcessing.js';

const ROOT_DIR = 'offline-rec';
const DIRECTORY = 'DATA';
export const SEGMENT_MAX_MS = 5 * 60 * 1000;
const FLUSH_RETRY_MS = 60 * 1000;
const ORPHAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Opus 32 kbps ≈ 14 Mo/h : un segment de 5 min ≈ 1,2 Mo, très loin des plafonds.
const SEGMENT_AUDIO_BITS_PER_SECOND = 32000;

const SEGMENT_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

/**
 * Comptabilité pure des segments et des gaps (exportée pour les tests).
 * Un segment appartient au gap courant s'il a été enregistré pendant que la
 * transcription live était tombée ; un gap est « complet » quand tous ses
 * segments enregistrés sont transcrits.
 */
export class SegmentLedger {
  constructor() {
    this.segments = [];
    this.currentGapId = null;
    this.gapSeq = 0;
  }

  /** @returns {{ gapOpened: string|null }} */
  setLive(connected) {
    if (connected) {
      this.currentGapId = null;
      return { gapOpened: null };
    }
    if (this.currentGapId) return { gapOpened: null };
    this.currentGapId = `gap-${++this.gapSeq}`;
    return { gapOpened: this.currentGapId };
  }

  openSegment(index, elapsedStartS) {
    this.segments.push({
      index,
      gapId: this.currentGapId,
      elapsedStartS,
      elapsedEndS: null,
      file: null,
      status: 'recording', // 'recording' | 'recorded' | 'uploaded'
      text: null,
    });
  }

  closeSegment(index, elapsedEndS, file) {
    const seg = this.segments.find((s) => s.index === index);
    if (!seg) return;
    seg.elapsedEndS = elapsedEndS;
    if (file) {
      seg.file = file;
      seg.status = 'recorded';
    } else {
      // Aucune donnée produite (segment de quelques ms lors d'une double
      // rotation) : on le sort de la comptabilité des uploads.
      seg.status = 'uploaded';
      seg.text = '';
    }
  }

  markUploaded(index, text) {
    const seg = this.segments.find((s) => s.index === index);
    if (!seg) return;
    seg.status = 'uploaded';
    seg.text = text || '';
  }

  /** Segments d'un gap, en ordre chronologique. */
  gapSegments(gapId) {
    return this.segments.filter((s) => s.gapId === gapId);
  }

  /** Segments à uploader : dans un gap, enregistrés, pas encore transcrits. */
  pendingUploads() {
    return this.segments.filter((s) => s.gapId && s.status === 'recorded');
  }

  /**
   * Un gap est complet quand il est FERMÉ (la coupure est finie — sinon des
   * segments vont encore s'y ajouter) et que tous ses segments sont transcrits.
   */
  gapCompleted(gapId) {
    if (this.currentGapId === gapId) return false;
    const segs = this.gapSegments(gapId);
    return segs.length > 0 && segs.every((s) => s.status === 'uploaded');
  }

  gapText(gapId) {
    return this.gapSegments(gapId)
      .map((s) => (s.text || '').trim())
      .filter(Boolean)
      .join(' ');
  }

  toManifest() {
    return {
      currentGapId: this.currentGapId,
      segments: this.segments.map(({ index, gapId, elapsedStartS, elapsedEndS, file, status }) => ({
        index,
        gapId,
        elapsedStartS,
        elapsedEndS,
        file,
        status,
      })),
    };
  }
}

// ── Session active + sessions en cours de drain (arrêtées, uploads restants) ──
let session = null;
const drainingSessions = new Set();
let flushTimer = null;

export function isOfflineCaptureSupported() {
  if (!isNative || typeof MediaRecorder === 'undefined') return false;
  try {
    nativePlugin('Filesystem');
    return true;
  } catch (_) {
    return false;
  }
}

function pickSegmentMime() {
  for (const type of SEGMENT_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function fileExtension(mimeType) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const s = String(reader.result || '');
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function writeManifest(s) {
  try {
    await nativePlugin('Filesystem').writeFile({
      path: `${s.dir}/manifest.json`,
      data: btoa(
        unescape(
          encodeURIComponent(
            JSON.stringify({
              sessionId: s.id,
              mimeType: s.mimeType,
              ...s.ledger.toManifest(),
            }),
          ),
        ),
      ),
      directory: DIRECTORY,
      recursive: true,
    });
  } catch (e) {
    console.warn('offline-rec: manifest non écrit:', (e && e.message) || e);
  }
}

// ── Segments ────────────────────────────────────────────────────────────────

function startSegment(s) {
  const index = s.segIndex++;
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(
      s.stream,
      s.mimeType
        ? { mimeType: s.mimeType, audioBitsPerSecond: SEGMENT_AUDIO_BITS_PER_SECOND }
        : { audioBitsPerSecond: SEGMENT_AUDIO_BITS_PER_SECOND },
    );
  } catch (e) {
    console.warn('offline-rec: MediaRecorder segment indisponible:', (e && e.message) || e);
    return;
  }

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('stop', () => {
    finalizeSegment(s, index, chunks, recorder.mimeType || s.mimeType);
  });

  s.ledger.openSegment(index, s.getElapsedS());
  s.recorder = recorder;
  recorder.start(2000);

  clearTimeout(s.rotateTimer);
  s.rotateTimer = setTimeout(() => rotateSegment(s, 'max-duration'), SEGMENT_MAX_MS);
}

function rotateSegment(s, reason) {
  clearTimeout(s.rotateTimer);
  s.rotateTimer = null;
  const recorder = s.recorder;
  s.recorder = null;
  if (recorder && recorder.state !== 'inactive') {
    try {
      recorder.stop(); // → 'stop' → finalizeSegment (async)
    } catch (e) {
      console.warn('offline-rec: stop segment:', (e && e.message) || e);
    }
  }
  if (!s.ended) startSegment(s);
  console.log(`📦 offline-rec: rotation segment (${reason})`);
}

async function finalizeSegment(s, index, chunks, mimeType) {
  const elapsedEndS = s.getElapsedS();
  if (!chunks.length) {
    s.ledger.closeSegment(index, elapsedEndS, null);
    afterSegmentSettled(s, index);
    return;
  }
  const file = `seg-${String(index).padStart(3, '0')}.${fileExtension(mimeType || '')}`;
  try {
    const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
    const base64 = await blobToBase64(blob);
    await nativePlugin('Filesystem').writeFile({
      path: `${s.dir}/${file}`,
      data: base64,
      directory: DIRECTORY,
      recursive: true,
    });
    s.ledger.closeSegment(index, elapsedEndS, file);
  } catch (e) {
    // Écriture impossible (disque plein ?) : le segment est perdu pour le
    // différé, l'enregistrement principal continue — ne jamais propager.
    console.warn('offline-rec: écriture segment échouée:', (e && e.message) || e);
    s.ledger.closeSegment(index, elapsedEndS, null);
  }
  afterSegmentSettled(s, index);
}

function afterSegmentSettled(s, index) {
  writeManifest(s);
  // Segment sans données (double rotation) réglé sans upload : son gap peut
  // être devenu complet — sans ce check, un arrêt en pleine coupure avec un
  // dernier segment vide laisserait le marqueur non résolu à jamais.
  const seg = s.ledger.segments.find((it) => it.index === index);
  if (seg && seg.gapId && s.ledger.gapCompleted(seg.gapId)) {
    s.onGapTranscribed(seg.gapId, s.ledger.gapText(seg.gapId));
  }
  if (s.ledger.pendingUploads().length > 0) {
    ensureFlushTimer();
    flushSession(s);
  } else {
    maybeCleanupEnded(s);
  }
}

// ── API session (appelée par App.svelte) ────────────────────────────────────

/**
 * Démarre la capture segmentée sur le stream mixé. `live` = état initial de la
 * transcription temps réel ; false = démarrage hors ligne, un gap s'ouvre dès
 * le premier segment et son id est retourné dans `gapOpened` (→ marqueur).
 * @returns {{ started: boolean, gapOpened: string|null }}
 */
export function startOfflineCapture(stream, { live, getElapsedS, onGapTranscribed }) {
  if (!isOfflineCaptureSupported() || session) return { started: false, gapOpened: null };
  const s = {
    id: `rec-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    dir: '',
    stream,
    mimeType: pickSegmentMime(),
    ledger: new SegmentLedger(),
    segIndex: 0,
    recorder: null,
    rotateTimer: null,
    ended: false,
    flushing: false,
    live: live !== false,
    getElapsedS: typeof getElapsedS === 'function' ? getElapsedS : () => 0,
    onGapTranscribed: typeof onGapTranscribed === 'function' ? onGapTranscribed : () => {},
  };
  s.dir = `${ROOT_DIR}/${s.id}`;
  const { gapOpened } = s.ledger.setLive(s.live);
  session = s;
  startSegment(s);
  console.log(`🛟 offline-rec: capture segmentée démarrée (${s.id}, live=${live !== false})`);
  return { started: true, gapOpened };
}

/**
 * À appeler à chaque transition de la transcription live (WS micro).
 * @returns {string|null} id du gap OUVERT par cette perte (→ insérer le
 *   marqueur), null sinon (reconnexion, doublon, session absente).
 */
export function notifyOfflineLiveState(connected) {
  const s = session;
  if (!s || s.ended || s.live === connected) return null;
  s.live = connected;
  const { gapOpened } = s.ledger.setLive(connected);
  // Rotation aux transitions : la partie couverte par le live et la partie à
  // transcrire en différé atterrissent dans des fichiers distincts.
  rotateSegment(s, connected ? 'live-restored' : 'live-lost');
  if (connected) flushOfflineQueue();
  return gapOpened;
}

/**
 * Fin d'enregistrement (choke point stopRecording). Le dernier segment se
 * finalise en asynchrone ; les uploads restants continuent tant que l'app vit.
 * @returns {{ pendingGaps: number }}
 */
export function endOfflineCapture() {
  const s = session;
  if (!s) return { pendingGaps: 0 };
  session = null;
  s.ended = true;
  clearTimeout(s.rotateTimer);
  s.rotateTimer = null;
  const recorder = s.recorder;
  s.recorder = null;
  if (recorder && recorder.state !== 'inactive') {
    try {
      recorder.stop();
    } catch (e) {
      /* dernier segment perdu, tant pis */
    }
  }
  drainingSessions.add(s);
  const openGapId = s.ledger.currentGapId;
  // Fermer le gap courant : la coupure se termine avec l'enregistrement, et un
  // gap resté « courant » ne serait jamais considéré complet (marqueur bloqué).
  s.ledger.currentGapId = null;
  const pendingGapIds = new Set(
    s.ledger.segments
      .filter((seg) => seg.gapId && seg.status !== 'uploaded')
      .map((seg) => seg.gapId),
  );
  // Le dernier segment (finalisation asynchrone en cours) appartient au gap
  // ouvert même si closeSegment n'a pas encore tourné.
  if (openGapId) pendingGapIds.add(openGapId);
  if (pendingGapIds.size > 0) ensureFlushTimer();
  else maybeCleanupEnded(s);
  return { pendingGaps: pendingGapIds.size };
}

/** Force une passe d'upload (retour réseau, reconnexion live, arrêt). */
export function flushOfflineQueue() {
  if (session) flushSession(session);
  for (const s of drainingSessions) flushSession(s);
}

// ── File d'upload ───────────────────────────────────────────────────────────

function ensureFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    const pending =
      (session ? session.ledger.pendingUploads().length : 0) +
      [...drainingSessions].reduce((n, s) => n + s.ledger.pendingUploads().length, 0);
    if (pending === 0 && !session) {
      clearInterval(flushTimer);
      flushTimer = null;
      return;
    }
    flushOfflineQueue();
  }, FLUSH_RETRY_MS);
}

async function flushSession(s) {
  if (s.flushing) return;
  const pending = s.ledger.pendingUploads();
  if (!pending.length) {
    maybeCleanupEnded(s);
    return;
  }
  s.flushing = true;
  try {
    const fs = nativePlugin('Filesystem');
    for (const seg of pending) {
      const { data } = await fs.readFile({ path: `${s.dir}/${seg.file}`, directory: DIRECTORY });
      const blob = base64ToBlob(data, s.mimeType || 'audio/webm');
      const formData = new FormData();
      formData.append('data', blob, `${s.id}-${seg.file}`);
      // `source=offline` : un segment appartient à une réunion déjà commencée,
      // dont le quota de minutes a été vérifié au démarrage — le serveur ne le
      // refuse jamais pour ça (cf. services/api/routes/ai.js). Sans ce marqueur,
      // un quota atteint entre-temps ferait perdre ce qui a été dit.
      const response = await fetch(`${baseUrl}/record?source=offline`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error(`record: HTTP ${response.status}`);
      const text = extractTranscriptionText(
        await response.text(),
        response.headers.get('content-type') || '',
      );
      s.ledger.markUploaded(seg.index, (text || '').trim());
      try {
        await fs.deleteFile({ path: `${s.dir}/${seg.file}`, directory: DIRECTORY });
      } catch (_) {}
      console.log(`📤 offline-rec: segment ${seg.index} transcrit (${seg.gapId})`);
      if (s.ledger.gapCompleted(seg.gapId)) {
        s.onGapTranscribed(seg.gapId, s.ledger.gapText(seg.gapId));
      }
    }
    await writeManifest(s);
    maybeCleanupEnded(s);
  } catch (e) {
    // Hors ligne ou serveur indisponible : silencieux, le tick périodique et
    // les déclencheurs (online, reconnexion, arrêt) réessaieront.
    console.warn('offline-rec: upload différé, nouvel essai plus tard:', (e && e.message) || e);
  } finally {
    s.flushing = false;
  }
}

async function maybeCleanupEnded(s) {
  if (!s.ended || s.ledger.pendingUploads().length > 0) return;
  if (s.ledger.segments.some((seg) => seg.status === 'recording')) return;
  drainingSessions.delete(s);
  try {
    await nativePlugin('Filesystem').rmdir({ path: s.dir, directory: DIRECTORY, recursive: true });
    console.log(`🧹 offline-rec: session ${s.id} nettoyée`);
  } catch (_) {
    /* déjà absente */
  }
}

/**
 * Purge au démarrage des sessions orphelines (app tuée en plein
 * enregistrement) : l'audio reste récupérable à la main pendant 7 jours
 * (adb / explorateur de fichiers), puis est supprimé pour ne pas remplir le
 * stockage.
 */
export async function purgeOfflineOrphans() {
  if (!isOfflineCaptureSupported()) return;
  try {
    const fs = nativePlugin('Filesystem');
    const { files } = await fs.readdir({ path: ROOT_DIR, directory: DIRECTORY });
    const now = Date.now();
    for (const entry of files || []) {
      const name = typeof entry === 'string' ? entry : entry.name;
      const match = /^rec-(\d+)-/.exec(name || '');
      const age = match ? now - Number(match[1]) : Infinity;
      if (age > ORPHAN_MAX_AGE_MS) {
        try {
          await fs.rmdir({ path: `${ROOT_DIR}/${name}`, directory: DIRECTORY, recursive: true });
          console.log(`🧹 offline-rec: orphelin ${name} purgé`);
        } catch (_) {
          /* ignore */
        }
      }
    }
  } catch (_) {
    // ROOT_DIR absent au premier lancement : rien à purger.
  }
}
