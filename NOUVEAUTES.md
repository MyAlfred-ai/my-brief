# Nouveautés de MyBrief

Ce que lisent les utilisateurs quand ils cliquent sur le numéro de version, en
bas à droite de l'écran (popup « Quoi de neuf ? »). Source unique, écrite à la
main : ni les sujets de commit, ni `CHANGELOG.md`, qui reste l'histoire
détaillée destinée à l'équipe.

**Quand écrire** — dans le même commit que l'évolution, et seulement si un
utilisateur ou un administrateur voit la différence :

- fonctionnalité nouvelle → **ajouter** une entrée en tête ;
- fonctionnalité déjà annoncée → **enrichir** son entrée. C'est le cas le plus
  fréquent : une entrée couvre volontiers cinq commits.

Outillage, déploiement, dette technique, correctif d'une fonctionnalité pas
encore arrivée en production : rien à écrire. Le numéro de version avance à
chaque commit ; la liste, elle, ne bouge que par ce fichier.

**Forme** :

```markdown
## Titre court, à hauteur d'utilisateur
<!-- id: slug-stable | genre: nouveaute | pour: tous -->

Une à trois phrases.

### en: Short English title

Optional English text.
```

- `id` : minuscules, chiffres, tirets. **Stable à vie** : c'est lui qui date
  l'entrée (premier commit où il apparaît) et qui allume la pastille « non
  lu ». Le changer re-date l'entrée.
- `genre` : `nouveaute`, `amelioration` ou `correctif`.
- `pour` : `tous` ou `administrateurs`. Ne filtre rien, ajoute une pastille.
- `date`, `version` : facultatives, lues dans l'historique git. À écrire à la
  main seulement pour les entrées antérieures à ce fichier.
- `### en:` : traduction facultative ; sans elle, l'interface anglaise affiche
  le texte français.

**Écriture** :

- dire ce que la personne **peut faire**, jamais ce qui a été codé ;
- aucun nom de fichier, de route, de modèle d'IA ni de réglage interne ;
- un correctif se raconte par son **symptôme**, jamais par sa cause ;
- nommer les écrans comme ils s'affichent (« Ma configuration → Mes tags ») ;
- titre de 80 caractères au plus, texte de 400 au plus.

L'ordre du fichier fait foi, la plus récente en tête. Les 10 premières sont
publiées, les suivantes restent ici comme mémoire du produit. Vérifier une
retouche : `npx vitest run scripts/whats-new.test.mjs`.

---

## Aide IA : moins d'idées, et mieux choisies
<!-- id: aide-ia-idees-espacees | genre: amelioration | pour: tous -->

La boîte à idées de l'Aide IA se fait rare : au plus une idée toutes les dix minutes, toutes les cinq en interventions « Soutenues », aucune en « Discrètes ». Elle attend que la réunion soit lancée, part du sujet qui vous occupe depuis plusieurs minutes, et se tait plutôt que de redire une idée ou d'énoncer une banalité.

### en: AI Help: fewer ideas, better chosen

The AI Help idea box now speaks up rarely: one idea every ten minutes at most, every five with "Frequent" interventions, none with "Discreet". It waits until the meeting is under way, works from the topic you have been on for several minutes, and stays silent rather than repeat an idea or state the obvious.

## Aide IA : un tag retient le projet de ses réunions
<!-- id: aide-ia-tag-projet | genre: amelioration | pour: tous -->

Quand l'Aide IA connaît le projet d'une réunion taguée, elle propose de relier le tag à sa fiche dans myBrain. Un clic sur « Relier », et les réunions suivantes avec ce tag partent directement sur le bon projet : plus de question, plus d'homonymes à départager.

### en: AI Help: a tag remembers its meetings' project

When AI Help knows the project of a tagged meeting, it offers to link the tag to its myBrain sheet. One click on "Link", and the next meetings with this tag start straight on the right project: no more question, no more look-alikes to choose from.

## Un logo pour chaque tag, et une fiche plus simple
<!-- id: tags-logo-fiche | genre: nouveaute | pour: tous -->

Dans Réglages → Mes tags, déposez le logo du client ou du projet : il se pose en médaillon sur l'infographie et en tête du compte rendu PDF. La fiche du tag s'enregistre au fil de vos gestes : le nom se modifie sur place, la couleur en un clic, et le rangement et l'envoi tiennent sur une ligne.

### en: A logo for every tag, and a simpler tag page

In Settings → My tags, drop the client's or project's logo: it appears as a medallion on the infographic and at the top of the PDF report. The tag page saves as you go: rename in place, change the colour in one click, and filing and sending fit on one line each.

## Trouvez et créez vos tags d'un geste
<!-- id: tags-recherche-creation | genre: amelioration | pour: tous -->

Le menu qui range une réunion cherche dans le nom de vos tags et dans ce que vous avez écrit sur eux : tapez le nom d'une cliente, le tag de son projet apparaît. Un nom inconnu ? « Créer » le crée et y range la réunion. Les tags de vos dernières réunions passent en tête.

### en: Find and create your tags in one go

The menu that files a meeting searches your tag names and what you wrote about them: type a client's name and her project's tag shows up. Unknown name? "Create" makes the tag and files the meeting in it. Tags from your latest meetings come first.

## Dites à l'IA de quoi parle un tag
<!-- id: contexte-des-tags | genre: nouveaute | pour: tous -->

Dans Réglages → Mes tags, chaque tag a un champ « Que doit savoir l'IA ? » : le projet, ses acteurs et leurs rôles, les sigles. Comptes rendus, infographie et Aide IA d'une réunion taguée s'en servent pour comprendre de quoi on parle, sans rien ajouter qui n'ait été dit. Pendant l'enregistrement, un nom ou un sigle écorché par la transcription est rétabli tel que vous l'avez écrit.

### en: Tell the AI what a tag is about

In Settings → My tags, every tag has a "What should the AI know?" field: the project, its people and their roles, the acronyms. Reports, the infographic and AI Help for a tagged meeting use it to understand what is being discussed, without adding anything that was not said. While recording, a name or acronym the transcript mangles is restored as you wrote it.

## L'extension Chrome s'installe sans accroc et annonce ses mises à jour
<!-- id: extension-chrome-mises-a-jour | genre: amelioration | pour: tous -->

Sous Windows, « Extraire tout » sur le fichier .zip donne directement le dossier à choisir dans Chrome. Quand une nouvelle version de l'extension existe, Réglages → Outils → Extension Chrome l'annonce et la propose. Sur un autre ordinateur, le menu de l'extension offre de lui redonner accès à votre MyBrief d'un clic.

### en: The Chrome extension installs smoothly and announces its updates

On Windows, "Extract All" on the .zip file gives you the folder to pick in Chrome straight away. When a new version of the extension is out, Settings → Tools → Chrome extension says so and offers it. On another computer, the extension's menu lets you give it back access to your MyBrief in one click.

## Une réunion terminée peut reprendre
<!-- id: reprendre-reunion-terminee | genre: nouveaute | pour: tous -->

Arrêtée trop tôt, coupée par le déjeuner, ou qui continue le lendemain : « Reprendre », juste après l'arrêt, ou « Reprendre l'enregistrement », en bas de la transcription d'une réunion rouverte, relance l'enregistrement. La suite s'ajoute à la même réunion, et un seul compte rendu couvre le tout.

### en: A finished meeting can resume

Stopped too early, interrupted by lunch, or continued the next day: "Resume", right after stopping, or "Resume recording", at the bottom of a reopened meeting's transcript, starts recording again. What follows is added to the same meeting, and a single summary covers it all.

## Le compte rendu en PDF, à votre marque
<!-- id: pdf-resume-charte | genre: amelioration | pour: tous -->

Le PDF du compte rendu — téléchargé, joint à un mail ou déposé sur un Drive — porte le logo de votre entreprise en tête et vos couleurs en dégradé discret : en haut de chaque page, sous le titre et devant les intertitres. Le texte reste noir sur blanc, et le logo de myBrief signe le pied de page.

### en: Your PDF summary, in your brand

The PDF summary — downloaded, attached to an email or saved to a Drive — carries your company logo at the top and your colours as a subtle gradient: across each page, under the title and beside headings. Text stays black on white, and the myBrief logo signs the footer.

## Après une pause, le micro et la transcription repartent tout de suite
<!-- id: reprise-apres-pause | genre: correctif | pour: tous -->

Après une longue pause — un café, l'ordinateur mis en veille, le casque éteint entre-temps —, « Reprendre » retrouve le son du micro et la transcription dès les premiers mots. La pause elle-même n'est plus notée « Enregistrement interrompu » dans la transcription.

### en: After a break, the microphone and transcript come back right away

After a long break — coffee, the computer gone to sleep, the headset switched off in the meantime — "Resume" picks up the microphone and the transcript from the very first words. The break itself is no longer marked as "Recording interrupted" in the transcript.

## Infographies : six mises en page à votre marque, sur une page A4
<!-- id: infographie-gabarits | genre: nouveaute | pour: tous -->

L'infographie, toujours sur une page A4, choisit la mise en page qui convient à la réunion — Synthèse, Décision, Feuille de route, Tableau de bord, Atelier ou Bilan — avec dégradés, pictogrammes et graphiques. Elle porte le logo de votre entreprise et vos couleurs, ses textes sont exacts, et elle arrive bien plus vite. Les anciennes restent consultables et téléchargeables.

### en: Infographics: six branded layouts, on one A4 page

The infographic, always on one A4 page, picks the layout that suits the meeting — Overview, Decision, Roadmap, Dashboard, Workshop or Review — with gradients, icons and charts. It carries your company's logo and colours, its text is exact, and it arrives much faster. Older infographics can still be viewed and downloaded.

## Le logo de votre entreprise sur les infographies
<!-- id: logo-entreprise-infographies | genre: nouveaute | pour: administrateurs -->

