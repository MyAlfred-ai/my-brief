/**
 * Destinataires d'un envoi d'action (lib/actions/recipients.js).
 *
 * Ce module est ce qui reste du garde-fou levé : l'envoi pouvait autrefois
 * n'atteindre QUE le titulaire du compte, il peut désormais atteindre des tiers.
 * Chaque test ici verrouille une des trois compensations — normalisation
 * stricte, plafond, copie systématique au compte connecté.
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeRecipients,
  resolveRecipients,
  MAX_RECIPIENTS_CEILING,
  DEFAULT_MAX_RECIPIENTS,
} from '../lib/actions/recipients.js';

describe('normalizeRecipients', () => {
  it('accepte des adresses ordinaires, en normalisant la casse', () => {
    const { recipients, rejected } = normalizeRecipients(['DG@Client.fr', ' compta@client.fr ']);
    expect(recipients).toEqual(['dg@client.fr', 'compta@client.fr']);
    expect(rejected).toEqual([]);
  });

  it('dédoublonne sans tenir compte de la casse', () => {
    // Deux graphies de la même boîte ne sont pas deux destinataires.
    const { recipients } = normalizeRecipients(['dg@client.fr', 'DG@CLIENT.FR']);
    expect(recipients).toEqual(['dg@client.fr']);
  });

  it("refuse une virgule — c'est le trou que le motif d'email ne bouche pas", () => {
    // `a@b.fr,victime` ne porte qu'un seul `@` : EMAIL_PATTERN le valide. Un
    // transport qui joindrait la liste en une chaîne y verrait deux
    // destinataires. C'est LE contrôle qui empêche la liste stockée de devenir
    // un vecteur d'injection d'en-tête.
    const { recipients, rejected } = normalizeRecipients(['compta@client.fr,victime']);
    expect(recipients).toEqual([]);
    expect(rejected).toEqual(['compta@client.fr,victime']);
  });

  it('refuse les caractères de structuration d’en-tête', () => {
    const suspects = [
      'a@b.fr;c@d.fr',
      '<a@b.fr>',
      '"a"@b.fr',
      'a@b.fr\r\nBcc: victime@ailleurs.com',
      'a@b.fr (commentaire)',
      'a@[10.0.0.1]',
    ];
    const { recipients, rejected } = normalizeRecipients(suspects);
    expect(recipients).toEqual([]);
    expect(rejected).toHaveLength(suspects.length);
  });

  it('refuse ce qui n’est pas une adresse', () => {
    const { recipients, rejected } = normalizeRecipients(['pas-une-adresse', 'a@b', '@b.fr', '']);
    expect(recipients).toEqual([]);
    // La chaîne vide est ignorée (une ligne blanche du formulaire), pas rejetée.
    expect(rejected).toEqual(['pas-une-adresse', 'a@b', '@b.fr']);
  });

  it('plafonne, et le dit', () => {
    const list = Array.from({ length: 5 }, (_, i) => `a${i}@client.fr`);
    const { recipients, truncated } = normalizeRecipients(list, { max: 3 });
    expect(recipients).toHaveLength(3);
    expect(truncated).toBe(true);
  });

  it("ne laisse pas l'administration dépasser le plafond dur", () => {
    const list = Array.from({ length: 40 }, (_, i) => `a${i}@client.fr`);
    const { recipients } = normalizeRecipients(list, { max: 999 });
    expect(recipients).toHaveLength(MAX_RECIPIENTS_CEILING);
  });

  it('tolère une entrée qui n’est pas une liste', () => {
    // Un document écrit par une version antérieure, ou modifié en base.
    expect(normalizeRecipients(undefined).recipients).toEqual([]);
    expect(normalizeRecipients('dg@client.fr').recipients).toEqual([]);
  });
});

describe('resolveRecipients', () => {
  const ACCOUNT = 'moi@client.fr';

  it('sans liste : le compte connecté, seul — le comportement d’avant', () => {
    expect(resolveRecipients({ stored: [], account: ACCOUNT })).toEqual({
      to: [ACCOUNT],
      cc: [],
      source: 'account',
    });
  });

  it('avec une liste : elle part en `to`, le compte connecté en copie', () => {
    // La copie systématique est ce qui garantit que personne ne peut faire
    // partir un document en son nom sans trace dans sa propre boîte.
    const resolved = resolveRecipients({ stored: ['compta@client.fr'], account: ACCOUNT });
    expect(resolved).toEqual({ to: ['compta@client.fr'], cc: [ACCOUNT], source: 'user' });
  });

  it('ne met pas le compte deux fois quand il figure déjà dans la liste', () => {
    const resolved = resolveRecipients({
      stored: ['MOI@client.fr', 'compta@client.fr'],
      account: ACCOUNT,
    });
    expect(resolved.to).toEqual(['moi@client.fr', 'compta@client.fr']);
    expect(resolved.cc).toEqual([]);
  });

  it('applique le plafond au moment de la résolution, pas seulement à la saisie', () => {
    // Un document écrit quand le plafond était plus haut ne doit pas le
    // contourner à l'envoi.
    const list = Array.from({ length: 8 }, (_, i) => `a${i}@client.fr`);
    const resolved = resolveRecipients({ stored: list, account: ACCOUNT, max: 2 });
    expect(resolved.to).toHaveLength(2);
    expect(resolved.cc).toEqual([ACCOUNT]);
  });

  it('a un plafond par défaut, même sans politique', () => {
    const list = Array.from({ length: 30 }, (_, i) => `a${i}@client.fr`);
    expect(resolveRecipients({ stored: list, account: ACCOUNT }).to).toHaveLength(
      DEFAULT_MAX_RECIPIENTS,
    );
  });

  // ── La couche « tag » ──────────────────────────────────────────────────────

  it('la liste du tag REMPLACE celle du compte — elle ne s’y ajoute pas', () => {
    // Cumuler enverrait le compte rendu d'un client aux interlocuteurs d'un
    // autre. C'est la fuite que cette règle empêche.
    const resolved = resolveRecipients({
      stored: ['interne@client.fr'],
      tagStored: ['dg@acme.com'],
      account: ACCOUNT,
    });
    expect(resolved).toEqual({ to: ['dg@acme.com'], cc: [ACCOUNT], source: 'tag' });
  });

  it('un tag sans liste laisse la liste du compte s’appliquer', () => {
    for (const tagStored of [undefined, null, []]) {
      const resolved = resolveRecipients({
        stored: ['interne@client.fr'],
        tagStored,
        account: ACCOUNT,
      });
      expect(resolved.to).toEqual(['interne@client.fr']);
      expect(resolved.source).toBe('user');
    }
  });

  it('le compte reste en copie derrière une liste de tag', () => {
    // La troisième compensation ne dépend pas de la couche qui a gagné.
    expect(resolveRecipients({ tagStored: ['dg@acme.com'], account: ACCOUNT }).cc).toEqual([
      ACCOUNT,
    ]);
    expect(
      resolveRecipients({ tagStored: ['dg@acme.com', 'MOI@client.fr'], account: ACCOUNT }).cc,
    ).toEqual([]);
  });

  it('une liste de tag entièrement invalide ne vaut pas « liste vide »… elle l’est', () => {
    // Rien d'exploitable dans la liste du tag ⇒ on retombe sur le compte, pas
    // sur un envoi à personne.
    const resolved = resolveRecipients({
      stored: [],
      tagStored: ['pas-une-adresse'],
      account: ACCOUNT,
    });
    expect(resolved).toEqual({ to: [ACCOUNT], cc: [], source: 'account' });
  });

  it('applique le plafond à la liste du tag comme aux autres', () => {
    const list = Array.from({ length: 8 }, (_, i) => `a${i}@acme.com`);
    expect(resolveRecipients({ tagStored: list, account: ACCOUNT, max: 2 }).to).toHaveLength(2);
  });
});
