# utils

### src/utils/actions.js

- **Rôle du fichier**  
  Gère la détection, l’ajout, la modification et la suppression (masquage) d’actions extraites de transcriptions ou saisies manuellement, avec persistance de session.

- **Fonction exportée principale**  
  - `createActionsManager(config)`
    - **Paramètres :**
      - `config` : objet de configuration avec clés :
        - `detectedActions` (store Svelte, array ou objet avec `.value[ ]`)
        - `actionIdCounter` (store Svelte, nombre ou objet avec `.value`)
        - `saveSessionData` (fonction de persistance)
        - `getTotalMeetingDuration`, `formatDurationHHMMSS` (fonctions utilitaires, meeting)
        - `t` (fonction de traduction)
        - `n8nBaseUrl` (string: URL API)
    - **Retour :**
      - Objet avec méthodes :  
        `detectActions`, `addAction`, `addManualAction`, `removeAction`
    - **Effets de bord :**
      - Met à jour les stores/pointeurs sur les actions, persiste via `saveSessionData`, effectue des requêtes HTTP.

- **Méthodes du manager :**
  - `detectActions(text: string)`  
    - Envoie le texte et les actions courantes à l'API `/actions` de n8n, récupère les actions détectées (plusieurs formats de réponse supportés), les ajoute via `addAction`.
    - Effets de bord : modifie `detectedActions`, peut logger des avertissements, erreurs, ou arrêter sur erreur.
    - **Points d'attention :**
      - Gère plusieurs formats de réponse (objet, array, JSON stringifié, formats n8n).
      - Vérifie le type de contenu de la réponse.
      - Erreurs réseau / HTTP prises en charge via handlers dédiés.
      - N’ajoute rien si réponse vide ou format inconnu.
  - `addAction(action: object, type: string = 'AI')`
    - Ajoute ou met à jour une action dans la liste (selon s’il y a un `action.id` déjà existant).
    - Normalise les dates, gère incrément du compteur d’ID, ajoute au début de la liste.
    - Effets de bord : modifie `detectedActions`, `actionIdCounter`, déclenche `saveSessionData`.
    - **Points d'attention :**
      - Prise en charge de plusieurs types de store (`array` direct, Svelte store avec `.set`, objet avec `.value`).
      - Si action déjà existante (par id), fait une mise à jour, sinon crée une nouvelle action.
      - Dates normalisées ou vides si placeholder/chaîne vide.
  - `addManualAction()`
    - Ajoute une nouvelle action manuelle avec des valeurs par défaut traduites.
    - Effets de bord : comme `addAction`.
  - `removeAction(actionToHide: object)`
    - "Supprime" une action en la masquant (`show: false` au lieu de suppression physique).
    - Effets de bord : met à jour la liste, sauvegarde la session.

- **Points d'attention généraux**
  - **Edge cases :**
    - Prise en charge de stores au format array, Svelte store (.set), objet with .value.
    - Formats variés de réponse API sur `detectActions` (parse robustesse).
    - Normalisation obligatoire des dates (ne jamais laisser le placeholder).
    - Si stores immuables (e.g. props simples), l’incrément d’id doit être géré par le parent.
  - **Dépendances :**
    - `normalizeDate` (pour format des dates)
    - `handleHttpError`, `handleFetchError` (gestion centrale des erreurs HTTP/fetch)
    - Utilisation de la fonction de traduction `t`
    - API distante n8n (`n8nBaseUrl`)
    - Doit être utilisé avec un mécanisme de persistance pour `saveSessionData`.

### src/utils/audioConstraints.js

- **Rôle du fichier** :  
  Génère les contraintes audio à utiliser avec `getUserMedia`, en appliquant l’identifiant du microphone choisi le cas échéant.

- **Fonctions exportées** :
  - `buildAudioConstraints(deviceId)`
    - **Paramètres** :
      - `deviceId` (*string | undefined*) : identifiant du micro souhaité, ou `undefined` pour le micro système par défaut.
    - **Retour** :
      - *Object* : contraintes audio au format attendu par `getUserMedia`, incluant la suppression d’écho, la réduction du bruit et le contrôle du gain automatique ; si `deviceId` est fourni, celle-ci est ajoutée en contrainte stricte (`exact`).
    - **Effet de bord notable** :
      - Aucun effet de bord (fonction pure).

- **Points d'attention** :
  - Si `deviceId` fourni est invalide ou non disponible, `getUserMedia` échouera.
  - Les contraintes retournées sont basées sur les capacités standards ; la compatibilité peut varier selon le navigateur.
  - Aucune dépendance externe.

### src/utils/audioConstraints.test.js

- **Rôle du fichier :**
  - Fichier de tests unitaires pour la fonction `buildAudioConstraints` du module `audioConstraints.js`.  
  - Assure la conformité de la génération des contraintes audio (pour micro) selon la sélection du périphérique.

- **Fonctions exportées :**
  - Aucune fonction exportée ; ce fichier contient seulement des tests Vitest.

- **Points principaux concernant la fonction testée (`buildAudioConstraints`) :**
  - **Paramètres :**
    - `deviceId` (`string` ou `null`/`undefined`) : identifiant du micro à utiliser.
  - **Retour :**
    - Objet contenant :
      - Toujours : `echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`
      - + `deviceId: { exact: <deviceId> }` **uniquement si** `deviceId` truthy
  - **Effets de bord notables :**
    - Aucun effet de bord ; la fonction est pure.
  - **Tests couvrent :**
    - Retour par défaut sans deviceId : pas de propriété `deviceId`.
    - Retour avec deviceId fourni : propriété `deviceId` correcte et contraintes inchangées.

- **Points d'attention :**
  - **Edge cases couverts :**
    - Cas où `deviceId` vaut `''` (chaîne vide), `null` ou `undefined`
    - Cas où `deviceId` a une valeur valide (ex: `'mic-123'`)
  - **Dépendances :**
    - Utilise les fonctions de test de `vitest` (`describe`, `it`, `expect`)
    - Dépend du module local `audioConstraints.js` pour la fonction à tester

- **À surveiller lors de modifications ultérieures :**
  - Aucun test pour des valeurs non-string/invalides comme `number`, `object`
  - Les valeurs de contraintes par défaut sont supposées inchangées même lorsqu'un `deviceId` est passé

### src/utils/audioProcessing.js

- **Rôle du fichier**
  - Utilitaires pour le traitement, l'import et la transcription de fichiers audio.
  - Extraction de texte de transcription à partir de réponses serveur dont le format varie.
  - Mesure de la durée d'un fichier audio via les métadonnées.

- **Fonctions exportées**
  - `extractTranscriptionText(responseText, contentType = '')`
    - **Paramètres** :
      - `responseText`: string (contenu brut de la réponse)
      - `contentType`: string (type MIME de la réponse, optionnel)
    - **Retour** : string ou `null` (texte de la transcription si détecté)
    - **Effets de bord notables** : Tolère et gère plusieurs formats de réponses historiques (JSON objet, tableau, texte brut).
    - **Points d'attention** :  
      - Gère des structures de données diverses et potentiellement inattendues (clé `text`, `transcription`, `content`, etc.).
      - Renvoie la chaîne brute si le format n'est pas reconnu comme JSON.

  - `processAudio(config)`
    - **Paramètres** :
      - `config`: objet contenant :
        - `audioBlob`: Blob ou File (audio à traiter)
        - `isFinal`: booléen (indique si traitement final)
        - `setIsImportingAudio`: fonction d'état (pour tracking UI)
        - `addTranscription`: fonction (insertion transcription)
        - `formatMessage`: fonction (formatage messages utilisateur)
        - `apiBaseUrl`: string (URL API, optionnelle)
    - **Retour** : `Promise<void>`
    - **Effets de bord notables** :
      - Effectue un appel réseau (`fetch`) vers `/record`.
      - Affiche/traite des erreurs avec `alert` et `console.log`.
      - Modifie l'état d'import via `setIsImportingAudio`.
      - Fait appel à `addTranscription`.
    - **Points d'attention** :
      - Gestion d'erreurs serveur ou réponses vides.
      - La fonction suppose la disponibilité et la fiabilité des endpoints API `/record`.
      - Utilise `FormData` et objets natifs du navigateur.
      - Dépend des callbacks passés dans `config`.

  - `readAudioDurationS(file)`
    - **Paramètres** :
      - `file`: Blob (fichier audio à analyser)
    - **Retour** : `Promise<number>` (nombre entier de secondes, 0 si échec)
    - **Effets de bord notables** :
      - Crée un objet audio HTML5 temporaire en mémoire.
      - Nettoie son URL temporaire automatiquement.
    - **Points d'attention** :
      - Peut retourner `0` si le format audio n'est pas reconnu/lisible par le navigateur, ou si le fichier est corrompu/tronqué (ex : WebM incomplet).
      - Best-effort : ne decode pas le flux audio, repose sur les métadonnées.

- **Dépendances**
  - Aucune dépendance externe (utilise uniquement API Web et JS standard).
  - Certaines fonctions requièrent des callbacks/fonctions fournis à l'exécution.

- **Edge cases / points d'attention globaux**
  - Les réponses serveur peuvent changer de format : robustesse assurée par tests sur plusieurs structures de JSON.
  - Supposition : l'utilisateur a fourni des fonctions de callback correctes dans `config` pour `processAudio`.
  - Lecture de la durée audio dépendante du support navigateur (pragmatique mais non infaillible).
  - Pas de gestion multi-langue ni de format audio non standard côté client.

### src/utils/audioRecording.js

- **Rôle du fichier**
  - Gère la capture, l'enregistrement et le mixage audio (micro, système), la détection de silence, le maintien d'activité audio ("keep-alive") et la gestion des enregistrements (démarrage, arrêt, stockage).

- **Fonctions exportées**  
  (Toutes sont des méthodes de l'objet retourné par `createAudioRecordingManager(config)`)

  - `startRecording()`
    - **Paramètres** : aucun
    - **Retour** : Promise<void>
    - **Effets de bord** :  
      - Demande l'accès au micro (+ audio système via getDisplayMedia)
      - Instancie et connecte les objets WebAudio, initialise MediaRecorder, démarre la détection de silence, prépare le PeerConnection, active le Wake Lock, démarre une reconnexion préventive.

  - `stopRecording()`
    - **Paramètres** : aucun
    - **Retour** : void
    - **Effets de bord** :  
      - Arrête toutes les pistes audio, le MediaRecorder, le contexte audio, les timers/requêtes keep-alive, la détection de silence, la reconnexion préventive, le Wake Lock.
      - Nettoie les états React ou stores via setters.

  - `setupSilenceDetection(microphoneSource, systemSource)`
    - **Paramètres** :
      - `microphoneSource` : MediaStreamAudioSourceNode (micro)
      - `systemSource` : MediaStreamAudioSourceNode (audio système) ou null
    - **Retour** : void
    - **Effets de bord** :  
      - Lance un analyseur sonore périodique ; envoie régulièrement des signaux keep-alive en cas de silence.

  - `setupMediaRecorder()`
    - **Paramètres** : aucun
    - **Retour** : void
    - **Effets de bord** :  
      - Instancie un MediaRecorder sur le flux audio mixé, rattache les listeners, gère la collecte des chunks.

  - `createKeepAliveSignal()`
    - **Paramètres** : aucun
    - **Retour** : AudioBuffer ou null
    - **Effets de bord** : aucun (crée et retourne un buffer de bruit blanc très faible).

  - `injectKeepAliveSignal()`
    - **Paramètres** : aucun
    - **Retour** : void
    - **Effets de bord** :  
      - Injecte un signal audio quasiment inaudible dans la chaîne pour "réveiller" le flux pendant un silence.

  - `finalizeRecordedAudio()`
    - **Paramètres** : aucun
    - **Retour** : void
    - **Effets de bord** :  
      - Génère un Blob de l'enregistrement, crée un URL, révoque l'ancien URL, met à jour le nom du fichier, vide la mémoire des chunks.

  - `resetRecordedAudio()`
    - **Paramètres** : aucun
    - **Retour** : void
    - **Effets de bord** :  
      - Révoque et vide l'URL d'enregistrement, réinitialise le nom de fichier.

  - `cleanupMediaRecorder()`
    - **Paramètres** : aucun
    - **Retour** : void
    - **Effets de bord** :  
      - Nettoie l’instance MediaRecorder.

- **Points d'attention / Edge cases / dépendances**
  - **Dépendances** :  
    - Repose sur le support Web APIs : `MediaRecorder`, `AudioContext`, `MediaStream`, `getUserMedia`, `getDisplayMedia`.
    - Utilise un ensemble conséquent de getters/setters/callbacks passés via le paramètre `config` pour synchroniser l’état externe (ex: React, stores, etc.).
  - **Edge cases** :
    - Les permissions micro/système peuvent être refusées ou limitées selon le navigateur.
    - La détection de silence dépend de seuils adaptés → peut être trop sensible ou pas assez (cf. `AUDIO_ACTIVITY_THRESHOLD`).
    - Certains types MIME peuvent ne pas être supportés par le navigateur, forçant un fallback.
    - Le support de l'audio dans `getDisplayMedia` est inégal selon OS et navigateur.
    - L'usage intensif des ressources peut provoquer des fuites mémoire si les flux ou contexts ne sont pas correctement libérés (surtout en cas d'erreur).
    - Le Wake Lock et la reconnexion préventive nécessitent que la plateforme les supporte/modèle correctement.
    - Les objets MediaStream et AudioContext doivent être explicitement détruits/stoppés pour éviter les fuites.
    - Fonctionne sur la base d'une logique asynchrone : bien chaîner les appels, notamment lors des

