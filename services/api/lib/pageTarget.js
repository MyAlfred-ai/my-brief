/**
 * Pagimètre, côté serveur : faire respecter la longueur demandée.
 *
 * Un modèle de langue ne voit pas de pages, et compte mal ses mots : à consigne
 * égale, il rend couramment 30 % de plus ou de moins. La consigne de longueur
 * (construite par le client, src/config/templates.js) ne suffit donc pas — le
 * serveur MESURE le résumé rendu (lib/pageMeter.js, la mise en page du PDF
 * rejouée) et, hors tolérance, le fait reprendre UNE fois : développer en
 * puisant dans la transcription, ou condenser. La reprise n'est gardée que si
 * elle rapproche de la cible ; sinon le premier jet reste. Jamais d'échec du
 * compte rendu pour une reprise ratée : elle est un bonus, pas une étape.
 *
 * Seul le résumé principal est repris, découpé entre ses ancres : titre,
 * actions et blocs complémentaires ne passent jamais par la reprise — c'est ce
 * qui interdit de perdre une action en route (le défaut qui a fait écarter
 * gpt-5-mini, cf. lib/summaryModels.js).
 *
 * Les consignes de reprise viennent du client, avec leurs contextes
 * (vocabulaire, notes, attribution) : même parti pris que le prompt principal,
 * le serveur ne fait qu'y reporter les nombres mesurés.
 */
import {
  normalizePages,
  effectivePages,
  countWords,
  estimatePages,
  lengthVerdict,
  splitAtAnchors,
  WORDS_PER_PAGE,
} from './pageMeter.js';

/** Bornes des chaînes reçues : ancres = une ligne de scaffold, consignes = prompt + contextes. */
const MAX_ANCHOR = 500;
const MAX_FIX_PROMPT = 60_000;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Plan de longueur envoyé par le client (`body.length`), validé. null si le
 * Pagimètre n'est pas demandé ou si la longueur est invalide : le compte rendu
 * part alors exactement comme avant.
 *
 * La cible est RECALCULÉE ici depuis la transcription reçue (plafond de
 * matière), jamais lue dans le corps : même fonction que le client.
 *
 * @param {unknown} raw
 * @param {string} transcription
 */
export function parsePagePlan(raw, transcription) {
  if (!raw || typeof raw !== 'object') return null;
  const pages = normalizePages(raw.pages);
  if (pages === null) return null;
  const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
  const anchors =
    raw.anchors && typeof raw.anchors === 'object'
      ? {
          before: str(raw.anchors.before, MAX_ANCHOR),
          beforeCount: Math.max(1, Math.min(50, Math.floor(Number(raw.anchors.beforeCount)) || 1)),
          after: str(raw.anchors.after, MAX_ANCHOR),
        }
      : null;
  return {
    pages,
    target: effectivePages(pages, countWords(transcription)),
    anchors,
    fix: {
      expand: str(raw.fix?.expand, MAX_FIX_PROMPT),
      condense: str(raw.fix?.condense, MAX_FIX_PROMPT),
    },
  };
}

/**
 * Verbosité du premier jet selon la longueur visée. `verbosity: 'high'` (le
 * réglage sans Pagimètre, cf. routes/meetings.js) pousse le modèle à
 * développer : juste pour trois pages, contre-productif pour un quart de page.
 */
export function mainVerbosity(target) {
  if (target <= 0.5) return 'low';
  if (target <= 2) return 'medium';
  return 'high';
}

/** Retire les clôtures de code et l'enveloppe de document qu'un modèle ajoute parfois. */
function cleanFragment(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .replace(/<\/?(?:html|body)\b[^>]*>/gi, '')
    .trim();
}

/** Écart relatif symétrique : 2× trop long compte comme 2× trop court. */
const distance = (measured, target) => Math.abs(Math.log(Math.max(measured, 0.01) / target));

/**
 * Délai après lequel on ne lance plus de SECONDE reprise, compté depuis le
 * début de la génération. Une reprise rate parfois sa cible parce que le résumé
 * change de forme en changeant de taille (un quart de page n'a pas
 * d'intertitres, une page en a) : sa densité n'est plus celle qu'on a mesurée.
 * Une seconde passe, mesurée sur la première, corrige presque toujours —
 * simulé le 2026-09-30 : 91 % des résumés dans ±20 % avec une reprise, 97 %
 * avec deux. Mais pour dix pages, chaque passe prend une à deux minutes : au
 * delà de ce délai, on rend le meilleur jet obtenu plutôt que de faire
 * attendre.
 */
export const SECOND_PASS_BUDGET_MS = 150_000;