Marque & apparence propose désormais deux logos : celui de l'application et celui de votre entreprise, qui ouvre chaque infographie. Tant qu'il manque, une pastille le signale et le logo de l'application le remplace.

### en: Your company logo on infographics

Brand & appearance now offers two logos: the application's and your company's, which opens every infographic. While it is missing, a badge flags it and the application logo stands in.

## Aide IA : un minuteur à l'écran, sur simple demande
<!-- id: aide-ia-minuteur | genre: nouveaute | pour: tous -->

Demandez-le à l'Aide IA, à voix haute ou par écrit : « Alfred, lance un minuteur de cinq minutes pour la pause ». Le décompte s'affiche au-dessus de la transcription ; « ajoute deux minutes » ou « arrête le minuteur » le changent, sa croix l'arrête. À zéro, une courte mélodie — à écouter et à régler dans Réglages → Pendant la réunion → Aide IA.

### en: AI Help: an on-screen timer, just by asking

Ask AI Help, aloud or in writing: “Alfred, start a five-minute timer for the break”. The countdown shows above the transcript; “add two minutes” or “stop the timer” change it, its cross stops it. At zero, a short melody plays — listen to it and set it in Settings → During the meeting → AI Help.

## Aide IA : vos demandes passent, même sans les questions-réponses
<!-- id: aide-ia-gestes-sans-questions | genre: correctif | pour: tous -->

Questions-réponses coupées, son prénom ne déclenchait plus rien : ni tag, ni note, ni pause. Désormais « Alfred, ajoute le tag… », « mets en pause », « à l'ordre du jour : … » marchent toujours, à voix haute ou au pupitre. Seules les questions restent sans réponse, et elle le dit.

### en: AI Help: your requests go through, even without questions & answers

With Questions & answers off, its name no longer triggered anything: no tag, no note, no pause. Now “Alfred, add the tag…”, “pause”, “on the agenda: …” still work, aloud or in the panel. Only questions go unanswered, and it says so.

## Vos remplacements de notes valent pour les réunions suivantes
<!-- id: mots-remplaces | genre: nouveaute | pour: tous -->

Écrivez « Remplace Durend par Durand » dans les notes d'une réunion : ce mot mal transcrit rejoint vos « Mots remplacés » et sera corrigé d'office dans vos réunions suivantes, dès la fin de chaque phrase. La liste se complète ou s'allège dans Réglages → Pendant la réunion → Mots remplacés (100 au plus).

### en: Replacements written in your notes now apply to your next meetings

Write “Replace Durend with Durand” in a meeting's notes: that mistranscribed word joins your “Replaced words” and is fixed automatically in your next meetings, at the end of each sentence. Extend or trim the list in Settings → During the meeting → Replaced words (100 at most).

## Réglages et Admin : cherchez un réglage par son nom
<!-- id: recherche-reglages | genre: nouveaute | pour: tous -->

Dans Réglages ou Admin, tapez ce que vous cherchez sous « Nouvelle réunion » — « micro », « langue », « logo », « clé openai » : les réglages qui répondent s'affichent avec leur chemin, et un clic ouvre la bonne page sur le réglage, mis en évidence. Accents et fautes de frappe ne gênent pas. Ctrl K (⌘ K sur Mac) y mène de partout.

### en: Settings and Admin: search for a setting by name

In Settings or Admin, type what you are looking for under “New meeting” — “microphone”, “language”, “logo”, “api key”: matching settings appear with their path, and one click opens the right page on that setting, highlighted. Accents and typos don't get in the way. Ctrl K (⌘ K on Mac) takes you there from anywhere.

## Aide IA : ses sons, sa voix, et une cloche pour la faire taire
<!-- id: aide-ia-sons | genre: amelioration | pour: tous -->

Une idée s'annonce d'un coup de sonnette, un geste fait de deux notes brèves. La cloche de sa pastille coupe ses sons et sa voix pour la réunion. Dans Réglages → Pendant la réunion → Aide IA, choisissez comment elle démarre, quels sons jouent, et faites-la lire à voix haute : voix du navigateur, d'OpenAI ou de Mistral.

### en: AI Help: its sounds, its voice, and a bell to silence it

An idea comes with a desk-bell ring, an action done with two short notes. The bell on its pill mutes its sounds and voice for the meeting. In Settings → During the meeting → AI Help, choose how it starts, which sounds play, and have it read aloud: browser, OpenAI or Mistral voice.

## Aide IA : elle vous laisse finir, et cherche mieux dans myBrain
<!-- id: aide-ia-ecoute-et-recherche | genre: amelioration | pour: tous -->

Votre demande part quand vous vous taisez, plus à la première phrase : « Alfred, j'ai une question. Est-ce que… » lui arrive en entier. Elle entend son prénom même écorché par la transcription, ou placé en fin de phrase. Dans myBrain, elle cherche chaque nom cité, y compris mal transcrit — « Durend » retrouve Durand — et lit davantage de fiches.

### en: AI Help: it lets you finish, and searches myBrain more thoroughly

Your request is sent once you stop talking, no longer at the first sentence. It hears its name even when the transcript garbles it, or when it ends your sentence. In myBrain, it looks up every name you mention, even a misspelled one, and reads more pages.

## Administration : un tableau de bord, et des pages plus courtes
<!-- id: admin-tableau-de-bord | genre: nouveaute | pour: administrateurs -->

L'administration s'ouvre sur un tableau de bord : ce qui reste à régler, du plus grave au plus léger, avec un lien vers la page où le corriger, et l'activité des 30 derniers jours. Les clés d'IA et les modèles ont chacun leur page ; le vocabulaire de l'organisation et l'apparence aussi. La touche Échap referme l'administration.

### en: Administration: a dashboard, and shorter pages

Administration now opens on a dashboard: what is left to fix, most serious first, with a link to the page where to fix it, and activity over the last 30 days. AI keys and models each have their own page; so do the organization's vocabulary and its appearance. The Escape key closes administration.
## Aide IA : pause, compte rendu et corrections, sur simple demande
<!-- id: aide-ia-gestes-reunion | genre: amelioration | pour: tous -->

Demandez-le à l'Aide IA, à voix haute ou par écrit : mettre la réunion en pause, la terminer, rédiger le compte rendu avec le template de votre choix, corriger un mot dans la transcription. Son prénom s'affiche désormais à côté de son orbe, et ses domaines se règlent dans un menu, derrière un seul bouton de la barre du bas.

### en: AI Help: pause, minutes and transcript fixes, just by asking

Ask AI Help, aloud or in writing: pause the meeting, end it, write the minutes with the template of your choice, fix a word in the transcript. Its name now shows next to its orb, and its areas are set in a menu, behind a single button of the bottom bar.

## La réunion tient bon sur téléphone : appel, autre application, réseau
<!-- id: reunion-resiste-aux-interruptions | genre: amelioration | pour: tous -->

Un appel, un passage sur une autre application ou une coupure de réseau n'arrêtent plus la réunion : le micro et la transcription repartent seuls, le trou est marqué dans la transcription, et ce qui s'est dit pendant une coupure de réseau est transcrit à son retour. Si le téléphone a fermé MyBrief, « Reprendre » continue la même réunion, chronomètre compris.

### en: Meetings survive calls, app switches and network drops on your phone

A call, switching to another app or a network drop no longer ends the meeting: the microphone and transcript restart on their own, the gap is marked in the transcript, and what was said during a network drop is transcribed once it returns. If your phone closed MyBrief, "Resume" continues the same meeting, timer included.


## Réglages et Admin : deux boutons, des menus qui suivent la réunion
<!-- id: menus-reglages-et-admin | genre: amelioration | pour: tous -->

En bas de la colonne, la carte de votre compte porte deux boutons. « Réglages » suit le fil d'une réunion : Mon compte, puis Mes réunions — « Pendant la réunion » (micro, mots remplacés, détection d'actions, Aide IA) et « Après la réunion » (e-mail, dépôt) —, Ma bibliothèque et Outils. « Admin » ouvre l'administration, rangée en cinq rubriques qu'on replie.

### en: Settings and Admin: two buttons, menus that follow the meeting

At the bottom of the column, your account card now has two buttons. “Settings” follows a meeting: My account, then My meetings — “During the meeting” (microphone, replaced words, action detection, AI Help) and “After the meeting” (email, storage) —, My library and Tools. “Admin” opens administration, sorted into five collapsible sections.

## MyBrief s'ouvre plus vite
<!-- id: ouverture-plus-rapide | genre: amelioration | pour: tous -->

MyBrief démarre en lisant deux fois moins de code : l'administration et les réglages arrivent quand vous les ouvrez. L'application est trois fois plus légère à télécharger, et la liste de vos réunions arrive sans leur contenu : chacune se charge quand vous l'ouvrez. Sur téléphone et en connexion lente, l'écran est prêt plus tôt.

### en: MyBrief opens faster

MyBrief starts up reading half as much code: administration and settings arrive when you open them. The app is three times lighter to download, and your meeting list arrives without their content: each one loads when you open it. On phones and slow connections, the screen is ready sooner.

## Longues réunions : moins de batterie et de mémoire
<!-- id: longues-reunions-plus-legeres | genre: amelioration | pour: tous -->

Sur téléphone comme sur ordinateur, une réunion de plusieurs heures sollicite moins l'appareil : la transcription en direct reste fluide, et MyBrief travaille moins quand vous êtes dans l'onglet de votre visio. L'audio à télécharger pèse environ 2,5 fois moins, sans perte audible sur la voix. La vague sonore défile de nouveau à son rythme.

### en: Long meetings: less battery and memory

On phones and computers alike, a meeting of several hours puts less load on your device: the live transcript stays smooth, and MyBrief works less while you are in your video call tab. The audio download is about 2.5 times smaller, with no audible loss on speech. The sound wave scrolls at its proper pace again.

