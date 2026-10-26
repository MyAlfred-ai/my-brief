/**
 * Le jeu de données FICTIF des captures : Camille Martin, le projet Atlas de Durand Logistique,
 * huit réunions. Tout est inventé — personnes, entreprise, projet.
 *
 *   node docs/tech/captures/donnees-fictives.mjs    (lancé par lancer.sh, API démarrée)
 *
 * L'API doit avoir démarré une fois : ses index uniques existent alors, et le jeu s'y plie.
 * Les dates se calculent depuis aujourd'hui, pour que l'historique retombe toujours dans les
 * mêmes groupes : « Cette semaine », « Semaine dernière », puis le mois.
 * Idempotent : l'utilisatrice est vidée puis reconstruite à chaque passage.
 */
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Le pilote Mongo est une dépendance de l'API, pas de la racine du dépôt.
const { MongoClient } = createRequire(new URL('../../../services/api/', import.meta.url))('mongodb');

const MONGO_URL = process.env.MONGO_URL ?? 'mongodb://root:captures@127.0.0.1:27018/mybrief?authSource=admin';
// L'identité que simule vite.config.local.js. Son adresse ne doit pas paraître à l'écran (d'où le
// quota posé plus bas) ; son nom, si :
// /api/init nommerait l'utilisatrice d'après son adresse, d'où le nom posé ici.
const EMAIL = 'dev@myalfred.ai';
const NOM = 'Camille Martin';

const iso = (d) => d.toISOString();
/** Aujourd'hui moins `jours`, à l'heure dite (heure locale). */
function jour(jours, heure, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  d.setHours(heure, minute, 0, 0);
  return d;
}
const plus = (d, secondes) => new Date(d.getTime() + secondes * 1000);
const pad = (n) => String(n).padStart(2, '0');
const jjmmaaaa = (d) => `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const aaaammjj = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const duree = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
const jourLong = (d) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

const owner = { email: EMAIL, emailLower: EMAIL.toLowerCase() };

// ─── Tags ────────────────────────────────────────────────────────────────────
const tag = (label, color) => ({
  ...owner, id: randomUUID(), label, labelLower: label.toLowerCase(), color,
  createdAt: iso(jour(40, 9)), updatedAt: iso(jour(40, 9)),
});
const ATLAS = tag('Projet Atlas', 'violet');
const DURAND = tag('Client Durand', 'blue');
const INTERNE = tag('Interne', 'green');

// ─── La réunion ouverte sur la capture ──────────────────────────────────────
const debut = jour(0, 9, 30);
const secondes = 52 * 60 + 10;
const fin = plus(debut, secondes);
const dansJours = (j) => { const d = new Date(debut); d.setDate(d.getDate() + j); return d; };

const actions = [
  { id: 1, title: 'Envoyer le planning révisé au comité', owner: 'Camille Martin', dueDate: aaaammjj(dansJours(1)),
    description: "Avec le report de l'export comptable à la version suivante.", show: true },
  { id: 2, title: 'Ouvrir l’accès au serveur de test', owner: 'Sophie Bernard', dueDate: aaaammjj(dansJours(4)),
    description: "Pour que l'équipe installe la version de recette.", show: true },
  { id: 3, title: 'Préparer le cahier de recette', owner: 'Julien Moreau', dueDate: aaaammjj(dansJours(7)),
    description: 'Scénarios du suivi des commandes, pour les cinq utilisateurs pilotes.', show: true },
];

// La forme que produit le template Standard (src/config/templates.js) : informations, points
// clés, décisions, puis les actions en puces.
const resumeAtlas = [
  '<h2>📋 Informations</h2>',
  '<ul>',
  `<li><strong>Date :</strong> ${jjmmaaaa(fin)}</li>`,
  `<li><strong>Durée :</strong> ${duree(secondes)}</li>`,
  `<li><strong>Auteur :</strong> ${NOM}</li>`,
  '<li><strong>Participants :</strong> Camille Martin, Julien Moreau, Sophie Bernard (Durand Logistique)</li>',
  '</ul>',
  '<h2>🎯 Points clés</h2>',
  '<ul>',
  `<li><strong>Planning :</strong> la mise en ligne du portail client est maintenue au ${jourLong(dansJours(21))}. La recette commence le ${jourLong(dansJours(7))}.</li>`,
  "<li><strong>Périmètre :</strong> le suivi des commandes passe en priorité ; l'export comptable glisse à la version suivante.</li>",
  "<li><strong>Risque :</strong> l'accès au serveur de test reste à ouvrir chez Durand Logistique.</li>",
  '</ul>',
  '<h2>✅ Décisions</h2>',
  '<ul>',
  '<li>Recette sur deux semaines, avec cinq utilisateurs pilotes, un par agence.</li>',
  "<li>Point d'avancement chaque lundi à 9 h 30, jusqu'à la mise en ligne.</li>",
  '</ul>',
  '<h2>📌 Actions</h2>',
  '<ul>',
  ...actions.map((a) => [
    `<li><strong>${a.title}</strong><ul>`,
    `<li>Responsable : ${a.owner}</li>`,
    `<li>Date d'échéance : ${a.dueDate.split('-').reverse().join('/')}</li>`,
    `<li>Description : ${a.description}</li>`,
    '</ul></li>',
  ].join('')),
  '</ul>',
].join('');

