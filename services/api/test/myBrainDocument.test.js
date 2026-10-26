/**
 * Ce que myBrain reçoit d'une réunion (lib/myBrain/document.js).
 *
 * Garanties tenues ici :
 *   - le texte porte ce que l'utilisateur a demandé : titre, date et heure,
 *     auteur, tag, notes, actions, compte rendu et transcription ;
 *   - le nom de l'outil n'y figure JAMAIS — myBrain en faisait une entité ;
 *   - au-delà de 120 000 caractères, la transcription est découpée aux fins de
 *     ligne, chaque partie reprend l'en-tête, et rien ne se perd entre deux ;
 *   - le découpage est déterministe : une reprise retombe sur les mêmes parties.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMyBrainDeposits,
  htmlToText,
  formatMeetingDuration,
  MYBRAIN_TEXT_MAX,
} from '../lib/myBrain/document.js';

const meeting = (over = {}) => ({
  meetingId: 'm-1',
  title: 'Budget 2026 priorités',
  // 12:30 UTC = 14:30 à Paris (heure d'été).
  meetingStartTime: '2026-09-15T12:30:00.000Z',
  lastConnecion: '2026-09-15T12:30:00.000Z',
  meetingDuration: 3900,
  transcription: '[Alex] On valide le budget.\n[Marie] Je relance le fournisseur vendredi.',
  notes: 'INITECH s’écrit en capitales.',
  resume: '<h2>Décisions</h2><ul><li>Budget validé à 12&nbsp;000 &euro;</li></ul>',
  actions: [
    {
      id: 1,
      title: 'Relancer le fournisseur',
      owner: 'Marie',
      dueDate: '2026-09-18',
      description: 'Confirmer le devis',
      show: true,
    },
    { id: 2, title: 'Action masquée', owner: 'Paul', show: false },
    // Textes de remplacement enregistrés par les anciennes versions de l'écran.
    {
      id: 3,
      title: 'Nouvelle action',
      owner: 'À définir',
      description: "Description de l'action...",
    },
    { id: 4, title: 'Commander les badges', owner: 'À définir', dueDate: '' },
  ],
  ...over,
});

const context = {
  authorName: 'Alex Dupont',
  authorEmail: 'alex@client.fr',
  tagLabel: 'Client Dupont',
};

describe('htmlToText', () => {
  it('garde la structure du compte rendu : titres, puces, gras', () => {
    const text = htmlToText(
      '<h1>Titre</h1><p>Un <strong>point</strong> clé.</p><ul><li>A</li><li>B</li></ul>',
    );
    expect(text).toContain('### Titre');
    expect(text).toContain('Un **point** clé.');
    expect(text).toMatch(/- A\n- B/);
    expect(text).not.toMatch(/<[^>]+>/);
  });

  it('décode les entités, sans décoder deux fois', () => {
    expect(htmlToText('<p>12&nbsp;000 &euro; &amp; &lt;b&gt; &#233;t&#xE9; &amp;lt;</p>')).toBe(
      '12 000 &euro; & <b> été &lt;',
    );
  });

  it('rend un tableau en lignes lisibles', () => {
    const text = htmlToText(
      '<table><tr><th>Action</th><th>Qui</th></tr><tr><td>Devis</td><td>Marie</td></tr></table>',
    );
    expect(text).toContain('Action | Qui');
    expect(text).toContain('Devis | Marie');
  });

  it('laisse passer tel quel un texte sans balise', () => {
    expect(htmlToText('## Déjà du Markdown\n- point')).toBe('## Déjà du Markdown\n- point');
  });
});

describe('formatMeetingDuration', () => {
  it('écrit une durée lisible, et rien pour une durée inconnue', () => {
    expect(formatMeetingDuration(3900)).toBe('1 h 05');
    expect(formatMeetingDuration(2520)).toBe('42 min');
    expect(formatMeetingDuration(7200)).toBe('2 h');
    expect(formatMeetingDuration(null)).toBe('');
    expect(formatMeetingDuration(0)).toBe('');
  });
});

describe('buildMyBrainDeposits — une réunion ordinaire', () => {
  const [deposit, ...others] = buildMyBrainDeposits(meeting(), context);

  it('un seul dépôt, titré avec sa date, adressé à son auteur', () => {
    expect(others).toHaveLength(0);
    expect(deposit.titre).toBe('Budget 2026 priorités — réunion du 15/09/2026');
    expect(deposit.pour).toBe('alex@client.fr');
  });

  it('porte les métadonnées demandées : date et heure, durée, auteur, tag', () => {
    expect(deposit.texte).toMatch(/^# Budget 2026 priorités\n/);
    expect(deposit.texte).toContain('15 septembre 2026');
    expect(deposit.texte).toContain('14:30');
    expect(deposit.texte).toContain('(heure de Paris)');
    expect(deposit.texte).toContain('- Durée : 1 h 05');
    expect(deposit.texte).toContain('- Auteur : Alex Dupont (alex@client.fr)');
    expect(deposit.texte).toContain('- Tag : Client Dupont');
  });

  it('porte les notes, les actions visibles, le compte rendu et la transcription', () => {
    expect(deposit.texte).toContain('## Notes de réunion\n\nINITECH s’écrit en capitales.');
    expect(deposit.texte).toContain(
      '- **Relancer le fournisseur** — responsable : Marie — échéance : 2026-09-18\n  Confirmer le devis',
    );
    expect(deposit.texte).toContain('- **Commander les badges**');
    expect(deposit.texte).toContain('### Décisions');
    expect(deposit.texte).toContain('## Transcription intégrale\n\n[Alex] On valide le budget.');
  });

  it("n'envoie ni les actions masquées, ni les textes de remplacement", () => {
    expect(deposit.texte).not.toContain('Action masquée');
    expect(deposit.texte).not.toContain('Nouvelle action');
    expect(deposit.texte).not.toContain('À définir');
    expect(deposit.texte).not.toContain("Description de l'action");
  });

  it("ne nomme jamais l'outil : myBrain pose lui-même la provenance", () => {
    expect(deposit.texte.toLowerCase()).not.toContain('mybrief');
    expect(deposit.titre.toLowerCase()).not.toContain('mybrief');
  });
});

describe('buildMyBrainDeposits — cas limites', () => {
  it("une réunion sans rien à apprendre n'est pas déposée", () => {
    expect(
      buildMyBrainDeposits(
        meeting({ transcription: '', notes: '  ', resume: '', actions: [] }),
        context,
      ),
    ).toEqual([]);
  });

  it('une réunion sans titre prend sa date et son heure pour titre', () => {
    const [deposit] = buildMyBrainDeposits(meeting({ title: 'Réunion sans titre' }), context);
    expect(deposit.titre).toBe('Réunion du 15/09/2026 à 14:30');
    expect(deposit.texte).toMatch(/^# Réunion du 15\/09\/2026 à 14:30\n/);
  });

  it("sans adresse, pas de destinataire de revue ; sans nom, l'adresse seule", () => {
    const [noEmail] = buildMyBrainDeposits(meeting(), { authorName: 'Alex' });
    expect(noEmail).not.toHaveProperty('pour');
    const [noName] = buildMyBrainDeposits(meeting(), { authorEmail: 'alex@client.fr' });
    expect(noName.texte).toContain('- Auteur : alex@client.fr');
  });

  it('sans tag ni durée, les lignes correspondantes disparaissent', () => {
    const [deposit] = buildMyBrainDeposits(meeting({ meetingDuration: null }), {
      authorEmail: 'alex@client.fr',
    });
    expect(deposit.texte).not.toContain('- Tag :');
    expect(deposit.texte).not.toContain('- Durée :');
  });
});

describe('buildMyBrainDeposits — une longue réunion', () => {
  // ~300 000 caractères : trois parties au plafond réel de myBrain.
  const lines = Array.from({ length: 3000 }, (_, i) =>
    `[Intervenant ${i % 7}] Réplique ${i} : ${'discussion détaillée '.repeat(4)}`.trim(),
  );
  const transcription = lines.join('\n');
  const deposits = buildMyBrainDeposits(meeting({ transcription }), context);

  it('découpe en parties sous le plafond de myBrain', () => {
    expect(deposits.length).toBeGreaterThan(1);
    for (const deposit of deposits)
      expect(deposit.texte.length).toBeLessThanOrEqual(MYBRAIN_TEXT_MAX);
  });

  it('numérote chaque partie, et chacune reprend date et auteur', () => {
    deposits.forEach((deposit, index) => {
      expect(deposit.titre).toBe(
        `Budget 2026 priorités — réunion du 15/09/2026 (partie ${index + 1} sur ${deposits.length})`,
      );
      expect(deposit.texte).toContain('15 septembre 2026');
      expect(deposit.texte).toContain('- Auteur : Alex Dupont (alex@client.fr)');
      expect(deposit.pour).toBe('alex@client.fr');
    });
  });

  it('notes, actions et compte rendu ne voyagent qu’avec la première partie', () => {
    expect(deposits[0].texte).toContain('## Notes de réunion');
    for (const deposit of deposits.slice(1)) {
      expect(deposit.texte).not.toContain('## Notes de réunion');
      expect(deposit.texte).toContain('## Transcription intégrale (suite)');
    }
  });

  it("aucune prise de parole n'est coupée ni perdue entre deux parties", () => {
    const rebuilt = deposits
      .map((deposit) => deposit.texte.split(/## Transcription intégrale(?: \(suite\))?\n\n/)[1])
      .join('\n');
    expect(rebuilt).toBe(transcription);
  });

  it('rend les mêmes parties à chaque appel', () => {
    expect(buildMyBrainDeposits(meeting({ transcription }), context)).toEqual(deposits);
  });

  it('au-delà du nombre de parties admis, la fin est coupée et le texte le dit', () => {
    const capped = buildMyBrainDeposits(meeting({ transcription }), { ...context, maxParts: 2 });
    expect(capped).toHaveLength(2);
    expect(capped[1].titre).toContain('(partie 2 sur 2)');
    expect(capped[1].texte).toContain('n’a pas été envoyée');
  });

  const chunkOf = (deposit) =>
    deposit.texte.split(/## Transcription intégrale(?: \(suite\))?\n\n/)[1];

  it('rejouer les coupes : un compte rendu régénéré entre deux essais ne déplace aucune frontière', () => {
    const cuts = deposits.map((deposit) => deposit.end);
    const regenerated = meeting({
      transcription,
      resume: `<p>${'Un compte rendu bien plus développé. '.repeat(200)}</p>`,
    });

    // Recalculé, le découpage GLISSE : la partie 1 laisse moins de place à la
    // transcription — c'est le défaut qu'évite le rejeu.
    const fresh = buildMyBrainDeposits(regenerated, context);
    expect(fresh.map((deposit) => deposit.end)).not.toEqual(cuts);

    const replayed = buildMyBrainDeposits(regenerated, { ...context, cuts });
    expect(replayed.map((deposit) => deposit.end)).toEqual(cuts);
    expect(replayed.slice(1).map(chunkOf)).toEqual(deposits.slice(1).map(chunkOf));
  });

  it('rejouer les coupes : du texte ajouté après coup est signalé, jamais glissé ailleurs', () => {
    const cuts = deposits.map((deposit) => deposit.end);
    const grown = meeting({ transcription: `${transcription}\n[Alex] Une dernière chose.` });
    const replayed = buildMyBrainDeposits(grown, { ...context, cuts });
    expect(replayed).toHaveLength(deposits.length);
    expect(replayed.at(-1).texte).toContain('n’a pas été envoyée');
    expect(replayed.at(-1).texte).not.toContain('Une dernière chose');
  });
});