## Transcription : les phrases avec « par » ne disparaissent plus
<!-- id: transcription-phrases-avec-par | genre: correctif | pour: tous -->

Des phrases manquaient dans la transcription en direct : celles qui contenaient « par » (« On commence par le budget »), ou qui commençaient par un tiret. Elles s'affichent désormais, et le compte rendu, la détection d'actions et l'Aide IA les lisent. Dans l'application Android, un passage hors ligne rattrapé ne perd plus son texte pour la même raison.

### en: Transcription: sentences with “par” no longer vanish

Sentences were missing from the live transcription: those containing the French word “par” (“On commence par le budget”), or starting with a dash. They now show up, and the summary, action detection and AI Help read them. In the Android app, an offline passage caught up later no longer loses its text for the same reason.

## Aide IA : une IA suit la réunion, alerte et répond
<!-- id: aide-ia-reunion | genre: nouveaute | pour: tous -->

L’Aide IA est là dès que la réunion démarre : elle alerte quand une décision contredit le projet, retient l’ordre du jour annoncé et rappelle à la fin ce qui reste. Appelez-la par son prénom pour une question ou un geste : poser un tag, prendre une note, sonner dans dix minutes, se retirer. Elle s’ouvre groupe par groupe dans Administration → Groupes.

### en: AI Help: an AI follows the meeting, alerts and answers

AI Help is there as soon as the meeting starts: it alerts when a decision contradicts the project, keeps the announced agenda and recalls at the end what is left. Call it by its first name for a question or an action: set a tag, take a note, ring in ten minutes, step back. It is opened group by group in Administration → Groups.

## Infographie : l'ancien modèle d'image est déjà remplacé
<!-- id: infographie-gpt-image-2-retire | genre: amelioration | pour: administrateurs -->

OpenAI arrête le 10 février 2027 le modèle d'image de la génération précédente : Administration → IA ne le propose plus. S'il dessinait vos infographies, le modèle recommandé a déjà pris le relais ; la tuile Infographie le dit, et un clic confirme ce choix.

### en: Infographics: the previous image model is already replaced

OpenAI shuts down the previous-generation image model on 10 February 2027: Administration → AI no longer offers it. If it drew your infographics, the recommended model has already taken over; the Infographic tile says so, and one click confirms the choice.

## Jusqu'à 30 tags par personne
<!-- id: tags-plafond-30 | genre: amelioration | pour: tous -->

Dans Ma configuration → Mes tags, chacun peut désormais créer jusqu'à 30 tags, contre 20 auparavant : de quoi garder un tag par client sans devoir en regrouper.

### en: Up to 30 tags per person

In My configuration → My tags, everyone can now create up to 30 tags, up from 20: enough to keep one tag per client without merging any.

## Comptes rendus : choisissez qui les rédige, prix en regard, et Mistral en plus
<!-- id: redaction-choix-du-modele | genre: nouveaute | pour: administrateurs -->

Administration → IA, tuile Comptes rendus : le modèle qui rédige se choisit sur une liste, comme celui de la transcription, avec le coût estimé d'un résumé pour une réunion d'une heure. OpenAI y propose de nouveaux paliers, du plus économique au plus capable, et Mistral rédige aussi, avec la clé qui sert déjà à sa transcription.

### en: Summaries: choose who writes them, with the price, and Mistral too

Administration → AI, Summaries tile: the writing model is picked from a list, like the transcription one, with the estimated cost of a summary for a one-hour meeting. OpenAI offers new tiers there, from the cheapest to the most capable, and Mistral can write them too, with the key it already uses for transcription.

## Le consentement des participants, rappelé au démarrage
<!-- id: consentement-participants | genre: amelioration | pour: tous -->

Sur ordinateur, la fenêtre « Quel type de réunion ? » rappelle désormais que tous les participants doivent accepter l'enregistrement qui va démarrer.

### en: Participant consent, a reminder at start

On a computer, the “What kind of meeting?” window now reminds you that every participant must agree to the recording about to start.

## Choisissez ce qui accompagne le compte rendu
<!-- id: options-du-compte-rendu | genre: amelioration | pour: tous -->

En générant un résumé, deux tuiles sous « Ajouter au compte rendu » : « Actions détectées », allumée et avec leur nombre — éteignez-la pour un compte rendu sans la liste des actions —, et « Infographie », éteinte, si elle vous est proposée.

### en: Choose what comes with the summary

When generating a summary, two tiles under "Add to the summary": "Detected actions", on and showing how many — turn it off for a summary without the action list — and "Infographic", off, if it is offered to you.

## La détection d'actions part en « Stricte »
<!-- id: detection-stricte-par-defaut | genre: amelioration | pour: tous -->

Pendant la réunion, seules les tâches annoncées comme telles — « Action : Marie envoie le compte rendu vendredi » — apparaissent désormais dans le panneau. Pour voir aussi les « je m'en occupe », passez en Équilibrée dans Ma configuration → Détection d'actions.

### en: Action detection now starts on "Strict"

During the meeting, only tasks announced as such — "Action: Marie sends the minutes on Friday" — now show up in the panel. To also catch "I'll take care of it", switch to Balanced in My configuration → Action detection.

## Configuration, Authentification et Actions se lisent d'un coup d'œil
<!-- id: admin-configuration-authentification-repliees | genre: amelioration | pour: administrateurs -->

Administration → Configuration, Authentification et Actions s'ouvrent repliées, comme l'onglet IA. Des tuiles disent ce qui est en place — vocabulaire, couleurs, boutons proposés et où ils apparaissent ; une pastille par mode de connexion montre ce qui est affiché. Un clic déplie le réglage, et « Modifié » signale ce qui reste à enregistrer.

### en: Configuration, Authentication and Actions at a glance

Administration → Configuration, Authentication and Actions open folded, like the AI tab. Tiles show what is in place — vocabulary, colors, buttons offered and where they appear; one pill per sign-in method shows what is displayed. A click unfolds the setting, and “Changed” flags what is left to save.

## Quota atteint en pleine réunion : un message, et la réunion continue
<!-- id: quota-atteint-en-reunion | genre: amelioration | pour: tous -->

Si vos minutes du mois s'épuisent pendant une réunion, un message vous prévient et reste affiché jusqu'à ce que vous le fermiez. La réunion n'est pas coupée : elle s'enregistre et se transcrit jusqu'à ce que vous l'arrêtiez, même si votre quota change en cours de route. Vous ne pourrez simplement pas en démarrer d'autre avant le renouvellement.

### en: Quota reached mid-meeting: a message, and the meeting goes on

If your monthly minutes run out during a meeting, a message tells you and stays until you close it. The meeting is not cut: it keeps recording and transcribing until you stop it, even if your quota changes along the way. You just won't be able to start another one before the reset.

## La transcription peut aussi passer par Mistral, Speechmatics ou AssemblyAI
<!-- id: transcription-mistral-voxtral | genre: nouveaute | pour: administrateurs -->

Administration → IA devient un tableau de bord : une pastille par fournisseur, avec sa clé, et trois tuiles qui disent ce qui tourne ; un clic déplie le réglage. La clé de Mistral, Speechmatics ou AssemblyAI débloque ses modèles, comparés sur une ligne avec leur prix. En choisir un lui confie le direct comme les fichiers importés ; les comptes rendus restent chez OpenAI.

### en: Transcription can also go through Mistral, Speechmatics or AssemblyAI

Administration → AI becomes a dashboard: one pill per provider, with its key, and three tiles showing what runs; a click unfolds the setting. A Mistral, Speechmatics or AssemblyAI key unlocks its models, compared one per line with their price. Picking one has it transcribe live speech and imported files; summaries stay with OpenAI.

## Un seul groupe par compte, et un groupe Admin illimité
<!-- id: groupe-unique-et-admin | genre: amelioration | pour: administrateurs -->

Administration → Groupes : un compte n'est plus que dans un groupe, dont il reçoit quota et droits ;
le placer ailleurs l'enlève du précédent. Un compte passé Administrateur entre dans le nouveau
groupe « Admin », illimité, comme les administrateurs actuels ; redevenu Utilisateur, il revient
dans « Défaut ». Qui avait plusieurs groupes garde celui qui lui donnait le plus de minutes.

### en: One group per account, and an unlimited Admin group

Administration → Groups: an account now belongs to a single group, whose quota and rights it gets;
placing it elsewhere removes it from the previous one. An account made Administrator joins the new
“Admin” group, unlimited, like current administrators; back to User, it returns to “Default”.
Accounts that had several groups keep the one that gave them the most minutes.

## Statistiques : filtres, usage par personne et rapport PDF
<!-- id: statistiques-pilotage | genre: nouveaute | pour: administrateurs -->

Administration → Statistiques se filtre par dates, groupe, utilisateur et template, et compare chaque chiffre à la période précédente. « Santé de l'adoption » montre qui utilise myBrief chaque semaine et qui ne l'a jamais démarré ; le tableau par utilisateur se trie et s'exporte en CSV. « Exporter en PDF » produit un rapport des sections choisies.

### en: Statistics: filters, usage per person and PDF report

Administration → Statistics can be filtered by dates, group, user and template, and compares every figure with the previous period. "Adoption health" shows who uses myBrief every week and who never started; the per-user table can be sorted and exported as CSV. "Export as PDF" produces a report of the chosen sections.

## Actions détectées et infographie suivent la langue de l'interface
<!-- id: actions-langue-interface | genre: correctif | pour: tous -->

Avec l'anglais choisi, les actions détectées pouvaient s'écrire en français, et l'infographie prenait la langue parlée en réunion. Toutes deux suivent désormais la langue choisie, FR ou EN, comme le compte rendu. Pour une infographie dans l'autre langue, changez de langue puis cliquez « Régénérer l'infographie ».

