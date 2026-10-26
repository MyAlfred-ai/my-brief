---
title: Résoudre un problème
description: Les situations fréquentes, leur cause et ce qu'il faut faire — et vers quelle page aller.
sidebar:
  order: 99
---

## Pendant l'enregistrement

| Ce qui arrive | Cause probable, et quoi faire |
|---|---|
| Rien ne se transcrit | Le micro n'est pas autorisé, ou ce n'est pas le bon : autorisez-le dans le navigateur, puis vérifiez **Ma configuration → Réglages audio**. Voir [Enregistrer une réunion](enregistrement/enregistrer-une-reunion.md). |
| « Micro refusé : autorisez-le pour MyBrief dans les réglages du navigateur ou du téléphone, puis relancez l'enregistrement. » | Autorisez le micro dans les réglages du navigateur — ou du téléphone, pour l'application —, puis **Démarrer**. |
| « Le micro est déjà utilisé par une autre application. Fermez-la, puis réessayez. » | Une visio ou un dictaphone tient le micro : fermez-le, puis **Démarrer**. |
| « Aucun micro détecté… » | Branchez un micro, ou choisissez-en un autre dans **Ma configuration → Réglages audio**. |
| Vos interlocuteurs en visio n'apparaissent pas | Le partage d'écran n'a pas été fait avec son audio. Voir [Enregistrer une réunion en visio](enregistrement/enregistrer-une-reunion-en-visio.md) ; dans Firefox ou Safari, [Enregistrer une visio dans Firefox ou Safari](enregistrement/enregistrer-une-visio-dans-firefox-ou-safari.md). |
| La transcription est dans la mauvaise langue | La langue de l'interface est celle de la transcription. Voir [Changer la langue](configuration/changer-la-langue.md). |
| L'enregistrement s'est arrêté seul | La question « Toujours en réunion ? » est restée sans réponse, ou la limite de huit heures est atteinte. Voir [Reprendre une réunion interrompue](pause-et-fin/reprendre-une-reunion-interrompue.md). |
| L'onglet s'est fermé en pleine réunion | Rouvrez myBrief dans le même navigateur : **Reprendre**. Voir [Reprendre une réunion interrompue](pause-et-fin/reprendre-une-reunion-interrompue.md). |
| Sur téléphone, l'enregistrement s'est arrêté écran verrouillé | Dans le navigateur, gardez l'écran allumé. Voir [Enregistrer sur son téléphone](enregistrement/enregistrer-sur-son-telephone.md). |
| « ❌ Crédit d'IA épuisé — transcription suspendue » | Le crédit du service d'IA de votre organisation est épuisé : prévenez votre administrateur. |
| **Démarrer** affiche « Quota atteint » | Vos minutes de réunion du mois sont épuisées ; la ligne sous votre nom, en bas de la colonne de gauche — sur téléphone, le menu de votre avatar —, donne la date du renouvellement. Si votre administrateur a relevé votre quota, cliquez de nouveau sur **Démarrer**. Voir [L'enregistrement d'une réunion](enregistrement/index.md). |

## Le compte rendu

| Ce qui arrive | Cause probable, et quoi faire |
|---|---|
| Il ne correspond pas à ce que vous attendez | Dans l'ordre : corrigez la transcription, complétez vos notes, changez de template, puis **Nouveau résumé** — les versions précédentes restent. Voir [Les résumés](resumes/index.md). |
| Un nom propre est mal écrit | Corrigez-le dans la transcription, ou par une consigne dans les notes. Voir [Corriger un nom ou un sigle](notes/corriger-un-nom-ou-un-sigle.md). |
| Il ne contient pas les actions | Le template n'appelle pas la liste des actions : prenez **Standard**, ou ajoutez la pastille **📋 Actions** au vôtre. Voir [Choisir un template](templates/choisir-un-template.md). |
| La date n'est pas celle de la réunion | La pastille **📅 Date** donne la date de la génération. Voir [Les templates](templates/index.md). |
| Il est en anglais | L'interface était en anglais à la génération : repassez en français et régénérez. |
| Le texte du PDF ne se sélectionne pas | Le PDF a été préparé sans connexion : il est sorti en image de chaque page. Téléchargez-le à nouveau une fois connecté, ou copiez le texte depuis l'onglet **Résumé**. Voir [Télécharger un document](actions/telecharger-un-document.md). |

## Les réunions

| Ce qui arrive | Cause probable, et quoi faire |
|---|---|
| Les notes et les actions d'une ancienne réunion sont vides | Elle a été rangée par **Enregistrer** avant que myBrief ne les garde sans résumé : elles n'ont pas été enregistrées. Voir [Terminer une réunion](pause-et-fin/terminer-une-reunion.md). |
| Une action a disparu de la liste | Elle a été masquée : **Actions masquées**, sous les cartes, puis **Rétablir**. Voir [Corriger et compléter les actions](detection-d-actions/corriger-et-completer-les-actions.md). |
| « L'enregistrement des notes et des actions a échoué — vos dernières modifications ne sont pas sauvegardées. » | La connexion a lâché : vérifiez-la, puis retouchez vos notes ou une action pour relancer l'enregistrement. |
| Le titre que vous aviez choisi a changé | Chaque génération de résumé redonne un titre : renommez après la dernière. Voir [Renommer ou supprimer une réunion](historique/renommer-ou-supprimer-une-reunion.md). |
| Vous ne trouvez plus une réunion | La recherche porte sur le titre et tient compte des accents ; un filtre de tag est peut-être actif. Voir [Retrouver une réunion](historique/retrouver-une-reunion.md). |
| La même réunion apparaît deux fois | Elle a été reprise après une coupure. Voir [Reprendre une réunion interrompue](pause-et-fin/reprendre-une-reunion-interrompue.md). |

## L'envoi et le dépôt

| Ce qui arrive | Cause probable, et quoi faire |
|---|---|
| Le compte rendu n'est pas parti | Votre compte relié a expiré, ou l'accès a été retiré : reliez-le à nouveau. Le bouton **Tester l'envoi** nomme l'erreur. Voir [Tester l'envoi et le dépôt](actions/tester-l-envoi-et-le-depot.md). |
| Il n'est parti qu'à vous | Il est passé par le relais du serveur : reliez votre compte. Voir [Envoyer par mail](actions/envoyer-par-mail.md). |
| Il est parti aux mauvaises personnes | Vérifiez le tag de la réunion : la liste d'un tag remplace la vôtre. Voir [Les tags](tags/index.md). |
| Le dépôt échoue | Le compte n'a pas l'accès aux fichiers : **Reconnecter mon compte**. Voir [Entreposer un document](actions/entreposer-un-document.md). |
| Un bouton d'action n'apparaît pas | Votre administrateur ne l'a pas ouvert sur votre installation. |

## La connexion

| Ce qui arrive | Cause probable, et quoi faire |
|---|---|
| « Vous êtes déconnecté » | La session a expiré : **Se reconnecter**. Voir [Se connecter](connexion/se-connecter.md). |
| Mot de passe oublié | Voir [Gérer son mot de passe](connexion/gerer-son-mot-de-passe.md). |
| « Votre domaine email n'est pas autorisé sur cette application. » | Votre administrateur doit autoriser votre domaine, ou créer votre compte. |

Pour tout le reste : **Ma configuration → Déclarer un bug ou une idée**, ou l'administrateur de votre
organisation.