/**
 * Mesure le résumé principal et le fait reprendre s'il s'écarte de la cible —
 * au plus `maxPasses` fois, chaque passe mesurée sur la précédente, et tant que
 * `canRetry()` le permet à partir de la deuxième.
 *
 * @param {object} args
 * @param {string} args.html - compte rendu rendu par le modèle (jetons de blocs fixes encore en place)
 * @param {ReturnType<typeof parsePagePlan>} args.plan
 * @param {string} args.transcription
 * @param {(p: {system: string, user: string, verbosity: string}) => Promise<string>} args.chat
 * @param {{info: Function, warn: Function}} [args.log]
 * @param {number} [args.maxPasses]
 * @param {() => boolean} [args.canRetry]
 * @returns {Promise<{html: string, report: object}>}
 */
export async function enforcePageTarget({
  html,
  plan,
  transcription,
  chat,
  log,
  maxPasses = 1,
  canRetry = () => true,
}) {
  const report = {
    requested: plan.pages,
    target: round2(plan.target),
    measured: null,
    verdict: null,
    passes: 0,
    corrected: false,
    final: null,
  };
  const done = (out, extra = {}) => {
    Object.assign(report, extra);
    log?.info({ pageMeter: report }, '/resume : Pagimètre');
    return { html: out, report };
  };

  const parts = plan.anchors ? splitAtAnchors(html, plan.anchors) : null;
  if (!parts || !parts.body.trim()) return done(html, { skipped: 'anchors' });

  let body = parts.body.trim();
  let measured = estimatePages(body);
  let verdict = lengthVerdict(measured, plan.target);
  report.measured = round2(measured);
  report.final = report.measured;
  report.verdict = verdict;

  while (verdict !== 'ok' && report.passes < maxPasses) {
    if (report.passes > 0 && !canRetry()) {
      report.skipped = 'budget';
      break;
    }
    const template = verdict === 'short' ? plan.fix.expand : plan.fix.condense;
    if (!template) {
      report.skipped = 'no_prompt';
      break;
    }

    // Mots visés à la DENSITÉ de ce résumé-ci : s'il est en puces courtes, une
    // page en demande moins qu'en prose. La mesure dit combien de mots ce
    // résumé met par page ; la cible s'en déduit.
    const words = countWords(body);
    const density = measured > 0 && words > 0 ? words / measured : WORDS_PER_PAGE;
    const targetWords = Math.max(30, Math.round(plan.target * density));
    const system = template
      .replaceAll('{{mots_actuels}}', String(words))
      .replaceAll('{{mots_cibles}}', String(targetWords))
      .replaceAll('{{mots_min}}', String(Math.round(targetWords * 0.9)))
      .replaceAll('{{mots_max}}', String(Math.round(targetWords * 1.1)));
    const user =
      `#TRANSCRIPTION DE LA RÉUNION (intégralité de ce qui a été dit — seule source des faits)\n\n${transcription ?? ''}` +
      `\n\n#RÉSUMÉ_À_REPRENDRE (HTML)\n\n${body}`;

    report.passes++;
    let rewritten;
    try {
      rewritten = cleanFragment(
        await chat({
          system,
          user,
          verbosity: verdict === 'short' ? (plan.target > 2 ? 'high' : 'medium') : 'low',
        }),
      );
    } catch (err) {
      log?.warn({ err: err.message }, '/resume : reprise de longueur en échec, meilleur jet gardé');
      report.skipped = 'fix_failed';
      break;
    }

    // Une reprise qui recopie une ligne de la mise en forme a débordé du résumé :
    // la coller dupliquerait un titre, voire la liste des actions. Seules les
    // ancres porteuses de texte comptent — un `</ul>` nu figure dans toute liste.
    const anchorsLeak = [plan.anchors.before, plan.anchors.after].some(
      (a) => a && a.replace(/<[^>]*>/g, '').trim() && rewritten.includes(a),
    );
    const remeasured = estimatePages(rewritten);
    report.remeasured = round2(remeasured);
    const moved = verdict === 'short' ? remeasured > measured : remeasured < measured;
    if (
      !rewritten ||
      anchorsLeak ||
      !moved ||
      distance(remeasured, plan.target) >= distance(measured, plan.target)
    ) {
      report.skipped = anchorsLeak ? 'leak' : 'not_better';
      break;
    }
    body = rewritten;
    measured = remeasured;
    verdict = lengthVerdict(measured, plan.target);
    report.corrected = true;
    report.final = round2(measured);
  }

  // Sans reprise gardée, le compte rendu repart tel que le modèle l'a rendu,
  // à l'octet près.
  return done(report.corrected ? `${parts.head}\n${body}\n${parts.tail}` : html);
}