### en: Detected actions and the infographic follow the interface language

With English selected, detected actions could be written in French, and the infographic took the language spoken in the meeting. Both now follow the chosen language, FR or EN, like the report. For an infographic in the other language, switch language, then click “Regenerate the infographic”.

## Transcription : un nombre ne se colle plus au mot qui le précède
<!-- id: transcription-nombres-colles | genre: correctif | pour: tous -->

En direct, un nombre dit après un mot s'écrivait collé à lui : « jusqu'à4 h », « le12 mars ». L'espace est de retour, à l'écran comme dans la transcription exportée et résumée. Les réunions déjà enregistrées gardent leur texte.

### en: Transcription: a number no longer sticks to the word before it

During live transcription, a number spoken after a word was written stuck to it: “until4 pm”, “March12”. The space is back, on screen and in the exported and summarized transcript. Meetings already recorded keep their text.

## Transcription : les modèles qu'OpenAI arrête sont déjà remplacés
<!-- id: modeles-transcription-retires | genre: amelioration | pour: administrateurs -->

OpenAI arrête trois modèles de transcription le 26 février 2027 : Administration → IA ne les propose plus. Si l'un d'eux était choisi, un modèle qui transcrit de la même façon a déjà pris le relais ; la carte le dit, et un clic confirme ce choix.

### en: Transcription: the models OpenAI is shutting down are already replaced

OpenAI shuts down three transcription models on 26 February 2027: Administration → AI no longer offers them. If one of them was chosen, a model that transcribes the same way has already taken over; the card says so, and one click confirms the choice.

## Un menu de compte qui dit où vous en êtes ce mois-ci
<!-- id: menu-compte-ce-mois | genre: amelioration | pour: tous -->

En bas de la colonne de gauche, un anneau autour de votre avatar et la ligne sous votre nom disent ce qu'il vous reste ce mois-ci. Votre nom ouvre le menu de compte : « Ce mois-ci » y résume votre crédit, vos réunions et vos comptes rendus, et la langue s'y choisit. Sur téléphone, Configuration et Administration sont dans ce menu.

### en: An account menu that shows where you stand this month

At the bottom of the left column, a ring around your avatar and the line under your name show what you have left this month. Your name opens the account menu: “This month” sums up your credit, meetings and summaries, and you pick the language there. On phones, Settings and Administration are in this menu.

## La phrase d'accueil, aussi en anglais
<!-- id: phrase-accueil-anglaise | genre: amelioration | pour: administrateurs -->

Dans Administration → Configuration, la carte « Phrase d'accueil » accepte une seconde phrase, en anglais : elle s'affiche sous le logo quand l'interface est en anglais. Laissée vide, la phrase en français reste affichée.

### en: The tagline, in English too

In Administration → Configuration, the "Tagline" card takes a second line, in English: it shows under the logo when the interface is in English. Left empty, the French tagline stays.

## Les actions détectées en direct restent courtes
<!-- id: actions-detectees-restent-courtes | genre: correctif | pour: tous -->

Pendant une longue réunion, une action détectée pouvait grossir au fil de la conversation, ajout après ajout, jusqu'à recopier tout ce qui s'était dit. Elle reste désormais une tâche courte : la carte se complète quand on précise qui la fait, pour quand ou ce qu'il faut livrer ; le reste de la discussion va au compte rendu.

### en: Live-detected actions stay short

During a long meeting, a detected action could grow with the conversation, addition after addition, until it copied everything that was said. It now stays a short task: the card is completed when someone says who does it, by when or what to deliver; the rest of the discussion goes into the report.

## Interface en anglais : plus de textes restés en français
<!-- id: interface-anglaise-complete | genre: correctif | pour: tous -->

Avec l'anglais choisi, l'écran d'accueil, la phrase sous le logo, les groupes de l'historique (cette semaine, semaine dernière, les mois), le menu d'une réunion et l'écran d'enregistrement restaient en partie en français. Tout s'affiche désormais en anglais, jusqu'au titre de l'onglet du navigateur.

### en: English interface: no more text left in French

With English selected, the home screen, the line under the logo, the history groups (this week, last week, the months), a meeting's menu and the recording screen still partly showed in French. Everything now shows in English, down to the browser tab title.

## Transcription : le début d'une phrase ne s'écrit plus en double
<!-- id: transcription-debut-en-double | genre: correctif | pour: tous -->

Avec certains modèles de transcription, quand quelqu'un enchaînait deux phrases sans marquer de pause, la première pouvait s'écrire deux fois, et se retrouver en double dans le compte rendu. Elle ne s'écrit plus qu'une fois : quand la personne s'arrête de parler, ses phrases se regroupent sur une seule ligne.

### en: Transcription: the start of a sentence is no longer written twice

With some transcription models, when someone ran two sentences together without pausing, the first one could be written twice and end up twice in the report. It is now written only once: when the person stops speaking, their sentences come together on a single line.

## En visio, votre dernière phrase ne reste plus en avant-dernier
<!-- id: visio-ordre-des-repliques | genre: correctif | pour: tous -->

Quand vous vous taisiez pendant une visio, votre dernière phrase restait affichée en avant-dernier,
au-dessus des répliques de vos interlocuteurs pourtant dites après elle, parfois pendant plusieurs
minutes. Elle reprend sa place dès qu'ils parlent : la transcription suit l'ordre de la conversation.

### en: In a video call, your last sentence no longer stays second to last

When you went quiet during a video call, your last sentence stayed second to last, above what the
others said after it, sometimes for minutes. It now takes its place as soon as they speak: the
transcript follows the order of the conversation.

## Mes statistiques : votre usage et la jauge de vos minutes du mois
<!-- id: mes-statistiques | genre: nouveaute | pour: tous -->

« Mes statistiques » montre vos réunions, votre temps enregistré et vos modèles. Avec un crédit de minutes, une jauge dit ce qu'il reste — vert, ambre, orange, rouge — et prévient si vous allez trop vite. Ouvrez-la par l'icône à côté de la roue crantée ou d'un clic sur le compteur. Administrateurs : Administration → Crédit de temps suit celui de chacun.

### en: My statistics: your usage and this month's time gauge

“My statistics” shows your meetings, recorded time and templates. With a time credit, a gauge shows what is left — green, amber, orange, red — and warns you when you are going too fast. Open it from the icon next to the cog or by clicking the counter. Administrators: Administration → Time credit follows everyone's.

## Mes tags, plus simple : une liste, et la fiche de chaque tag
<!-- id: mes-tags-liste-et-fiche | genre: amelioration | pour: tous -->

Dans Ma configuration → Mes tags, choisissez un tag dans la liste : sa fiche pose deux questions en
clair — où ranger ses comptes rendus, à qui les envoyer —, et le logo Google Drive, OneDrive ou
SharePoint montre où va chaque dossier. Ce qui vaut pour tous les tags est dans « Réglages communs ».

### en: My tags, simpler: a list, and a sheet for each tag

In My configuration → My tags, pick a tag from the list: its sheet asks two plain questions — where its
reports go, who receives them — and the Google Drive, OneDrive or SharePoint logo shows where each
folder lives. What applies to every tag is under “Shared settings”.

## Sur téléphone, le numéro de version ne recouvre plus « Terminer »
<!-- id: version-dans-le-menu-mobile | genre: correctif | pour: tous -->

Sur téléphone, le numéro de version se posait sur le bouton « Terminer » pendant une réunion, et sur
« Enregistrer » dans les réglages. Il est désormais en bas du menu, avec « Quoi de neuf ? ».

### en: On a phone, the version number no longer covers “End”

On a phone, the version number sat on top of the “End” button during a meeting, and on “Save” in the
settings. It now lives at the bottom of the menu, with “What’s new?”.

## Les noms que la transcription écorche, corrigés tout seuls
<!-- id: corrections-transcription | genre: nouveaute | pour: administrateurs -->

Dans Administration → Configuration, indiquez ce que la transcription écrit mal (« Klobex ») et ce
qu'il faut écrire à la place (« Globex ») : le mot est corrigé dans les réunions de tous les comptes,
dès la fin de chaque phrase, et s'éclaire un instant. « Essayer » montre le résultat avant
d'enregistrer.

### en: Names the transcription mangles, fixed automatically

In Administration → Configuration, enter what the transcription gets wrong (“Klobex”) and what to
write instead (“Globex”): the word is corrected in every account's meetings, as soon as each sentence
ends, and briefly lights up. “Try it” shows the result before saving.

## Sur téléphone, vos réglages en haut à droite ; le logo ramène à l'accueil
<!-- id: logo-retour-accueil | genre: amelioration | pour: tous -->

Sur téléphone, le menu passe en haut à gauche, à côté du logo ; votre avatar, la roue crantée et, pour
un administrateur, le bouclier sont en haut à droite, sans ouvrir le menu. La langue se change depuis
votre avatar. Partout, un clic sur le logo referme la réunion ou les réglages ouverts et ramène à
l'accueil ; pendant un enregistrement, il ramène au direct.

### en: On a phone, your settings at the top right; the logo takes you home

On a phone, the menu moves to the top left, next to the logo; your avatar, the settings gear and, for
administrators, the shield sit at the top right, no menu to open. Change the language from your
avatar. Everywhere, clicking the logo closes the open meeting or settings and takes you home; while
recording, it takes you back to the live meeting.

## La pastille de chaque tag à votre image : votre teinte, votre forme
<!-- id: tags-pastille-personnalisee | genre: nouveaute | pour: tous -->

Dans Ma configuration → Mes tags, composez la pastille d'un tag : une couleur de la palette ou la
vôtre, réglée aux deux curseurs sous les pastilles — la teinte sur l'arc-en-ciel, puis la clarté —, et
une forme : rond, carré, losange, triangle, hexagone, étoile ou cœur. L'aperçu en tête du formulaire la
montre telle qu'elle paraîtra dans l'historique et partout où le tag s'affiche.

