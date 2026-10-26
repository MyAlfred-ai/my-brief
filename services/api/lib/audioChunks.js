/**
 * Découpe d'un audio long en tranches de 5 minutes, pour /record.
 *
 * Pourquoi découper : `gpt-transcribe`, qui a remplacé whisper-1 (retiré le
 * 2027-02-26), n'a ni plafond de durée ni plafond de sortie documentés. Sa
 * famille en a deux : gpt-4o-transcribe refusait au-delà de ~1 400-1 500 s, et
 * surtout plafonnait à 2 000 jetons de SORTIE — transcription tronquée SANS
 * erreur au bout de 8 à 11 minutes de parole (relevés publics). whisper-1
 * transcrivait 100 minutes d'un tenant ; l'import doit continuer à le faire.
 *
 * Pourquoi 5 minutes : ~1 200 jetons de français, loin des 2 000, et la taille
 * des segments hors ligne (src/platform/offlineRecording.js), qui passent donc
 * entiers.
 *
 * Pourquoi sur le serveur, avec ffmpeg : décoder dans le navigateur a été
 * mesuré le 2026-10-15 sous Chromium — +4,2 Go de RAM pour un m4a de 25 Mo et
 * 100 min, +2,9 Go pour 26 min en stéréo (décodage à 48 kHz en flottants), et
 * ~190 Mo de WAV à renvoyer. Ici, sans réencodage (`-c copy`), la découpe du
 * même fichier prend moins d'une seconde et 50 Mo au pic, dans l'image de
 * l'API limitée à 256 Mo — m4a, webm/opus et mp3 vérifiés. Le paquet alpine
 * coûte 101 Mo d'image ; un ffmpeg compilé pour l'audio seul a été écarté
 * (build CI, liste de formats à maintenir).
 *
 * Tranches ÉGALES (durée ÷ nombre) : à 300 s fixes, 100 min donnaient une 21e
 * tranche de 0,03 s, qu'OpenAI refuse comme trop courte.
 *
 * Sans ffmpeg (dev local, image ancienne) ou si la découpe échoue : le fichier
 * part ENTIER, comme avant — un import long peut alors être refusé
 * (`audio_too_long`) ou tronqué. Choix d'Alex le 2026-10-15, plutôt qu'un refus
 * de tout import long tant que l'image n'a pas ffmpeg.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Durée maximale d'une tranche. */
export const CHUNK_MAX_SECONDS = 300;

/**
 * Jusqu'ici, le fichier part entier : un segment hors ligne de 5 min tout
 * juste dépassées ne vaut pas deux appels.
 */
const WHOLE_MAX_SECONDS = CHUNK_MAX_SECONDS + 15;

/** Au-delà, ffmpeg/ffprobe sont tués : un fichier piégé ne bloque pas une place de /record. */
const PROCESS_TIMEOUT_MS = 60_000;

/**
 * Démultiplexeur (`format_name` de ffprobe) → extension des tranches. Elle
 * fixe le format qu'écrit le muxer `segment` ET celui qu'OpenAI déduit du nom
 * du fichier. Ce sont aussi les SEULS formats que ffmpeg accepte d'ouvrir.
 */
const EXTENSIONS = {
  'mov,mp4,m4a,3gp,3g2,mj2': 'm4a',
  'matroska,webm': 'webm',
  mp3: 'mp3',
  wav: 'wav',
  ogg: 'ogg',
  aac: 'aac',
  flac: 'flac',
};

/**
 * ffmpeg lit un fichier envoyé par l'utilisateur. Sans ces listes, un
 * « audio » qui serait en fait une playlist HLS ou un script `concat` lui ferait
 * ouvrir d'autres fichiers du serveur, ou des URL (lecture de fichiers, SSRF).
 */
const INPUT_GUARDS = [
  '-protocol_whitelist',
  'file',
  '-format_whitelist',
  Object.keys(EXTENSIONS).join(','),
];

/**
 * Lance un exécutable sans shell ; rejette (ENOENT) s'il est introuvable.
 * @returns {Promise<{code: number|null, stdout: string, stderr: string}>}
 */
function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout = (stdout + d).slice(-16_384);
    });
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-4_096);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), PROCESS_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * @param {Object} [opts]
 * @param {string} [opts.ffmpeg]
 * @param {string} [opts.ffprobe]
 * @param {{warn: Function, info?: Function}} [opts.log]
 * @param {typeof runProcess} [opts.run] - injectable : aucun test n'exige ffmpeg
 */
export function createAudioChunker({
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  log,
  run = runProcess,
} = {}) {
  let missingWarned = false;

  /** @returns {Promise<{seconds: number, extension: string}|null>} */
  async function probe(path) {
    const { code, stdout } = await run(ffprobe, [
      '-v',
      'error',
      ...INPUT_GUARDS,
      '-show_entries',
      'format=duration,format_name',
      '-of',
      'json',
      path,
    ]);
    if (code !== 0) return null;
    const format = JSON.parse(stdout || '{}').format || {};
    const seconds = Number.parseFloat(format.duration);
    const extension = EXTENSIONS[format.format_name];
    return Number.isFinite(seconds) && extension ? { seconds, extension } : null;
  }

  return {
    /**
     * Tranches de `path`, dans l'ordre. `cleanup` efface ce que la découpe a
     * écrit — jamais `path`, qui appartient à l'appelant.
     *
     * @param {string} path
     * @returns {Promise<{paths: string[], cleanup: () => Promise<void>}>}
     */
    async split(path) {
      const whole = { paths: [path], cleanup: async () => {} };
      let audio;
      try {
        audio = await probe(path);
      } catch (err) {
        if (err.code === 'ENOENT') {
          if (!missingWarned) log?.warn('ffmpeg absent : les imports longs partent entiers');
          missingWarned = true;
        } else {
          log?.warn({ err: err.message }, 'ffprobe : durée illisible');
        }
        return whole;
      }
      // Illisible pour ffprobe : OpenAI dira lui-même ce qui ne va pas.
      if (!audio || audio.seconds <= WHOLE_MAX_SECONDS) return whole;

      const count = Math.ceil(audio.seconds / CHUNK_MAX_SECONDS);
      const seconds = Math.ceil(audio.seconds / count);
      let dir = null;
      const cleanup = async () => {
        if (dir) await rm(dir, { recursive: true, force: true });
      };
      try {
        dir = await mkdtemp(join(tmpdir(), 'mybrief-chunks-'));
        const { code, stderr } = await run(ffmpeg, [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          ...INPUT_GUARDS,
          '-i',
          path,
          // Le seul son : une pochette d'album (flux vidéo d'un m4a) n'a
          // rien à faire chez OpenAI.
          '-map',
          '0:a:0',
          '-c',
          'copy',
          '-f',
          'segment',
          '-segment_time',
          String(seconds),
          // Sans lui, chaque tranche garde la durée du fichier entier dans ses
          // métadonnées (piège relevé sur le forum OpenAI).
          '-reset_timestamps',
          '1',
          join(dir, `part%03d.${audio.extension}`),
        ]);
        if (code !== 0) throw new Error(stderr.trim() || `ffmpeg code ${code}`);
        const paths = (await readdir(dir)).sort().map((name) => join(dir, name));
        if (!paths.length) throw new Error('aucune tranche écrite');
        log?.info?.({ parts: paths.length, seconds: audio.seconds }, 'audio découpé');
        return { paths, cleanup };
      } catch (err) {
        log?.warn({ err: err.message }, 'découpe impossible : le fichier part entier');
        await cleanup();
        return whole;
      }
    },
  };
}
