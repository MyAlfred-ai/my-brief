---
title: Gérer les groupes
description: Créer des groupes d'utilisateurs, y placer les comptes, en retirer, leur donner un quota de minutes de réunion, le droit aux infographies et à l'Aide IA, et comprendre les groupes Défaut et Admin.
sidebar:
  order: 4
---

**Administration → Personnes → Groupes.**

Un groupe est un ensemble de comptes : un service, une équipe, un profil. Chaque compte est dans **un
seul groupe** : le mettre dans un autre l'enlève du premier. Un groupe sert à se repérer, et porte des
règles : le **quota de minutes de réunion** de ses membres, leur **droit de générer des
infographies**, et leurs **droits sur l'Aide IA**.

La page montre la colonne **Utilisateurs** à gauche, et une carte par groupe à droite. Chaque carte
porte la couleur du groupe, sa description, les initiales de ses premiers membres suivies de leur
nombre, son quota, et une pastille par droit qu'il donne : **Infographies**, **Aide IA** ou
**Aide IA + myBrain**.

## Le groupe par défaut

Un groupe **Défaut** existe dès l'installation, marqué **Par défaut** :

- tout nouveau compte y entre, qu'il soit créé par vous ou à une première connexion Google ou Microsoft ;
- un compte retiré de son groupe y revient, de même que les membres d'un groupe supprimé ;
- il se renomme et change de couleur, mais **ne se supprime pas**.

## Le groupe des administrateurs

Un groupe **Admin** existe aussi dès l'installation, marqué **Administrateurs**. Il naît **Illimité** et
avec le droit aux infographies :

- un compte qui **devient administrateur** y entre : créé avec le rôle **Administrateur**, ou passé
  **Administrateur** dans sa fiche ;
- un administrateur qui **redevient utilisateur** en sort pour le groupe par défaut ;
- il se renomme, change de couleur, de quota et de droits, mais **ne se supprime pas**.

C'est un placement par défaut, pas une obligation : vous pouvez ensuite mettre un administrateur dans
un autre groupe, ou un utilisateur dans celui-ci. Un administrateur que vous avez placé ailleurs y
reste s'il redevient utilisateur.

## Créer un groupe

1. Cliquez **+ Nouveau groupe**.
2. Renseignez :
   - **Nom du groupe** ;
   - **Description**, facultative : à quoi sert le groupe, qui doit y être ;
   - **Couleur** : la pastille qui marque le groupe sur les comptes. L'**Aperçu** montre la puce telle
     qu'elle s'affichera ;
   - **Minutes de réunion par mois** : **Illimité**, ou **Limité à** un nombre de minutes, voir
     ci-dessous ;
   - sous **Droits**, **Générer des infographies**, **Aide IA en réunion** et **Aide IA avec
     myBrain** : désactivés à la création, voir ci-dessous.
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

**Chaque membre a le quota de son groupe**, pour lui seul : changer quelqu'un de groupe change son
quota. Pour donner un quota de base à tout le monde, limitez le groupe par défaut ; pour en exempter
quelques personnes, mettez-les dans un groupe **Illimité**.

**Ce que voient les membres.** Un anneau autour de leur avatar, en bas de la colonne de gauche, et sous
leur nom « 1 h 15 restantes ». L'anneau descend en direct pendant une réunion, et passe du
vert à l'ambre sous la moitié, à l'orange sous un cinquième. **Réglages → Usage & crédits** détaille le
mois, avec la jauge et une alerte quand le rythme mènerait à l'épuisement avant le 1er ; sur téléphone,
la carte du compte, ouverte par l'avatar, le résume (**Ce mois-ci**), et **Voir le détail** y mène.
Quota atteint, l'anneau passe en rouge, **Démarrer** affiche **Quota atteint**, et un message donne la
date du renouvellement. Un quota relevé vaut aussitôt : le membre clique de nouveau sur **Démarrer**, sans
recharger la page. La réunion en cours n'est jamais coupée : le quota s'applique au démarrage, et une
réunion qui dépasse termine normalement.