### en: Each tag's badge, your way: your hue, your shape

In My configuration → My tags, compose a tag's badge: a colour from the palette or your own, set with
the two sliders under the swatches — the hue on the rainbow, then the lightness —, and a shape —
circle, square, diamond, triangle, hexagon, star or heart. The preview at the top of the form shows it
as it will appear; you will find it in the history and wherever the tag shows.

## Votre photo Google en bas à gauche
<!-- id: photo-de-profil | genre: amelioration | pour: tous -->

Connecté avec Google, vous voyez désormais votre photo de profil en bas de la colonne de gauche et
dans le menu de compte, à la place de vos initiales. Elle se met à jour à chaque connexion. Sans
photo, ou connecté par Microsoft ou par mot de passe, vos initiales restent affichées.

### en: Your Google photo in the bottom-left corner

Signed in with Google, you now see your profile photo at the bottom of the left-hand column and in
the account menu, instead of your initials. It is refreshed each time you sign in. Without a photo,
or when signed in with Microsoft or a password, your initials are shown.

## Pendant qu'un résumé s'écrit, les autres réunions restent ouvertes
<!-- id: resume-en-cours-autres-reunions | genre: amelioration | pour: tous -->

Lancez un résumé, puis ouvrez une autre réunion de l'historique sans attendre : elle s'affiche
normalement, se lit et se partage. Dans la colonne de gauche, le titre de la réunion dont le résumé
s'écrit s'anime d'un reflet ; seule sa page porte le voile « Résumé en cours... ». Une notification
prévient quand le résumé est prêt.

### en: While a summary is being written, other meetings stay open

Start a summary, then open another meeting from the history right away: it displays normally and can
be read and shared. In the left column, the title of the meeting being summarized shimmers; only its
page shows the “Summary in progress...” veil. A notification tells you when the summary is ready.

## MyBrief change de visage
<!-- id: nouveau-logo | genre: amelioration | pour: tous -->

La mascotte de MyBrief a été redessinée : même casque, mêmes lunettes et même nœud papillon, en
facettes plus franches et plus colorées. Vous la retrouvez dans l'en-tête, sur l'écran d'accueil et
de connexion, dans l'onglet du navigateur et sur l'icône de l'application. Si votre organisation a
mis son propre logo, rien ne change pour vous.

### en: MyBrief has a new face

MyBrief's mascot has been redrawn: same headphones, same glasses and same bow tie, in bolder, more
colourful facets. You will find it in the header, on the welcome and sign-in screens, in the browser
tab and on the app icon. If your organisation uses its own logo, nothing changes for you.

## Le prix de chaque modèle de transcription, au moment de choisir
<!-- id: prix-modeles-transcription | genre: amelioration | pour: administrateurs -->

Dans Administration → IA, chaque modèle de transcription affiche son niveau de prix, de € à €€€€, et
le coût d'une heure en euros, du moins cher au plus cher. Choisir un autre modèle dit aussitôt ce
qu'il fait gagner ou coûter par heure, avant d'enregistrer.

### en: Each transcription model's price, right where you choose

In Administration → AI, each transcription model shows its price level, from € to €€€€, and the cost
of one hour in euros, from cheapest to most expensive. Picking another model immediately tells you
what it saves or costs per hour, before you save.

## Sur tablette, la réunion garde toute la place
<!-- id: tablette-historique-replie | genre: amelioration | pour: tous -->

Sur une tablette tenue en hauteur, ou dans une fenêtre étroite, l'historique se replie en barre
d'icônes et s'ouvre par-dessus la page : transcription, résumé et choix du template ne sont plus
écrasés entre les deux colonnes. Choisir une réunion, ou toucher à côté, le replie. Sur téléphone, le
logo du menu referme bien le menu.

### en: On a tablet, the meeting keeps all the room

On a tablet held upright, or in a narrow window, the history folds into a strip of icons and opens
over the page: the transcript, the summary and the template choice are no longer squeezed between two
columns. Picking a meeting, or tapping beside it, folds it away. On a phone, the menu's logo now closes
the menu.

## Firefox et Safari enregistrent aussi le son de la visio
<!-- id: son-de-l-ordinateur-firefox-safari | genre: nouveaute | pour: tous -->

Firefox et Safari ne partagent pas le son de l'écran : installez un périphérique audio virtuel
(BlackHole sur Mac, VB-CABLE sur Windows) et choisissez-le dans Ma configuration → Réglages audio →
Son de l'ordinateur. Chaque « Réunion avec visio » enregistre alors vos interlocuteurs et le son des
applications, en plus de votre micro. « Tester le son » vérifie le réglage.

### en: Firefox and Safari now record the video call's sound too

Firefox and Safari do not share screen audio: install a virtual audio device (BlackHole on Mac,
VB-CABLE on Windows) and choose it in My configuration → Audio settings → Computer sound. Every
“Video meeting” then records the other side and the sound of your apps, along with your microphone.
“Test the sound” checks the setup.

## Choisir son résumé d'un coup d'œil, même sur téléphone
<!-- id: carte-de-generation-claire | genre: amelioration | pour: tous -->

Au moment de générer, templates et Pagimètre tiennent sur un même écran, téléphone compris : des cartes
compactes, une coche sur le template retenu, sa longueur en pastille. Un template sans Pagimètre le dit
en une ligne, et les instructions supplémentaires se déplient d'un clic.

### en: Pick your summary at a glance, even on a phone

When generating, templates and the page meter fit on one screen, phones included: compact cards, a
check on the chosen template, its length as a badge. A template without the page meter says so in one
line, and additional instructions open in one click.

## Votre résumé est prêt : rangez-le et partagez-le en un geste
<!-- id: apres-le-premier-resume | genre: nouveaute | pour: tous -->

Dès le premier résumé d'une réunion, une fenêtre propose de choisir son tag, de l'envoyer par mail et
de l'entreposer — seuls ou ensemble. Le tag choisi montre à qui et où tout partira ; une adresse s'y
ajoute au passage. Les résultats arrivent en notifications. « Ne plus me proposer » la ferme pour de bon.

### en: Your summary is ready: file it and share it in one go

Right after a meeting's first summary, a window offers to pick its tag, send it by email and store it —
alone or together. The chosen tag shows who receives it and where it goes; you can add an address on
the way. Results arrive as notifications. "Don't offer this again" turns it off.

## Des pastilles pour voir ce qui reste à régler
<!-- id: pastilles-de-configuration | genre: nouveaute | pour: tous -->

Une pastille signale un réglage à revoir : sur la roue crantée, sur le bouclier pour les
administrateurs, puis sur la section concernée. Survolez-la — sur téléphone, lisez la phrase sous la
section — pour savoir ce qui ne va pas : un compte Google ou Microsoft à reconnecter, un dossier de
dépôt introuvable, une clé OpenAI absente ou refusée, MyBrain qui ne répond plus.

### en: Dots that show what still needs setting up

A dot flags a setting that needs attention: on the gear, on the shield for administrators, then on
the section concerned. Hover it — on a phone, read the sentence under the section — to see what is
wrong: an account to reconnect, a storage folder that cannot be found, a missing or rejected OpenAI
key, MyBrain no longer answering.

## Le Pagimètre : choisissez la longueur du résumé, en pages
<!-- id: pagimetre-longueur-en-pages | genre: nouveaute | pour: tous -->

Au moment de générer, un curseur règle la longueur du résumé, de ¼ de page à 10 pages ; myBrief
vérifie la longueur obtenue et reprend le résumé s'il s'en écarte. Standard le propose, sur 1 page.
Dans Ma configuration → Mes templates comme dans l'administration, chaque template peut le proposer,
avec sa position de départ.

### en: The page meter: choose your summary's length, in pages

When generating, a slider sets the summary's length, from ¼ page to 10 pages; myBrief checks the
result and reworks the summary when it strays. Standard offers it, set to 1 page. In My configuration
→ My templates as in the administration, any template can offer it, with its own starting position.

## Les dépenses d'IA estimées, dans Administration → Statistiques
<!-- id: depenses-ia-estimees | genre: nouveaute | pour: administrateurs -->

Administration → Statistiques estime en euros ce que coûte myBrief : la dépense par mois, le coût
d'une heure de réunion, et la part de la transcription, des comptes rendus et des infographies.
« Comparer les modèles » chiffre chaque modèle de l'onglet IA. « Actualiser les tarifs » relève les
prix publics en ligne ; sinon, les derniers relevés s'appliquent.

### en: Estimated AI spend, in Administration → Statistics

Administration → Statistics estimates in euros what myBrief costs: spend per month, the cost of one
hour of meeting, and the share of transcription, summaries and infographics. “Compare models” prices
each model of the AI tab. “Refresh prices” looks up public prices online; otherwise, the last ones
found apply.

## Des pastilles à motif pour vos tags
<!-- id: tags-pastilles-a-motif | genre: amelioration | pour: tous -->

Dans Ma configuration → Mes tags, sept pastilles à motif — rayures, taches, anneau, moitié-moitié —
s'ajoutent aux quatorze couleurs unies. Dans l'historique et partout où un tag s'affiche, sa pastille
grandit un peu pour que le motif se voie.

### en: Patterned swatches for your tags

In My configuration → My tags, seven patterned swatches — stripes, spots, ring, half-and-half — join
the fourteen plain colours. In the history and wherever a tag appears, its swatch is slightly bigger so
the pattern shows.

## Une ligne par compte dans Administration → Utilisateurs
<!-- id: utilisateurs-liste-dense | genre: amelioration | pour: administrateurs -->