### src/utils/export.js

- **Rôle du fichier** :  
  Gestion des opérations d’import/export de fichiers audio et de données (JSON), ainsi que de certaines actions liées à la session utilisateur (nouvelle réunion, confettis).

- **Fonctions exportées :**
  - `uploadAudio()`
    - **Paramètres** : aucun
    - **Retour** : void
    - **Effet de bord :** simule un clic sur l’élément input file `#audioUpload` dans le DOM

  - `handleAudioUpload(event, processAudio, formatMessage)`
    - **Paramètres** :
      - `event` (Event) : évènement de changement d’un input file
      - `processAudio` (Function) : fonction asynchrone pour traiter l’audio
      - `formatMessage` (Function) : fonction de traduction/formattage des messages utilisateurs
    - **Retour** : Promise<void>
    - **Effet de bord :**  
      - Alerte l’utilisateur si le fichier n’est pas audio ou dépasse 25 Mo
      - Réinitialise toujours l’input file (`event.target.value = ''`)
      - Appelle `processAudio` si validation OK, affiche une alerte sinon

  - `exportSummary(config)`
    - **Paramètres** :
      - `config` (Object) : contient les données du résumé, historique, actions, etc.
    - **Retour** : Promise<void>
    - **Effet de bord :**
      - Génère et déclenche le téléchargement d’un JSON (via `saveFile`)
      - Met à jour le statut via `setStatus`

  - `startNewMeeting(config)`
    - **Paramètres** :
      - `config` (Object) : objets/fonctions setters et utilitaires de session
    - **Retour** : void
    - **Effet de bord :**
      - Réinitialise tous les états de réunion/session (transcriptions, actions, audio, etc.)
      - Vide/sauvegarde les données de session, déclenche la mise à jour du statut

  - `triggerConfetti(targetElement, confetti)`
    - **Paramètres** :
      - `targetElement` (HTMLElement) : cible pour les confettis
      - `confetti` (Function) : fonction d’affichage de confettis
    - **Retour** : void
    - **Effet de bord :**
      - Déclenche la fonction confetti sur la cible si présente (effet visuel)

- **Points d’attention / edge cases / dépendances :**
  - `handleAudioUpload` : 
    - N’accepte que le premier fichier de la sélection.
    - N’accepte que les fichiers MIME `audio/*`.
    - Taille max stricte : 25 Mo (non configurable).
    - Affiche des alertes navigateur en cas d’erreur.
    - Utilise `formatMessage` pour l’internationalisation/templating des messages.
  - `exportSummary` : dépend de la fonction utilitaire asynchrone `saveFile` provenant de `../platform/download.js`.
  - Plusieurs fonctions dépendent fortement de la présence, validité et bon fonctionnement des setters et callbacks passés en paramètre (`config`).
  - `triggerConfetti` : rien n’est fait si `targetElement` est null/indéfini ; nécessite le paramètre `confetti` pour fonctionner.  
  - Manipulation directe du DOM dans `uploadAudio` et `handleAudioUpload` (fragile si l’élément n’existe pas).

### src/utils/formatUtils.js

- **Rôle du fichier :**
  - Fournit des fonctions utilitaires pour formater des durées et des dates, notamment pour de l’affichage et l’horodatage de transcriptions.

- **Fonctions exportées :**
  - `formatDurationConditional(seconds: number): string`
    - Formate une durée :
      - `MM:SS` si `< 1h`
      - `HH:MM:SS` sinon
    - Paramètre : nombre de secondes (number).
    - Retour : chaîne formatée.
    - Effet de bord : aucun.

  - `formatDurationHHMMSS(seconds: number): string`
    - Formate une durée en permanence au format `HH:MM:SS`.
    - Paramètre : nombre de secondes (number).
    - Retour : chaîne formatée.
    - Effet de bord : aucun.

  - `transcriptStamp(elapsedSeconds: number, now?: Date): {timeStr: string, timestamp: string}`
    - Génère :
      - `timeStr` : durée écoulée formatée (`HH:MM:SS`, via `formatDurationHHMMSS`)
      - `timestamp` : heure courante du poste (`HH:MM:SS`)
    - Paramètres :
      - `elapsedSeconds` (number) : secondes écoulées.
      - `now` (Date, optionnel) : date/heure à utiliser (défaut : date/heure système à l’appel).
    - Retour : objet `{ timeStr, timestamp }`.
    - Effet de bord : lit l’heure système si `now` absent.

  - `normalizeDate(dateString: string): string`
    - Normalise une date au format `YYYY-MM-DD`.
    - Paramètre : chaîne de date.
    - Retour : date normalisée ou chaîne vide si échec.
    - Effet de bord : aucun.

- **Points d’attention :**
  - **Edge cases :**
    - Pour `formatDurationConditional` et `formatDurationHHMMSS` : aucun contrôle que `seconds` est >= 0 ou un nombre entier (comportement natif JS si type inattendu).
    - `normalizeDate` :
      - Accepte des formats variés (ISO, DD-MM-YYYY, DD/MM/YYYY, MM-DD-YYYY…).
      - En cas d’ambiguïté entre DD-MM-YYYY et MM-DD-YYYY, privilégie le format européen (DD-MM-YYYY).
      - Retourne `''` si la chaîne n’est pas une date valide ou d’un format non reconnu.
      - Si le jour et le mois ≤ 12 : hypothèse forte sur la préférence européenne, peut entraîner des inversions jour/mois.
    - `transcriptStamp` : si un objet `Date` invalide est passé en second paramètre, retourne `'NaN:NaN:NaN'` pour `timestamp`.

  - **Dépendances :**
    - Toutes les fonctions sont pures, sauf `transcriptStamp` (lecture de l’heure système si le second paramètre est absent).
    - Dépendances internes : `transcriptStamp` utilise `formatDurationHHMMSS`. Pas de dépendance externe.

### src/utils/httpErrorHandler.js

- **Rôle du fichier**
  - Centralise la gestion des erreurs HTTP liées à l’authentification OIDC, à la connectivité réseau et aux appels d'API IA (OpenAI, Anthropic...), en assurant la compatibilité web/app Capacitor.
  - Gère la détection automatique, le logging, la catégorisation et le recouvrement automatique des situations d’expiration de session ou d’indisponibilité de service IA.
  - Fournit des hooks d'intégration pour l'app native (jeton Bearer, handler de réauth) et installe un intercepteur global fetch pour protéger les routes /api/.

- **Fonctions exportées**

  - `registerAuthTokenProvider(fn)`
    - **Paramètres**: fonction retournant le jeton JWT/Bearer à attacher.
    - **Retour**: void
    - **Effet**: Définit le provider de jeton d'auth. (capteur mobile).

  - `registerAuthFailureHandler(fn)`
    - **Paramètres**: fonction appelée sur erreur d’auth (webview/app).
    - **Retour**: void
    - **Effet**: Définit le handler d’échec d’auth. (app native).

  - `getAuthToken()`
    - **Paramètres**: aucun
    - **Retour**: string (JWT courant ou '')
    - **Effet**: Lit le token mobile via le provider (ou chaîne vide).

  - `isAuthenticationError(response)`
    - **Paramètres**: Response
    - **Retour**: boolean
    - **Effet**: True si 401 ou 403.

  - `isOAuthRedirectError(error)`
    - **Paramètres**: Error
    - **Retour**: boolean
    - **Effet**: True si erreur OAuth redirection/CORS.

  - `categorizeApiError({response, error})`
    - **Paramètres**: objet avec Response et/ou Error
    - **Retour**: 'auth' | 'ai_service' | 'network'
    - **Effet**: Catégorise l’erreur API IA.

  - `aiErrorMessageKey(category)`
    - **Paramètres**: catégorie ('auth', 'ai_service', 'network')
    - **Retour**: string (clé i18n)
    - **Effet**: Associe un message utilisateur à la catégorie d’erreur.

  - `logAiServiceError(response, endpoint)`
    - **Paramètres**: Response, endpoint (string)
    - **Retour**: Promise<void>
    - **Effet**: Log technique pour l’admin. Clone la réponse.

  - `detectAiProvider(text)`
    - **Paramètres**: string (corps d’erreur)
    - **Retour**: string (nom affichable du provider, ou '')
    - **Effet**: Détecte le provider IA d’après le texte.

  - `inspectAiServiceError(response, endpoint)`
    - **Paramètres**: Response, endpoint (string)
    - **Retour**: Promise<{status, isCredit, provider, detail} | null>
    - **Effet**: Analyse et log l’erreur IA, détecte quota/crédit épuisé.

  - `handleHttpError(response, endpoint)`
    - **Paramètres**: Response, endpoint (string)
    - **Retour**: Promise<string>
    - **Effet**: Gestion/parse des erreurs HTTP. Peut throw 'SESSION_EXPIRED'.

  - `handleFetchError(error, endpoint)`
    - **Paramètres**: Error, endpoint (string)
    - **Retour**: 'SESSION_EXPIRED' | null
    - **Effet**: Gère les erreurs réseau/CORS, log adapté.

  - `registerRecordingGuard(fn)`
    - **Paramètres**: fonction guard durant un enregistrement
    - **Retour**: void
    - **Effet**: Interdit tout rechargement/réauth pendant un enregistrement.

  - `isRecordingGuardActive()`
    - **Paramètres**: aucun
    - **Retour**: boolean
    - **Effet**: True si guard active (rec en cours).

  - `consumeDeferredAuthError()`
    - **Paramètres**: aucun
    - **Retour**: string|null
    - **Effet**: Consomme/retourne une raison d’auth différée.

  - `isOpaqueAuthRedirect(res)`
    - **Paramètres**: Response
    - **Retour**: boolean
    - **Effet**: True si fetch a été redirigé (exp. de session, CORS, opaque).

  - `isHtmlResponse(res)`
    - **Paramètres**: Response
    - **Retour**: boolean

### src/utils/httpErrorHandler.test.js

- **Rôle du fichier :**
  - Tests unitaires des utilitaires de gestion d’erreurs HTTP liés à la gestion d’authentification, en particulier lors de scénarios d’enregistrement et de forçage de ré-authentification.
- **Fonctions testées/exportées :**
  - `registerRecordingGuard(getter: ?Function): void`
    - Définit une fonction "garde" (guard) consultée pour savoir si un « enregistrement en cours » doit temporairement bloquer certaines actions.
    - **Effet de bord :** Change la fonction de garde globale.
    - Si argument non fonction, désactive la garde sans erreur.
  - `isRecordingGuardActive(): boolean`
    - Retourne l’état courant exposé par la fonction de garde (si définie).
    - Si la fonction lève une erreur, retourne `false`.
  - `consumeDeferredAuthError(): string|null`
    - Récupère puis purge le cas échéant la dernière raison d’erreur d’auth différée.
    - Retourne la chaîne (raison) ou `null` s’il n’y a rien à consommer.
  - `forceReauth(): Promise<void>`
    - Tente de forcer une ré-authentification.
    - **Effet de bord :** Déclenche des effets systèmes (non exécutés si un enregistrement est actif).
    - Si enregistrement en cours, ne fait rien sauf mémoriser une erreur différée (`'forceReauth-pendant-enregistrement'`).
    - Sûr à appeler en Node, jamais de côté effect nocif/teardown dans ce cas.
  - `autoRecoverFromAuthError(reason: string): Promise<boolean>`
    - Gère une erreur d’authentification selon contexte : la diffère si enregistrement en cours.
    - Retourne une promesse résolue en `false` (non traité immédiatement si erreur différée).
    - Seule la première raison différée est retenue jusqu’à consommation.