Sans quota, pas d'anneau : sous le nom, l'adresse.

## Le droit aux infographies

Dans le formulaire du groupe, sous **Droits**, l'interrupteur **Générer des infographies** permet aux
membres de créer l'infographie d'un compte rendu. La carte du groupe porte alors la pastille
**Infographies**.

Un compte a le droit quand **son groupe** le lui donne.

**Au départ, « Défaut » et « Admin » donnent le droit.** Un groupe créé ensuite naît sans le droit.
Pour réserver les infographies à quelques personnes, retirez le droit à « Défaut », puis donnez-le à
leurs groupes.

**Ce que voient les membres sans le droit.** La tuile **Infographie** de la carte de génération,
l'invitation **Créer une infographie** et **Régénérer** disparaissent. Leurs infographies déjà créées restent visibles,
téléchargeables et supprimables.

**La page Modèles passe avant.** Si **Proposer l'infographie** y est sur **Masquée**, personne
ne génère d'infographie, quels que soient les groupes. Le formulaire du groupe le rappelle quand vous
donnez le droit. Voir [Proposer l'infographie](../ia/proposer-l-infographie.md).

## Les droits de l'Aide IA

Sous **Droits**, deux interrupteurs :

| Droit | Ce qu'il donne aux membres |
|---|---|
| **Aide IA en réunion** | Activer l'Aide IA pendant leurs réunions. La carte du groupe porte la pastille **Aide IA** |
| **Aide IA avec myBrain** | Leur Aide IA lit le wiki partagé de myBrain — le même accès pour tout le groupe. La pastille devient **Aide IA + myBrain** |

Le second ne s'allume que si le premier l'est : éteindre **Aide IA en réunion** éteint l'autre.

**Au départ, aucun groupe n'a ces droits**, « Défaut » et « Admin » compris : c'est vous qui les
donnez. Un compte les a quand **son groupe** les lui donne.

**Ce que voient les membres sans le droit.** Rien : ni la carte **Aide IA** de l'écran d'accueil, ni sa
pastille dans la barre d'une réunion.

**La page Aide IA passe avant.** Un domaine coupé dans **Administration → Capacités → Aide IA**
n'apparaît chez personne, quels que soient les groupes ; et **Aide IA avec myBrain** ne sert à rien
tant que la clé de myBrain n'a pas le droit **lire**. Voir [L'Aide IA en réunion](../aide-ia/index.md).

Cinquante groupes au plus ; le compteur, en haut de la page, dit où vous en êtes.

## Mettre des comptes dans un groupe

**En glissant.** Dans la colonne **Utilisateurs**, chaque ligne est un compte ; sa pastille de couleur
est son groupe. Glissez la ligne sur la carte d'un groupe. Pendant le geste, chaque carte dit ce
qu'elle fera : **Déposer ici** en pointillés si elle peut accueillir le compte, **Déjà dans ce groupe**
sinon. Sur la carte survolée, **Relâchez pour placer**. Le compte change aussitôt de groupe : ses
initiales passent en tête de la nouvelle carte, quittent l'ancienne, et un message le confirme en bas
de l'écran.

**Sans glisser**, au doigt sur un téléphone ou au clavier. Touchez le compte, ou **Entrée** : le
bandeau **Choisissez un groupe pour…** apparaît, et chaque carte qui peut l'accueillir propose
**Placer … ici**. Choisissez-la. **Annuler**, ou **Échap**, relâche le compte. Au clavier, **Entrée**
mène directement au premier groupe possible.

**Chercher un compte…**, en tête de la colonne, la filtre par nom ou adresse. La colonne charge les
200 premiers comptes par ordre d'adresse : au-delà, la recherche trouve les autres. Sur un écran
étroit, elle devient une bande qui défile de côté, au-dessus des cartes.

Le déplacement n'a pas de confirmation : il se défait en reposant le compte sur son ancien groupe.