// Une ligne [Nom] par prise de parole : celles au nom de l'utilisatrice sont les siennes
// (src/utils/transcriptAttribution.js).
const transcriptionAtlas = [
  '[Camille Martin]', 'Bonjour à tous. On fait le point sur le portail client : le planning, le périmètre, puis les risques.',
  '[Julien Moreau]', "Côté développement, le suivi des commandes est terminé. L'export comptable, lui, ne sera pas prêt pour la mise en ligne.",
  '[Sophie Bernard]', "Pour nous, le suivi des commandes est la priorité. L'export peut attendre la version suivante.",
  '[Camille Martin]', "Très bien, on sort l'export du périmètre de la première version. Julien, tu peux préparer le cahier de recette ?",
  '[Julien Moreau]', 'Oui, pour lundi prochain, avec les scénarios du suivi des commandes.',
  '[Sophie Bernard]', "Il faudra que j'ouvre l'accès au serveur de test. Je m'en occupe cette semaine.",
  '[Camille Martin]', "Parfait. On part sur deux semaines de recette avec cinq utilisateurs pilotes, un par agence. J'envoie le planning révisé au comité demain.",
  '[Sophie Bernard]', "Ça me va. On garde le point du lundi matin jusqu'à la mise en ligne ?",
  '[Camille Martin]', 'Oui, chaque lundi à 9 h 30. Merci à tous.',
].join('\n');

// ─── L'historique ────────────────────────────────────────────────────────────
// Des titres courts : au-delà de vingt-deux signes, la colonne de gauche les coupe.
function reunion({ title, jours, heure, minute = 0, minutes, tagId, html, transcription, actions: acts = [], notes = '' }) {
  const start = jour(jours, heure, minute);
  const s = minutes * 60;
  const end = plus(start, s);
  return {
    meetingId: randomUUID(), ...owner, name: NOM, title,
    lastConnecion: iso(start), now: iso(end), meetingStartTime: iso(start),
    // Sans meetingDurationSource, le démarrage de l'API recalcule la durée (lib/bootstrap.js).
    meetingDuration: s, meetingDurationSource: 'timer',
    status: 'ended', language: 'fr', template: 'standard',
    resume: html,
    versions: [{ id: `v_${randomUUID().slice(0, 8)}`, html, template: 'standard', ton: null, longueur: null, customPrompt: null, generatedAt: iso(end) }],
    transcription, transcriptionChars: transcription.length,
    actions: acts, notes, ...(tagId ? { tagId } : {}),
  };
}
const court = (points) => `<h2>🎯 Points clés</h2><ul>${points.map((p) => `<li>${p}</li>`).join('')}</ul>`;
const dialogue = (...lignes) => lignes.join('\n');