- **Points d'attention :**
  - **Cas limites :**
    - Un getter d’état qui lève une exception ne bloque jamais l’action, retourne `false` silencieusement.
    - `registerRecordingGuard` tolère un argument invalide (désactive la garde).
    - Plusieurs erreurs différées : seule la première est retenue.
    - Les tests garantissent l’absence d’effets systèmes inattendus (ex: accès au DOM) en environnement Node si enregistrement actif.
  - **Dépendances :**
    - Nécessite le module `vitest` pour l’exécution des tests.  
    - Se base sur des fonctions du fichier `src/utils/httpErrorHandler.js`.

### src/utils/panels.js

- **Rôle du fichier :**
  - Gère dynamiquement le redimensionnement et le layout de trois panneaux principaux (« left », « middle », « action ») dans l’interface, avec contraintes minimales de tailles, gestion des évènements de resize (souris, clavier) et adaptation aux changements de dimensions du container principal.

- **Fonction exportée :**
  - `createPanelsManager(config)`
    - **Paramètre :**
      - `config` : objet attendu avec de nombreux getters/setters pour manipuler références DOM, états internes et styles des panneaux, variables de redimensionnement, etc.
    - **Retour :**
      - Un objet contenant les méthodes suivantes :

        - `getAvailablePanelWidth()`
          - **Paramètres :** aucun
          - **Retour :** largeur disponible (en px) pour les panneaux, déduite du container principal.
          - **Bord notable :** dépend de la présence du container DOM.

        - `setPanelsStacked(flag)`
          - **Paramètres :** booléen (true : panneaux « empilés »)
          - **Retour :** aucun
          - **Effets de bord :** force l’arrêt du redimensionnement et met à jour les styles.

        - `updatePanelStyles()`
          - **Paramètres :** aucun
          - **Retour :** aucun
          - **Effet de bord :** modifie les styles CSS des éléments panneaux.

        - `updatePanelRatios(available)`
          - **Paramètres :** `available` (largeur utilisable totale)
          - **Retour :** aucun
          - **Effet de bord :** recalcule/stocke les ratios de proportions des panneaux.

        - `enforcePanelBounds(available)`
          - **Paramètres :** `available` (largeur utilisable totale)
          - **Retour :** aucun
          - **Effet de bord :** ajuste en cascade les largeurs des panneaux selon les contraintes minimales.

        - `initializePanelWidths(force=false)`
          - **Paramètres :** `force` (booléen)
          - **Retour :** aucun
          - **Effet de bord :** calcule et assigne les dimensions initiales selon ratios ou états précédents ; peut passer en mode empilé si l’espace manque.

        - `startPanelResize(event, handle)`
          - **Paramètres :** `event` (PointerEvent), `handle` (string : 'left' ou 'right')
          - **Retour :** aucun
          - **Effet de bord :** initie le mode redimensionnement interactif, ajoute des listeners globaux et classes CSS ; capture le pointeur.

        - `handlePanelResizeMove(clientX)`
          - **Paramètres :** `clientX` (number)
          - **Retour :** aucun
          - **Effet de bord :** modifie les largeurs des panneaux pendant drag du pointeur.

        - `stopPanelResize(skipRatios=false)`
          - **Paramètres :** `skipRatios` (booléen)
          - **Retour :** aucun
          - **Effet de bord :** nettoie les listeners, supprime la classe CSS spéciale, libère la capture de pointeur et met à jour les ratios si nécessaire.

        - `handlePanelResizeKey(event, handle)`
          - **Paramètres :** `event` (KeyboardEvent), `handle` (string)
          - **Retour :** aucun
          - **Effet de bord :** permet le redimensionnement par flèches clavier.

        - `setupPanelResizeObserver()`
          - **Paramètres :** aucun
          - **Retour :** aucun
          - **Effet de bord :** installe un `ResizeObserver` sur le container des panneaux pour ajuster automatiquement la taille/répartition en cas de resize.

- **Points d’attention :**
  - **Edge cases/Contraintes :**
    - Les largeurs minimales sont strictement respectées pour chaque panneau, pouvant contraindre la répartition.
    - Le mode « empilé » est activé automatiquement si la largeur disponible descend sous le minimum requis.
    - Les ratios et largeurs peuvent dériver si des valeurs non finies ou incohérentes sont stockées dans les setters/getters : plusieurs vérifications de finitude/validité sont présentes.
    - La gestion du redimensionnement suppose l’existance et la validité des setters/getters fournis dans `config`.
  - **Dépendances et effets globaux :**
    - Ajoute/retire la classe CSS `resizing-panels` au body pendant drag & drop pour effets visuels globaux.
    - Évènements globaux (`window`, `document`) ajoutés/ret

### src/utils/pdf.js

- **Rôle du fichier**  
  Génération de fichiers PDF à partir de résumés HTML, incluant la gestion du style, de l’internationalisation, du rendu DOM→PDF, du téléchargement et de l’envoi.

- **Fonctions exportées**
  - `generatePDF(config)`
    - **Paramètres** :  
      - `config` *(Object)* :  
        - `hasGeneratedSummary` *(boolean)* : résumé présent  
        - `summaryText` *(string)* : HTML du résumé  
        - `userName` *(string)* : nom de l’utilisateur  
        - `currentTemplate` *(string)*  
        - `currentLanguage` *(string)*  
        - `templateOptions` *(Array)*  
        - `t` *(Function)* : traduction  
        - `formatMessage` *(Function)*  
        - `setStatus` *(Function)*  
        - `isValidUserName` *(Function)*  
        - `uiText` *(Object)*  
    - **Retour** : `Promise<void>`
    - **Effets de bord** :
      - Affiche un alert() si aucun résumé généré
      - Télécharge le PDF via `saveFile` (adaptateur plateforme)
      - Appel console et mise à jour de statut (`setStatus`)
  - `buildSummaryPdfBlob(config)`
    - **Paramètres** :  
      - `config` : même structure que `generatePDF`
    - **Retour** :  
      - `Promise<{blob: Blob, filename: string}>`
    - **Effets de bord** :  
      - Ajoute/retire dynamiquement des éléments DOM temporaires et CSS pour le rendu
      - Utilise `setStatus` pour informer de l’état en cours
      - Log en console lors du rendu des pages PDF

