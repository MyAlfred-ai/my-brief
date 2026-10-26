/**
 * Plusieurs résumés sur une même réunion : chaque génération S'AJOUTE aux
 * précédentes, qui survivent à la réouverture.
 *
 * Le test rejoue, contre l'API et le faux Mongo, la séquence d'appels exacte
 * de generateSummary (App.svelte) : /resume, puis /versions/add quand la
 * réunion est déjà connue de l'écran. Il rouvre ensuite la réunion comme
 * selectHistoryItem : /history, puis unpackHistoryItem (src/utils).
 *
 * Pourquoi un scénario plutôt que des tests de route : la garantie est
 * répartie entre deux routes et l'écran. /resume ne touche pas aux versions
 * d'une réunion existante, /versions/add empile — chaque route, prise seule,
 * était correcte, et le compte rendu d'une réunion n8n disparaissait pourtant
 * au premier « Nouveau résumé » (cf. lib/legacyVersion.js).
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, identityHeaders } from './helpers.js';
import { bootstrap } from '../lib/bootstrap.js';
import { TITLE_RULES } from '../lib/prompts.js';
import { LEGACY_VERSION_ID } from '../lib/legacyVersion.js';
import { unpackHistoryItem } from '../../../src/utils/historySelection.js';
import { LEGACY_VERSION_ID as SCREEN_LEGACY_VERSION_ID } from '../../../src/utils/summary.js';

const EMAIL = 'alex@myalfred.ai';
const TRANSCRIPTION = 'On a parlé du budget et du planning.';
const isTitleCall = (params) => params?.messages?.[0]?.content === TITLE_RULES;

/** Le modèle rend le prompt système qu'il reçoit : chaque génération est reconnaissable. */
function makeApp(seed) {
  return buildTestApp({
    seed,
    openai: {
      chat: (params) =>
        isTitleCall(params) ? 'Titre généré' : `<p>CR ${params.messages[0].content}</p>`,
    },
  });
}

