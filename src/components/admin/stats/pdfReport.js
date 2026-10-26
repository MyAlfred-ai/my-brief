/**
 * Rapport PDF des statistiques d'administration — le document HTML, sans
 * effet de bord. L'écriture du PDF est celle du résumé (utils/pdf.js →
 * htmlToPdfBlob) : le navigateur met en page, jsPDF écrit du TEXTE — un
 * rapport de dix pages pèse quelques dizaines de Ko, ses chiffres se
 * sélectionnent et se recopient.
 *
 * Ce que le moteur sait écrire guide le dessin (cf. src/lib/pdf/) : du texte,
 * des fonds et des filets rectangulaires — pas d'arrondi, pas d'ombre, pas
 * d'espacement de lettres. Les graphiques sont donc faits de blocs : colonnes
 * et barres en `div` colorées, graduations en filets. Chaque graphique est un
 * bloc insécable (`data-pdf-keep`) : la coupe de page passe avant ou après,
 * jamais au travers.
 *
 * Le tableau par utilisateur ferme le rapport, en annexe : il est découpé en
 * tranches d'une page, chacune insécable et coiffée de son en-tête de
 * colonnes — à la page 3, on sait encore ce que dit la cinquième colonne. Les
 * lignes ont une hauteur FIXE (une ligne de texte, chaînes raccourcies ici)
 * pour que la tranche tienne à coup sûr dans une page.
 *
 * Mêmes lectures que l'écran (statsView.js) : un chiffre du rapport est celui
 * de l'écran, au même arrondi.
 */
import { PDF_FONT_FAMILY } from '../../../lib/pdf/fonts.js';
import { fill } from '../../../utils/i18nFormat.js';
import {
  formatBucket,
  formatCount,
  formatDate,
  formatDecimal,
  formatDuration,
  formatEuros,
  formatHours,
  formatPercent,
  niceScale,
} from './format.js';
import {
  ADOPTION_COLORS,
  accountName,
  adoptionItems,
  adoptionRate,
  deltaOf,
  formatDelta,
  pointsDeltaOf,
  rangeDatesOf,
  rangeLabelOf,
  regularShareOf,
  scopePartsOf,
  sortAccounts,
  templateName,
} from './statsView.js';

/** Sections du rapport, dans l'ordre du document — et de la boîte d'export. */
export const REPORT_SECTIONS = [
  'overview',
  'adoption',
  'meetings',
  'time',
  'durations',
  'weekdays',
  'topUsers',
  'templates',
  'costs',
  'users',
];

/** Lignes du tableau par tranche : une tranche tient dans une page A4 (cf. l'en-tête). */
export const ROWS_PER_SLICE = 34;

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Raccourcit une chaîne à `max` caractères : une cellule ne passe jamais à la ligne. */
const clip = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const pct = (value, max) => (max ? Math.min(100, Math.max(0, (value / max) * 100)) : 0);

const DELTA_MARK = { up: '▲', down: '▼', flat: '=', new: '•' };

function deltaHtml(delta, lang, texts) {
  if (!delta) return '';
  return `<span class="sr-delta sr-delta-${delta.direction}">${DELTA_MARK[delta.direction]} ${esc(
    formatDelta(delta, lang, texts),
  )}</span>`;
}

function kpi({ label, value, delta = '', hint = '' }) {
  return `<div class="sr-kpi">
    <div class="sr-kpi-label">${esc(label)}</div>
    <div class="sr-kpi-value">${esc(value)}</div>
    ${delta ? `<div class="sr-kpi-delta">${delta}</div>` : ''}
    ${hint ? `<div class="sr-kpi-hint">${esc(hint)}</div>` : ''}
  </div>`;
}

/** Histogramme vertical en blocs : graduations, colonnes, quelques libellés d'abscisse. */
function columnChart({ points, color, formatTick }) {
  const max = points.reduce((best, p) => Math.max(best, p.value), 0);
  const scale = niceScale(max);
  const step = Math.max(1, Math.ceil(points.length / 8));
  const ticks = scale.ticks
    .map(
      (tick) =>
        `<div class="sr-tick" style="bottom:${pct(tick, scale.max)}%"><span>${esc(
          formatTick(tick),
        )}</span></div>`,
    )
    .join('');
  const cols = points
    .map(
      (p) =>
        `<div class="sr-col"><div class="sr-col-bar" style="height:${
          p.value > 0 ? Math.max(1.5, pct(p.value, scale.max)) : 0
        }%;background:${color}"></div></div>`,
    )
    .join('');
  const labels = points
    .map(
      (p, index) =>
        `<div class="sr-xlabel">${index % step === 0 ? `<span>${esc(p.label)}</span>` : ''}</div>`,
    )
    .join('');
  return `<div class="sr-plot">${ticks}<div class="sr-cols">${cols}</div></div>
    <div class="sr-xaxis">${labels}</div>`;
}

