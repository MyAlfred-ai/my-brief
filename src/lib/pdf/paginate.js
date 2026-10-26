/**
 * Pagination du résumé — fonctions pures.
 *
 * Le navigateur met le résumé en page sur UNE bande continue ; le PDF la
 * découpe en pages A4. La capture d'image la tranchait tous les 252 mm, sans
 * regarder ce qu'il y avait dessous : une ligne sur deux pages, moitié haute
 * en bas de l'une, moitié basse en haut de l'autre. Ici, la coupe tombe
 * toujours ENTRE deux lignes, et un titre ne reste pas seul en bas de page.
 *
 * Vocabulaire :
 * - un « atome » est ce qui ne se coupe pas : un mot, une image, un filet ;
 * - une « ligne » regroupe les atomes qui se chevauchent verticalement ;
 * - une page est l'intervalle [start, end[ de la bande qu'elle montre.
 *
 * Unités : pixels CSS de la bande (cf. measure.js).
 */

/**
 * Regroupe les atomes en lignes.
 *
 * Deux atomes sont sur la même ligne s'ils se recouvrent sur plus de la moitié
 * du plus petit : un soulignement tombe dans son mot, alors que deux lignes de
 * texte consécutives — interligne 1,6 — ne se touchent pas.
 *
 * @param {Array<{top: number, bottom: number, keepWithNext?: boolean}>} atoms
 * @returns {Array<{top: number, bottom: number, keepWithNext: boolean}>}
 *   triées de haut en bas
 */
export function lineGroups(atoms) {
  const sorted = atoms
    .filter((a) => a.bottom > a.top)
    .sort((a, b) => a.top - b.top || a.bottom - b.bottom);
  const lines = [];
  for (const atom of sorted) {
    const line = lines[lines.length - 1];
    const overlap = line ? Math.min(line.bottom, atom.bottom) - Math.max(line.top, atom.top) : 0;
    const smallest = line ? Math.min(line.bottom - line.top, atom.bottom - atom.top) : 0;
    // Un bloc insécable (measure.js, `data-pdf-keep`) porte souvent son propre
    // titre : ce titre est déjà gardé avec son contenu, et la ligne qu'ils
    // forment ensemble ne doit pas se coller à la suivante — sinon une suite
    // de blocs titrés se tient tout entière et chaque page n'en montre qu'un.
    const keep = atom.role === 'keep';
    if (line && overlap > smallest / 2) {
      line.bottom = Math.max(line.bottom, atom.bottom);
      if (keep) line.keep = true;
      line.keepWithNext = !line.keep && (line.keepWithNext || !!atom.keepWithNext);
    } else {
      lines.push({
        top: atom.top,
        bottom: atom.bottom,
        keepWithNext: !keep && !!atom.keepWithNext,
        ...(keep ? { keep } : {}),
      });
    }
  }
  return lines;
}

/**
 * Découpe les lignes en pages de `pageHeight`.
 *
 * Une ligne qui déborde ouvre la page suivante, qui commence à son sommet :
 * la marge qui la précédait tombe avec la coupe, comme à l'impression. Les
 * titres (`keepWithNext`) qui la précèdent partent avec elle — jamais au point
 * de vider la page. Une ligne plus haute qu'une page reste seule sur la sienne.
 *
 * @param {Array<{top: number, bottom: number, keepWithNext: boolean}>} lines
 *   - triées (cf. lineGroups)
 * @param {number} pageHeight
 * @returns {Array<{start: number, end: number}>} au moins une page
 */
export function paginate(lines, pageHeight) {
  const starts = [0];
  let first = 0;
  for (let i = 0; i < lines.length; i++) {
    const pageStart = starts[starts.length - 1];
    if (i === first || lines[i].bottom - pageStart <= pageHeight) continue;
    let at = i;
    while (at - 1 > first && lines[at - 1].keepWithNext) at--;
    starts.push(lines[at].top);
    first = at;
    i = at;
  }
  return starts.map((start, k) => ({
    start,
    end: k + 1 < starts.length ? starts[k + 1] : Infinity,
  }));
}

/**
 * Page d'un atome : celle dont l'intervalle contient son sommet.
 *
 * @param {Array<{start: number, end: number}>} pages
 * @param {number} top
 * @returns {number} index de page
 */
export function pageIndexOf(pages, top) {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (pages[mid].start <= top) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Morceaux d'un élément qui se découpe (fond, bordure verticale) : sa part
 * visible sur chaque page qu'il traverse.
 *
 * @param {{top: number, bottom: number}} span
 * @param {Array<{start: number, end: number}>} pages
 * @param {number} pageHeight
 * @returns {Array<{page: number, top: number, bottom: number}>}
 */
export function slicesOf(span, pages, pageHeight) {
  const out = [];
  pages.forEach((page, index) => {
    const top = Math.max(span.top, page.start);
    const bottom = Math.min(span.bottom, page.end, page.start + pageHeight);
    if (bottom > top) out.push({ page: index, top, bottom });
  });
  return out;
}