function postJson(app, url, body) {
  return app.inject({
    method: 'POST',
    url,
    headers: { ...identityHeaders(EMAIL, 'Alex'), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Réunion rangée : ouverte au démarrage, transcription poussée, close à l'arrêt. */
async function recordMeeting(app, meetingId) {
  await postJson(app, '/api/history/start', { meetingId });
  await postJson(app, '/api/transcription/update', { meetingId, transcription: TRANSCRIPTION });
  await postJson(app, '/api/history/stop', { meetingId, duration: 600, discardIfEmpty: true });
}

/**
 * Miroir de generateSummary. `screen` = ce que porte l'écran :
 * `{ meetingId, versions }`.
 */
async function generate(app, screen, label, template = 'standard') {
  const versionId = `v-${label}`;
  const isEdit = !!screen.meetingId;
  screen.versions = [...screen.versions, { id: versionId, html: '', template, pending: true }];
  const res = await postJson(app, '/api/resume', {
    transcription: TRANSCRIPTION,
    systemPrompt: label,
    template,
    language: 'fr',
    actions: [],
    versionId,
    meetingDuration: 0,
    meetingStartTime: null,
    meetingId: screen.meetingId,
    isEdit,
    ton: null,
    longueur: null,
    customPrompt: null,
    notes: '',
  });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  if (body.meetingId && !screen.meetingId) screen.meetingId = body.meetingId;
  const finalized = {
    id: versionId,
    html: body.resume,
    template,
    ton: null,
    longueur: null,
    customPrompt: null,
    generatedAt: new Date().toISOString(),
  };
  screen.versions = screen.versions.map((v) => (v.id === versionId ? finalized : v));
  if (isEdit && screen.meetingId) {
    const add = await postJson(app, '/api/versions/add', {
      meetingId: screen.meetingId,
      version: finalized,
    });
    expect(add.statusCode).toBe(200);
  }
  await app.background.drain();
  return finalized;
}

/** Miroir de selectHistoryItem : la réunion telle que l'historique la rouvre. */
async function reopen(app, meetingId) {
  const res = await app.inject({
    method: 'GET',
    url: '/api/history',
    headers: identityHeaders(EMAIL, 'Alex'),
  });
  expect(res.statusCode).toBe(200);
  const matching = res.json().filter((item) => item.meetingId === meetingId);
  expect(matching).toHaveLength(1); // jamais la même réunion en double
  const [doc] = matching;
  const view = unpackHistoryItem(doc, {
    defaultSummaryText: 'ACCUEIL',
    fallbackTemplate: 'standard',
  });
  return { doc, view, screen: { meetingId, versions: [...view.summaryVersions] } };
}

const htmlOf = (versions) => versions.map((v) => v.html);
const idsOf = (versions) => versions.map((v) => v.id);

describe('Plusieurs résumés sur une même réunion', () => {
  it('réunion enregistrée : trois résumés, trois versions dans l’ordre', async () => {
    const { app } = makeApp();
    await recordMeeting(app, 'live-1');
    const screen = { meetingId: 'live-1', versions: [] };

    await generate(app, screen, 'un');
    await generate(app, screen, 'deux', 'commercial');
    await generate(app, screen, 'trois');

    const { doc, view } = await reopen(app, 'live-1');
    expect(htmlOf(doc.versions)).toEqual(['<p>CR un</p>', '<p>CR deux</p>', '<p>CR trois</p>']);
    expect(doc.versions.map((v) => v.template)).toEqual(['standard', 'commercial', 'standard']);
    expect(idsOf(view.summaryVersions)).toEqual(idsOf(screen.versions));
    expect(view.activeVersionId).toBe('v-trois');
  });

  it('démarrage hors ligne : /resume crée la réunion avec sa V1, les suivantes s’y ajoutent', async () => {
    const { app } = makeApp();
    const screen = { meetingId: null, versions: [] };

    await generate(app, screen, 'un');
    expect(screen.meetingId).toBeTruthy();
    await generate(app, screen, 'deux');

    const { doc } = await reopen(app, screen.meetingId);
    expect(htmlOf(doc.versions)).toEqual(['<p>CR un</p>', '<p>CR deux</p>']);
  });

  it('réunion rangée sans résumé : résumée plus tard, deux fois', async () => {
    const { app } = makeApp();
    await recordMeeting(app, 'rangee');
    const opened = await reopen(app, 'rangee');
    expect(opened.view.summaryVersions).toEqual([]);

    await generate(app, opened.screen, 'un');
    await generate(app, opened.screen, 'deux');

    const { doc } = await reopen(app, 'rangee');
    expect(htmlOf(doc.versions)).toEqual(['<p>CR un</p>', '<p>CR deux</p>']);
  });

  it('une version supprimée : le résumé suivant s’ajoute aux restantes', async () => {
    const { app } = makeApp();
    await recordMeeting(app, 'live-2');
    const screen = { meetingId: 'live-2', versions: [] };
    await generate(app, screen, 'un');
    await generate(app, screen, 'deux');
    await postJson(app, '/api/versions/delete', { meetingId: 'live-2', versionId: 'v-deux' });

    await generate(app, screen, 'trois');

    const { doc } = await reopen(app, 'live-2');
    expect(idsOf(doc.versions)).toEqual(['v-un', 'v-trois']);
  });

  it('compte rendu n8n sans versions : l’original reste, sous l’identifiant qu’affiche l’écran', async () => {
    const { app } = makeApp({
      resume: [
        {
          email: EMAIL,
          meetingId: 'n8n-1',
          title: 'Point hebdo',
          resume: '<p>Compte rendu n8n</p>',
          transcription: 'Transcription d’origine, corrigée à la main.',
          template: 'standard',
          now: '2025-06-01T10:00:00.000Z',
          lastConnecion: '2025-06-01T09:00:00.000Z',
        },
      ],
    });
    const opened = await reopen(app, 'n8n-1');
    expect(idsOf(opened.view.summaryVersions)).toEqual([LEGACY_VERSION_ID]);

    await generate(app, opened.screen, 'deux');

    const { doc, view } = await reopen(app, 'n8n-1');
    expect(htmlOf(view.summaryVersions)).toEqual(['<p>Compte rendu n8n</p>', '<p>CR deux</p>']);
    // Même identifiant à l'écran et en base : une retouche de « Résumé 1 » faite
    // dans la foulée trouve sa version.
    expect(SCREEN_LEGACY_VERSION_ID).toBe(LEGACY_VERSION_ID);
    expect(idsOf(doc.versions)).toEqual(idsOf(opened.screen.versions));
    // Une régénération, pas un brouillon : la transcription en base n'est pas
    // remplacée par celle que l'écran reconstruit.
    expect(doc.transcription).toBe('Transcription d’origine, corrigée à la main.');
  });

  it('première version jamais arrivée en base : le résumé suivant ne l’efface pas', async () => {
    // /resume a écrit le compte rendu du brouillon, mais le /versions/add qui
    // suit s'est perdu (réseau coupé entre les deux appels).
    const { app } = makeApp();
    await recordMeeting(app, 'orphelin');
    const lost = { meetingId: 'orphelin', versions: [] };
    const res = await postJson(app, '/api/resume', {
      transcription: TRANSCRIPTION,
      systemPrompt: 'un',
      template: 'standard',
      language: 'fr',
      actions: [],
      versionId: 'v-un',
      meetingId: lost.meetingId,
      isEdit: true,
    });
    expect(res.statusCode).toBe(200);
    await app.background.drain();

    const opened = await reopen(app, 'orphelin');
    expect(htmlOf(opened.view.summaryVersions)).toEqual(['<p>CR un</p>']);
    await generate(app, opened.screen, 'deux');

    const { doc } = await reopen(app, 'orphelin');
    expect(htmlOf(doc.versions)).toEqual(['<p>CR un</p>', '<p>CR deux</p>']);
  });

  it('après la reprise au démarrage : la version d’origine est en base, la suivante s’y ajoute', async () => {
    const { app, db } = makeApp({
      resume: [
        {
          email: EMAIL,
          emailLower: EMAIL,
          meetingId: 'n8n-2',
          resume: '<p>Compte rendu n8n</p>',
          transcription: 'Texte.',
          transcriptionChars: 6,
          meetingDurationSource: 'unknown',
          now: '2025-06-01T10:00:00.000Z',
        },
      ],
    });
    await bootstrap(
      db,
      {
        adminSeed: { enabled: false, email: '', password: '' },
        legacyAdminDomain: '',
        adminEmails: [],
        adminEmailDomains: [],
      },
      { info() {}, warn() {}, error() {} },
      {},
    );

    const opened = await reopen(app, 'n8n-2');
    expect(idsOf(opened.doc.versions)).toEqual([LEGACY_VERSION_ID]);
    await generate(app, opened.screen, 'deux');

    const { doc } = await reopen(app, 'n8n-2');
    expect(htmlOf(doc.versions)).toEqual(['<p>Compte rendu n8n</p>', '<p>CR deux</p>']);
  });
});