/** Barres horizontales à valeur écrite : classements et répartitions. */
function barList(items, { colors = null, color = 'var(--viz-series-1)', formatValue }) {
  const max = items.reduce((best, item) => Math.max(best, item.value), 0) || 1;
  return `<div class="sr-bars">${items
    .map(
      (item, index) => `<div class="sr-bar-row">
        <span class="sr-bar-label">${esc(clip(item.label, 34))}</span>
        <span class="sr-bar-track"><span class="sr-bar-fill" style="width:${
          item.value > 0 ? Math.max(1, pct(item.value, max)) : 0
        }%;background:${colors ? colors[index % colors.length] : color}"></span></span>
        <span class="sr-bar-value">${esc(formatValue(item.value))}</span>
      </div>`,
    )
    .join('')}</div>`;
}

const panel = (title, hint, body) => `<div class="sr-panel">
  <h3>${esc(title)}</h3>${hint ? `<p class="sr-hint">${esc(hint)}</p>` : ''}${body}
</div>`;

const section = (title, body, { keep = true, extraClass = '' } = {}) =>
  `<section class="sr-sec ${extraClass}"${keep ? ' data-pdf-keep' : ''}>
    <h2>${esc(title)}</h2>${body}
  </section>`;

/**
 * @param {object} input
 * @param {object} input.stats - réponse de GET /api/admin/stats
 * @param {string[]} input.sections - identifiants de REPORT_SECTIONS retenus
 * @param {object} input.texts - `$uiText.adminStats`
 * @param {string} input.lang
 * @param {string} input.author - nom (ou adresse) de l'administrateur qui exporte
 * @param {Date} [input.now]
 * @returns {{html: string, styles: string, className: string, filename: string,
 *            meta: {title: string, author: string, language: string, footerText: string}}}
 */