**Depuis le groupe.** Cliquez le nom du groupe, ou son nombre de membres. Sous **Ajouter un membre**,
tapez un nom ou une adresse : les comptes qui correspondent apparaissent, sans ceux qui sont déjà
membres, chacun avec son groupe actuel (**Actuellement dans**). **Ajouter un membre** sur la ligne du
compte l'y fait passer aussitôt : il quitte son groupe actuel.

**Depuis le compte.** **Administration → Personnes → Comptes**, cliquez le compte : sous **Groupe**,
choisissez le sien, puis **Enregistrer**. À la création d'un compte, le groupe par défaut est déjà
choisi. Passer le **Rôle** à **Administrateur** choisit le groupe des administrateurs, revenir à
**Utilisateur** le groupe par défaut : vous pouvez encore en choisir un autre avant d'enregistrer.

## Retirer un compte d'un groupe

Dans le groupe, **Retirer** sur la ligne du compte : il revient dans le groupe par défaut, l'infobulle
du bouton le dit avant le geste. Dans le groupe par défaut, **Retirer** est grisé : on n'en sort qu'en
rejoignant un autre groupe.

## Modifier ou supprimer un groupe

Le crayon, sur la carte ou en tête des membres, change le nom, la description, la couleur, le quota et
les droits.
Deux groupes ne peuvent pas porter le même nom. Un quota modifié s'applique aussitôt, y compris aux
minutes déjà consommées ce mois-ci.

La corbeille supprime le groupe. Ses membres reviennent dans le groupe par défaut. **Aucun compte
n'est supprimé.** Les groupes **Défaut** et **Admin** n'ont pas de corbeille.

## Ce que voient les utilisateurs

Chacun voit son groupe dans **Réglages → Mon profil**, sous **Votre groupe**. Il ne peut pas le
changer.

## En cas de problème

| Ce qui arrive | Quoi faire |
|---|---|
| « Un groupe porte déjà ce nom. » | Choisissez un autre nom, ou retrouvez le groupe existant dans la liste. |
| « Le groupe par défaut ne se supprime pas. » | Renommez-le, ou videz-le en mettant ses membres ailleurs. |
| « Le groupe des administrateurs ne se supprime pas. » | Renommez-le, ou videz-le en mettant ses membres ailleurs. |
| « Le groupe choisi n'existe plus. Rechargez la page. » | Le groupe a été supprimé depuis un autre onglet : rechargez, puis refaites votre choix. |
| Un nouvel administrateur a un crédit illimité | Il est entré dans le groupe des administrateurs, illimité au départ. Mettez-le dans un autre groupe, ou limitez **Admin**. |
| « Indiquez un nombre de minutes, ou choisissez « Illimité ». » | **Limité à** attend un nombre entier de minutes ; zéro interdit tout enregistrement au groupe. |
| Un utilisateur dit qu'il ne peut plus enregistrer | Son compteur est à **Quota atteint** : relevez le quota de son groupe, ou mettez-le dans un groupe plus généreux. Le changement vaut tout de suite. |
| Un utilisateur a supprimé des réunions, et son compteur n'a pas bougé | C'est la règle : une réunion supprimée reste décomptée jusqu'au renouvellement. Pour lui rendre des minutes, relevez le quota de son groupe. |
| Un compte n'apparaît pas dans la liste de la page **Comptes** | Le filtre **Tous les groupes**, à côté de la recherche, est peut-être sur un groupe : remettez-le sur **Tous les groupes**. |
| Une carte refuse le compte qu'on glisse | Il est déjà dans ce groupe : la carte affiche **Déjà dans ce groupe**. |
| Un compte manque dans la colonne **Utilisateurs** | Au-delà de 200 comptes, tapez son nom dans **Chercher un compte…**. |
| Un utilisateur ne voit pas la tuile **Infographie** | Son groupe ne lui en donne pas le droit, ou la page **Modèles** masque l'infographie. Donnez le droit à son groupe, mettez-le dans un groupe qui l'a, ou vérifiez **Proposer l'infographie**. |
