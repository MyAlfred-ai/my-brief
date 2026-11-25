---
title: Administration
description: Ce qu'un administrateur de l'instance myBrief règle depuis l'interface, rubrique par rubrique, et dans quel ordre.
sidebar:
  label: Vue d'ensemble
  order: 0
---

Ces pages sont réservées aux personnes qui administrent l'instance myBrief de leur organisation. Elles
suivent, autant que possible, les sujets de la documentation utilisateur : un sujet réglé ici renvoie à
sa page côté utilisateur.

## L'écran Administration

Le bouton **Admin**, sur la carte du compte — en bas de la colonne de gauche, à côté de **Réglages** ;
sur téléphone, votre avatar, en haut à droite, puis **Admin** —, ouvre l'administration. Le bouton
n'apparaît qu'aux comptes qui ont le rôle **Administrateur**.

La colonne de gauche devient le sommaire de l'administration : le **Tableau de bord**, en tête, puis
cinq **rubriques**, chacune avec ses **pages**. Un clic sur une rubrique la replie ou la déplie ; le pli
est mémorisé sur l'appareil. L'administration s'ouvre sur le **Tableau de bord** ; **Accueil**, au-dessus
du titre, la referme, comme la touche **Échap** — sauf quand vous tapez dans un champ, ou qu'une fenêtre
est ouverte par-dessus : Échap ferme alors la fenêtre, pas l'administration. Sur téléphone, le sommaire est le menu déroulant en haut du panneau, avec le nom
des rubriques en intertitres.

| Rubrique | Page | Ce qu'on y règle | Sujet |
|---|---|---|---|
| | **Tableau de bord** | Rien : il dit ce qui reste à régler, sur quelle page, et l'activité des 30 derniers jours | « Le Tableau de bord », ci-dessous |
| **Personnes** | **Comptes** | Les comptes, les rôles, les mots de passe | [Les utilisateurs](utilisateurs/index.md) |
| | **Groupes** | Les groupes d'utilisateurs, et qui est dans lequel | [Gérer les groupes](utilisateurs/gerer-les-groupes.md) |
| **Modèles IA** | **Clés API** | La clé OpenAI, et celles de Mistral, Speechmatics et AssemblyAI | [Enregistrer la clé OpenAI](ia/enregistrer-la-cle-openai.md) |
| | **Modèles** | Les modèles de rédaction et de transcription, l'infographie | [L'IA](ia/index.md) |
| **Capacités** | **Templates** | Les templates proposés à tous, et les templates fournis | [Les templates](templates/index.md) |
| | **Actions** | Les boutons après réunion, le compte relié, les limites d'envoi | [Les actions après réunion](actions/index.md) |
| | **Aide IA** | Ce que l'IA propose pendant une réunion : ses domaines, son mot d'appel, ce qu'elle signale d'elle-même | [L'Aide IA en réunion](aide-ia/index.md) |
| | **MyBrain** | Le myBrain de l'organisation, et qui lui envoie ses réunions | [L'envoi des réunions à myBrain](mybrain/index.md) |
| **Coûts** | **Crédit de temps** | Le crédit de temps du mois de chaque compte, dans l'ordre d'urgence | [Suivre le crédit de l'équipe](statistiques/suivre-le-credit-de-l-equipe.md) |
| | **Consommation** | L'usage de l'instance, compte par compte, ce qu'il coûte en IA, et le rapport PDF | [Les statistiques](statistiques/index.md) |
| **Organisation** | **Entreprise** | Le vocabulaire de l'organisation, les corrections automatiques de la transcription | [La configuration de l'instance](configuration/index.md) |
| | **Marque & apparence** | Le logo, la phrase d'accueil, les couleurs | [Personnaliser l'apparence](configuration/personnaliser-l-apparence.md) |
| | **Authentification** | La page de connexion, Google, Microsoft, les domaines autorisés | [La connexion](connexion/index.md) |

**Chercher un réglage.** Le champ **Rechercher un réglage…**, sous **Nouvelle réunion**, trouve un
réglage sans savoir dans quelle rubrique il est rangé : « logo », « clé openai », « sso »,
« smtp », « quota »… Ses résultats remplacent le sommaire, chacun avec son chemin, par exemple
« Organisation › Marque & apparence ». Un clic, ou **Entrée**, ouvre la page, déplie la tuile ou la
pastille du réglage et le fait clignoter un instant. La recherche couvre aussi vos réglages
personnels, marqués « Réglages › … » : on ne sait pas toujours si une chose se règle pour soi ou pour
toute l'organisation. Depuis **Réglages**, elle trouve de même les pages de l'administration. Le
raccourci **Ctrl K** — **⌘ K** sur Mac — mène au champ ; sur téléphone, il est en haut du menu
déroulant du panneau.

## Le Tableau de bord

L'administration s'ouvre sur cette page. Elle ne règle rien : elle dit ce qui reste à régler dans
l'organisation, et la page où le corriger, puis l'activité récente de l'instance.

**Points à régler.** Les constats du diagnostic — ceux des pastilles, décrites plus bas —, une ligne
chacun, du plus grave au plus léger. Chaque ligne porte :

- sa gravité, écrite : **Panne**, **Réglage sans effet** ou **Conseil** ;
- la phrase qui dit ce qui ne va pas, et ce que cela coûte ;
- un lien au nom du chemin de la page, par exemple « Modèles IA › Clés API » : il ouvre la page où le
  point se corrige.

Sans constat, la carte dit : « Rien à régler : l'installation est en ordre. »

