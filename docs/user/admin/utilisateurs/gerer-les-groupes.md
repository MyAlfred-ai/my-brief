---
title: Gérer les groupes
description: Créer des groupes d'utilisateurs, y glisser les comptes, en retirer, leur donner un quota de minutes de réunion et le droit aux infographies, et comprendre le groupe par défaut.
sidebar:
  order: 4
---

**Administration → Groupes.**

Un groupe est un ensemble de comptes : un service, une équipe, un profil. Chaque compte est dans **au
moins un groupe**, et peut être dans plusieurs. Un groupe sert à se repérer, et porte des règles : le
**quota de minutes de réunion** de ses membres, et leur **droit de générer des infographies**.

L'onglet montre la colonne **Utilisateurs** à gauche, et une carte par groupe à droite. Chaque carte
porte la couleur du groupe, sa description, les initiales de ses premiers membres suivies de leur
nombre, son quota, et la pastille **Infographies** quand il en donne le droit.

## Le groupe par défaut

Un groupe **Défaut** existe dès l'installation, marqué **Par défaut** :

- tout nouveau compte y entre, qu'il soit créé par vous ou à une première connexion Google ou Microsoft ;
- un compte retiré de son dernier groupe y revient ;
- il se renomme et change de couleur, mais **ne se supprime pas**.

## Créer un groupe

1. Cliquez **+ Nouveau groupe**.
2. Renseignez :
   - **Nom du groupe** ;
   - **Description**, facultative : à quoi sert le groupe, qui doit y être ;
   - **Couleur** : la pastille qui marque le groupe sur les comptes. L'**Aperçu** montre la puce telle
     qu'elle s'affichera ;
   - **Minutes de réunion par mois** : **Illimité**, ou **Limité à** un nombre de minutes, voir
     ci-dessous ;
   - sous **Droits**, **Générer des infographies** : désactivé à la création, voir ci-dessous.
3. Cliquez **Enregistrer**. Le groupe s'ouvre sur ses membres, vides : ajoutez-les.

## Le quota de minutes de réunion

Chaque groupe fixe ce que ses membres peuvent enregistrer **par mois et par personne** : **Illimité**,
ou **Limité à** un nombre de minutes. La carte du groupe l'affiche, « 120 min / mois » ou
« Illimité ».

**Ce qui compte.** La durée de chaque réunion terminée, telle que le chronomètre l'a mesurée, comptée
dans le mois où la réunion a commencé — **même si elle a été supprimée depuis** : supprimer une réunion
ne rend pas ses minutes. Le compteur repart de zéro le 1er du mois à minuit, heure de Paris. Un
enregistrement où rien n'a été transcrit, que myBrief efface de lui-même à l'arrêt, ne décompte rien.
Un fichier importé non plus, mais l'import est refusé quand le quota est atteint.

**Un compte dans plusieurs groupes garde le quota le plus généreux**, et **Illimité** l'emporte. Pour
donner un quota de base à tout le monde, limitez le groupe par défaut ; pour en exempter quelques
personnes, mettez-les dans un groupe **Illimité**.

**Ce que voient les membres.** Un anneau autour de leur avatar, en bas de la colonne de gauche, et sous
leur nom « 1 h 15 restantes ». L'anneau descend en direct pendant une réunion, et passe du
vert à l'ambre sous la moitié, à l'orange sous un cinquième. Leur menu de compte détaille le mois
(**Ce mois-ci**) ; **Voir mes statistiques** ouvre **Mes statistiques**, avec la jauge du mois et une
alerte quand le rythme mènerait à l'épuisement avant le 1er. Quota atteint, il passe en rouge, **Démarrer** affiche **Quota atteint**, et un message donne la date du
renouvellement. Un quota relevé vaut aussitôt : le membre clique de nouveau sur **Démarrer**, sans
recharger la page. La réunion en cours n'est jamais coupée : le quota s'applique au démarrage, et une
réunion qui dépasse termine normalement.

Sans quota, pas d'anneau : sous le nom, l'adresse.

## Le droit aux infographies

Dans le formulaire du groupe, sous **Droits**, l'interrupteur **Générer des infographies** permet aux
membres de créer l'infographie d'un compte rendu. La carte du groupe porte alors la pastille
**Infographies**.

**Les droits s'additionnent.** Un compte a le droit dès qu'un seul de ses groupes le lui donne, comme il
garde le quota le plus généreux.

**Au départ, « Défaut » donne le droit**, et comme tout le monde y est, personne ne perd les
infographies. Un groupe créé ensuite naît sans le droit. Pour réserver les infographies à quelques
personnes, retirez le droit à « Défaut », puis donnez-le à leurs groupes.

**Ce que voient les membres sans le droit.** La case **Générer une infographie**, l'invitation **Créer
une infographie** et **Régénérer** disparaissent. Leurs infographies déjà créées restent visibles,
téléchargeables et supprimables.