export function buildStatsReport({ stats, sections, texts, lang, author, now = new Date() }) {
  const t = texts;
  const p = t.pdf;
  const want = new Set(sections);
  const applied = stats.filters?.applied || { days: stats.range?.days };
  const options = stats.filters?.options || {};
  const totals = stats.totals || {};
  const previous = stats.previous || null;
  const granularity = stats.range?.granularity || 'day';
  const count = (value) => formatCount(value, lang);
  const focused = !!applied.user;

  const periodText = `${rangeLabelOf(applied, t, lang)} · ${rangeDatesOf(stats.range, lang)}`;
  const scopeText = scopePartsOf(applied, options, t, lang).join(' · ');

  const coverage = stats.coverage || {};
  const noDuration = coverage.meetingsInRange > 0 && coverage.withDuration === 0;
  const partial =
    coverage.meetingsInRange > 0 &&
    coverage.withDuration > 0 &&
    coverage.withDuration < coverage.meetingsInRange;

  const parts = [];

  // ── En-tête ───────────────────────────────────────────────────────────────
  parts.push(`<header class="sr-head">
    <div class="sr-kicker">${esc(p.reportKicker)}</div>
    <h1>${esc(p.reportTitle)}</h1>
    <div class="sr-meta">
      <div><div class="sr-meta-label">${esc(p.period)}</div><div class="sr-meta-value">${esc(
        periodText,
      )}</div></div>
      <div><div class="sr-meta-label">${esc(p.scope)}</div><div class="sr-meta-value">${esc(
        scopeText,
      )}</div></div>
      <div><div class="sr-meta-label">${esc(p.issued)}</div><div class="sr-meta-value">${esc(
        fill(p.issuedBy, { date: formatDate(now.toISOString(), lang), author }),
      )}</div></div>
    </div>
  </header>`);

  // ── Indicateurs clés ──────────────────────────────────────────────────────
  if (want.has('overview')) {
    const rate = adoptionRate(totals.activeAccounts, totals.enabledUsers);
    const previousRate = previous
      ? adoptionRate(previous.activeAccounts, previous.enabledUsers)
      : null;
    const perActive = totals.activeAccounts ? totals.meetingsInRange / totals.activeAccounts : null;
    const kpis = [
      kpi({
        label: t.kpiMeetings,
        value: count(totals.meetingsInRange),
        delta: deltaHtml(deltaOf(totals.meetingsInRange, previous?.meetings), lang, t),
        hint: fill(t.kpiMeetingsHint, {
          total: count(totals.meetings),
          range: rangeLabelOf(applied, t, lang).toLowerCase(),
        }),
      }),
      kpi({
        label: t.kpiTotalTime,
        value: totals.durationSeconds ? formatDuration(totals.durationSeconds, lang) : '—',
        delta: noDuration
          ? ''
          : deltaHtml(deltaOf(totals.durationSeconds, previous?.durationSeconds), lang, t),
        hint: noDuration ? t.kpiNoDuration : '',
      }),
      kpi({
        label: t.kpiAverage,
        value: totals.avgDurationSeconds ? formatDuration(totals.avgDurationSeconds, lang) : '—',
        hint: totals.medianDurationSeconds
          ? fill(t.kpiAverageHint, { median: formatDuration(totals.medianDurationSeconds, lang) })
          : t.kpiNoDuration,
      }),
      kpi({
        label: t.kpiAdoption,
        value: rate === null ? '—' : formatPercent(rate, lang),
        delta:
          rate === null || previousRate === null
            ? ''
            : deltaHtml(pointsDeltaOf(rate, previousRate), lang, t),
        hint: totals.enabledUsers
          ? fill(t.kpiAdoptionHint, {
              active: count(totals.activeAccounts),
              enabled: count(totals.enabledUsers),
            })
          : t.kpiAdoptionNone,
      }),
      kpi({
        label: t.kpiSummaries,
        value: totals.meetingsInRange
          ? formatPercent(totals.withSummary / totals.meetingsInRange, lang)
          : '—',
        hint: totals.meetingsInRange
          ? fill(t.kpiSummariesHint, {
              count: count(totals.withSummary),
              total: count(totals.meetingsInRange),
            })
          : t.kpiSummariesNone,
      }),
      kpi({
        label: t.kpiPerActive,
        value: perActive === null ? '—' : formatDecimal(perActive, lang, 1),
        hint:
          perActive === null
            ? ''
            : fill(t.kpiPerActiveHint, { count: count(totals.activeAccounts) }),
      }),
    ];
    const notes = [];
    if (previous) {
      notes.push(
        fill(p.previousNote, {
          from: formatDate(previous.from, lang),
          to: formatDate(new Date(Date.parse(previous.to) - 1).toISOString(), lang),
        }),
      );
    }
    if (partial || noDuration) {
      notes.push(
        fill(p.durationNote, {
          counted: count(coverage.withDuration),
          total: count(coverage.meetingsInRange),
        }),
      );
    }
    parts.push(
      section(
        p.sections.overview,
        `<div class="sr-kpis">${kpis.join('')}</div>${notes
          .map((note) => `<p class="sr-note">${esc(note)}</p>`)
          .join('')}`,
      ),
    );
  }

  // ── Santé de l'adoption ───────────────────────────────────────────────────
  if (want.has('adoption') && !focused) {
    const items = adoptionItems(stats.adoption);
    const total = items.reduce((sum, item) => sum + item.count, 0);
    const body = total
      ? `<p class="sr-lead">${esc(fill(t.adoptionLead, { share: regularShareOf(stats.adoption, lang) }))}</p>
        <div class="sr-stack">${items
          .filter((item) => item.count)
          .map(
            (item) =>
              `<div class="sr-stack-seg" style="width:${pct(item.count, total)}%;background:${
                ADOPTION_COLORS[item.status]
              }"></div>`,
          )
          .join('')}</div>
        <div class="sr-legend">${items
          .map(
            (item) => `<div class="sr-legend-item">
              <div class="sr-legend-name"><span class="sr-swatch" style="background:${
                ADOPTION_COLORS[item.status]
              }"></span>${esc(t.adoptionStatuses[item.status])}</div>
              <div class="sr-legend-figure">${esc(count(item.count))}<span>${esc(
                formatPercent(item.share, lang),
              )}</span></div>
              <div class="sr-legend-def">${esc(t.adoptionDefinitions[item.status])}</div>
            </div>`,
          )
          .join('')}</div>`
      : `<p class="sr-empty">${esc(t.adoptionEmpty)}</p>`;
    parts.push(section(p.sections.adoption, body));
  }

  // ── Séries ────────────────────────────────────────────────────────────────
  const series = stats.series || [];
  if (want.has('meetings')) {
    const points = series.map((s) => ({
      label: formatBucket(s.key, granularity, lang),
      value: s.meetings,
    }));
    parts.push(
      section(
        p.sections.meetings,
        totals.meetingsInRange
          ? `<p class="sr-hint">${esc(fill(t.periodHint, { range: rangeLabelOf(applied, t, lang).toLowerCase() }))}</p>${columnChart(
              { points, color: 'var(--viz-series-1)', formatTick: count },
            )}`
          : `<p class="sr-empty">${esc(t.empty)}</p>`,
      ),
    );
  }
  if (want.has('time')) {
    const points = series.map((s) => ({
      label: formatBucket(s.key, granularity, lang),
      value: Math.round((s.durationSeconds / 3600) * 10) / 10,
    }));
    parts.push(
      section(
        p.sections.time,
        noDuration || !totals.durationSeconds
          ? `<p class="sr-empty">${esc(noDuration ? t.noDurationEmpty : t.empty)}</p>`
          : `<p class="sr-hint">${esc(t.chartTimeHint)}</p>${columnChart({
              points,
              color: 'var(--viz-series-2)',
              formatTick: (value) => fill(t.hours, { value: formatHours(value, lang) }),
            })}`,
      ),
    );
  }

  // Deux panneaux côte à côte quand les deux sont demandés : une demi-page
  // chacun, plutôt qu'une page de barres courtes.
  const pair = (left, right) => {
    const shown = [left, right].filter(Boolean);
    if (!shown.length) return;
    parts.push(
      `<section class="sr-sec" data-pdf-keep><div class="sr-pair${
        shown.length === 1 ? ' sr-pair-single' : ''
      }">${shown.join('')}</div></section>`,
    );
  };

  const durationPanel = want.has('durations')
    ? panel(
        p.sections.durations,
        t.chartDurationsHint,
        noDuration
          ? `<p class="sr-empty">${esc(t.noDurationEmpty)}</p>`
          : barList(
              (stats.durationBuckets || []).map((b) => ({
                label: t.buckets[b.id],
                value: b.count,
              })),
              {
                colors: [1, 2, 3, 4, 5].map((n) => `var(--viz-ramp-${n})`),
                formatValue: count,
              },
            ),
      )
    : '';
  const weekdayPanel = want.has('weekdays')
    ? panel(
        p.sections.weekdays,
        t.chartWeekdaysHint,
        barList(
          (stats.weekdays || []).map((d) => ({
            label: t.weekdaysLong[d.index],
            value: d.meetings,
          })),
          { formatValue: count },
        ),
      )
    : '';
  pair(durationPanel, weekdayPanel);

  const accounts = stats.accounts || [];
  const top = sortAccounts(
    accounts.filter((row) => row.meetings > 0),
    'meetings',
    'desc',
  ).slice(0, 8);
  const topPanel =
    want.has('topUsers') && !focused
      ? panel(
          p.sections.topUsers,
          t.chartTopUsersHint,
          top.length
            ? barList(
                top.map((row) => ({ label: accountName(row), value: row.meetings })),
                { formatValue: count },
              )
            : `<p class="sr-empty">${esc(t.emptyUsers)}</p>`,
        )
      : '';
  const templatePanel = want.has('templates')
    ? panel(
        p.sections.templates,
        t.chartTemplatesHint,
        (stats.templates || []).length
          ? barList(
              stats.templates.map((row) => ({
                label: templateName(row, lang, t.templateUnknown),
                value: row.meetings,
              })),
              { color: 'var(--viz-series-2)', formatValue: count },
            )
          : `<p class="sr-empty">${esc(t.empty)}</p>`,
      )
    : '';
  pair(topPanel, templatePanel);

  // ── Dépenses d'IA ─────────────────────────────────────────────────────────
  const costs = stats.costs;
  if (want.has('costs') && costs) {
    const c = t.costs;
    const figure = (label, value, hint) => `<div class="sr-kpi">
      <div class="sr-kpi-label">${esc(label)}</div>
      <div class="sr-kpi-value">${esc(value)}</div>
      ${hint ? `<div class="sr-kpi-hint">${esc(hint)}</div>` : ''}
    </div>`;
    const rows = (costs.lines || [])
      .map(
        (line) => `<tr>
          <th>${esc(c.lines[line.id] || line.id)}</th>
          <td>${esc(formatEuros(line.periodEur, lang))}</td>
          <td>${esc(formatEuros(line.monthlyEur, lang))}</td>
          <td>${esc(formatPercent(line.share, lang))}</td>
        </tr>`,
      )
      .join('');
    parts.push(
      section(
        p.sections.costs,
        `<p class="sr-hint">${esc(fill(c.hint, { days: formatCount(costs.spanDays, lang) }))}</p>
        <div class="sr-kpis">
          ${figure(c.monthly, formatEuros(costs.monthlyEur, lang, { compact: true }), c.monthlyHint)}
          ${figure(c.perHour, formatEuros(costs.perHourEur, lang), '')}
          ${figure(
            c.period,
            formatEuros(costs.periodEur, lang),
            costs.perMeetingEur === null
              ? c.periodHintEmpty
              : fill(c.periodHint, {
                  meetings: count(costs.usage?.meetings),
                  perMeeting: formatEuros(costs.perMeetingEur, lang),
                }),
          )}
        </div>
        <table class="sr-table sr-costs">
          <thead><tr><th>${esc(c.colLine)}</th><th>${esc(c.colPeriod)}</th><th>${esc(
            c.colMonthly,
          )}</th><th>${esc(c.colShare)}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`,
      ),
    );
  }

  // ── Annexe : utilisation par utilisateur ──────────────────────────────────
  if (want.has('users') && !focused && accounts.length) {
    const rows = sortAccounts(accounts, 'meetings', 'desc');
    const head = `<thead><tr>
      <th class="sr-c-user">${esc(t.colUser)}</th>
      <th class="sr-c-groups">${esc(t.colGroups)}</th>
      <th class="sr-c-status">${esc(t.colStatus)}</th>
      <th class="sr-c-num sr-c-meetings">${esc(t.colMeetings)}</th>
      <th class="sr-c-num sr-c-time">${esc(t.colTime)}</th>
      <th class="sr-c-num sr-c-avg">${esc(t.colAverage)}</th>
      <th class="sr-c-num sr-c-weeks">${esc(t.csv.activeWeeks)}</th>
      <th class="sr-c-num sr-c-summaries">${esc(t.colSummaries)}</th>
      <th class="sr-c-num sr-c-last">${esc(t.colLastMeeting)}</th>
    </tr></thead>`;
    const line = (row) => {
      const delta = deltaOf(row.meetings, row.previousMeetings);
      return `<tr>
        <td class="sr-c-user"><strong>${esc(clip(accountName(row), 26))}</strong>${
          row.disabled ? ` <em>${esc(t.disabledBadge)}</em>` : ''
        }</td>
        <td class="sr-c-groups">${esc(clip((row.groups || []).map((g) => g.name).join(', '), 17))}</td>
        <td class="sr-c-status"><span class="sr-swatch" style="background:${
          ADOPTION_COLORS[row.status]
        }"></span>${esc(t.statusLabels[row.status])}</td>
        <td class="sr-c-num"><strong>${esc(count(row.meetings))}</strong>${
          delta && delta.direction !== 'flat'
            ? // Un compte nouveau sur la période est une hausse : ▲, comme dans la légende.
              ` <span class="sr-delta-${delta.direction}">${DELTA_MARK[delta.direction === 'new' ? 'up' : delta.direction]}</span>`
            : ''
        }</td>
        <td class="sr-c-num">${esc(row.durationSeconds ? formatDuration(row.durationSeconds, lang) : '—')}</td>
        <td class="sr-c-num">${esc(
          row.avgDurationSeconds ? formatDuration(row.avgDurationSeconds, lang) : '—',
        )}</td>
        <td class="sr-c-num">${esc(fill(t.regularity, { active: row.activeWeeks, weeks: row.weeks }))}</td>
        <td class="sr-c-num">${esc(count(row.summaries))}</td>
        <td class="sr-c-num">${esc(row.lastMeetingAt ? formatDate(row.lastMeetingAt, lang) : t.never)}</td>
      </tr>`;
    };
    for (let start = 0; start < rows.length; start += ROWS_PER_SLICE) {
      const slice = rows.slice(start, start + ROWS_PER_SLICE);
      const table = `<table class="sr-table sr-users">${head}<tbody>${slice.map(line).join('')}</tbody></table>`;
      parts.push(
        start === 0
          ? section(p.sections.users, `<p class="sr-hint">${esc(t.usersHintPdf)}</p>${table}`, {
              extraClass: 'sr-annex',
            })
          : `<section class="sr-sec sr-annex-next" data-pdf-keep>${table}</section>`,
      );
    }
  }

  parts.push(`<p class="sr-privacy">${esc(p.privacy)}</p>`);

  const day = now.toISOString().slice(0, 10);
  return {
    html: parts.join('\n'),
    styles: REPORT_STYLES,
    className: 'sr',
    filename: `${p.filename}_${day}.pdf`,
    meta: {
      // Latin-1 seulement dans les métadonnées (utils/pdf.js) : pas de tiret long.
      title: `${p.reportTitle} - myBrief`,
      author,
      language: lang,
      footerText: p.footer,
    },
  };
}