- **Points d'attention**
  - **Dépendances** :
    - [html2canvas](https://github.com/niklasvh/html2canvas) : rendu visuel HTML→canvas côté client
    - [jsPDF](https://github.com/parallax/jsPDF) : génération et manipulation PDF
    - `saveFile` : abstraction pour le téléchargement, compatible plateforme (navigateur, Webview...)
  - **Edge cases** :
    - **DOM pollution** : Si une erreur survient avant insertion, les éléments temporaires ne sont pas ajoutés ; le `finally` vérifie et évite les fuites mémoire.
    - **Erreurs html2canvas** : En cas d’échec du rendu, une erreur localisée est renvoyée.
    - **Limitations serveur** : La génération PDF dépend du DOM et ne fonctionne que côté client ; impossible depuis un environnement serveur.
    - **Templates** : Si un template n’est pas trouvé, un titre par défaut est utilisé.
    - **Langue/Nom utilisateur** : Fallbacks en cas d’absence de nom ou de traduction.
    - **jsPDF** :
      - Le PDF est paginé en découpant “l’image” générée en plusieurs pages A4.
      - Les styles sont en CSS injecté et peuvent différer du rendu UI réel.
    - **Alert bloquant** : Si `hasGeneratedSummary` est `false`, l’utilisateur voit un alert ; la génération s’arrête.
    - **Sécurité** : Le rendu HTML du résumé doit éviter d’inclure du contenu potentiellement malicieux.

- **À adapter en cas de modification** :
  - Toute évolution de la structure `config` ou de la gestion des plateformes de téléchargement doit être répercutée ici.
  - html2canvas et jsPDF évoluent : tester à chaque montée de version des dépendances.
  - Les modifications de styles CSS peuvent affecter l’apparence PDF sans effet côté UI.

### src/utils/peerConnection.js

- **Rôle du fichier :**
  - Gère la connexion WebRTC (audio + data channel) côté client pour la transcription vocale temps réel via un backend type OpenAI ; inclut initialisation, reconnexion automatique et gestion de session.

- **Fonctions exportées :**
  - `createPeerConnectionManager(config)`
    - **Paramètres :**
      - `config` : objet de configuration, contenant des getters/setters pour l’état et la gestion de la connexion, le flux audio, la langue, l’URL des APIs (OpenAI & n8n), les callbacks de message, etc. (voir code pour détails précis).
    - **Retour :**
      - Objet `{ setupPeerConnection, reconnectPeerConnection, closePeerConnection }`
    - **Méthodes de l’objet retourné :**
      - `setupPeerConnection() : Promise<void>`
        - Crée et configure une connexion WebRTC (nouvelle session), data channel, ajoute le flux audio mixé, négocie la session avec OpenAI.
        - **Effets de bord :**
          - Ferme/nettoie les connexions/data channel précédents.
          - Peut lancer une reconnexion automatique en cas d’échec ou de perte de connexion.
          - Met à jour les références internes via les setters du `config`.
          - Appelle le backend OpenAI (`aiBaseUrl`) pour négociation SDP.
      - `reconnectPeerConnection() : Promise<void>`
        - Lance un cycle de reconnexion : obtention nouvelle clé (`n8nBaseUrl`), relance la connexion.
        - **Effets de bord :**
          - Réessaie en boucle toutes les 5 secondes en cas d’échec.
          - Modifie les états de reconnexion/clé client/connexion via setters.
      - `closePeerConnection() : void`
        - Ferme (et nettoie) data channel et connexion peer, arrête l’envoi d’audio.
        - **Effets de bord :**
          - Arrête les tracks audio envoyés.
          - Met à jour à `null` les références.

- **Points d’attention / edge cases / dépendances :**
  - **Dépendances :**
    - Nécessite `ICE_SERVERS` (`../config/constants.js`).
    - La négociation SDP nécessite l’API OpenAI paramétrée par `aiBaseUrl`.
    - Le renouvellement du client_secret passe par l’API n8n (`n8nBaseUrl`).
    - Nécessite de fournir tous les getters/setters dans `config` et notamment le flux audio mixé, sinon la connexion échouera.
  - **Comportements notables :**
    - La reconnexion est automatique lors d’une perte de connexion si l’enregistrement est actif.
    - Gère les deux cas de reconnexion : ICE ou data channel.
    - Les tracks du flux audio ne sont PAS stoppées quand une peer connection est fermée (c’est volontaire, cf. commentaire).
  - **Edge cases :**
    - Si le flux audio (`getMixedAudioStream`) n’existe pas, la connexion n’aura pas de piste audio (donc transcription impossible).
    - Si les APIs distantes (OpenAI/n8n) échouent, les cycles de reconnexion persistent tant que l’enregistrement est actif.
    - Configuration de session envoyée automatiquement sur ouverture du data channel.
    - Les callbacks/handlers non fournis dans le `config` peuvent provoquer des erreurs runtime silencieuses.
    - L’API OpenAI doit accepter un POST en `application/sdp` avec l’offre SDP ; sinon la mise en place échoue.
    - Le code repose sur le fait que chaque tentative remplace les connexions précédentes (pas de multiplexing géré).

### src/utils/session.js

- **Rôle du fichier**
  - Gestion de la persistance des données de session utilisateur via `localStorage` (transcriptions, actions détectées, notes de réunion, résumés, etc.).
  - Nettoyage/filtrage de certains états d'interface pour éviter des effets indésirables lors de la restauration.

- **Fonctions exportées**

  - **saveSessionData(config)**
    - **Paramètres :**
      - `config` (objet) : Doit contenir `transcriptionHistory`, `transcriptionFullText`, `detectedActions`, `meetingNotes`, `summaryText`, `summaryVersions`, `activeVersionId`, `getDefaultSummaryTextFor`, `currentLanguage`.
    - **Retour :** Aucun.
    - **Effets de bord :** 
      - Écrit dans `localStorage` sous plusieurs clés liées à la session.
      - Filtre les marqueurs d’animation (`flash`, `refineFlash`) avant sauvegarde pour éviter des rejouements au rechargement.
    - **Points d'attention :**
      - En cas de données `undefined` (ex : meetingNotes), la clé n'est pas touchée.
      - `summaryText` sauvegardé uniquement si différent de la valeur par défaut.

  - **restoreSessionData(config)**
    - **Paramètres :**
      - `config` (objet) : Attendu d’avoir des setters pour chaque type de données persistée, ainsi que `getDefaultSummaryTextFor` et `currentLanguage`.
    - **Retour :**
      - Objet contenant toutes les données restaurées (mêmes clés que les données sauvegardées dans `saveSessionData`).
    - **Effets de bord :**
      - Lit le `localStorage`, peuple les setters fournis (si présents).
      - Attribue des ids aux actions dépourvues via `ensureActionIds`.
    - **Points d'attention :**
      - Les setteurs sont optionnels dans `config` : la restauration directe dans le state dépend de leur présence.
      - Edge case : si des actions sauvegardées n’ont pas d’id (anciennes sessions), un id leur est attribué lors de la restauration.
      - Gère les erreurs de parsing JSON et signale les corruptions potentielles.
      - Pour les versions de résumé, vérifie/ajuste le `activeVersionId` si l’id sauvegardé n’existe plus.

  - **clearSessionData()**
    - **Paramètres :** Aucun.
    - **Retour :** Aucun.
    - **Effets de bord :**
      - Supprime toutes les clés de session du `localStorage` associées à l’application.
    - **Points d'attention :**
      - N’efface rien d’autre que les clés explicitement listées.

- **Dépendances internes**
  - `ensureActionIds` de `./liveActionsMerge.js` (utilisé dans la restauration des `detectedActions`).

- **Points d'attention globaux**
  - Les fonctions n’assurent aucune migration des structures de données si le format change.
  - Manipulation directe du `localStorage` : attention aux quotas de taille et à la persistance sur différents navigateurs.
  - Les erreurs lors de la lecture/écriture dans `localStorage` sont visibles uniquement via la console (pas de gestion utilisateur).
  - Les setters doivent impérativement respecter la même signature/format que lors de la sauvegarde pour éviter des incohérences lors de la restauration.

### src/utils/sessionStorage.js

- **Rôle** :  
  Gestion de la persistance des données de session via `localStorage` (historique de transcription, texte complet, actions détectées, résumé, temps d'enregistrement cumulé).

- **Fonctions exportées** :  
  - `saveSessionData(data)`
    - **Paramètres** :
      - `data` (*Object*) : contient `transcriptionHistory` (Array), `transcriptionFullText` (string), `detectedActions` (Array), `summaryText` (string), `defaultSummaryText` (string)
    - **Retour** : aucun
    - **Effets de bord** : écrit dans `localStorage` plusieurs clés (`mybrief_*`). N'écrit le résumé que s’il diffère de la valeur par défaut.  
    - **Logs** : écrit dans la console en cas de succès ou d’erreur.
  - `restoreSessionData()`
    - **Paramètres** : aucun
    - **Retour** : *Object* `{ transcriptionHistory, transcriptionFullText, detectedActions, summaryText, actionIdCounter }`
    - **Effets de bord** : lecture dans `localStorage`
    - **Comportement** : 
      - Ne restaure que les transcriptions sans `isDelta` vrai (évite les transcriptions partielles).
      - Reconstruit `actionIdCounter` à partir des IDs déjà présents.
      - Loggue les erreurs.
  - `saveCumulativeRecordingTime(cumulativeTime)`
    - **Paramètres** : `cumulativeTime` (*number*) - durée en secondes
    - **Retour** : aucun
    - **Effets de bord** : écrit dans `localStorage` (`mybrief_cumulative_recording_time`)  
    - **Logs** : loggue les erreurs.
  - `restoreCumulativeRecordingTime()`
    - **Paramètres** : aucun
    - **Retour** : *number* (secondes, entier ≥0)
    - **Effets de bord** : lecture dans `localStorage`
    - **Comportement** : retourne 0 si la valeur n'est pas définie ou incorrecte. Loggue les erreurs.

- **Points d'attention** :  
  - Les données sont sérialisées/désérialisées en JSON sauf pour les strings et le temps cumulé.
  - Les erreurs lors des accès à `localStorage` sont capturées et logguées, mais non propagées.
  - Le filtrage sur `isDelta` dans l'historique peut surprendre si le format change.
  - Dépendance globale à l’API navigateur `localStorage` (non disponible côté serveur).  
  - Certains champs (`actionIdCounter`) sont calculés dynamiquement à la restauration.
  - Pas de gestion spécifique de la corruption ou incompatibilité des données stockées (autre que le fallback aux valeurs par défaut).

### src/utils/summary.js

- **Rôle du fichier** :  
  Normalise du HTML de résumé généré par un LLM (nettoyage des espaces, lignes vides, suppression de motifs « --- » issus de templates).

- **Fonctions exportées** :
  - `normalizeSummaryHtml(html)`
    - **Paramètres** :
      - `html` (*string*) : Chaîne de caractères contenant du HTML à normaliser.
    - **Retour** :
      - (*string*) : HTML normalisé selon plusieurs règles de nettoyage.
    - **Effet de bord notable** :
      - Aucun effet de bord ; fonction pure.

- **Points d'attention** :
  - Retourne l'entrée sans modification si `html` est falsy.
  - Suppression des lignes constituées uniquement de `---`.
  - Uniformisation des espaces, retours à la ligne et balises communes (`ul`, `ol`, `li`, `p`, `h1`-`h6`).
  - Ne traite pas la validité HTML globale, uniquement des normalisations basiques.
  - Aucun appel réseau ou dépendance externe.
  - Peut produire un résultat inattendu si du texte « --- » est utilisé en dehors d’un gabarit.

### src/utils/transcription.js

- **Rôle du fichier :**
  - Fournit un gestionnaire pour la gestion des transcriptions (complètes ou partielles) lors de réunions, via une API configurable.

- **Fonctions exportées :**
  - `createTranscriptionManager(config)`
    - **Paramètres :**
      - `config` *(Object)* : Objet de configuration devant contenir les fonctions suivantes :  
        `getTranscriptionHistory`, `setTranscriptionHistory`,  
        `getTranscriptionFullText`, `setTranscriptionFullText`,  
        `getTranscriptContainer`, `getMobileTranscriptContainer`,  
        `detectActions`, `saveSessionData`, `tick`.
    - **Retour :**
      - *(Object)* : Contient la méthode `addTranscription`.
    - **Méthodes internes retournées :**
      - `addTranscription(text, author, isDelta = false)`
        - **Paramètres :**
          - `text` *(string)* : Texte de la transcription.
          - `author` *(string)* : Auteur de la transcription.
          - `isDelta` *(boolean, optionnel)* : Si `true`, transcription partielle (delta).
        - **Retour :**  
          - *void*
        - **Effets de bord :**
          - Modifie l’historique des transcriptions (`setTranscriptionHistory`).
          - Met à jour le texte complet (`setTranscriptionFullText`) pour les transcriptions finales.
          - Déclenche le scroll automatique sur le container de transcription.
          - Détecte des actions tous les 5 messages finaux (`detectActions`).
          - Sauvegarde la session pour les transcriptions finales (`saveSessionData`).

- **Points d’attention :**
  - **Validation** : Les textes invalides (via `isValidTranscription`) sont ignorés, sans log pour des raisons de confidentialité.
  - **Gestion du delta** :
    - Si `isDelta` et un delta existe déjà en dernier dans l'historique, il est remplacé (overwrite).
    - Les transcriptions finales mettent à jour le texte agrégé et peuvent provoquer une détection d’actions.
  - **Effets UI** : Le scroll automatique dépend des containers HTML récupérés via la config.
  - **Dépendances externes** :
    - Utilise une validation externe via `isValidTranscription` depuis `transcriptionValidation.js`.
    - Nécessite les méthodes passées dans `config` (voir la liste ci-dessus).
  - **Edge cases** :
    - Aucune gestion de fusion de plusieurs deltas successifs (un seul delta est supporté à la fois).
    - Si un container de transcription n'existe pas, le scroll automatique est sans effet.
  - **Confidentialité** : Aucun log sur les contenus rejetés.

### src/utils/transcriptionValidation.js

- **Rôle du fichier :**
  - Fournit des utilitaires pour filtrer et valider des transcriptions, en éliminant celles jugées non pertinentes (ex : crédits automatiques, hésitations, contenus triviaux issus de YouTube, etc.).

- **Fonctions et exports :**
  - **`listToDelete`**
    - Type : `string[]`
    - Liste de phrases exactes à rejeter systématiquement comme transcriptions.
    - Aucun effet de bord.

  - **`isYouTubeSubtitlePattern(text)`**
    - **Paramètres :**
      - `text` (`string`) : le texte à vérifier.
    - **Retour :**
      - `boolean` : `true` si le texte correspond à un pattern typique de sous-titre YouTube (crédits, remerciements, phrases de fin, etc.), sinon `false`.
    - **Effet de bord :**
      - Aucun.
    - **Notes :**
      - Fonctionne par correspondance avec plusieurs regex couvrant les possibles variantes et formulations.

  - **`isValidTranscription(text)`**
    - **Paramètres :**
      - `text` (`string`) : le texte à valider.
    - **Retour :**
      - `boolean` : `true` si la transcription est considérée comme pertinente, sinon `false`.
    - **Effet de bord :**
      - Aucun.
    - **Règles principales :**
      - Rejette explicitement si le texte :
        - Est dans `listToDelete`.
        - Correspond à un pattern de sous-titre YouTube (`isYouTubeSubtitlePattern`).
        - Fait moins de 3 caractères (après trim).
        - Ne contient aucun caractère alphanumérique.
        - Est un mot d'hésitation courant (ex : "Hmm", "euh", "ah", etc.).
        - Ne contient que de la ponctuation.
        
- **Points d'attention :**
  - **Edge cases :**
    - Distinction sensible à la casse et aux espaces dans les listes/exclusions : un mot mal formaté peut passer outre les filtres.
    - Certaines phrases peuvent ne pas être filtrées si elles diffèrent légèrement des patterns/liste.
    - Les transcriptions composées uniquement de caractères accentués sont quand même validées si elles sont alphanumériques.
    - Le filtrage d'hésitations repose sur des regex simples, non contextuelles.
  - **Dépendances :**
    - Aucune dépendance externe (usage natif de String & RegExp).
    - `isValidTranscription` dépend de `listToDelete` et `isYouTubeSubtitlePattern`.

### src/utils/userIdentity.js

- **Rôle du fichier :**
  - Utilitaires pour valider la valeur d'un nom d'utilisateur extrait des en-têtes d'identité (ex. OIDC, n8n).
- **Fonctions exportées :**
  - `isValidUserName(name)`
    - **Paramètres :**
      - `name` (*any*): valeur à tester comme nom d'utilisateur.
    - **Retour :**
      - *boolean* : `true` si la valeur passée est un nom d'utilisateur valide, `false` sinon.
    - **Effet de bord notable :**
      - Aucun.
- **Points d'attention :**
  - Les valeurs sentinelles « no value », « unknown », « undefined », « null » (insensibles à la casse/espaces) sont explicitement rejetées.
  - Accepte uniquement un paramètre *string* non vide, sinon retourne `false`.
  - Aucun appel externe ou dépendance à d’autres modules.
  - Attention aux inputs inattendus (`name` = objet, nombre, `undefined`) : retourne toujours `false`.

### src/utils/userIdentity.test.js

- **Rôle du fichier :**
  - Fichier de tests unitaires validant le comportement de la fonction `isInternalEmail` du module `userIdentity.js`.
- **Fonctions exportées :**
  - Aucune fonction exportée ; ce fichier ne définit que des suites de tests à exécuter avec Vitest.
- **Principales fonctions testées :**
  - `isInternalEmail(email: string): boolean`
    - **Paramètres :** `email` (string)
    - **Retour :** booléen (`true` si l’email appartient au domaine interne `@myalfred.ai`, sinon `false`)
    - **Effets de bord notables :** aucun
- **Points d’attention :**
  - **Sensibilité à la casse et aux espaces :** Le test vérifie que les emails sont reconnus comme internes même avec espaces et casse variée.
  - **Domaines similaires :** S’assure que seuls les emails strictement en `@myalfred.ai` sont acceptés (exclut les sous-domaines ou emails contenant la chaîne dans une autre partie).
  - **Valeurs invalides :** La fonction doit retourner `false` pour les emails vides, `null` ou `undefined`.
  - **Dépendances :** Utilise le framework de test Vitest (`describe`, `it`, `expect`) et la fonction `isInternalEmail` du module local.

### src/utils/wakeLock.js

- **Rôle du fichier :**
  - Fournit un gestionnaire universel de « Wake Lock » pour empêcher la mise en veille de l’écran lors de la transcription/recording audio/vidéo.
  - Combine plusieurs techniques : Screen Wake Lock API moderne, diversion via une vidéo silencieuse (pour iOS), animation canvas hors-écran (fallback legacy).

- **Fonction exportée :**
  - `createWakeLockManager(getIsRecording)`
    - **Paramètres** :
      - `getIsRecording`: fonction de lecture réactive, retourne un booléen indiquant si un enregistrement/transcription est actif.
    - **Retourne** : un objet `{ activate, release, isActive, isSupported, destroy }`
      - `activate() : Promise<void>`
        - Effet : active toutes les stratégies anti-veilles ; demande le wake lock si supporté ; crée la vidéo & le canvas keep-alive.
      - `release() : void`
        - Effet : désactive toutes les stratégies ; libère le wake lock ; retire vidéo/canvas & event listeners.
      - `isActive() : boolean`
        - Indique si le wake lock (ou une des stratégies) est actif.
      - `isSupported() : boolean`
        - Indique la prise en charge native Wake Lock de l’API navigateur.
      - `destroy() : void`
        - Alias de `release()`, nettoie tous les effets de bord.
    - **Effets de bord notables** :
      - Ajoute/retire dynamiquement des éléments DOM cachés (vidéo, canvas), modifie la classe CSS `keep-screen-awake` sur `<body>`, installe/désinstalle un event listener sur `document`.
      - Loggue des avertissements en console (console.warn) en cas d’échec d’acquisition ou d’exécution.

- **Points d’attention (edge cases, dépendances, limitations) :**
  - **Support navigateur :**
    - Wake Lock natif pas dispo sur tous les navigateurs (ex : vieux iOS, certains Firefox).
    - Vidéo « NoSleep » nécessaire sur iOS Safari ; nécessite interaction utilisateur préalable pour autoplay.
    - Canvas keep-alive utilisé en fallback si aucun des deux ci-dessus.
  - **Interaction utilisateur requise** : le play automatique de la vidéo peut être bloqué si aucune interaction utilisateur n’a eu lieu.
  - **Fuites mémoire** : mauvaise gestion de release()/destroy() peut laisser des éléments DOM cachés ou des timers actifs ; éviter les doubles instanciations.
  - **Dépendances implicites** : manipulation du DOM (`document`, `navigator`) → ne fonctionne pas côté serveur.
  - **Comportement asynchrone** : l’appel `activate` est asynchrone (acquisition Wake Lock), mais la vidéo/canvas sont créés immédiatement.
  - **Sécurité :**
    - Ne vérifie pas l’environnement sandboxé ; si l’API est cassée, le code tente fallback sans interruption fatale.
    - Certains navigateurs peuvent jeter des erreurs inattendues lors de l’usage de l’API Wake Lock ou du play vidéo, gérées en silence ou en log.
  - **Effets visuels** : si CSS personnalisée attend l’absence de la classe `.keep-screen-awake`, elle doit être tolérante.

### src/utils/documentExport.js

- **Rôle du fichier**
  - Génère les fichiers à exporter ou joindre aux actions post-réunion (« Envoyer par mail », « Entreposer »), notamment résumé en PDF (via html2canvas côté client) ou transcription texte.
  - Génère les noms de fichiers selon un gabarit utilisateur ou une convention par défaut, en fonction du contexte (langue, date, type) obtenu via des stores Svelte.

- **Fonctions exportées**
  - **`documentNameFor({ historyItem, ext, fallback })`**
    - *Paramètres* :
      - `historyItem?` : objet contenant des métadonnées de la réunion (`title`, `lastConnecion`, `now`).
      - `ext` : string, extension du fichier ('pdf' ou autre).
      - `fallback` : string, titre de secours en cas de titre manquant.
    - *Retour* : `Promise<string>` - nom du fichier généré.
    - *Effet de bord* : Lit le store linguistique (`currentLanguageStore`) et charge des paramètres utilisateur asynchrones (`ensureActionSettings`).
    - *Notable* : Le nom dépend du gabarit utilisateur, sinon applique un format `AAAA-MM-JJ-titre.ext`.
  
  - **`buildActionAttachment({ kind, transcriptionText, historyItem, pdfConfig })`**
    - *Paramètres* :
      - `kind` : 'transcription' ou 'summary'.
      - `transcriptionText` : string, contenu de la transcription (pour `kind=transcription`).
      - `historyItem?` : métadonnées pour nommer le fichier.
      - `pdfConfig` : objet de configuration pour le rendu PDF (si `kind=summary`).
    - *Retour* : `Promise<{blob: Blob, filename: string}|null>` - objet `{ blob, filename }` ou `null` en cas d’échec.
    - *Effet de bord* : Peut afficher une erreur dans la console si la génération échoue. Fait appel à `buildSummaryPdfBlob` pour le PDF. Dépend de la disponibilité de html2canvas côté client.
    - *Notable* : Retourne `null` si un PDF ne peut être généré, pour ne pas bloquer l'action globale.

- **Points d’attention**
  - Dépendances fortes à Svelte stores (`currentLanguageStore`), paramètres utilisateur asynchrones, et à la disponibilité côté client de html2canvas pour la génération du PDF.
  - Edge cases : 
    - Si la génération du PDF échoue, la fonction log et retourne proprement `null` (ne bloque pas l’envoi).
    - Si `title` absent, utilise `fallback` pour nommer les fichiers.
    - Gestion de la langue basée sur le store, par défaut 'fr' si non 'en'.
  - Mise en page/format du fichier peut différer côté client (téléchargement direct) vs côté serveur (qui réapplique le gabarit au besoin).

### src/utils/filename.js

- **Rôle du fichier**  
  Génère des noms de fichiers sûrs, normalisés et lisibles pour des documents exportés (ex. : `AAAA-MM-JJ-titre-en-slug.ext`). Prévient les incompatibilités inter-plateformes, gère la datation locale, propose la génération par gabarits et la translitération des titres.

- **Fonctions exportées**
  - `slugifyTitle(title, fallback = 'document')`
    - **Paramètres** :
      - `title` *(string)* : titre du document
      - `fallback` *(string, optionnel)* : valeur de repli si le titre ne contient aucun caractère valide
    - **Retour** : *(string)* Slug du titre, dépourvu d'accents, caractères non alphanumériques, borné à 80 caractères. Utilise `fallback` si résultat vide.
    - **Effets de bord** : Normalise les accents par suppression, non remplacement.
  - `fileDatePart(source)`
    - **Paramètres** :
      - `source` *(Date|string|number, optionnel)* : date cible, ou 'aujourd’hui' si non fournie.
    - **Retour** : *(string)* Date au format AAAA-MM-JJ (locale, jamais UTC).  
    - **Effets de bord** : Utilise la date locale, jamais UTC ; en cas d’entrée non valide, retourne la date du jour.
  - `documentFilename({ title, date, ext, fallback = 'document' })`
    - **Paramètres** :
      - `title` *(string, optionnel)* : titre du document  
      - `date` *(Date|string|number, optionnel)* : date du document
      - `ext` *(string, requis)* : extension, sans point
      - `fallback` *(string, optionnel)* : fallback pour le titre
    - **Retour** : *(string)* Nom de fichier complet sous forme `YYYY-MM-DD-slug.ext`.
  - `renderFilenameTemplate(template, vars = {}, { ext })`
    - **Paramètres** :
      - `template` *(string)* : gabarit comportant des variables sur double-moustaches (`{{titre}}`, `{{date}}`…)
      - `vars` *(objet)* : valeurs substituées `{ titre, date, type, compte }`
      - `{ ext }` : extension du fichier (requis, sans point)
    - **Retour** : *(string|null)* Nom de fichier issu du gabarit + ext., ou null si aucun caractère valable.
    - **Effets de bord** : Substitution non récursive ; variables inconnues supprimées ; ext. jamais gabaritable ; contrôle les caractères interdits.

- **Points d’attention**
  - **Cas limites / comportements notables**
    - `slugifyTitle` : Si le titre ne donne aucun caractère, renvoie le fallback. Peut troncature à 80 caractères.
    - `fileDatePart` : Protège contre dates non valides ; bascule sur date actuelle.
    - `renderFilenameTemplate` :
      - Gabarit vide → null.
      - Variables inconnues ou vides → rien inséré.
      - Procède à un seul passage de substitution (pas de récursion).
      - Extension jointe strictement hors gabarit.
      - Retire tous caractères de contrôle (ASCII < 32 et 127).
      - Slug final limité à 200 caractères.
    - **Duplication structurelle** de la table des variables modèles (`TEMPLATE_ALIASES`), voir commentaire dans le code.
  - **Dépendances** :  
    - Ne dépend que des fonctionnalités natives JS (`Date`, `String`, RegExp).
    - Référence duplicata d’une table d’alias externe utilisée côté API (cf. commentaire sur Dockerfile).  
    - Gabarit vérifié par un test de parité séparé (`src/utils/filenameTemplate.parity.test.js`).

### src/utils/historyTitle.js

- **Rôle :**
  - Génère les titres affichables et métadonnées pour les réunions d'historique, en gérant les cas particuliers liés aux régimes de données historiques ou incomplètes et leurs repliques sur des fallbacks datés ou numérotés.

- **Fonctions exportées :**

  - **historyItemDate(item)**
    - **Paramètres :**
      - `item` (*Object*) : Un élément d'historique.
    - **Retour :**
      - `Date|null` : La première date exploitable (`lastConnecion`, `lastConnection`, ou `now`), ou null si absente ou invalide.
    - **Effet de bord notable :**
      - Gère la faute de frappe d'origine `lastConnecion` dans les propriétés de date.

  - **resolveHistoryTitle(item, lang = 'fr')**
    - **Paramètres :**
      - `item` (*Object|string|null*) : Item d’historique tel que renvoyé par `/history`.
      - `lang` (*string*) : 'fr' ou 'en' (optionnel).
    - **Retour :**
      - `string` : Un titre utilisable (ou fallback daté/localisé si absence d’un vrai titre ou titre générique du backend).
    - **Effet de bord notable :**
      - Détecte et évite les titres de repli problématiques (`BACKEND_UNTITLED`, nom de compte).
      - Fallback non dépendant de `toLocaleDateString` pour robustesse en tests.

  - **formatHistoryItemTitle(item, index, fallbackLabel = 'Réunion')**
    - **Paramètres :**
      - `item` (*Object|string|null*) : Item d’historique (toutes formes possibles, même héritées).
      - `index` (*number*) : Position dans la liste (base 0).
      - `fallbackLabel` (*string*) : Libellé utilisé s’il n’existe aucun titre (injecté, déjà traduit).
    - **Retour :**
      - `string` : Titre à afficher dans la modale mobile (pouvant inclure email/template, filename, label, id, ou fallback numéroté).
    - **Effet de bord notable :**
      - Attention à l’ordre de priorité des champs : n’affiche pas de valeurs `undefined undefined` (corrige un bug historique lié à la concaténation).
      - Ne dépend pas du store de langue.

  - **formatHistoryItemMeta(item, lang = 'fr')**
    - **Paramètres :**
      - `item` (*Object|string|null*) : Item d’historique.
      - `lang` (*string*) : 'fr' ou 'en' (optionnel).
    - **Retour :**
      - `string` : Date localisée (si présente), sinon durée, sinon chaîne vide.

- **Points d’attention :**
  - **Edge cases :**
    - Propriété `lastConnecion` (faute de frappe) prioritaire sur `lastConnection` / `now`.
    - Titres de repli du backend (`BACKEND_UNTITLED`) ou issus du nom du compte détectés/ignorés pour éviter les doublons et titres peu informatifs.
    - Pour les items sans titre, fallback sur libellé daté ou numéroté, selon le contexte (liste principale vs modale mobile).
    - Concaténation de champs mail/template pour anciens items : vérification explicite pour éviter les `undefined undefined`.
  - **Dépendances :**
    - Pas de dépendance externe ; utilise seulement des valeurs locales et des fonctions utilitaires internes.
    - Locale de date gérée à la main pour éviter les incohérences entre environnements JS (`toLocaleDateString` non fiable en tests/navigateurs).
  - **Internationalisation :**
    - Prise en charge minimaliste du français et de l’anglais pour les fallbacks, sans dépendance à un store i18n.

### src/utils/i18nFormat.js

- **Rôle du fichier :**
  - Fournit une fonction utilitaire pour résoudre des clés i18n (internationalisation) à partir d’un dictionnaire, avec gestion de substitutions de variables dans les chaînes de caractères.

- **Fonctions exportées :**
  - `formatText(dict, path, replacements = {})`
    - **Paramètres :**
      - `dict` : objet source contenant l'ensemble des clés/valeurs de traduction.
      - `path` : clé sous forme de chaîne pointée par des dots (ex : `"utilisateur.nom"`).
      - `replacements` : objet de paires `{variable: valeur}` pour remplacer les occurrences `{variable}` dans la chaîne traduite (facultatif, défaut : `{}`).
    - **Retour :**
      - La valeur traduite (chaîne de caractères) issue de `dict`, avec substitutions effectuées le cas échéant.
      - Si la clé n’existe pas dans `dict`, retourne la clé `path` elle-même.
    - **Effet de bord notable :**
      - Aucun effet de bord externe.

- **Points d’attention :**
  - **Comportement sur clé inconnue** : Retourne la chaîne `path` (la clé elle-même) si non trouvée, pour faciliter la détection des absents.
  - **Substitution** : Ne remplace qu’une seule occurrence `{variable}` par clé dans la chaîne (ne gère pas les multiples occurrences d’une même variable).
  - **Types** : Si la valeur trouvée dans le dictionnaire n’est pas une chaîne, le `path` est retourné.
  - **Dépendances** : Aucune dépendance externe.
  - **Edge cases** :
    - Un `path` erroné ou incomplet ne lève pas d’exception mais retourne la clé.
    - Les objets imbriqués non-string dans le dictionnaire sont ignorés.

### src/utils/logoutTarget.js

- **Rôle du fichier :**
  - Détermine la/les cibles à fermer lors d'une déconnexion utilisateur selon le contexte d'authentification (web, plugin OIDC, mobile).
  - Fournit le chemin exact à utiliser pour la déconnexion du plugin OIDC Traefik.

- **Fonctions exportées :**

  - `resolveLogoutTarget(context)`
    - **Paramètres :**
      - `context` (objet, optionnel) avec propriétés :  
        - `authMode` (`'oidc'`, `'password'`, `'sso'`, optionnel)
        - `isNative` (booléen, optionnel, défaut : `false`) — build mobile (Capacitor)
        - `oidcEnabled` (booléen, optionnel, défaut : `false`) — plugin OIDC activé
    - **Retour :**
      - Chaîne indiquant la(les) cible(s) de déconnexion :
        - `'mobile'` : JWT local de l’app mobile
        - `'plugin'` : plugin OIDC (Traefik)
        - `'native'` : session serveur native uniquement
        - `'native+plugin'` : cumule session native et plugin OIDC
    - **Effet de bord :**
      - Aucun (fonction pure, déterministe, sans modification d’état)
    - **Point d’attention :**
      - Ne réalise aucune action de déconnexion ; décision pure (utile pour des tests)
      - L’activation du plugin (`oidcEnabled`) n’est qu’une déclaration côté configuration, pas une détection dynamique.
      - Les modes d’authentification gérés sont explicites ; d'autres valeurs de `authMode` non prévues peuvent retourner `'native'` ou `'native+plugin'` selon le flag.

  - `PLUGIN_LOGOUT_PATH`
    - **Valeur :**  
      - `'/oauth2/callback/logout'`
    - **Usage :**
      - À utiliser pour déclencher le logout du plugin OIDC Traefik (et **non** `/oauth2/logout`)
    - **Point d’attention :**
      - Adresse `/oauth2/logout` non routée—ça renvoie une 404 silencieuse.

- **Points d’attention généraux :**
  - Dépendances : aucune importation, tout est autonome.
  - Le bouton de déconnexion peut être inefficace si on ne purge pas toutes les “sources” d’authentification déterminées.
  - Les edge cases concernent principalement la combinaison des modes d’auth et de la plateforme ; bien s’assurer que `oidcEnabled` est correctement renseigné selon le contexte d’exécution réel.

### src/utils/offlineGaps.js

- **Rôle du fichier :**
  - Gestion des marqueurs de coupure réseau (« gaps ») dans la transcription d’une app native.
  - Génération, résolution et comptage des segments non transcrits lors d’un passage hors ligne.
  - Fonctions pures, sans effet de bord ni mutation des arguments.

- **Fonctions exportées :**
  - `makeGapMarkerItem({ gapId, time, timestamp, author, text })`
    - **Paramètres :**
      - `gapId` (string) : identifiant unique du gap.
      - `time` (number), `timestamp` (number), `author` (string), `text` (string) : métadonnées du segment.
    - **Retour :** objet représentant le gap (prêt à insérer dans l’historique).
    - **Effets de bord :** aucun.
  - `resolveGapMarker(history, gapId, text)`
    - **Paramètres :**
      - `history` (Array) : historique de transcription.
      - `gapId` (string) : identifiant du gap à remplacer.
      - `text` (string) : transcription différée.
    - **Retour :** `{ history: Array, changed: boolean }` (historique mis à jour, indication de changement).
    - **Effets de bord :** aucun (nouveau tableau).
    - **Remarques :** 
      - Si `text` vide ou spaces only, le marqueur est supprimé (= gap muet ou filtré).
  - `countPendingGaps(history)`
    - **Paramètre :**
      - `history` (Array) : historique de transcription.
    - **Retour :** nombre (`number`) de gaps non résolus (présence de `offlineGapId`).
    - **Effets de bord :** aucun.
  - `recomputeFullText(history)`
    - **Paramètre :**
      - `history` (Array) : historique de transcription.
    - **Retour :** texte complet reconstruit (string), exclut les deltas et lignes vides.
    - **Effets de bord :** aucun.

- **Points d’attention :**
  - Ne modifie jamais les objets de l’historique d’origine (immutabilité).
  - Le remplacement d’un gap par un texte vide supprime son marqueur ; donc, attention à ne pas perdre des emplacements vides dans la transcription.
  - Doit rester synchronisé avec les conventions de transcriptionHistory et l’intégration côté App.svelte / offlineRecording.js (structure des items et gestion des identifiants).
  - Testé unitairement (garantie de cohérence si utilisé selon la convention).

### src/utils/orientation.js

- **Rôle du fichier**  
  Gestion du verrouillage de l’orientation en portrait sur mobile. Permet de forcer l’affichage portrait sur les appareils compatibles, avec fallback CSS (overlay) si le verrouillage n’est pas possible.

- **Fonctions exportées**
  - `lockPortraitOrientation()`
    - **Paramètres** : aucun
    - **Retour** : `() => void` — fonction de nettoyage qui retire les listeners.
    - **Effet de bord** :
      - Tente de verrouiller l’orientation en portrait sur mobiles « pointer: coarse ».
      - Ajoute un listener `visibilitychange` pour refaire le lock quand l’app revient au premier plan.
      - Sur échec (navigateurs ne supportant pas l’API), l’overlay CSS `.rotate-overlay` doit masquer l’app en paysage.
      - Pas d’impact sur desktop ou navigateurs non compatibles.

- **Fonctions internes**
  - `isMobileLike()`
    - **Détecte** si l’on est sur un terminal à pointeur grossier (mobile/tablette).
    - Retourne un booléen.
  - `tryLock()`
    - **Tente** un `screen.orientation.lock('portrait')` asynchrone.
    - Retourne un booléen résolvant la réussite du lock.

- **Points d’attention**
  - **Compatibilité** :  
    - Le verrou matériel (`screen.orientation.lock`) n’est possible que sur PWA Android installée et en display-mode standalone; ailleurs, rejet silencieux.
    - iOS Safari ne supporte pas `screen.orientation.lock`.
  - **Fallback nécessaire** :
    - Doit être accompagné d’un overlay CSS `.rotate-overlay` pour masquer l’app en paysage sur les plateformes non supportées.
  - **Edge cases** :
    - Si `window` ou `screen` n’est pas défini (SSR, tests), la fonction retourne juste un cleanup vide.
    - Les changements d’onglet peuvent relâcher le verrou — d’où le listener `visibilitychange`.

### src/utils/passwordPolicy.js

- **Rôle du fichier :**
  - Implémente la politique de mot de passe côté client pour validation immédiate lors de la saisie.
  - Miroir léger de la logique du serveur (API), utilisé uniquement pour l’UX (le serveur valide systématiquement pour la sécurité).
  - La longueur minimale configurable côté serveur est prise en compte dynamiquement par le frontend.

- **Fonctions et constantes exportées :**
  - `DEFAULT_MIN_LENGTH`
    - Valeur : `10`
    - Usage : Valeur par défaut pour la longueur minimale de mot de passe.
  - `MAX_LENGTH`
    - Valeur : `200`
    - Usage : Limite supérieure pour la longueur du mot de passe.
  - `checkPassword(password, {email?, minLength?} = {})`
    - Paramètres :
      - `password` (`string`)&nbsp;: mot de passe à valider.
      - `ctx` (`object` facultatif)&nbsp;: contexte optionnel.
        - `email` (`string` facultatif)&nbsp;: email de l'utilisateur, utilisé pour éviter les mots de passe contenant le local part.
        - `minLength` (`number` facultatif)&nbsp;: longueur minimale, par défaut `DEFAULT_MIN_LENGTH`.
    - Retour :
      - `{ ok: true }` si le mot de passe passe les vérifications.
      - `{ ok: false, reason: string }` sinon, avec un slug pour l’erreur (`required`, `too_short`, `too_long`, `contains_email`).
    - Effet de bord&nbsp;: aucun.

- **Points d’attention :**
  - Ne pas utiliser côté sécurité : validation doublée par le serveur indispensable.
  - Edge cases&nbsp;:
    - Email vide ou local part de moins de 3 caractères&nbsp;: la règle “contains_email” ne s’applique pas.
    - Si `minLength` n’est pas fourni, on utilise la valeur définie par le backend (récupérée via `/api/auth/config`).
    - `password` falsy (`''`/`null`/`undefined`) retourne immédiatement une erreur.
  - Dépendances : aucune dépendance externe.

### src/utils/postActions.js

- **Rôle du fichier**
  - Fournit des fonctions pour déclencher et diagnostiquer les actions post-réunion (envoi de documents par email, dépôt sur un Drive) et traduire les résultats renvoyés (succès/erreurs) en messages utilisateurs adaptés.
  - Centralise la logique des "toasts" utilisateur suivant le résultat retourné par l’API.

- **Fonctions exportées**
  - `runEmailAction({ payload, attachment, showToast, email })`
    - **Paramètres :**
      - `payload` : `{ kind, title, content, lang }` – contenu à envoyer.
      - `attachment` : `{ blob: Blob, filename: string } | null` – fichier joint (ou null).
      - `showToast` : fonction (slug, type, durée, variables) – affiche une notification.
      - `email` : string – adresse du destinataire (pour affichage, la cible réelle dépend du serveur).
    - **Retour :** `Promise<void>`
    - **Effets de bord :** Appelle `showToast` au moins une fois selon la situation (succès, envoi partiel, erreur type ou générique).
  ---
  - `runStoreAction({ payload, attachment, showToast, providerLabel, approved, onApprovalRequired })`
    - **Paramètres :**
      - `payload` : objets de données à stocker.
      - `attachment` : fichier à déposer (**obligatoire** ; si null, échec immédiat).
      - `showToast` : fonction notification.
      - `providerLabel` : label du fournisseur (ex : "Google Drive").
      - `approved` : boolean (optionnel, par défaut `false`) – accord explicite donné par l'utilisateur.
      - `onApprovalRequired` : fonction (optionnelle, par défaut `requestStoreApproval`) appelée quand le serveur demande une confirmation supplémentaire.
    - **Retour :** `Promise<{ stored: boolean }>`
    - **Effets de bord :**
      - Affiche un toast en fonction du résultat (succès ou types d’erreurs identifiés).
      - Peut appeler récursivement la demande d’approbation jusqu’à obtention d’un accord ou refus.
  ---
  - `runActionTestAction(payload, texts)`
    - **Paramètres :**
      - `payload` : `{ target, kind?, lang?, scope? }` – type d’action à tester.
      - `texts` : `{ errors: Record<string, string> }` – correspondance slug/textes erreurs à afficher.
    - **Retour :** `Promise<{ ok: boolean, key: string, vars: object, details: Array<{labelKey, value, sourceKey}> }>`
      - Fourni un diagnostic détaillé prêt à afficher.
    - **Effets de bord :** Aucun (fonction pure).
    
- **Points d'attention**
  - **Edge cases :**
    - `runEmailAction` avertit dans le cas où des destinataires sont ignorés par le serveur SMTP.
    - `runStoreAction` requiert impérativement une pièce jointe pour procéder, sinon retour immédiat et toast d’erreur.
    - Gestion spécifique de l’approbation (utilisateur ou serveur) pour stocker des documents : boucle d’appel jusqu’à confirmation, évitant une infinité d’approbations en cas de serveur mal configuré.
    - Traitement explicite du cas d’erreur 429/"trop de tests" dans `runActionTestAction`, avec extraction du délai recommandé (`retryAfter`).
    - Les messages et détails servent à orienter l’utilisateur sur la nature exacte du problème (reconnexion, reconfiguration, etc).
  - **Dépendances internes :**
    - Fonctionne en coordination avec :
      - `../services/actionsApi.js` (`sendDocumentByEmail`, `storeDocument`, `runActionTest`)
      - `../stores/storeApproval.js` (`requestStoreApproval`)
    - Les textes utilisateurs affichés dépendent de clefs de traduction (`messages.*`, `configActions.*`), transmises ou importées ailleurs.
  - **Autres**
    - Aucun stockage d’état, pas d’accès global, interface purement transactionnelle.
    - Aucune logique d’UI : se contente d’orchestrer traitements et retours pour affichage par le front.

### src/utils/safeNext.js

- **Rôle** :  
  Valider le paramètre `next` d’URL après connexion, pour empêcher toute redirection externe malveillante et garantir que l’utilisateur reste sur le site actuel.

- **Fonctions exportées :**
  - `DEFAULT_NEXT`
    - **Type** : `string`
    - **Valeur** : `'/'`
    - **Description** : Valeur de repli (racine du site) utilisée si `next` n’est pas jugé sûr.
  - `safeNext(value)`
    - **Paramètre** :
      - `value` (`unknown`) : Valeur à valider comme chemin de redirection.
    - **Retour** : `string`  
      - Chemin sûr du site (ex : `/dashboard`), ou `DEFAULT_NEXT` (`'/'`).
    - **Effets de bord** : Aucun.

- **Points d’attention :**
  - **Sécurité** : N’accepte que les chemins relatifs internes commençant par `/`, refuse tout ce qui pourrait permettre une redirection externe ou ambiguë (`//`, `\`, caractères de contrôle, etc.).
  - **Edge cases** :
    - Valeurs falsy, non-string, vides ou ne commençant pas par `/` → retournent `/`.
    - Un chemin commençant par `//`, `/\`, ou contenant un antislash ou caractères de contrôle → rejeté.
  - **Dépendances** :  
    - Aucune, code autonome.
    - Attention : Doit rester synchronisé avec la logique serveur équivalente (`services/api/lib/auth/safeNext.js`).

### src/utils/transcriptDeltas.js

- **Rôle du fichier :**
  - Gère le suivi des segments de transcription pour éviter les doublons entre les messages incrémentaux ("deltas") et les résultats finaux ("completed") selon les différences de comportement des modèles de transcription.
  - Permet d’identifier si une ligne a déjà été affichée par les deltas avant sa version finalisée.

- **Fonctions exportées :**
  - `findPendingDeltaIndex(history, source)`
    - **Paramètres :**
      - `history` : Array d’objets (transcription historique, chaque item peut avoir `{isDelta?: boolean, source?: string}`)
      - `source` : string (identifie la source du flux, ex : micro, audio système)
    - **Retour :**
      - `number`: index de la dernière ligne delta active pour le flux donné, ou -1 si aucune
    - **Effet de bord notable :**
      - Aucun
  - `createTranscriptDeltaTracker()`
    - **Paramètres :**
      - Aucun
    - **Retour :**
      - Objet avec 3 méthodes :
        - `onDelta(source, text)`
          - Ajoute et cumule le texte delta pour le flux spécifié
          - **Effet de bord** : met à jour l’état interne (`pending`)
        - `takeCompleted(source, transcript)`
          - Indique si la transcription finale `transcript` du flux `source` est déjà entièrement constituée par l’accumulation des deltas précédents (retourne `true` si déjà affiché)
          - Remet à zéro le cumul pour ce flux
          - **Effet de bord** : supprime le suivi du flux dans l’état interne
        - `reset()`
          - Efface tous les suivis (“pending”) pour débuter une nouvelle session/enregistrement
          - **Effet de bord** : réinitialise l’état interne

- **Points d’attention :**
  - **Edge cases :**
    - Les flux sont adressés par `source` (ex : 'local' par défaut), attention à utiliser la même convention sur toute l’application.
    - `findPendingDeltaIndex` retourne -1 si `history` n’est pas un tableau (évite une erreur silencieuse).
    - les comparaisons de texte utilisent `normalizeForCompare()` (cf. dépendance), attention si la normalisation évolue.
  - **Dépendances :**
    - Dépend de `normalizeForCompare` de `./transcriptEcho.js` pour les comparaisons de texte (doit gérer les éventuelles différences de ponctuation, casses, espaces, etc.).
  - Modèle d’événements adaptatif : des comportements inattendus peuvent survenir si un flux change son mode d’émission delta/completed sans alignement avec la logique de ce module (cf. commentaires en haut du fichier).
  - Conseillé d’appeler systématiquement `takeCompleted()` pour chaque événement `completed` reçu, même si la ligne n’est pas ajoutée, pour maintenir la cohérence de l’état.

### src/utils/transcriptEcho.js

- **Rôle du fichier**  
  - Déduplique les doublons de transcription émanant du micro **et** du partage d'audio système lors de visioconférences, afin de ne garder qu'une seule occurrence (marquée 'remote') lorsqu'une même phrase remonte sur les deux flux (problème d'écho).

- **Fonctions exportées**
  - **normalizeForCompare(text: string): string**
    - Normalise une chaîne de texte pour comparaison (minuscules, suppression des accents/ponctuation, espaces uniformisés).
    - Paramètres : `text` (string)
    - Retour : texte normalisé (string)
    - Effet de bord : aucun.
    
  - **similarity(a: string, b: string): number**
    - Calcule la similarité entre deux textes déjà normalisés (basé sur la distance de Levenshtein, normalisé entre 0 et 1).
    - Paramètres : `a` et `b` (strings normalisées)
    - Retour : score de similarité entre 0 (différent) et 1 (identique)
    - Effet de bord : aucun.

  - **parseElapsedSeconds(time: string): number**
    - Convertit une chaîne horaire "HH:MM:SS" en nombre de secondes.
    - Paramètres : `time` (string)
    - Retour : nombre de secondes (`number`), ou `NaN` si non valide
    - Effet de bord : aucun

  - **findEchoDuplicate(history: Array<Object>, candidate: Object): number**
    - Recherche, dans l’historique, un doublon potentiel (même texte sur l’autre source, dans une fenêtre temporelle définie).
    - Paramètres :
      - `history` : tableau d’objets transcription (items)
      - `candidate` : objet `{text, source, elapsedS, [selfIndex]}`
    - Retour : index du doublon trouvé dans l’historique, ou -1 si aucun
    - Effet de bord : aucun

  - **applyEchoDedup(history: Array<Object>, candidate: Object): {history: Array<Object>, dropped: boolean}**
    - Applique la déduplication d’écho à l'historique de transcription.
    - Modifie potentiellement `source` d’une ligne existante, retire la ligne dupliquée du micro si déjà présente.
    - Paramètres :
      - `history` : historique des transcriptions
      - `candidate` : objet transcription à ajouter (voir findEchoDuplicate)
    - Retour : objet `{history, dropped}` où `dropped = true` si le candidat ne doit pas être ajouté
    - Effet de bord : retourne un nouvel historique si modification

- **Points d’attention**
  - **Cas limites** :
    - Les phrases très courtes (`< 6 caractères`, par ex. "oui", "ok") ne sont jamais dédupliquées (risque de faux positifs).
    - Analyse par fenêtre temporelle de 12s (synchronisation approximative micro/système).
    - Le rapprochement "flou" (Levenshtein) n’est appliqué que pour des textes assez longs (`≥ 16 caractères`), seuil de similarité fixé à 0.82.
    - Les textes très longs sont tronqués à 400 caractères pour comparaison (performance).
    - Le découpage des horaires suppose format "HH:MM:SS" exactement.
  - **Dépendances** :
    - Aucune dépendance externe, pure JS.
    - Suppose la présence cohérente des champs `text`, `source`, `time` dans l’historique des transcriptions.
  - **Effets notables** :
    - Une ligne conservée peut être rétroactivement "promue" en source 'remote'.
    - La suppression de doublon se fait au moment de l’ajout/finalisation d’une nouvelle ligne.

### src/utils/versionGuard.js

- **Rôle du fichier :**
  - Détecte un changement de version de l’application (en comparant la version du bundle à celle mémorisée localement).
  - Purge certains caches applicatifs hérités pour garantir un démarrage propre après mise à jour.

- **Fonction exportée :**
  - `runVersionGuard()`
    - **Paramètres** : aucun.
    - **Retour** : `Promise<void>`.
    - **Effets de bord :**
      - Compare la version actuelle (`appVersion.version` depuis `../version.json`) à celle stockée dans `localStorage`.
      - Si la version a changé :
        - Supprime tous les caches applicatifs non liés à `workbox-precache` via l’API `caches` (caches de versions/sws précédents).
        - Met à jour la version mémorisée dans `localStorage`.
        - Affiche en console le changement de version et l’opération de purge.
      - Ne touche pas aux données de `localStorage` métier (utilisateur).

- **Points d'attention :**
  - **Edge cases :**
    - Si `localStorage` ou `caches` ne sont pas disponibles ou génèrent une erreur, l’opération continue sans interruption (erreurs silencieuses).
    - Si `appVersion.version` n’est pas défini, la fonction ne fait rien.
  - **Dépendances :**
    - Lit la version applicative depuis `../version.json`.
    - Utilise les APIs web `localStorage` et `caches`.
    - Suppression sélective : ne supprime que les caches dont le nom ne commence pas par `workbox-precache` (préserver les précaches gérés par le Service Worker via Workbox).
    - Laisse à la charge du Service Worker (via la méthode `cleanupOutdatedCaches`) le nettoyage des anciens précaches.
    - Usage d’API navigateur : non compatible Node.js.

### src/utils/actionDetectionScheduler.js

- **Rôle :**
  - Organise et cadencie la détection d’actions dans des transcriptions audio, en optimisant le déclenchement des analyses et en évitant les doublons/chevauchements.
  - Corrige les anciens défauts de fenêtres de transcription disjointes et de processus de détection concurrent en offrant une fenêtre glissante et un verrou à un seul appel.

- **Fonctions & constantes exportées :**

  - `ACTION_WINDOW_SIZE`
    - **Type :** number (8)
    - **Description :** Taille de la fenêtre glissante pour l’analyse des segments finalisés (avec recouvrement pour ne rien perdre).

  - `ACTION_DEBOUNCE_MS`
    - **Type :** number (400)
    - **Description :** Durée en ms du débounce pour coalescer les notifications proches.

  - `buildActionWindow(history, size = ACTION_WINDOW_SIZE)`
    - **Params :**
      - `history` : Array d’objets `{text: string, isDelta?: boolean}`.
      - `size` : nombre d’éléments à prendre (optionnel, défaut : `ACTION_WINDOW_SIZE`).
    - **Retour :** string — concaténation des `text` (hors éléments `isDelta`), séparés par des sauts de ligne. Chaîne vide si entrée invalide.
    - **Effet de bord notable :** aucun.
    - **Remarques :** Filtre les transcriptions partielles (deltas) pour éviter de détecter une action sur une phrase incomplète.

  - `createActionScheduler(opts)`
    - **Params (objet) :**
      - `getContent()` : () => string — fonction retournant le texte actuel à l’analyse, appelé à chaque départ réel d’analyse.
      - `run(content)` : (string) => Promise<void> — fonction asynchrone déclenchant l’analyse du texte.
      - `onStateChange(inFlight?)` : (bool) => void, optionnel — notifie l’état interne (utile pour interface/chargement).
      - `getMinSentences()` : () => number, optionnel — nombre de phrases minimales à accumuler avant analyse (dynamique).
      - `isEnabled()` : () => boolean, optionnel — permet de désactiver l’ordonnanceur.
      - `debounceMs` : number, optionnel — délai de débounce.
    - **Retour :** objet avec méthodes :
      - `.notify()` — signale l’arrivée d’un segment à analyser ;
      - `.flush()` — force une analyse immédiate (fin d’enregistrement, analyse du reliquat) ;
      - `.reset()` — réinitialise l’état interne (nouvelle réunion, changement de contexte) ;
      - `.isInFlight()` — retourne l’état d’activité (boolean).
    - **Effets de bord / comportements :**
      - Un seul appel à la fois (`run`), avec relance différée si requis.
      - Ignore segments tant que le nombre requis n’est pas atteint, mais garantit qu’aucune arrivée n’est perdue (flush analyse tout).
      - Utilise un système de « dirty flag » pour assurer qu’un événement survenu pendant une analyse n’est pas perdu.
      - Le réglage `getMinSentences` et l’activation `isEnabled` sont lus dynamiquement à chaque appel.
      - Les exceptions lors de l’analyse n’empêchent pas la remise à zéro du verrou.

- **Points d’attention (dépendances, edge cases, etc.) :**
  - Ne dépend que des utilitaires standards et des fonctions passées en paramètres.
  - Gère le cas où l’historique des transcriptions peut EN DIMINUER (ex : déduplication ailleurs).
  - La fenêtre glissante permet de ne pas rater des actions prononcées à cheval sur deux lots.
  - La détection ne se base jamais sur la taille totale de l’historique (pour éviter problèmes si des éléments sont retirés entre deux analyses).
  - Plusieurs notifications rapprochées ne déclenchent qu’une seule analyse par cycle grâce au débounce.
  - La méthode `flush()` analyse même moins d’éléments que le seuil paramétré (pour capturer toute action pendant le reliquat final).

### src/utils/liveActionsMerge.js

- **Rôle du fichier**
  - Gère la fusion IMMUTABLE entre la liste d'actions affichées et le résultat fourni par un modèle AI, en maintenant les propriétés nécessaires à la réactivité, la cohérence des IDs, et la correction des champs vides ou non significatifs.

- **Fonctions exportées**

  - `ensureActionIds(actions, idCounter = 0)`
    - **Paramètres** :
      - `actions` (Array) : Liste d’actions éventuellement incomplètes.
      - `idCounter` (number, optionnel) : Dernier identifiant utilisé.
    - **Retour** : `{ actions: Array, idCounter: number }`
      - Nouvelle liste d’actions où chaque élément a un ID numérique unique.
    - **Effets de bord notables** :
      - Incrémente `idCounter` si besoin.
      - Garde le tableau inchangé si tous les IDs sont déjà valides.

  - `splitActionsForPrompt(actions, placeholders = {})`
    - **Paramètres** :
      - `actions` (Array) : Liste d’actions à transformer.
      - `placeholders` (object, optionnel) : Placeholders pour vérifier si un champ est effectivement vide ou non rempli.
    - **Retour** : `{ active: Array, dismissed: Array }`
      - `active` : actions à transmettre au modèle (avec ID).
      - `dismissed` : actions supprimées, sans ID.
    - **Effets de bord notables :** retire les champs d'affichage et d’animation qui ne doivent pas partir au modèle.

  - `mergeDetectedActions(current, incoming, { idCounter = 0, defaults = {}, now } = {})`
    - **Paramètres** :
      - `current` (Array) : Liste actuelle des actions (affichée).
      - `incoming` (Array) : Résultat renvoyé par le modèle.
      - `opts` (object) :
        - `idCounter` (number) : Dernier identifiant utilisé.
        - `defaults` (object) : Valeurs par défaut pour les champs (`title`, `owner`, `description`).
        - `now` (number, optionnel) : Timestamp à utiliser.
    - **Retour** : `{ actions: Array, idCounter: number, createdIds: Array<number>, updatedIds: Array<number> }`
      - Nouvelle liste d’actions fusionnée de façon immuable, identifiants mis à jour, et IDs des actions créées/mises à jour.
    - **Effets de bord notables** :
      - Ajoute marqueurs d’animation (`flash`, `flashAt`) pour les actions nouvellement créées ou modifiées.
      - Ne restaure pas une action supprimée à la demande du modèle (sécurité).

  - `clearActionFlashes(actions, ids)`
    - **Paramètres** :
      - `actions` (Array) : Liste d’actions.
      - `ids` (Array<number>) : Identifiants des actions à nettoyer.
    - **Retour** : (Array) la liste des actions, avec marqueurs d’animation retirés si besoin.
    - **Effets de bord notables** :
      - Retourne le même tableau si rien n'est modifié (optimisation).
      - Efface `flash`, `flashAt`, `updatedFields` pour chaque action ciblée.

  - `FLASH_DURATION_MS`
    - **Constante** : Durée (en ms) des marqueurs d'animation (`flash`).

- **Points d’attention**
  - **Immutabilité** : Toutes les mutations de listes/objets créent de nouvelles références (indispensable à la réactivité Svelte).
  - **Edge cases** :
    - Les actions sans ID se voient attribuer de nouveaux IDs, les anciens enregistrements restent compatibles.
    - Le modèle pouvant renvoyer l’ensemble des champs, seuls les champs « non vides » écrasent les saisies utilisateurs.
    - Les actions supprimées par l’utilisateur ne peuvent être ressuscitées même à la demande du modèle.
    - La normalisation du titre (`normalizeForCompare`) empêche la duplication d’actions aux formulations proches.
  - **Dépendances** :
    - `normalizeDate` (depuis `./formatUtils.js`) : formatte les dates.
    - `normalizeForCompare` (depuis `./transcriptEcho.js`) : normalise les titres pour comparaison.
  - **Interopérabilité** : Les marqueurs visuels (`flash`, `newBadge`, etc.) sont ignorés lors des échanges avec le modèle (prompt) et nettoyés avant persistance.

### src/utils/templateTexts.js

- **Rôle du fichier :**
  - Fournit une fonction utilitaire pour construire un objet de textes littéraux destinés aux composants du template d’`App.svelte`.
  - Centralise la projection sélective de valeurs de `$uiText` vers une structure consommée par les enfants (ex. : ActionsPanel, MobileActionsModal).
  - Fonction pure : aucune logique métier ou effet de bord.

- **Fonctions exportées :**
  - `buildTemplateTexts(uiText)`
    - **Paramètres :**
      - `uiText` (objet) : source globale regroupant les textes de l’application par familles (sections, boutons, actions, etc.).
    - **Retour :**
      - (objet) : sous-structure de `uiText` avec uniquement les clés attendues/consommées par les composants enfants.
    - **Effets de bord :**
      - Aucun (fonction pure).

- **Points d’attention :**
  - **Edge cases :**
    - Aucune protection sur la présence ou la complétude des champs dans `uiText` : si des clés attendues sont manquantes, leur valeur dans l’objet retourné sera `undefined`.
  - **Dépendances :**
    - Attend que la structure de `uiText` suive strictement la hiérarchie (sections, buttons, actions, ariaLabels, app, resumeLoading).
    - Toute modification de cette structure dans la source doit être répercutée ici, sinon clés absentes pour le template.

### src/utils/transcriptRefine.js

- **Rôle du fichier :**
  - Applique une relecture automatique postérieure sur les dernières phrases transcrites, en s'appuyant sur les notes de réunion pour corriger les fautes orthographiques (ex : noms propres mal dictés).
  - Ne modifie jamais une phrase en cours de dictée ni les délimitations hors ligne.
  - Fonctionne de manière débouncée, un seul appel simultané, robustesse aux erreurs (aucun blocage si un appel échoue).

- **Fonctions/Constantes exportées :**
  - `REFINE_SENTENCE_COUNT`  
    - Nombre de phrases à relire à chaque passage (par défaut : 2).

  - `REFINE_DEBOUNCE_MS`  
    - Durée du débounce en ms avant déclenchement d’une relecture (par défaut : 1200 ms).

  - `pickRefineTargets(history, count = REFINE_SENTENCE_COUNT)`  
    - **Paramètres :**  
      - `history` : tableau d’objets {text, isDelta?, offlineGapId?}
      - `count` (optionnel)
    - **Retour :** tableau des `count` derniers items valides ({item, text})
    - **Effet de bord :** aucun  
    - **Point d'attention :** ignore les phrases vides, en cours de dictée (`isDelta`) ou marquées hors ligne (`offlineGapId`)

  - `acceptRefined(original, corrected)`  
    - **Paramètres :**  
      - `original` : string d'origine
      - `corrected` : string relue
    - **Retour :** string corrigée à appliquer, ou `null` si la correction est invalide (vide, identique à l’original, paraphrase)
    - **Effet de bord :** aucun

  - `diffWordFlags(original, corrected)`  
    - **Paramètres :**  
      - `original` : texte d’origine
      - `corrected` : texte corrigé
    - **Retour :** tableau [{word, changed: boolean}] pour chaque mot de la correction
    - **Effet de bord :** aucun  
    - **Algorithme :** LCS (Longest Common Subsequence) entre mots  
    - **Point d'attention :** complexité O(n.m) mais négligeable sur courtes phrases

  - `REFINE_FLASH_MS`  
    - Durée (ms) du surlignage visuel des mots modifiés (2600 ms)

  - `flashRefinedWords(index, original, corrected, update, ms = REFINE_FLASH_MS)`  
    - **Paramètres :**  
      - `index` : position de l’item à flasher dans l’historique
      - `original`, `corrected` : textes concernés
      - `update` : fonction de mise à jour fonctionnelle sur l’historique
      - `ms` : durée optionnelle
    - **Retour :** void
    - **Effet de bord :** met/retire la propriété volatile `refineFlash` sur l’item cible dans l’historique (jamais persisté)
    - **Point d'attention :** le retrait du marqueur se fait par estampille temporelle (`at`) pour résister au déplacement d’items

  - `createNotesRefiner({getHistory, setHistory, getNotes, isActive, post, editTranscription})`  
    - **Paramètres :**  
      - Fonctions d’accès et mutation de l’historique de transcription  
      - Récupération des notes  
      - Etat d’activité  
      - Fonction d’appel API POST pour raffinage  
      - Edition de la transcription
    - **Retour :** objet {notify, reset, isInFlight}
    - **Effet de bord :** modifie l’historique via `setHistory` et la transcription via `editTranscription`
    - **Dépendance interne :** `createTranscriptRefiner`

  - `createTranscriptRefiner({getTargets, getNotes, isActive, post, apply, debounceMs})`
    - **Paramètres :**  
      - Fonction pour extraire les cibles à corriger  
      - Accès aux notes, état d’activité, function d’API POST  
      - Fonction `apply` de correction  
      - Option debounceMs
    - **Retour :** objet {notify, reset, isInFlight}
    - **Effet de bord :** état interne ; appelle `apply` sur items corrigés

- **Points d'attention / Edge cases :**
  - Relecture best-effort : erreurs réseau/API ignorées, rien ne bloque l'enregistrement.
  - Les corrections rejetées si elles réécrivent la phrase au