**Activité des 30 derniers jours.** Trois chiffres : **Réunions**, **Temps enregistré** et **Comptes
actifs** — sous la forme « 7 sur 12 » : les comptes ouverts qui ont enregistré au moins une réunion sur
la période, sur l'ensemble des comptes ouverts. **Voir la consommation** ouvre **Coûts → Consommation**,
qui en donne le détail. Si les chiffres ne se chargent pas, la carte l'écrit — « Les chiffres ne sont pas
disponibles pour le moment. » — et les points à régler restent lisibles.

## Les pastilles : ce qui reste à régler

Une **pastille** sur le bouton **Admin** de la carte du compte signale qu'un réglage de l'organisation
est à revoir ; la même pastille marque ensuite, dans la colonne de gauche, la page où il se corrige —
ou sa rubrique, tant qu'elle est repliée. Survolez-la : une bulle dit ce qui ne va pas et ce que cela
coûte. Sur téléphone, la pastille est d'abord sur votre avatar, puis sur le bouton **Admin** de la
carte du compte, la phrase écrite sous les boutons ; dans l'administration, elle apparaît sur le menu
déroulant, et la phrase est écrite sous le nom de la page.

Le **Tableau de bord** dit la même chose en clair : toutes les phrases sur une seule page, sans survol,
chacune avec sa gravité écrite et le lien vers sa page.

| Couleur | Sens | Sur le Tableau de bord |
|---|---|---|
| Rouge | Une panne : quelque chose ne marche plus, pour tout le monde | **Panne** |
| Orange | Un réglage sans effet : un bouton proposé qui n'apparaîtra chez personne | **Réglage sans effet** |
| Bleu | Un conseil : rien n'est cassé, le résultat serait meilleur | **Conseil** |

| Page | Ce qui allume sa pastille |
|---|---|
| **Clés API** | Aucune clé OpenAI, ou une clé qu'OpenAI refuse ; la clé du fournisseur choisi sur **Modèles** pour transcrire ou rédiger — Mistral, Speechmatics, AssemblyAI — absente, ou refusée par lui |
| **Actions** | **Entreposer** proposé sans fournisseur choisi ; **Envoyer par mail** proposé alors que le serveur n'a pas de relais d'envoi et qu'aucun compte ne peut être relié |
| **MyBrain** | La clé ne peut plus être lue, myBrain la refuse, lui a retiré le droit « nourrir », ou ne répond pas |
| **Consommation** | Tarifs d'IA relevés il y a plus de trente jours |
| **Entreprise** | Vocabulaire de l'organisation vide |
| **Marque & apparence** | Logo, phrase d'accueil et couleurs d'origine |
| **Authentification** | Le fournisseur choisi dans **Actions** n'a pas ses identifiants : personne ne peut relier son compte |

La clé OpenAI et la connexion à myBrain sont réellement essayées, pas seulement lues. Une pastille
disparaît dès que vous enregistrez la correction. Après une correction faite hors de myBrief — un
serveur myBrain redémarré, par exemple —, rouvrez l'administration : elle suit dans les deux minutes.
Un incident passager, un service lent, n'allume jamais de pastille.

Le bouton **Réglages** porte, comme pour tout le monde, vos pastilles personnelles : votre compte relié,
vos dossiers de dépôt. Elles ne concernent que vous, et vous ne voyez pas celles de vos collègues.

## Mettre une instance en service

L'installation sur le serveur, puis les réglages sans lesquels personne ne peut se servir de myBrief —
votre mot de passe, la clé OpenAI, la connexion, les comptes —, se font dans cet ordre :
[L'installation](installation/index.md). Sur une instance déjà installée, commencez à
[Faire les réglages de base](installation/faire-les-reglages-de-base.md).

## Le principe à retenir

**Pour les actions après réunion, l'administration est un plafond, pas un défaut.** Ce que vous fermez,
un utilisateur ne peut pas le rouvrir ; ce que vous ouvrez, il l'affine dans vos limites. Pour le reste
— templates, vocabulaire, corrections de la transcription, apparence —, vos réglages s'appliquent à tous
les comptes.

## Enregistrer vos réglages

Les pages **Clés API**, **Modèles**, **Actions**, **MyBrain**, **Entreprise**, **Marque & apparence** et
**Authentification** ont une barre d'enregistrement en bas : « Modifications non enregistrées »,
**Annuler**, **Enregistrer**. Chaque page n'enregistre que ce qu'elle montre, et aucun avertissement ne
vous retient si vous changez de page sans enregistrer : une clé collée sur **Clés API** s'enregistre
avant d'aller choisir son modèle sur **Modèles**. **Comptes** et **Groupes** agissent immédiatement ;
chaque template s'enregistre à part.

Les autres comptes voient la plupart des changements au prochain chargement de myBrief.

## Ce que vous voyez, et ce que vous ne voyez pas

Vous voyez les comptes, leur dernière connexion et des volumes d'usage, par personne. Vous ne voyez
**jamais** le contenu des réunions de vos collègues : ni transcription, ni résumé, ni notes. Une réunion
envoyée à myBrain y est lue, elle, par les personnes qui valident sa revue — voir
[L'envoi des réunions à myBrain](mybrain/index.md).

Les réunions ne sont jamais supprimées automatiquement : chacun garde les siennes jusqu'à ce qu'il les
supprime, ou que son compte soit supprimé.

## Qui fait quoi

| Relève de votre organisation | Relève de MyAlfred |
|---|---|
| Comptes, rôles, connexion, domaines autorisés | Installation — voir [L'installation](installation/index.md) —, mises à jour, serveur, sauvegardes |
| Clé OpenAI et choix des modèles | Le relais d'envoi des mails du serveur |
| Actions, templates, vocabulaire, apparence | Les identifiants Microsoft Entra fournis au déploiement |
| Applications Google Cloud et Microsoft Entra de votre organisation | L'activation ou non de la connexion par mot de passe au niveau du serveur |