La liste des comptes tient en une ligne par personne : nom, adresse, groupes, dernière connexion
(« il y a 3 jours ») et interrupteur « Actif ». Quatre fois plus de comptes à l'écran, au moins cinq
fois plus sur téléphone. Un clic sur un compte ouvre sa fiche : date exacte de connexion,
« Réinitialiser le mot de passe », « Supprimer le compte ». Au-delà de cent comptes, « Afficher la
suite ».

### en: One line per account in Administration → Users

The account list now takes one line per person: name, address, groups, last sign-in (“3 days ago”)
and the “Active” switch. Four times more accounts on screen, at least five times more on a phone.
Click an account to open it: exact sign-in date, “Reset password”, “Delete account”. Past a hundred
accounts, “Show more”.

## Six couleurs de plus pour vos tags
<!-- id: tags-cinq-couleurs | genre: amelioration | pour: tous -->

Dans Ma configuration → Mes tags, un tag se colore désormais parmi quatorze teintes : marron, orange,
vert anis, bleu ciel, bleu marine et fuchsia rejoignent les huit d'origine. Chaque pastille porte son
nom, que lit un lecteur d'écran. De quoi donner à chaque client, à chaque projet, sa propre couleur.

### en: Six more colours for your tags

In My configuration → My tags, a tag can now take one of fourteen colours: brown, orange, lime, sky
blue, navy and fuchsia join the original eight. Each swatch carries its name, read out by screen
readers. Enough to give each client, each project, a colour of its own.

## Les infographies, groupe par groupe
<!-- id: infographies-par-groupe | genre: nouveaute | pour: administrateurs -->

Administration → Groupes : chaque groupe donne ou non le droit de générer des infographies. Les droits
s'additionnent : un seul groupe qui l'accorde suffit. « Défaut » le donne au départ, personne ne le
perd. Pour réserver les infographies à quelques personnes, retirez le droit à « Défaut » et donnez-le à
leurs groupes.

### en: Infographics, group by group

Administration → Groups: each group grants or withholds the right to generate infographics. Rights add
up: one granting group is enough. “Default” grants it to begin with, so nobody loses it. To keep
infographics for a few people, remove the right from “Default” and give it to their groups.

## Un compte n'apparaît plus en double dans l'administration
<!-- id: compte-en-double-administration | genre: correctif | pour: administrateurs -->

Administration → Utilisateurs : un compte pouvait apparaître deux fois, la ligne en trop se disant
« SSO uniquement » et jamais connectée, et ses boutons agissaient sur le vrai compte. Chaque compte
n'a plus qu'une ligne, et les groupes le comptent une seule fois.

### en: An account no longer appears twice in the administration

Administration → Users: an account could appear twice, the extra row saying “SSO only” and never
signed in, and its buttons acted on the real account. Each account now has a single row, and groups
count it once.

## Un quota de minutes de réunion par groupe
<!-- id: quota-minutes-reunion | genre: nouveaute | pour: tous -->

Administration → Groupes : chaque groupe fixe les minutes de réunion mensuelles de chaque membre,
ou reste illimité. Si votre groupe en a un, le compteur « Temps de réunion », en bas à gauche, dit ce
qu'il vous reste et descend pendant la réunion ; une réunion supprimée reste décomptée. Quota atteint,
« Démarrer » le dit, avec la date du renouvellement ; une réunion commencée n'est jamais coupée.

### en: A quota of meeting minutes per group

Administration → Groups: each group sets its members’ meeting minutes, per month and per person, or
stays unlimited. If your group has one, the “Meeting time” meter at the bottom of the left column
shows what you have left this month and goes down during a meeting; a deleted meeting still counts.
Once reached, “Start” says so, with the reset date; a meeting already started is never cut off.

## Des groupes d'utilisateurs
<!-- id: groupes-utilisateurs | genre: nouveaute | pour: administrateurs -->

Administration → Groupes : créez des groupes avec un nom, une description et une couleur, puis
glissez-y les comptes depuis la colonne Utilisateurs ; sur téléphone, touchez le compte, puis le
groupe. Chacun est dans au moins un groupe : « Défaut » accueille tout nouveau compte. Chaque personne
voit ses groupes en cliquant son nom, en bas de la colonne de gauche.

### en: User groups

Administration → Groups: create groups with a name, a description and a colour, then drag accounts
onto them from the Users column; on a phone, tap the account, then the group. Everyone belongs to at
least one group: “Default” welcomes every new account. Each person sees their groups by clicking their
name at the bottom of the left column.

## L'onde sonore défile
<!-- id: onde-sonore-defile | genre: amelioration | pour: tous -->

Pendant l'enregistrement, l'onde de la barre du bas garde la trace du son : chaque instant naît à
droite et glisse vers la gauche, comme un mémo vocal. Un silence se voit, une prise de parole aussi —
sur ordinateur comme sur téléphone.

### en: The sound wave scrolls

While recording, the wave in the bottom bar keeps a trace of the sound: each moment appears on the
right and slides to the left, like a voice memo. A silence shows, and so does someone speaking — on
the computer as on the phone.

## « Terminer » pour finir une réunion ; sur téléphone, « + » et barre nommée
<!-- id: telephone-barre-de-reunion | genre: amelioration | pour: tous -->

Pendant la réunion, la barre du bas dit « Pause » et « Terminer » ; en pause, « Reprendre » et
« Terminer », avec le rappel « En pause — la réunion n'est pas terminée ». « Terminer » propose
« Résumer maintenant », « Enregistrer sans résumé » ou « Supprimer la réunion ». Sur téléphone, le
« + » à côté du menu démarre une réunion ; la barre porte aussi « Notes » et « Actions ».

### en: “End” to finish a meeting; on the phone, a “+” and a named bar

During a meeting, the bottom bar says “Pause” and “End”; when paused, “Resume” and “End”, with the
reminder “Paused — the meeting is not over yet”. “End” offers “Summarize now”, “Save without a
summary” or “Delete the meeting”. On the phone, the “+” next to the menu starts a meeting; the bar
also carries “Notes” and “Actions”.

## Nommer un participant en pleine visio : la fenêtre reste ouverte
<!-- id: nommer-voix-fenetre-reste-ouverte | genre: correctif | pour: tous -->

Pendant une visio, la fenêtre « Qui parle ici ? » se fermait dès que votre interlocuteur reprenait la
parole, et le nom commencé était perdu. Elle reste désormais ouverte, à côté de sa ligne : la
transcription attend que vous ayez fini pour reprendre son défilement.

### en: Naming a participant mid-call: the window stays open

During a video call, the “Who is speaking here?” window closed as soon as the other person spoke
again, and the name you had started typing was lost. It now stays open next to its line: the
transcript waits until you are done before scrolling again.

## Au démarrage : « Réunion en présentiel » ou « Réunion avec visio »
<!-- id: choix-presentiel-ou-visio | genre: amelioration | pour: tous -->

Sur ordinateur, lancer une réunion propose deux grands boutons illustrés : « Réunion en présentiel »
enregistre au micro, « Réunion avec visio » ouvre aussitôt le partage d'écran, avec un rappel pour
choisir l'onglet de la réunion et cocher l'audio. « Annuler » renonce à démarrer. La fenêtre de
bienvenue va aussi à l'essentiel.

### en: At start: “In-person meeting” or “Video meeting”

On a computer, starting a meeting now offers two large illustrated buttons: “In-person meeting”
records with the microphone, “Video meeting” opens screen sharing right away, with a reminder to pick
the meeting's tab and tick the audio box. “Cancel” backs out without starting. The welcome window
also gets straight to the point.

## Des PDF de résumé bien plus légers, au texte sélectionnable
<!-- id: pdf-resume-texte | genre: amelioration | pour: tous -->

Le PDF d'un résumé garde sa mise en page, mais contient désormais du vrai texte : il se sélectionne,
se recherche, et les outils d'IA le lisent comme un document ordinaire. Il pèse une centaine de Ko au
lieu de plusieurs Mo, ses liens sont cliquables et plus aucune ligne n'est coupée entre deux pages.

### en: Much lighter summary PDFs, with selectable text

The summary PDF keeps its layout but now contains real text: you can select and search it, and AI
tools read it like any other document. It weighs about a hundred KB instead of several MB, its links
are clickable and no line is split across two pages anymore.

## « Nouveau résumé » garde toujours les résumés précédents
<!-- id: nouveau-resume-garde-les-precedents | genre: correctif | pour: tous -->

Sur certaines réunions anciennes, un nouveau résumé effaçait le compte rendu d'origine : à la
réouverture, il ne restait que le dernier. Et un résumé en échec pouvait remplacer celui affiché par
« Une erreur s'est produite. ». Chaque nouveau résumé s'ajoute désormais aux précédents, qui restent
intacts.

### en: “New summary” always keeps earlier summaries

On some older meetings, a new summary erased the original one: after reopening, only the latest was
left. And a failed summary could replace the one on screen with “An error occurred.”. Each new summary
now adds to the earlier ones, which stay intact.

## Microsoft : tous les comptes d'un domaine autorisé peuvent se connecter
<!-- id: domaines-autorises-microsoft | genre: correctif | pour: tous -->

Certains comptes Microsoft d'un domaine autorisé étaient refusés à leur première connexion, avec
« Votre compte ne publie aucune adresse email exploitable » ou « Votre domaine email n'est pas
autorisé ». Ils entrent désormais. Dans Administration → Authentification, un domaine tapé sans
cliquer « Ajouter » est aussi enregistré.

### en: Microsoft: every account from an allowed domain can sign in

Some Microsoft accounts from an allowed domain were refused on their first sign-in, with “Your
account does not publish a usable email address” or “Your email domain is not allowed”. They now get
in. In Administration → Authentication, a domain typed without clicking “Add” is saved too.

## Des infographies plus nettes, et deux fois plus vite
<!-- id: infographie-generateur | genre: amelioration | pour: tous -->