const reunions = [
  reunion({
    title: 'Comité de pilotage', jours: 0, heure: 9, minute: 30, minutes: 52, tagId: ATLAS.id,
    html: resumeAtlas, transcription: transcriptionAtlas, actions,
    notes: "Relancer le service informatique de Durand pour l'accès VPN.\nPrévoir une démonstration au comité de direction début octobre.",
  }),
  reunion({
    title: 'Point hebdo commercial', jours: 3, heure: 14, minutes: 35, tagId: INTERNE.id,
    html: court(['Trois propositions en cours de signature.', 'Salon professionnel : stand confirmé.']),
    transcription: dialogue('[Camille Martin]', 'On commence par les propositions en cours.', '[Thomas Petit]', 'Trois sont en signature cette semaine.'),
  }),
  reunion({
    title: 'Découverte – Durand', jours: 5, heure: 10, minutes: 64, tagId: DURAND.id,
    html: court(['Suivi des commandes attendu par les agences.', 'Export comptable souhaité, sans échéance.']),
    transcription: dialogue('[Camille Martin]', 'Qu’attendent vos agences du portail ?', '[Sophie Bernard]', 'Avant tout, suivre leurs commandes en temps réel.'),
  }),
  reunion({
    title: 'Revue budgétaire T4', jours: 10, heure: 16, minutes: 45, tagId: INTERNE.id,
    html: court(['Budget tenu à 96 %.', 'Deux recrutements reportés au premier trimestre.']),
    transcription: dialogue('[Léa Robert]', 'Le budget est tenu à 96 %.', '[Camille Martin]', 'Et les recrutements ?'),
  }),
  reunion({
    title: 'Atelier ergonomie', jours: 11, heure: 9, minutes: 90, tagId: ATLAS.id,
    html: court(['Parcours de commande simplifié en trois écrans.', 'Tests avec deux chauffeurs la semaine prochaine.']),
    transcription: dialogue('[Nicolas Richard]', 'Le parcours actuel demande sept écrans.', '[Camille Martin]', 'Visons trois.'),
  }),
  reunion({
    title: 'Rétrospective du sprint 14', jours: 12, heure: 11, minutes: 40,
    html: court(['Livraison tenue.', 'À améliorer : les revues de code du vendredi.']),
    transcription: dialogue('[Julien Moreau]', 'On a tout livré.', '[Camille Martin]', 'Qu’est-ce qu’on change pour le prochain ?'),
  }),
  reunion({
    title: 'Lancement d’Atlas', jours: 18, heure: 15, minutes: 70, tagId: ATLAS.id,
    html: court(['Objectifs et jalons validés.', 'Comité de pilotage toutes les deux semaines.']),
    transcription: dialogue('[Camille Martin]', 'Bienvenue à tous pour le lancement.', '[Sophie Bernard]', 'Merci, on est impatients.'),
  }),
  reunion({
    title: 'Réunion fournisseurs', jours: 24, heure: 10, minute: 30, minutes: 50,
    html: court(['Deux devis comparés.', 'Décision attendue fin du mois.']),
    transcription: dialogue('[Camille Martin]', 'Comparons les deux devis.', '[Thomas Petit]', 'Le second livre plus vite.'),
  }),
];

// ─── Écriture ───────────────────────────────────────────────────────────────
const client = new MongoClient(MONGO_URL);
await client.connect();
const db = client.db('mybrief');
const maintenant = new Date().toISOString();

// /api/init retrouve l'utilisateur par { email }, casse comprise : même chaîne que l'en-tête.
await db.collection('user').updateOne(
  { email: EMAIL },
  {
    $set: { emailLower: owner.emailLower, name: NOM, role: 'user', disabled: false, mustChangePassword: false, updatedAt: maintenant },
    $setOnInsert: { authProviders: ['oidc'], createdAt: maintenant, lastConnecion: null },
  },
  { upsert: true },
);
// Un quota sur le groupe par défaut (créé par l'API au démarrage) : la capsule de compte montre
// alors l'anneau du crédit et « … restantes ». Sans quota, elle afficherait l'ADRESSE — celle de
// l'identité simulée, qui n'a pas sa place dans une image publiée.
await db.collection('userGroups').updateOne({ id: 'default' }, { $set: { meetingMinutesPerMonth: 600 } });
await db.collection('resume').deleteMany({ emailLower: owner.emailLower });
await db.collection('userTags').deleteMany({ emailLower: owner.emailLower });
await db.collection('userTags').insertMany([ATLAS, DURAND, INTERNE]);
await db.collection('resume').insertMany(reunions);
await client.close();

console.log(`Données fictives : ${NOM}, ${reunions.length} réunions, 3 tags.`);