**L'onglet IA passe avant.** Si **Proposer l'infographie** y est sur **Masquée**, personne ne génère
d'infographie, quels que soient les groupes. Le formulaire du groupe le rappelle quand vous donnez le
droit. Voir [Proposer l'infographie](../ia/proposer-l-infographie.md).

Cinquante groupes au plus ; le compteur, en haut de l'onglet, dit où vous en êtes.

## Mettre des comptes dans un groupe

**En glissant.** Dans la colonne **Utilisateurs**, chaque ligne est un compte ; ses pastilles de couleur
sont ses groupes. Glissez la ligne sur la carte d'un groupe. Pendant le geste, chaque carte dit ce
qu'elle fera : **Déposer ici** en pointillés si elle peut accueillir le compte, **Déjà dans ce groupe**
sinon. Sur la carte survolée, **Relâchez pour ajouter**. Le compte entre aussitôt dans le groupe : ses
initiales passent en tête de la carte, et un message le confirme en bas de l'écran. Il reste dans ses
autres groupes.

**Sans glisser**, au doigt sur un téléphone ou au clavier. Touchez le compte, ou **Entrée** : le
bandeau **Choisissez un groupe pour…** apparaît, et chaque carte qui peut l'accueillir propose
**Ajouter … ici**. Choisissez-la. **Annuler**, ou **Échap**, relâche le compte. Au clavier, **Entrée**
mène directement au premier groupe possible.

**Chercher un compte…**, en tête de la colonne, la filtre par nom ou adresse. La colonne charge les
200 premiers comptes par ordre d'adresse : au-delà, la recherche trouve les autres. Sur un écran
étroit, elle devient une bande qui défile de côté, au-dessus des cartes.

L'ajout n'a pas de confirmation : il se défait depuis le groupe, avec **Retirer**.

**Depuis le groupe.** Cliquez le nom du groupe, ou son nombre de membres. Sous **Ajouter un membre**,
tapez un nom ou une adresse : les comptes qui correspondent apparaissent, sans ceux qui sont déjà
membres. **Ajouter un membre** sur la ligne du compte l'inscrit aussitôt.

**Depuis le compte.** **Administration → Utilisateurs**, cliquez le compte : sous **Groupes**, cochez
ceux qu'il faut, puis **Enregistrer**. À la création d'un compte, le groupe par défaut est déjà coché.

## Retirer un compte d'un groupe

Dans le groupe, **Retirer** sur la ligne du compte. Le compte reste dans ses autres groupes. Si c'était
son dernier groupe, il revient dans le groupe par défaut : l'infobulle du bouton le dit avant le
geste. Dans le groupe par défaut, **Retirer** est grisé pour un compte qui n'a pas d'autre groupe.

Depuis la fiche du compte, décocher tous les groupes le laisse dans le groupe par défaut.

## Modifier ou supprimer un groupe

Le crayon, sur la carte ou en tête des membres, change le nom, la description, la couleur, le quota et
les droits.
Deux groupes ne peuvent pas porter le même nom. Un quota modifié s'applique aussitôt, y compris aux
minutes déjà consommées ce mois-ci.

La corbeille supprime le groupe. Les membres restent dans leurs autres groupes ; ceux qui n'en ont
pas d'autre reviennent dans le groupe par défaut. **Aucun compte n'est supprimé.**

## Ce que voient les utilisateurs

Chacun voit ses groupes dans son menu de compte, en cliquant son nom en bas de la colonne de gauche.
Il ne peut pas les changer.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Un groupe porte déjà ce nom. » | Choisissez un autre nom, ou retrouvez le groupe existant dans la liste. |
| « Le groupe par défaut ne se supprime pas. » | Renommez-le, ou videz-le en mettant ses membres ailleurs. |
| « Un des groupes choisis n'existe plus. Rechargez la page. » | Le groupe a été supprimé depuis un autre onglet : rechargez, puis refaites votre sélection. |
| « Indiquez un nombre de minutes, ou choisissez « Illimité ». » | **Limité à** attend un nombre entier de minutes ; zéro interdit tout enregistrement au groupe. |
| Un utilisateur dit qu'il ne peut plus enregistrer | Son compteur est à **Quota atteint** : relevez le quota de son groupe, ou mettez-le dans un groupe plus généreux. Le changement vaut tout de suite. |
| Un utilisateur a supprimé des réunions, et son compteur n'a pas bougé | C'est la règle : une réunion supprimée reste décomptée jusqu'au renouvellement. Pour lui rendre des minutes, relevez le quota de son groupe. |
| Un compte n'apparaît pas dans la liste **Utilisateurs** | Le filtre **Tous les groupes**, à côté de la recherche, est peut-être sur un groupe : remettez-le sur **Tous les groupes**. |
| Une carte refuse le compte qu'on glisse | Il est déjà dans ce groupe : la carte affiche **Déjà dans ce groupe**. |
| Un compte manque dans la colonne **Utilisateurs** | Au-delà de 200 comptes, tapez son nom dans **Chercher un compte…**. |
| Un utilisateur ne voit pas la case **Générer une infographie** | Aucun de ses groupes ne lui en donne le droit, ou l'onglet IA masque l'infographie. Donnez le droit à l'un de ses groupes, ou vérifiez **Proposer l'infographie**. |