Les infographies de réunion sont dessinées par un générateur d'images de nouvelle génération : un
trait plus net, un lettrage plus sûr, et une attente réduite de moitié. Les administrateurs peuvent
en changer dans Administration → IA, carte « Infographie de compte rendu », et revenir au générateur
précédent d'un menu déroulant.

### en: Sharper infographics, twice as fast

Meeting infographics are drawn by a new generation image model: a cleaner look, more reliable
lettering, and half the wait. Administrators can switch it in Administration → AI, “Meeting
infographic”, and go back to the previous generator from a dropdown.

## Relier un compte Microsoft sans ouvrir SharePoint
<!-- id: microsoft-sharepoint-facultatif | genre: nouveaute | pour: administrateurs -->

Certains annuaires Microsoft refusent le droit sur les sites SharePoint, et la liaison échouait alors
pour tout le monde — OneDrive compris. Dans Administration → Actions, carte « Compte relié »,
désactivez « Proposer les bibliothèques SharePoint » : vos utilisateurs relient leur compte pour
Outlook et leur OneDrive. Les comptes déjà reliés gardent leurs bibliothèques.

### en: Link a Microsoft account without opening SharePoint

Some Microsoft directories refuse the SharePoint sites permission, and linking then failed for
everyone — OneDrive included. In Administration → Actions, “Linked account”, turn off “Offer
SharePoint libraries”: your users link their account for Outlook and their OneDrive. Accounts already
linked keep their libraries.

## Des comptes rendus plus nets avec les templates fournis
<!-- id: templates-fournis-revus | genre: amelioration | pour: tous -->

Les six templates fournis produisent un compte rendu mieux découpé : un titre avec l'auteur et la
durée, une synthèse en parties titrées, puis les actions — désormais dans chacun. Prospect IA quitte
la liste. Dans Administration → Templates, l'éditeur montre la version qui s'applique.

### en: Cleaner summaries with the built-in templates

The six built-in templates produce a better-structured summary: a title with the author and duration,
a summary in titled parts, then the actions — now in every one of them. AI Prospect leaves the list. In
Administration → Templates, the editor shows the version actually applied.

## Des infographies mieux composées
<!-- id: infographie-composition | genre: amelioration | pour: tous -->

L'infographie d'une réunion se lit désormais comme une vraie page de synthèse : un bandeau de
titre, l'information clé en grand, une carte par sujet avec son pictogramme, une frise pour les
échéances, un tableau des actions, une palette sobre et des textes courts, lisibles. Sur une réunion
déjà illustrée, « Régénérer l'infographie » lui donne cette nouvelle forme.

### en: Better-composed infographics

A meeting's infographic now reads like a real one-page summary: a title band, the key figure or
decision in large type, one card per topic with its icon, a timeline for deadlines, an actions table,
a restrained palette and short, legible text. On a meeting that already has one, “Regenerate the
infographic” gives it this new look.

## Vos notes et vos actions restent avec la réunion
<!-- id: notes-actions-gardees | genre: amelioration | pour: tous -->

Notes et actions s'enregistrent à chaque modification : une réunion terminée par « Enregistrer », ou
rouverte depuis l'historique, les garde sans attendre un nouveau résumé. Une action masquée se
retrouve sous « Actions masquées » et revient d'un clic sur « Rétablir ». Une action ajoutée à la main
ne remplit plus le compte rendu de « À définir ».

### en: Your notes and actions stay with the meeting

Notes and actions are saved as you edit them: a meeting ended with “Save”, or reopened from the
history, keeps them without waiting for a new summary. A hidden action waits under “Hidden actions”
and comes back with one click on “Restore”. An action added by hand no longer fills the summary with
“To be decided”.

## Une barre plus claire au-dessus du compte rendu
<!-- id: barre-documents-epuree | genre: amelioration | pour: tous -->

Au-dessus d'une réunion terminée, les onglets Transcription et Résumé forment un seul sélecteur, et
deux boutons disent ce qui reste à faire : « Partager » — envoyer, entreposer ou télécharger, chaque
entrée nommée et disant où part le document, sur ordinateur aussi — et « Résumer », ou « Nouveau
résumé ». La barre du bas s'efface dès que le compte rendu existe.

### en: A clearer bar above the summary

Above a finished meeting, the Transcript and Summary tabs form a single selector, and two buttons say
what is left to do: “Share” — send, store or download, each entry named and saying where the document
goes, on desktop too — and “Summarize”, or “New summary”. The bottom bar goes away once the summary
exists.

## Sur téléphone, partager le compte rendu depuis votre messagerie
<!-- id: partage-messagerie | genre: nouveaute | pour: tous -->

Sur téléphone, « Partager » ouvre un menu : envoyer ou entreposer via le tag de la réunion, télécharger,
ou « Rédiger dans ma messagerie ». Le résumé ou la transcription s'ouvre alors dans votre application
de mail, destinataires du tag déjà remplis : relisez, ajoutez-en, envoyez.

### en: On your phone, share the summary from your own mail app

On a phone, “Share” opens a menu: send or store via the meeting's tag, download, or “Write in my mail
app”. The summary or transcript then opens in your mail app, with the tag's recipients already filled
in: review, add more, send.

## Vos réunions peuvent nourrir MyBrain, le cerveau partagé
<!-- id: mybrain-envoi-reunions | genre: nouveaute | pour: tous -->

Quand votre administration relie MyBrief à MyBrain, chaque réunion terminée
peut y partir — transcription, notes, actions, compte rendu, date, auteur et
tag — pour enrichir les fiches de l'équipe après validation. Activez l'envoi
dans Ma configuration → MyBrain, et suivez-y vos derniers envois.

### en: Your meetings can feed MyBrain, the shared brain

When your administrators connect MyBrief to MyBrain, every finished meeting can
be sent there — transcript, notes, actions, summary, date, author and tag — to
enrich the team's records after approval. Turn it on in My configuration →
MyBrain, and follow your latest sends there.

## Le bouton retour d'Android ferme ce qui est ouvert
<!-- id: retour-android | genre: amelioration | pour: tous -->

Dans l'application Android, le retour ferme le menu, la fenêtre ou le panneau ouvert, un à la fois ;
une suppression s'annule. Quand plus rien n'est ouvert, l'application passe en arrière-plan et une
réunion en cours continue.

### en: Android's back button closes what is open

In the Android app, back closes the open menu, window or panel, one at a time; a deletion is
cancelled. When nothing is left open, the app goes to the background and a meeting in progress keeps
recording.

## Sur téléphone, une fin de réunion plus claire
<!-- id: fin-de-reunion-telephone | genre: amelioration | pour: tous -->

Sur téléphone, les boutons de la pause portent leur nom — Enregistrer, Reprendre, Supprimer — et
« Partager » réunit l'envoi par mail, le dépôt et le téléchargement du compte rendu. Un micro refusé
ne bloque plus « Démarrer », et l'application rouvre la réunion que vous consultiez.

### en: A clearer end of meeting on your phone

On a phone, the pause buttons now show their names — Save, Resume, Delete — and “Share” gathers
sending by email, storing and downloading the summary. A blocked microphone no longer freezes
“Start”, and the app reopens the meeting you were reading.

## Le compte rendu envoyé juste après la réunion porte son titre
<!-- id: envoi-titre-des-la-generation | genre: correctif | pour: tous -->

Envoyé ou déposé dès la fin de la génération, le compte rendu gardait un objet et un nom de fichier
génériques tant que la réunion n'était pas rouverte depuis l'historique. Il reprend désormais le titre
de la réunion, rédigé dans les secondes qui suivent.

### en: A summary sent right after the meeting carries its title

Sent or stored as soon as it was generated, the summary kept a generic subject and file name until
the meeting was reopened from the history. It now uses the meeting title, written a few seconds
later.

## L'aide ouvre la documentation complète de MyBrief
<!-- id: aide-documentation-en-ligne | genre: amelioration | pour: tous -->

Ma configuration → Aide ouvre désormais la documentation de MyBrief dans un
nouvel onglet : chaque fonctionnalité y est expliquée pas à pas. Pour signaler
un problème ou proposer une idée, « Déclarer un bug ou une idée » est juste en
dessous.

### en: Help opens the full MyBrief documentation

My configuration → Help now opens the MyBrief documentation in a new tab, where
every feature is explained step by step. To report a problem or suggest an
idea, “Report a bug or an idea” is right below.

## Des infographies aux couleurs de votre organisation
<!-- id: infographie-charte | genre: amelioration | pour: administrateurs | date: 2026-09-09 | version: 1.3.0.8 -->

Administration → IA accueille un « Style graphique » pour les infographies :
couleurs, ton des schémas, mention à faire figurer sur chaque image. Laissé
vide, rien ne change : chaque infographie choisit librement sa palette.

## Vos tags fonctionnent aussi avec Outlook, OneDrive et SharePoint
<!-- id: tags-microsoft | genre: nouveaute | pour: tous | date: 2026-09-05 | version: 1.3.0.5 -->

Avec un compte Microsoft relié, un tag range ses comptes rendus dans votre
OneDrive ou dans une bibliothèque SharePoint, et les envoie depuis Outlook,
comme avec Google. Le logo de chaque bibliothèque montre d'un coup d'œil où
part le compte rendu.

## Enregistrer une réunion sans en faire le compte rendu
<!-- id: enregistrer-sans-resume | genre: nouveaute | pour: tous | date: 2026-09-04 | version: 1.3.0.4 -->

En fin de réunion, « Enregistrer », à côté de « Résumer », range la réunion
dans l'historique, nommée d'après ce qui s'y est dit. Le compte rendu se génère
plus tard, quand vous le voulez, avec « Nouveau résumé ».

