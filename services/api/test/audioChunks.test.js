/**
 * Découpe des imports longs (lib/audioChunks.js).
 *
 * ffmpeg est simulé (`run` injecté) : ce qui se vérifie ici, c'est la décision
 * (entier ou en tranches), les garde-fous passés à ffmpeg et le ménage. Le
 * dernier bloc rejoue la découpe avec le vrai ffmpeg quand la machine l'a
 * (image de l'API, CI) ; il est sauté sinon.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAudioChunker, CHUNK_MAX_SECONDS } from '../lib/audioChunks.js';

let tmp;
let previousTmpdir;

beforeEach(() => {
  previousTmpdir = process.env.TMPDIR;
  tmp = mkdtempSync(join(tmpdir(), 'mybrief-chunks-test-'));
  process.env.TMPDIR = tmp;
});

afterEach(() => {
  if (previousTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previousTmpdir;
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * Faux ffprobe/ffmpeg : ffprobe répond `probe`, ffmpeg écrit `parts` tranches
 * dans le dossier demandé (ou échoue avec `ffmpegCode`).
 */
function fakeRun({ probe, parts = 0, ffmpegCode = 0 }) {
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    if (command === 'ffprobe') {
      if (probe instanceof Error) throw probe;
      return { code: probe ? 0 : 1, stdout: JSON.stringify({ format: probe || {} }), stderr: '' };
    }
    const pattern = args.at(-1);
    for (let i = parts - 1; i >= 0; i -= 1) {
      writeFileSync(pattern.replace('%03d', String(i).padStart(3, '0')), `tranche ${i}`);
    }
    return { code: ffmpegCode, stdout: '', stderr: ffmpegCode ? 'Invalid data found' : '' };
  };
  run.calls = calls;
  return run;
}

const quietLog = () => {
  const warnings = [];
  return { warnings, warn: (...args) => warnings.push(args), info: () => {} };
};

const leftovers = () => readdirSync(tmp).filter((name) => name.startsWith('mybrief-chunks-'));

describe('découpe des imports longs', () => {
  it('jusqu’à 5 min (et un souffle), le fichier part entier, sans ffmpeg', async () => {
    const run = fakeRun({ probe: { duration: '312.4', format_name: 'mp3' } });
    const { paths } = await createAudioChunker({ run }).split('/tmp/court.mp3');
    expect(paths).toEqual(['/tmp/court.mp3']);
    expect(run.calls.map((c) => c.command)).toEqual(['ffprobe']);
  });

  it('au-delà : tranches ÉGALES, sans réencodage, dans l’ordre — pas de miette en fin', async () => {
    // 100 min à 300 s fixes donnaient une 21e tranche de 0,03 s, refusée par OpenAI.
    const run = fakeRun({
      probe: { duration: '6000.03', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
      parts: 21,
    });
    const { paths, cleanup } = await createAudioChunker({ run }).split('/tmp/long.m4a');

    const args = run.calls[1].args;
    const seconds = Number(args[args.indexOf('-segment_time') + 1]);
    expect(seconds).toBe(286);
    expect(seconds).toBeLessThanOrEqual(CHUNK_MAX_SECONDS);
    expect(args).toEqual(expect.arrayContaining(['-c', 'copy', '-reset_timestamps', '1']));
    expect(args[args.indexOf('-map') + 1]).toBe('0:a:0');
    expect(paths).toHaveLength(21);
    expect(paths[0]).toMatch(/part000\.m4a$/);
    expect(paths.at(-1)).toMatch(/part020\.m4a$/);

    await cleanup();
    expect(leftovers()).toEqual([]);
  });

  it('ffprobe et ffmpeg n’ouvrent que des fichiers audio locaux — ni playlist, ni URL', async () => {
    const run = fakeRun({ probe: { duration: '900', format_name: 'matroska,webm' }, parts: 3 });
    const { cleanup } = await createAudioChunker({ run }).split('/tmp/long.webm');
    for (const { args } of run.calls) {
      expect(args[args.indexOf('-protocol_whitelist') + 1]).toBe('file');
      const formats = args[args.indexOf('-format_whitelist') + 1].split(',');
      expect(formats).toEqual(expect.arrayContaining(['mp4', 'webm', 'mp3', 'wav', 'ogg']));
      expect(formats).not.toContain('hls');
      expect(formats).not.toContain('concat');
    }
    await cleanup();
  });

  it('un format que ffprobe ne reconnaît pas part entier : OpenAI dira ce qui ne va pas', async () => {
    const run = fakeRun({ probe: null });
    const { paths } = await createAudioChunker({ run }).split('/tmp/inconnu.bin');
    expect(paths).toEqual(['/tmp/inconnu.bin']);
  });

  it('sans ffmpeg installé : le fichier part entier, et on ne le dit qu’une fois', async () => {
    const missing = Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' });
    const log = quietLog();
    const chunker = createAudioChunker({ run: fakeRun({ probe: missing }), log });
    expect((await chunker.split('/tmp/a.m4a')).paths).toEqual(['/tmp/a.m4a']);
    expect((await chunker.split('/tmp/b.m4a')).paths).toEqual(['/tmp/b.m4a']);
    expect(log.warnings).toHaveLength(1);
  });

  it('une découpe en échec : le fichier part entier, et rien ne reste sur le disque', async () => {
    const log = quietLog();
    const run = fakeRun({
      probe: { duration: '1800', format_name: 'mp3' },
      parts: 2,
      ffmpegCode: 1,
    });
    const { paths } = await createAudioChunker({ run, log }).split('/tmp/abime.mp3');
    expect(paths).toEqual(['/tmp/abime.mp3']);
    expect(leftovers()).toEqual([]);
    expect(log.warnings[0][0].err).toContain('Invalid data');
  });
});

const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasFfmpeg)('avec le vrai ffmpeg', () => {
  const duration = (path) =>
    Number(
      execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        path,
      ]).toString(),
    );

  it('11 min 40 de mp3 → trois tranches de moins de 5 min, qui couvrent tout', async () => {
    const source = join(tmp, 'reunion.mp3');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=8000:cl=mono',
      '-t',
      '700',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '8k',
      '-threads',
      '1',
      source,
    ]);
    const { paths, cleanup } = await createAudioChunker().split(source);
    const lengths = paths.map(duration);
    expect(paths).toHaveLength(3);
    for (const seconds of lengths) expect(seconds).toBeLessThanOrEqual(CHUNK_MAX_SECONDS + 1);
    expect(lengths.reduce((sum, s) => sum + s, 0)).toBeCloseTo(700, -1);
    await cleanup();
    expect(leftovers()).toEqual([]);
  }, 30_000);

  it('une playlist déguisée en audio n’est pas ouverte', async () => {
    const trap = join(tmp, 'piege.m4a');
    writeFileSync(trap, '#EXTM3U\n#EXTINF:10,\nfile:///etc/passwd\n#EXT-X-ENDLIST\n');
    expect((await createAudioChunker().split(trap)).paths).toEqual([trap]);
  });
});