/**
 * Feuille du rapport. Unités en pixels CSS d'une bande de 210 mm ramenée aux
 * 180 mm utiles de la page (≈ 0,23 mm par pixel, ≈ 1 111 pixels de haut par
 * page) : 12 px s'impriment en ~7,7 pt, 15 px en ~9,6 pt. Couleurs par
 * jetons : le conteneur vit dans la page, il hérite de la marque de
 * l'installation. Graisses 400 et 700 seulement : ce sont les deux que la
 * police embarquée possède.
 */
export const REPORT_STYLES = `
.sr { font-family: '${PDF_FONT_FAMILY}', 'Segoe UI', Tahoma, sans-serif; color: var(--ink); font-size: 15px; line-height: 1.45; background: #fff; padding: 0 6px; }
.sr *, .sr *::before, .sr *::after { box-sizing: border-box; margin: 0; padding: 0; }
.sr strong { font-weight: 700; }
.sr em { font-style: italic; color: var(--ink-faint); font-weight: 400; }

.sr-head { padding: 4px 0 22px; border-bottom: 3px solid var(--brand); }
.sr-kicker { font-size: 13px; font-weight: 700; color: var(--brand-text); text-transform: uppercase; }
.sr-head h1 { margin-top: 6px; font-size: 34px; line-height: 1.15; font-weight: 700; color: var(--ink); }
.sr-meta { display: flex; gap: 22px; margin-top: 18px; }
.sr-meta > div { flex: 1 1 0; padding-left: 10px; border-left: 2px solid var(--line-strong); }
.sr-meta-label { font-size: 11px; font-weight: 700; color: var(--ink-faint); text-transform: uppercase; }
.sr-meta-value { margin-top: 3px; font-size: 13.5px; font-weight: 700; color: var(--ink-soft); line-height: 1.35; }

.sr-sec { padding-top: 30px; }
.sr-sec h2 { font-size: 19px; font-weight: 700; color: var(--ink); padding-bottom: 7px; margin-bottom: 14px; border-bottom: 1px solid var(--line-strong); }
.sr-annex { padding-top: 34px; }
.sr-annex-next { padding-top: 18px; }
.sr-hint { font-size: 12.5px; color: var(--ink-faint); margin-bottom: 12px; }
.sr-note { font-size: 12px; color: var(--ink-faint); font-style: italic; margin-top: 10px; }
.sr-empty { font-size: 13px; color: var(--ink-faint); padding: 16px 0; }
.sr-lead { font-size: 15.5px; color: var(--ink-soft); margin-bottom: 14px; }

.sr-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.sr-kpi { padding: 12px 14px 13px; background: var(--surface-tint); border-top: 3px solid var(--viz-series-1); }
.sr-kpi-label { font-size: 11.5px; font-weight: 700; color: var(--ink-faint); text-transform: uppercase; }
.sr-kpi-value { margin-top: 4px; font-size: 28px; line-height: 1.15; font-weight: 700; color: var(--ink); }
.sr-kpi-delta { margin-top: 3px; font-size: 12px; }
.sr-kpi-hint { margin-top: 3px; font-size: 12px; color: var(--ink-faint); line-height: 1.35; }
.sr-delta { font-weight: 700; color: var(--ink-muted); }
.sr-delta-up, .sr-delta-new { color: var(--success-text); }
.sr-delta-down { color: var(--danger-text); }
.sr-delta-flat { color: var(--ink-faint); }

.sr-stack { display: flex; gap: 2px; height: 18px; background: var(--viz-track); }
.sr-legend { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 14px; }
.sr-legend-item { padding: 9px 10px; border: 1px solid var(--line); }
.sr-legend-name { font-size: 12.5px; font-weight: 700; color: var(--ink-soft); }
.sr-legend-figure { margin-top: 3px; font-size: 24px; font-weight: 700; color: var(--ink); }
.sr-legend-figure span { margin-left: 7px; font-size: 13px; font-weight: 400; color: var(--ink-faint); }
.sr-legend-def { margin-top: 2px; font-size: 11.5px; color: var(--ink-faint); line-height: 1.3; }
.sr-swatch { display: inline-block; width: 10px; height: 10px; margin-right: 6px; vertical-align: 0; }

.sr-plot { position: relative; height: 170px; margin-left: 46px; margin-top: 8px; }
.sr-tick { position: absolute; left: 0; right: 0; height: 0; border-top: 1px solid var(--viz-grid); }
.sr-tick span { position: absolute; right: 100%; top: -9px; padding-right: 8px; font-size: 11.5px; color: var(--ink-faint); white-space: nowrap; }
.sr-cols { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 3px; border-bottom: 1px solid var(--viz-axis); }
.sr-col { flex: 1 1 0; height: 100%; display: flex; align-items: flex-end; }
.sr-col-bar { width: 100%; }
.sr-xaxis { display: flex; gap: 3px; margin-left: 46px; margin-top: 5px; height: 16px; }
.sr-xlabel { flex: 1 1 0; position: relative; }
.sr-xlabel span { position: absolute; left: 50%; transform: translateX(-50%); font-size: 11px; color: var(--ink-faint); white-space: nowrap; }

.sr-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; }
.sr-pair-single { grid-template-columns: 1fr; }
.sr-panel h3 { font-size: 16px; font-weight: 700; color: var(--ink); padding-bottom: 6px; margin-bottom: 6px; border-bottom: 1px solid var(--line-strong); }
.sr-bars { display: flex; flex-direction: column; gap: 9px; }
.sr-bar-row { display: grid; grid-template-columns: 38% 1fr 46px; align-items: center; gap: 10px; }
.sr-bar-label { font-size: 12.5px; color: var(--ink-soft); white-space: nowrap; overflow: hidden; }
.sr-bar-track { height: 11px; background: var(--viz-track); }
.sr-bar-fill { display: block; height: 100%; }
.sr-bar-value { font-size: 12.5px; font-weight: 700; color: var(--ink); text-align: right; }

.sr-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.sr-table th, .sr-table td { padding: 0 7px; height: 26px; text-align: right; white-space: nowrap; color: var(--ink-soft); border-bottom: 1px solid var(--line); }
.sr-table thead th { height: auto; padding-bottom: 6px; vertical-align: bottom; white-space: normal; line-height: 1.2; font-size: 10.5px; font-weight: 700; color: var(--ink-faint); text-transform: uppercase; border-bottom: 1.5px solid var(--line-strong); }
.sr-table th:first-child, .sr-table td:first-child { text-align: left; padding-left: 0; }
.sr-table td:last-child, .sr-table th:last-child { padding-right: 0; }
.sr-table tbody th { font-weight: 700; color: var(--ink); }
.sr-costs { margin-top: 14px; font-size: 13px; }
.sr-users { table-layout: fixed; }
.sr-users .sr-c-user { width: 19%; text-align: left; }
.sr-users .sr-c-groups { width: 15%; text-align: left; }
.sr-users .sr-c-status { width: 14%; text-align: left; }
.sr-users .sr-c-meetings { width: 8%; }
.sr-users .sr-c-time { width: 8%; }
.sr-users .sr-c-avg { width: 7%; }
.sr-users .sr-c-weeks { width: 9%; }
.sr-users .sr-c-summaries { width: 9%; }
.sr-users .sr-c-last { width: 11%; }
.sr-users .sr-c-user strong { color: var(--ink); }
.sr-users tbody tr:nth-child(even) td { background: var(--surface-tint); }

.sr-privacy { margin-top: 30px; padding-top: 10px; border-top: 1px solid var(--line); font-size: 11.5px; color: var(--ink-faint); font-style: italic; }
`;
