// @vitest-environment jsdom
/**
 * Catalogue de tags + pose sur une conversation.
 *
 * Deux propriétés valent qu'on les verrouille : la pose est OPTIMISTE mais se
 * rétracte en cas d'échec (une pastille posée sur une base qui ne l'a pas
 * enregistrée ferait croire à un rangement inexistant), et supprimer un tag
 * détague immédiatement les conversations affichées.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const api = {
  fetchTags: vi.fn(),
  saveTag: vi.fn(),
  deleteTag: vi.fn(),
  setMeetingTag: vi.fn(),
};
vi.mock('../services/tagsApi.js', () => ({
  fetchTags: (...a) => api.fetchTags(...a),
  saveTag: (...a) => api.saveTag(...a),
  deleteTag: (...a) => api.deleteTag(...a),
  setMeetingTag: (...a) => api.setMeetingTag(...a),
}));
vi.mock('../services/apiClient.js', () => ({ post: vi.fn(async () => ({ ok: true, data: {} })) }));

const { historyItems } = await import('./history.js');
const {
  tags,
  tagColors,
  tagShapes,
  tagsMax,
  tagsById,
  loadTags,
  upsertTag,
  removeTag,
  tagMeeting,
  tagHueLightness,
  tagColorVars,
  tagShapeClip,
  tagHue,
  TAG_COLOR_FALLBACK,
  TAG_SHAPE_FALLBACK,
  TAG_HUE_LIGHTNESS,
} = await import('./tags.js');

const ok = (data) => ({ ok: true, status: 200, data });
const ko = (status, error) => ({ ok: false, status, data: { error } });

const TAG_A = { id: 't-1', label: 'Client Dupont', color: 'red' };
const TAG_B = { id: 't-2', label: 'Interne', color: 'blue' };

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(api)) fn.mockReset();
  tags.set([]);
  tagColors.set([TAG_COLOR_FALLBACK]);
  tagShapes.set([TAG_SHAPE_FALLBACK]);
  tagHueLightness.set(TAG_HUE_LIGHTNESS);
  tagsMax.set(0);
  historyItems.set([
    { meetingId: 'm-1', title: 'Point produit' },
    { meetingId: 'm-2', title: 'Client Dupont', tagId: 't-1' },
  ]);
});

describe('loadTags', () => {
  it('remplit liste, palette, formes et plafond depuis le serveur', async () => {
    api.fetchTags.mockResolvedValue(
      ok({ tags: [TAG_A], colors: ['red', 'blue'], shapes: ['circle', 'star'], max: 20 }),
    );
    const res = await loadTags();
    expect(res.ok).toBe(true);
    expect(get(tags)).toEqual([TAG_A]);
    expect(get(tagColors)).toEqual(['red', 'blue']);
    expect(get(tagShapes)).toEqual(['circle', 'star']);
    expect(get(tagsMax)).toBe(20);
  });

  it('un serveur sans formes (version antérieure) laisse le rond seul', async () => {
    api.fetchTags.mockResolvedValue(ok({ tags: [], colors: ['red'], max: 20 }));
    await loadTags();
    expect(get(tagShapes)).toEqual([TAG_SHAPE_FALLBACK]);
  });

  it('prend les bornes de clarté du serveur, et garde les précédentes sans elles', async () => {
    api.fetchTags.mockResolvedValue(
      ok({ tags: [], colors: ['red'], hueLightness: { min: 30, max: 70, default: 55 }, max: 20 }),
    );
    await loadTags();
    expect(get(tagHueLightness)).toEqual({ min: 30, max: 70, default: 55 });
    api.fetchTags.mockResolvedValue(ok({ tags: [], colors: ['red'], hueLightness: { min: 1 } }));
    await loadTags();
    expect(get(tagHueLightness)).toEqual({ min: 30, max: 70, default: 55 });
  });

  it('un échec ne vide pas la liste déjà affichée', async () => {
    tags.set([TAG_A]);
    api.fetchTags.mockResolvedValue(ko(500, 'boom'));
    const res = await loadTags();
    expect(res).toEqual({ ok: false, error: 'boom' });
    expect(get(tags)).toEqual([TAG_A]);
  });

  it('tagsById résout par id', async () => {
    api.fetchTags.mockResolvedValue(ok({ tags: [TAG_A, TAG_B] }));
    await loadTags();
    expect(get(tagsById).get('t-2')).toEqual(TAG_B);
    expect(get(tagsById).get('inconnu')).toBeUndefined();
  });
});

describe('upsertTag', () => {
  it('ajoute le tag renvoyé par le serveur', async () => {
    api.saveTag.mockResolvedValue(ok({ tag: TAG_A }));
    const res = await upsertTag({ label: 'Client Dupont', color: 'red' });
    expect(res.ok).toBe(true);
    expect(get(tags)).toEqual([TAG_A]);
  });

  it('remplace le tag existant au lieu de le dupliquer', async () => {
    tags.set([TAG_A]);
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG_A, label: 'Dupont SA', color: 'teal' } }));
    await upsertTag({ id: 't-1', label: 'Dupont SA', color: 'teal' });
    expect(get(tags)).toHaveLength(1);
    expect(get(tags)[0]).toMatchObject({ id: 't-1', label: 'Dupont SA', color: 'teal' });
  });

  it('garde l’ordre alphabétique du serveur après un renommage', async () => {
    tags.set([TAG_A, TAG_B]);
    api.saveTag.mockResolvedValue(ok({ tag: { ...TAG_B, label: 'Alpha' } }));
    await upsertTag({ id: 't-2', label: 'Alpha', color: 'blue' });
    expect(get(tags).map((t) => t.label)).toEqual(['Alpha', 'Client Dupont']);
  });

  it('remonte le slug du serveur sans rien changer localement', async () => {
    tags.set([TAG_A]);
    api.saveTag.mockResolvedValue(ko(409, 'duplicate_label'));
    const res = await upsertTag({ label: 'client dupont', color: 'blue' });
    expect(res).toEqual({ ok: false, error: 'duplicate_label' });
    expect(get(tags)).toEqual([TAG_A]);
  });

  it('slug `network` quand la requête n’aboutit pas', async () => {
    api.saveTag.mockResolvedValue({ ok: false, status: 0, data: null });
    expect(await upsertTag({ label: 'X', color: 'red' })).toEqual({ ok: false, error: 'network' });
  });
});

describe('removeTag', () => {
  it('retire le tag ET détague les conversations affichées', async () => {
    tags.set([TAG_A, TAG_B]);
    api.deleteTag.mockResolvedValue(ok({ ok: true, untagged: 1 }));
    const res = await removeTag('t-1');
    expect(res).toEqual({ ok: true, untagged: 1 });
    expect(get(tags)).toEqual([TAG_B]);
    expect(get(historyItems).find((m) => m.meetingId === 'm-2').tagId).toBe(null);
  });

  it('un échec ne retire rien', async () => {
    tags.set([TAG_A]);
    api.deleteTag.mockResolvedValue(ko(404, 'tag_not_found'));
    const res = await removeTag('t-1');
    expect(res).toEqual({ ok: false, error: 'tag_not_found' });
    expect(get(tags)).toEqual([TAG_A]);
    expect(get(historyItems).find((m) => m.meetingId === 'm-2').tagId).toBe('t-1');
  });
});

describe('tagMeeting', () => {
  it('pose le tag immédiatement, avant la réponse du serveur', async () => {
    let resolveCall;
    api.setMeetingTag.mockReturnValue(new Promise((r) => (resolveCall = r)));
    const pending = tagMeeting('m-1', 't-1');

    // La requête n'a pas encore répondu : la pastille est déjà là.
    expect(get(historyItems).find((m) => m.meetingId === 'm-1').tagId).toBe('t-1');
    resolveCall(ok({ ok: true }));
    expect((await pending).ok).toBe(true);
  });

  it('retire le tag avec null', async () => {
    api.setMeetingTag.mockResolvedValue(ok({ ok: true }));
    await tagMeeting('m-2', null);
    expect(get(historyItems).find((m) => m.meetingId === 'm-2').tagId).toBe(null);
    expect(api.setMeetingTag).toHaveBeenCalledWith('m-2', null);
  });

  it('restaure la valeur précédente si le serveur refuse', async () => {
    api.setMeetingTag.mockResolvedValue(ko(404, 'tag_not_found'));
    const res = await tagMeeting('m-2', 't-9');
    expect(res).toEqual({ ok: false, error: 'tag_not_found' });
    // m-2 portait 't-1' : elle le retrouve, elle ne se retrouve pas sans tag.
    expect(get(historyItems).find((m) => m.meetingId === 'm-2').tagId).toBe('t-1');
  });

  it('restaure l’absence de tag si le serveur refuse une première pose', async () => {
    api.setMeetingTag.mockResolvedValue(ko(500, 'boom'));
    await tagMeeting('m-1', 't-1');
    expect(get(historyItems).find((m) => m.meetingId === 'm-1').tagId).toBe(null);
  });

  it('ne touche pas les autres conversations', async () => {
    api.setMeetingTag.mockResolvedValue(ok({ ok: true }));
    await tagMeeting('m-1', 't-1');
    expect(get(historyItems).find((m) => m.meetingId === 'm-2').tagId).toBe('t-1');
  });

  it('refuse sans meetingId — pas d’appel réseau', async () => {
    const res = await tagMeeting(null, 't-1');
    expect(res).toEqual({ ok: false, error: 'meeting_not_found' });
    expect(api.setMeetingTag).not.toHaveBeenCalled();
  });
});

describe('tagColorVars', () => {
  it('renvoie les variables CSS de la couleur', () => {
    tagColors.set(['slate', 'red']);
    expect(tagColorVars('red')).toEqual({
      dot: 'var(--tag-red)',
      soft: 'var(--tag-red-soft)',
      fill: 'var(--tag-red-fill, var(--tag-red))',
    });
  });

  it('une pastille à motif peint son `-fill` ; texte et traits gardent la teinte unie', () => {
    tagColors.set(['slate', 'blue-stripes']);
    const vars = tagColorVars('blue-stripes');
    expect(vars.fill).toBe('var(--tag-blue-stripes-fill, var(--tag-blue-stripes))');
    expect(vars.dot).toBe('var(--tag-blue-stripes)');
  });

  it('retombe sur le repli pour une couleur sans jeton — jamais de pastille transparente', () => {
    tagColors.set(['slate', 'red']);
    expect(tagColorVars('fuchsia')).toEqual({
      dot: `var(--tag-${TAG_COLOR_FALLBACK})`,
      soft: `var(--tag-${TAG_COLOR_FALLBACK}-soft)`,
      fill: `var(--tag-${TAG_COLOR_FALLBACK}-fill, var(--tag-${TAG_COLOR_FALLBACK}))`,
    });
  });

  it('compose une couleur libre sans clarté avec les jetons de clarté et de chroma — unie, fill = dot', () => {
    tagColors.set(['slate']);
    const vars = tagColorVars('hue-210');
    expect(vars.dot).toBe('oklch(var(--tag-hue-l) var(--tag-hue-c) 210)');
    expect(vars.fill).toBe(vars.dot);
    expect(vars.soft).toBe(
      'oklch(var(--tag-hue-l) var(--tag-hue-c) 210 / var(--tag-hue-soft-alpha))',
    );
  });

  it('une clarté dans le slug remplace le jeton', () => {
    tagColors.set(['slate']);
    const vars = tagColorVars('hue-210-45');
    expect(vars.dot).toBe('oklch(45% var(--tag-hue-c) 210)');
    expect(vars.soft).toBe('oklch(45% var(--tag-hue-c) 210 / var(--tag-hue-soft-alpha))');
    expect(vars.fill).toBe(vars.dot);
  });

  it('une couleur libre mal formée retombe sur le repli, pas sur un oklch cassé', () => {
    tagColors.set(['slate']);
    const bad = ['hue-360', 'hue-07', 'hue-', 'hue-abc', 'hue-210-34', 'hue-210-69', 'hue-210-5'];
    for (const color of bad) {
      expect(tagColorVars(color).dot, color).toBe(`var(--tag-${TAG_COLOR_FALLBACK})`);
    }
  });
});

describe('tagHue', () => {
  it('lit l’angle et la clarté d’une couleur libre, null pour tout le reste', () => {
    const { min, max } = TAG_HUE_LIGHTNESS;
    expect(tagHue('hue-0')).toEqual({ hue: 0, lightness: null });
    expect(tagHue('hue-359')).toEqual({ hue: 359, lightness: null });
    expect(tagHue('hue-210-45')).toEqual({ hue: 210, lightness: 45 });
    expect(tagHue(`hue-210-${min}`)).toEqual({ hue: 210, lightness: min });
    expect(tagHue(`hue-210-${max}`)).toEqual({ hue: 210, lightness: max });
    expect(tagHue('hue-360')).toBe(null);
    expect(tagHue('hue-07')).toBe(null);
    expect(tagHue(`hue-210-${min - 1}`)).toBe(null);
    expect(tagHue(`hue-210-${max + 1}`)).toBe(null);
    expect(tagHue('hue-210-045')).toBe(null);
    expect(tagHue('blue')).toBe(null);
    expect(tagHue(undefined)).toBe(null);
  });

  it('les bornes servies par le serveur font foi pour la clarté', () => {
    tagHueLightness.set({ min: 20, max: 90, default: 50 });
    expect(tagHue('hue-10-25')).toEqual({ hue: 10, lightness: 25 });
    expect(tagHue('hue-10-19')).toBe(null);
  });

  it('la copie locale des bornes est identique à celle du serveur', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const route = readFileSync(
      join(here, '..', '..', 'services', 'api', 'routes', 'tags.js'),
      'utf8',
    );
    const m = route.match(
      /export const TAG_HUE_LIGHTNESS = \{ min: (\d+), max: (\d+), default: (\d+) \};/,
    );
    expect(m, 'TAG_HUE_LIGHTNESS introuvable dans routes/tags.js').toBeTruthy();
    expect(TAG_HUE_LIGHTNESS).toEqual({
      min: Number(m[1]),
      max: Number(m[2]),
      default: Number(m[3]),
    });
  });
});

describe('tagShapeClip', () => {
  it('renvoie le clip-path de la forme', () => {
    tagShapes.set(['circle', 'star']);
    expect(tagShapeClip('star')).toBe('var(--tag-shape-star)');
  });

  it('retombe sur le rond pour une forme inconnue ou absente (tag d’avant les formes)', () => {
    tagShapes.set(['circle', 'star']);
    expect(tagShapeClip('blob')).toBe(`var(--tag-shape-${TAG_SHAPE_FALLBACK})`);
    expect(tagShapeClip(undefined)).toBe(`var(--tag-shape-${TAG_SHAPE_FALLBACK})`);
  });
});