## Une extension Chrome pour lancer MyBrief d'un clic
<!-- id: extension-chrome | genre: nouveaute | pour: tous | date: 2026-09-02 | version: 1.3.0.1 -->

Son icône, dans la barre de Chrome, ouvre MyBrief ou démarre une réunion depuis
n'importe quel site, et affiche REC pendant l'enregistrement. En option, elle
vous rappelle d'enregistrer quand une visio Meet, Teams, Zoom ou Webex
commence. À installer depuis Réglages → Outils → Extension Chrome.

## Savoir qui parle, et nommer les voix de la visio
<!-- id: qui-parle | genre: nouveaute | pour: tous | date: 2026-09-02 | version: 1.2.0.224 -->

Quand la réunion mêle votre micro et le son d'une visio, la transcription
signale chaque changement de voix et le compte rendu attribue décisions et
engagements à la bonne personne. La pastille « Visio » devient un bouton :
« Qui parle ici ? » y pose un nom, pendant la réunion ou après.

## Des comptes rendus plus complets
<!-- id: comptes-rendus-complets | genre: amelioration | pour: tous | date: 2026-09-02 | version: 1.2.0.218 -->

Les comptes rendus sont rédigés par un modèle plus capable : plus développés,
mieux structurés. L'administration peut changer ce modèle dans
Administration → IA, avec un repère de coût et de qualité pour chaque choix.

## L'essentiel de la réunion en une infographie
<!-- id: infographie | genre: nouveaute | pour: tous | date: 2026-08-31 | version: 1.2.0.212 -->

Cochez « Générer une infographie » au moment du compte rendu, ou cliquez plus
tard sur « Créer une infographie » : MyBrief dessine l'essentiel de la réunion
en une image, qui s'ouvre en grand, se télécharge, se régénère ou se supprime
depuis sa miniature. Disponible si votre administration l'a activée.

## Une barre d'outils pour mettre en forme le compte rendu
<!-- id: barre-outils-resume | genre: nouveaute | pour: tous | date: 2026-08-28 | version: 1.2.0.209 -->

Gras, italique, titres, listes, liens : la barre au-dessus du compte rendu le
met en forme sans raccourci à connaître. Chaque modification s'enregistre
d'elle-même, et la barre le confirme discrètement.

## Les templates par défaut s'adaptent à votre organisation
<!-- id: templates-defaut | genre: amelioration | pour: administrateurs | date: 2026-08-27 | version: 1.2.0.206 -->

Les sept templates livrés avec MyBrief — Standard, Réunion de décision,
Entretien RH… — se modifient dans Administration → Templates, pour tous les
comptes. « Rétablir le défaut » revient à la version d'origine à tout moment.

## Un résumé en 20 mots, en 100 mots, et les points clés
<!-- id: resumes-courts | genre: nouveaute | pour: tous | date: 2026-08-27 | version: 1.2.0.199 -->

Dans la mise en forme d'un template, trois blocs s'ajoutent au résumé
principal : une phrase de 20 mots, un résumé d'une centaine de mots et la liste
des points clés. Chacun est rédigé à part, si bien que le résumé principal
garde toute sa longueur.

## Une transcription en direct plus sûre
<!-- id: transcription-fiable | genre: amelioration | pour: tous | date: 2026-08-26 | version: 1.2.0.190 -->

Une transcription qui cessait de répondre en pleine réunion reprend désormais
d'elle-même, sans perdre de parole. Pendant l'enregistrement, vous pouvez
remonter relire le direct sans être ramené en bas à chaque phrase ; une flèche
vous ramène à la phrase en cours.

## Choisir les façons de se connecter
<!-- id: modes-connexion | genre: nouveaute | pour: administrateurs | date: 2026-08-26 | version: 1.2.0.187 -->

La carte « Page de connexion », dans Administration → Authentification, montre
les modes proposés aux utilisateurs : mot de passe, Google, Microsoft, SSO de
l'organisation. Elle permet de masquer le mot de passe ou le SSO, et de tester
chaque mode avant de l'ouvrir.

## Chaque réunion s'inscrit dans l'historique dès le premier mot
<!-- id: historique-premier-mot | genre: amelioration | pour: tous | date: 2026-08-24 | version: 1.2.0.181 -->

Une réunion prend place dans l'historique dès le début de l'enregistrement, en
italique tant qu'elle tourne. Fermer l'onglet par erreur, ou arrêter sans
compte rendu, ne fait plus perdre ce qui a été dit.

## Chaque tag a ses destinataires
<!-- id: destinataires-par-tag | genre: nouveaute | pour: tous | date: 2026-08-22 | version: 1.2.0.178 -->

Dans Ma configuration → Mes tags, un tag peut porter sa propre liste de
destinataires : le compte rendu d'une réunion taguée part chez eux, plutôt que
chez les destinataires habituels de votre compte. Vous restez en copie.

## Réglez vous-même la détection d'actions
<!-- id: detection-reglages | genre: amelioration | pour: tous | date: 2026-08-21 | version: 1.2.0.169 -->

Ma configuration → Détection d'actions : activation, sensibilité, mots
déclencheurs, fréquence des analyses. Chacun règle ce que MyBrief repère
pendant ses propres réunions.

## Le vocabulaire de votre organisation, bien écrit dans chaque compte rendu
<!-- id: vocabulaire-organisation | genre: amelioration | pour: administrateurs | date: 2026-08-21 | version: 1.2.0.168 -->

Noms de clients, de projets, sigles maison : saisis en tête
d'Administration → Templates, ils servent désormais à chaque compte rendu, et
plus seulement à la détection d'actions.

## Des notes pendant la réunion, pour des noms bien orthographiés
<!-- id: notes-reunion | genre: nouveaute | pour: tous | date: 2026-08-19 | version: 1.2.0.147 -->

Sous les actions, une zone de notes accueille ce que le compte rendu doit
reprendre — et d'abord l'orthographe exacte des noms propres et des sigles, que
la transcription corrige ensuite d'elle-même. Sur téléphone, un bouton dédié
l'ouvre pendant l'enregistrement.

## Les nouveautés, en un clic sur le numéro de version
<!-- id: quoi-de-neuf | genre: nouveaute | pour: tous | date: 2026-08-19 | version: 1.2.0.141 -->

Le numéro de version, en bas à droite de l'écran, ouvre la liste des dernières
nouveautés. Une pastille signale celles que vous n'avez pas encore vues.

## Les actions à faire apparaissent pendant la réunion
<!-- id: actions-en-direct | genre: nouveaute | pour: tous | date: 2026-08-18 | version: 1.2.0.138 -->

Chaque phrase est analysée au fil de l'eau : les tâches et les engagements
évoqués s'affichent dans le panneau « Actions » sans attendre la fin de
l'enregistrement, et se complètent quand la discussion précise une échéance ou
un responsable.

## Votre logo, votre phrase d'accueil, vos couleurs
<!-- id: apparence | genre: nouveaute | pour: administrateurs | date: 2026-08-18 | version: 1.2.0.136 -->

Administration → Configuration règle l'apparence de l'installation : logo,
phrase d'accueil, couleur principale et couleur secondaire, appliqués partout,
jusqu'à l'écran de connexion.

## Un écran de statistiques d'usage
<!-- id: statistiques | genre: nouveaute | pour: administrateurs | date: 2026-08-18 | version: 1.2.0.130 -->

Administration → Statistiques montre l'usage réel de l'installation : nombre
de réunions, temps enregistré, comptes actifs et évolution sur la période
choisie, sans lire le contenu d'aucune réunion.

## Une aide pour qui découvre MyBrief
<!-- id: aide | genre: nouveaute | pour: tous | date: 2026-08-18 | version: 1.2.0.129 -->

Ma configuration → Aide décrit ce que propose réellement votre installation,
avec une rubrique consacrée aux réunions en visio et au partage du son.

## Tous vos réglages dans « Ma configuration »
<!-- id: ma-configuration | genre: amelioration | pour: tous | date: 2026-08-17 | version: 1.2.0.123 -->

Un bouton « Configuration » dans le menu ouvre, pour tout le monde, un seul
panneau où se retrouvent les réglages autrefois dispersés : envoi du compte
rendu, dossier de dépôt, templates, tags.

## Chaque tag a son dossier de dépôt
<!-- id: dossier-par-tag | genre: nouveaute | pour: tous | date: 2026-08-11 | version: 1.2.0.104 -->

Le dossier où déposer les comptes rendus se choisit dans une fenêtre, sans
chemin à taper, et chaque tag peut avoir le sien, jusque dans un Drive partagé
de l'organisation.

## Le modèle de transcription se choisit
<!-- id: modele-transcription | genre: nouveaute | pour: administrateurs | date: 2026-08-09 | version: 1.2.0.97 -->

Administration → IA règle le modèle qui transcrit les réunions, et permet de
l'essayer sur un vrai enregistrement avant de le retenir.

## Envoyez et déposez depuis vos comptes Google ou Microsoft
<!-- id: comptes-externes | genre: nouveaute | pour: tous | date: 2026-08-08 | version: 1.2.0.92 -->

Reliez votre compte dans Ma configuration → Connexion : le compte rendu part de
votre propre adresse et se dépose dans votre espace de fichiers.

## Rangez vos réunions par tag
<!-- id: tags | genre: nouveaute | pour: tous | date: 2026-08-08 | version: 1.2.0.91 -->

Un tag par réunion, posé dès le début de l'enregistrement si vous le souhaitez,
et un filtre dans l'historique pour retrouver un client ou un projet.

## Enregistrer sans réseau, sur mobile
<!-- id: hors-ligne-mobile | genre: nouveaute | pour: tous | date: 2026-08-02 | version: 1.2.0.35 -->

Dans l'application mobile, l'enregistrement continue hors couverture : le son
est capté par morceaux, puis transcrit au retour de la connexion.
