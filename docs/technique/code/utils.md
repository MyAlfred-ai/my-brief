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

- Construit les contraintes audio destinées à `getUserMedia`.
- Fonctions exportées :
  - `buildAudioConstraints(deviceId)` — prend l’identifiant du microphone, éventuellement absent. Retourne les traitements audio activés (`echoCancellation`, `noiseSuppression`, `autoGainControl`) et, si un identifiant est fourni, impose ce périphérique avec `deviceId: { exact: deviceId }`. N’a pas d’effet de bord.
  - `buildSystemAudioConstraints(deviceId)` — prend l’identifiant du périphérique virtuel servant à capturer le son de l’ordinateur. Retourne des contraintes qui imposent ce périphérique et désactivent les trois traitements audio. N’a pas d’effet de bord.
- Points d’attention :
  - Sans `deviceId`, `buildAudioConstraints` laisse le navigateur choisir le microphone par défaut.
  - `buildSystemAudioConstraints` exige un `deviceId` valide ; si le périphérique est indisponible, il n’y a pas de repli vers le micro par défaut.
  - Le fichier ne dépend d’aucun module. Les contraintes sont utilisées par `getUserMedia` ; le son système suppose un périphérique virtuel, décrit dans `lib/audio/systemAudio.js`.

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

- Traite l’import et la transcription de fichiers audio via l’API `/record`. Dépend de `recordUrl.js` pour construire l’URL de requête.
- Fonctions exportées :
  - `extractTranscriptionText(responseText, contentType = '')` — retourne le texte trouvé dans une réponse JSON (objet ou tableau) ou le texte brut ; retourne `null` si absent ou si le JSON ne contient pas de champ reconnu. Si le JSON est invalide, conserve la réponse brute.
  - `recordErrorKey(responseText)` — retourne la clé de traduction associée aux slugs `record_busy` et `audio_too_long`, sinon `null`. Aucun effet de bord.
  - `processAudio(config)` — retourne une `Promise<void>`. Envoie `config.audioBlob` en `multipart/form-data`, transmet la transcription à `config.addTranscription` et signale l’état via `config.setIsImportingAudio`. En cas d’erreur, journalise et affiche une alerte ; les refus connus affichent leur message dédié. `apiBaseUrl` vaut `/api` par défaut.
  - `readAudioDurationS(file)` — retourne une `Promise<number>` : durée arrondie en secondes, ou `0` si les métadonnées sont indisponibles ou non finies. Crée une URL objet puis la révoque.
- Points d’attention :
  - `processAudio` nécessite les fonctions de rappel fournies dans `config` et les API navigateur `FormData`, `fetch`, `File` et `alert`.
  - `readAudioDurationS` dépend de `Audio` et des URL objet ; la lecture est best-effort et ne décode pas le flux.
  - Les réponses `/record` peuvent être du JSON ou du texte brut ; seuls les champs de transcription reconnus sont extraits.

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

- Fournit des utilitaires sans état pour l’import audio et la remise à zéro d’une réunion.
- `uploadAudio()` — déclenche un clic sur l’élément DOM `#audioUpload` s’il existe. Ne retourne rien ; effet de bord : ouvre le sélecteur de fichiers.
- `handleAudioUpload(event, processAudio, formatMessage)` — traite le premier fichier sélectionné ; retourne une promesse (`Promise<void>`). Vérifie le type `audio/` et une taille maximale de 25 Mo ; en cas de validation échouée, affiche une alerte et réinitialise le champ. Après traitement, ou en cas d’erreur, réinitialise aussi le champ ; les erreurs sont journalisées dans la console et ne sont pas propagées.
- `startNewMeeting(config)` — réinitialise les états de transcription, d’actions, de résumé et d’enregistrement via les setters de `config`, puis appelle `clearSessionData()`, `saveSessionData()` et définit le statut à `statuses.ready`. Ne retourne rien.
- **Points d’attention :** dépend de l’API DOM (`document`), de `alert` et de `console`. `handleAudioUpload` suppose un événement avec `target.files` et `target.value`, ainsi que des fonctions `processAudio` et `formatMessage`. `startNewMeeting` attend toutes les fonctions et valeurs listées dans `config`.

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

- Gère les erreurs HTTP, réseau et OAuth, ainsi que la récupération de session pour le web et l’app native.
- Exports :
  - `registerAuthTokenProvider(fn)`, `registerAuthFailureHandler(fn)` : enregistrent des hooks d’authentification ; un argument non fonctionnel les réinitialise à `null`.
  - `getAuthToken()` : retourne le jeton fourni par le hook, ou `''`.
  - `isAuthenticationError(response)` : retourne `true` pour les statuts 401/403.
  - `isOAuthRedirectError(error)` : retourne `true` si le message contient un marqueur OAuth/CORS/redirection.
  - `categorizeApiError({ response, error })` : retourne `'auth'`, `'ai_service'` ou `'network'`.
  - `aiErrorMessageKey(category)` : retourne la clé i18n du message réseau ou service IA.
  - `logAiServiceError(response, endpoint = '')` : logue jusqu’à 500 caractères du corps d’une réponse non-authentification ; clone la réponse pour préserver son corps.
  - `isCreditExhaustedText(text = '')` : détecte les signatures de crédit/quota épuisé.
  - `detectAiProvider(text = '')` : retourne le fournisseur détecté, ou `''`.
  - `inspectAiServiceError(response, endpoint = '')` : retourne une promesse de `{ status, isCredit, provider, detail }`, ou `null` pour une réponse absente ou 401/403 ; clone et logue le corps (limité à 1 000 caractères).
  - `handleHttpError(response, endpoint = '')` : retourne une promesse contenant le texte d’erreur ; lève `Error('SESSION_EXPIRED')` pour 401/403.
  - `handleFetchError(error, endpoint = '')` : retourne `'SESSION_EXPIRED'` pour une erreur OAuth/CORS, sinon `null` ; journalise les erreurs réseau.
  - `registerRecordingGuard(fn)` : configure la garde d’enregistrement ; une valeur non fonctionnelle rétablit une garde inactive.
  - `isRecordingGuardActive()` : retourne l’état de la garde ; retourne `false` si elle lève une exception.
  - `consumeDeferredAuthError()` : retourne puis efface la raison d’erreur d’auth différée, ou `null`.
  - `isOpaqueAuthRedirect(res)` : détecte une réponse de type `opaqueredirect` ou de statut `0`.
  - `detectAuthErrorReturn()` : retourne une raison si l’URL contient des marqueurs d’erreur OIDC/CSRF, sinon `null`.
  - `canReauthNow()` : indique si la ré-authentification est permise selon l’URL et le backoff local.
  - `autoRecoverFromAuthError(reason = '')` : promesse booléenne ; diffère la récupération pendant un enregistrement, sinon appelle `forceReauth()` si le backoff le permet.
  - `forceReauth()` : lance la ré-authentification ; peut différer l’action pendant un enregistrement ou déléguer au hook natif. Sur le web, purge au mieux cookies accessibles, session serveur et caches/SW, puis navigue vers `/login`.
  - `bootstrapAuthRecovery()` : détecte une erreur OIDC au démarrage et lance la récupération ; promesse booléenne.
  - `installAuthFetchInterceptor()` : installe une seule fois un intercepteur global `window.fetch` pour les appels `/api/` protégés ; ajoute l’en-tête XHR et, si disponible, le Bearer, puis déclenche la récupération d’auth selon la réponse.
- Points d’attention :
  - Dépend de `apiOrigin` (`../config/constants.js`) et des API navigateur (`window`, `location`, `localStorage`, cookies, `fetch`, service workers, Cache API). Plusieurs accès sont protégés par des `try/catch`, mais l’intercepteur requiert un environnement navigateur.
  - La garde d’enregistrement diffère la récupération et stocke une seule raison, consommée par `consumeDeferredAuthError()`.
  - Le backoff de ré-authentification est de 10 minutes ; `/api/ping`, `/api/auth/*` et `/api/admin/*` sont exclus du déclenchement automatique.
  - L’intercepteur ne réécrit pas les objets `Request`. Les réponses inspectées sont clonées avant lecture ; `handleHttpError`, lui, consomme directement leur corps.

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

- Génère des PDF depuis un résumé HTML ou un document HTML générique. Privilégie un PDF texte sélectionnable ; utilise une capture image en secours.
- **`generatePDF(config)`** — paramètres : configuration du résumé (notamment `hasGeneratedSummary`, `t`, `setStatus` et les données de rendu) ; retour : `Promise<void>`. Sans résumé, affiche une alerte et s’arrête. Sinon, télécharge le PDF via `saveFile`, puis met à jour le statut.
- **`buildSummaryPdfBlob(config)`** — paramètres : configuration du résumé (texte, nom, modèle, langue, options, traductions et fonctions de formatage/statut) ; retour : `Promise<{blob: Blob, filename: string}>`. Construit le PDF sans le télécharger, pour réutilisation comme pièce jointe ou dépôt.
- **`htmlToPdfBlob({ html, styles, className, meta })`** — paramètres : HTML, styles CSS, classe du conteneur et métadonnées (`title`, `author`, `language`, `footerText`) ; retour : `Promise<Blob>`. Convertit un document HTML générique en PDF.
- **Effets de bord :** ajoute temporairement styles et contenu hors écran au DOM, puis les retire dans `finally`. `generatePDF` peut afficher une alerte, écrit dans la console et met à jour le statut.
- **Points d’attention :**
  - `buildSummaryPdfBlob` attend `templateOptions.find(...)` ; si le modèle est absent, le titre de repli vient de `uiText.sections.summaryTitle`. Le nom d’auteur utilise aussi une valeur de repli.
  - Le HTML fourni est injecté via `innerHTML` : les contenus doivent être fiables ou assainis en amont.
  - Le rendu texte dépend des polices chargées et des outils de mesure/mise en page de `src/lib/pdf/`. En cas d’échec, le rendu image utilise `html2canvas-pro` et `jspdf` ; le texte du PDF image n’est pas sélectionnable.
  - Dépendances : `saveFile`, `src/lib/pdf/draw.js`, `fonts.js`, `measure.js`, ainsi que les imports dynamiques `jspdf` et `html2canvas-pro`.

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

- Gère la persistance et la restauration des données de session dans `localStorage`.
- **`saveSessionData(config)`** — enregistre transcription, actions, notes, résumé, versions et identifiant de réunion ; ne retourne rien. Ignore les erreurs de stockage après les avoir journalisées. Retire les marqueurs d’animation avant de persister transcription et actions.
- **`saveMeetingNotesDraft(notes, meetingId)`** — enregistre uniquement le brouillon des notes si l’identifiant de réunion local correspond ; retourne `false` en cas de décalage, `true` après l’écriture ou si le stockage échoue. Effet de bord : écrit `mybrief_meeting_notes`.
- **`restoreSessionData(config)`** — restaure les données avec des valeurs par défaut ; retourne un objet complet contenant transcription, actions, notes, résumé, versions, identifiant actif et identifiant de réunion. Normalise les actions sans identifiant, ignore les versions en attente et sélectionne une version active valide, à défaut la dernière.
- **`clearSessionData()`** — supprime les clés de session de `localStorage` ; ne retourne rien. Les erreurs sont journalisées.
- **Points d’attention :** dépend de `localStorage` et de `normalizeActions` (`./liveActionsMerge.js`). Les accès au stockage et les parsings sont protégés par `try/catch`. Les champs `meetingNotes` et `currentMeetingId` omis (`undefined`) lors d’une sauvegarde ne modifient pas leurs clés existantes ; un identifiant vide les supprime.

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

- Regroupe la normalisation du HTML de résumé et des fonctions utilitaires pour les versions et leur état après génération. La génération est gérée dans `App.svelte` via `POST /resume`.
- `normalizeSummaryHtml(html)` — retourne le HTML normalisé, ou `html` inchangé s’il est falsy. Nettoie les marqueurs de scaffold, les espaces et les retours à la ligne ; ne supprime un `<p>` que s’il contient uniquement un marqueur `[[AI_…]]`.
- `makeVersionId()` — sans paramètre ; retourne un identifiant unique de forme `v_…`, construit avec l’heure courante et `Math.random()`.
- `pendingVersionFrom(opts, currentTemplate)` — retourne un objet de version en attente, avec identifiant, options de génération, date ISO et `pending: true`. `opts` peut être `null` ; `pages` n’est inclus que si sa valeur est truthy. Effet indirect : appelle `makeVersionId()` et lit l’horloge.
- `LEGACY_VERSION_ID` — constante `v_legacy`, identifiant fixe partagé avec le serveur pour les versions historiques sans tableau `versions`.
- `afterFailedGeneration(versions, activeVersionId, pendingId, message)` — retourne les versions sans l’entrée en attente, l’identifiant actif valide et le texte du résumé affiché. Si la version active échoue, sélectionne la dernière version restante ; affiche `message` uniquement s’il n’en reste aucune. Normalise le HTML de la version affichée.
- `meetingStartIso(recordingStartTime, hasTranscript, durationSeconds, now = Date.now())` — retourne une date ISO de début : utilise l’horodatage d’enregistrement s’il est truthy, sinon estime le début à partir de `now` et de la durée si une transcription existe ; retourne `null` autrement. Peut lever une erreur si une date fournie est invalide.
- **Points d’attention :** aucune dépendance externe ; `normalizeSummaryHtml` attend une chaîne truthy dotée de `.replace()`. L’identifiant généré n’est pas garanti sans collision ; `LEGACY_VERSION_ID` doit rester synchronisé avec le serveur.

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

- Centralise la validation du nom d’utilisateur et la construction des données de compte affichées dans l’interface.
- `isValidUserName(name)`
  - Prend une valeur quelconque ; retourne un booléen.
  - Rejette les valeurs falsy, non textuelles et les sentinelles `no value`, `unknown`, `undefined`, `null` ou une chaîne vide, après suppression des espaces et passage en minuscules.
  - Aucun effet de bord.
- `accountView(user, signedInWith = {})`
  - Prend l’utilisateur (`$auth.user`, éventuellement absent) et une table facultative de libellés de fournisseurs d’authentification.
  - Retourne un objet normalisé : `name`, `initials`, `email`, `picture`, `provider`, `providerLabel`, `groups`, `canChangePassword` et `isAdmin`.
  - Aucun effet de bord ; ne modifie pas l’utilisateur.
- Points d’attention :
  - Un nom invalide devient `null` et ses initiales deviennent `?`. Les initiales utilisent les deux premiers mots du nom.
  - Les champs absents prennent des valeurs de repli (`''`, `[]` ou `false`) ; `groups` n’est conservé que s’il s’agit d’un tableau.
  - `providerLabel` dépend de la présence d’une entrée pour `user.authProvider` dans `signedInWith`.
  - Aucune dépendance externe ; utilise les opérateurs JavaScript optionnels et les API standard des chaînes et tableaux.

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

- Fournit les noms et les pièces jointes des documents utilisés par les actions post-réunion et les téléchargements directs.
- `documentNameFor({ historyItem?, ext, fallback })` → `Promise<string>` : construit le nom à partir du titre et de la date de la réunion, du gabarit utilisateur et de la langue courante. Lit les stores de réglages et de langue ; utilise le nom par défaut si le gabarit ne produit aucun nom.
- `buildActionAttachment({ kind, transcriptionText, historyItem?, pdfConfig })` → `Promise<{ blob: Blob, filename: string } | null>` : génère un PDF pour `summary`, ou un Blob texte pour `transcription`, puis lui associe un nom. En cas d’échec, journalise l’erreur avec `console.error` et renvoie `null`.
- Points d’attention :
  - Le type de document est déterminé par `kind` pour la pièce jointe, mais par l’extension (`pdf` ou autre) pour le nom.
  - Le nom utilise `historyItem.lastConnecion` (orthographe telle quelle dans le code), puis `historyItem.now` ; le titre vide ou absent reprend `fallback`.
  - Dépendances : stores Svelte (`currentLanguageStore`, `ensureActionSettings`), rendu PDF (`buildSummaryPdfBlob`) et utilitaires de nommage (`filename.js`).
  - Le PDF est produit côté navigateur ; ce module ne transmet pas lui-même les fichiers au serveur.

### src/utils/filename.js

- Fournit des utilitaires de génération de noms de fichiers datés et de rendu de gabarits de noms de fichier et d’objets de mail.
- Fonctions exportées :
  - `slugifyTitle(title, fallback = 'document')` — convertit un titre en slug sûr, en minuscules, sans accents et limité à 80 caractères. Retourne `fallback` si aucun caractère ne subsiste. Aucun effet de bord notable.
  - `fileDatePart(source)` — accepte une `Date`, une chaîne ou un nombre ; retourne la date locale au format `AAAA-MM-JJ`. Utilise la date du jour si la source est absente ou invalide. Aucun effet de bord notable.
  - `documentFilename({ title, date, ext, fallback })` — retourne `date-slug.ext`, en combinant `fileDatePart` et `slugifyTitle`. Aucun effet de bord notable.
  - `renderFilenameTemplate(template, vars = {}, { ext })` — développe les variables reconnues, slugifie le résultat et ajoute l’extension hors gabarit. Retourne `null` si le gabarit est vide ou ne produit aucun caractère exploitable. Aucun effet de bord notable.
  - `renderSubjectTemplate(template, vars = {})` — développe les variables reconnues et limite l’objet du mail à 200 caractères. Retourne une chaîne vide si le gabarit est vide ou ne laisse rien. Aucun effet de bord notable.
  - `DOCUMENT_TYPE_LABEL` — libellés de `summary` et `transcription` en français et en anglais.
- Points d’attention :
  - Les dates sont locales, pas UTC ; une date invalide retombe sur aujourd’hui.
  - Les gabarits reconnaissent `titre`/`title`, `date`, `type`/`kind` et `compte`/`account`. Les variables inconnues sont supprimées ; l’expansion se fait en une seule passe.
  - Les valeurs de gabarit sont nettoyées des caractères de contrôle et espaces répétés. Le texte développé est limité à 200 caractères avant slugification ; les slugs sont limités à 80 caractères.
  - Le rendu des gabarits réplique celui du service API : maintenir la parité, vérifiée par `src/utils/filenameTemplate.parity.test.js`.
  - Dépendances : API standard JavaScript (`Date`, `String.prototype.normalize`) ; aucune dépendance externe.

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

- Résout des chemins i18n pointés et remplace des variables dans les textes.
- `formatText(dict, path, replacements = {})` : cherche `path` dans `dict` en séparant ses segments par `.` ; si la valeur trouvée est une chaîne, remplace chaque `{clé}` par la valeur correspondante et retourne le texte. Sinon, retourne `path`. Chaque remplacement ne concerne que la première occurrence. Aucun effet de bord notable.
- `fill(template, values = {})` : remplace toutes les occurrences de `{clé}` dans `template` par les valeurs converties en chaînes ; retourne `''` si le gabarit est absent ou falsy. Aucun effet de bord notable.
- **Attention :** `formatText` convertit `path` en chaîne pour la recherche, mais retourne la valeur originale si le chemin est introuvable ou ne désigne pas une chaîne. `fill` insère les valeurs littéralement, sans interpréter les séquences `$` comme des motifs de remplacement.
- **Dépendances :** API standard JavaScript uniquement.

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

- Gère les marqueurs de passages hors ligne dans l’historique de transcription : insertion, résolution après transcription différée et recalcul du texte complet.
- Fonctions exportées :
  - `makeGapMarkerItem({ gapId, time, timestamp, author, text })` — retourne un élément d’historique marqué par `offlineGapId`, avec `isDelta: false` et `source: 'local'`. Ne modifie pas l’historique.
  - `resolveGapMarker(history, gapId, text)` — retourne `{ history, changed }`. Remplace le marqueur par le texte nettoyé, ou le retire si le texte est vide. Si `gapId` est absent, retourne l’historique inchangé avec `changed: false`. Produit un nouveau tableau lorsqu’un marqueur est trouvé.
  - `recomputeFullText(history, selfName)` — retourne le texte complet attribué aux locuteurs, calculé à partir des éléments finaux (`isDelta` falsy). Ne modifie pas l’historique.
- Points d’attention :
  - Un texte nul ou vide après `trim()` supprime le marqueur ; aucun marqueur correspondant ne déclenche aucune modification.
  - Dépend de `buildAttributedTranscript` (`./transcriptAttribution.js`) pour le formatage et l’attribution des locuteurs.

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

- Traduit les réponses des API d’actions post-réunion en notifications et diagnostics utilisateur. Les destinations sont résolues côté serveur ; le module gère aussi l’approbation avant dépôt.
- **Fonctions exportées :**
  - `buildActionDocument({ kind, content, title, lang, meetingId })` — retourne le document normalisé pour les routes `/actions`, ou `null` si le contenu est vide. `meetingId` doit référencer la réunion courante, pas une sélection d’historique.
  - `sentTo(to, fallback)` — retourne jusqu’à deux destinataires, suivis de `+N`, ou `fallback` si aucun destinataire exploitable.
  - `runEmailAction({ payload, attachment, showToast, email })` — envoie le document par mail et affiche une notification selon le résultat. Effet de bord : appel à l’API et notifications via `showToast`.
  - `runStoreAction({ payload, attachment, showToast, providerLabel, approved, onApprovalRequired })` — dépose le fichier et retourne `{ stored: boolean }`. Effets de bord : appel à l’API, demande éventuelle d’approbation, notifications via `showToast`.
  - `runActionTestAction(payload, texts)` — exécute un test d’envoi ou de dépôt et retourne `{ ok, key, vars, details }`, prêt à afficher. Effet de bord : appel à l’API de test.
- **Points d’attention :**
  - Sans pièce jointe, le dépôt est refusé localement. Une approbation refusée ou indisponible interrompt aussi le dépôt ; après confirmation, l’appel est relancé avec `approved: true` et sans nouvelle demande d’approbation.
  - Les réponses dégradées SMTP, les pièces jointes trop volumineuses, les erreurs de connexion ou d’autorisation et les limites de test (`429`) ont des traitements distincts.
  - Le diagnostic de test dépend des champs renvoyés par le serveur, notamment les destinataires, leurs sources et l’indicateur de cache.
  - Dépend de `services/actionsApi.js` (`sendDocumentByEmail`, `storeDocument`, `runActionTest`) et de `stores/storeApproval.js` (`requestStoreApproval`). Les autres fonctions de diagnostic sont internes au module.

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

- **Rôle :** évite de réafficher une transcription finale déjà écrite par les événements delta. Le suivi est isolé par flux et par segment (`item_id`).
- **`findPendingDeltaIndex(history, source)`**
  - Cherche en remontant l’index du delta en cours pour `source` (`local` par défaut), ou renvoie `-1`.
  - Retourne un nombre ; ne modifie pas l’historique.
- **`createTranscriptDeltaTracker()`**
  - Retourne un objet avec trois méthodes :
    - **`onDelta(source, itemId, text)`** : ajoute le texte d’un delta au tampon du segment ; ne retourne rien.
    - **`takeCompleted(source, itemId, transcript)`** : consomme le suivi du segment et retourne `true` si la transcription finale correspond déjà au texte des deltas (ne pas l’ajouter), sinon `false`.
    - **`reset()`** : vide tous les tampons ; ne retourne rien.
  - Effet de bord : conserve un état interne mutable, limité à quatre segments par flux ; les plus anciens sont évincés.
- **Points d’attention :**
  - Appeler `takeCompleted` à chaque événement `completed`, même si la transcription sera ajoutée. Sans correspondance d’`item_id`, la méthode tente le tampon anonyme (`''`).
  - `source` vide ou absent est traité comme `local`. `findPendingDeltaIndex` renvoie `-1` si `history` n’est pas un tableau.
  - La comparaison passe par `normalizeForCompare`, importé de `./transcriptEcho.js` ; un `completed` vide ne correspond jamais.

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
- Détecte un changement de version entre `version.json` et la valeur mémorisée dans `localStorage`.
- **Export** — `runVersionGuard()`
  - Paramètres : aucun.
  - Retour : promesse résolue sans valeur.
  - Effet de bord : si la version a changé, supprime les caches Cache Storage dont le nom ne commence pas par `workbox-precache`, puis mémorise la version courante. Journalise le changement si une ancienne version était enregistrée.
- **Points d’attention**
  - Si la version courante est absente ou identique à la version mémorisée, aucune purge n’a lieu.
  - Les erreurs d’accès à `localStorage` ou Cache Storage sont ignorées ; la purge est aussi ignorée si `caches` n’est pas disponible.
  - Les précaches Workbox et les données métier de `localStorage` ne sont pas supprimés.
  - Dépend de `../version.json`, de `localStorage` et de l’API Cache Storage.

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

- Fusionne les actions reçues du modèle avec les actions courantes, en conservant les cartes masquées et en utilisant des mises à jour immuables pour préserver la réactivité Svelte.
- Fonctions exportées :
  - `hasActionContent(action)` → `boolean` : indique si l’action contient un champ utile.
  - `ensureActionIds(actions, idCounter = 0)` → `{ actions, idCounter }` : attribue des identifiants numériques uniques. Retourne le tableau d’origine si aucun changement n’est nécessaire.
  - `normalizeActions(actions, idCounter = 0)` → `{ actions, idCounter }` : garantit les identifiants et vide les anciens textes de remplacement.
  - `toStoredActions(actions)` → `Array` : produit un instantané prêt à stocker, sans marqueurs d’animation, avec dates normalisées et anciens placeholders vidés.
  - `prependManualAction(actions, idCounter = 0)` → `{ actions, idCounter }` : ajoute une carte manuelle vierge en tête de liste.
  - `setActionShown(actions, target, show)` → `Array` : masque ou rétablit une action, repérée par objet ou identifiant.
  - `splitActionsForPrompt(actions, placeholders = {})` → `{ active, dismissed }` : prépare les actions pour le prompt ; les masquées sont transmises sans identifiant, les cartes vierges sont exclues.
  - `mergeDetectedActions(current, incoming, opts = {})` → `{ actions, idCounter, createdIds, updatedIds }` : crée ou met à jour les actions, avec marqueurs d’animation pour les changements effectifs.
  - `clearActionFlashes(actions, ids)` → `Array` : retire les marqueurs d’animation des actions ciblées.
- Constantes exportées : `FLASH_DURATION_MS` (`2600`) et `MAX_UPDATE_WORDS` (limites de mots pour les mises à jour de titre, porteur et description), ainsi que `LEGACY_ACTION_PLACEHOLDERS` (valeurs historiques traitées comme vides).
- Points d’attention :
  - Les créations sont insérées en tête ; un identifiant fourni par le modèle n’est utilisé que pour retrouver une action existante. Une action masquée n’est pas réactivée.
  - Les champs vides ou placeholders n’écrasent pas les valeurs existantes. Les limites de mots ne s’appliquent qu’aux mises à jour, pas aux créations.
  - Les tableaux et objets modifiés sont recréés ; les éléments inchangés gardent leur référence. Certains résultats renvoient le tableau d’origine si aucune modification n’est requise.
  - Dépend de `normalizeDate` (`formatUtils.js`) pour les échéances et de `normalizeForCompare` (`transcriptEcho.js`) pour rapprocher les titres.

### src/utils/templateTexts.js

- `buildTemplateTexts(uiText)` : projette les textes nécessaires aux composants du template dans un nouvel objet structuré (`sections`, `buttons`, `actions`, `ariaLabels`, `app`, `resumeLoading`). Retourne les valeurs telles quelles, sans transformation.
- Effet de bord : aucun ; fonction pure.
- Points d’attention :
  - `uiText` et toutes les propriétés accédées doivent être définis ; sinon, l’accès provoque une erreur.
  - Seules les clés explicitement listées sont incluses dans le résultat.
  - Aucune dépendance externe.

### src/utils/transcriptRefine.js

- **Rôle :** relire les dernières phrases finalisées à l’aide des notes de réunion, valider les corrections avant application et signaler brièvement les mots modifiés. La relecture est best-effort : ses échecs ne bloquent pas l’enregistrement.
- **Constantes exportées :** `REFINE_SENTENCE_COUNT` (2), `REFINE_DEBOUNCE_MS` (1 200 ms), `REFINE_SIMILARITY_MIN` (0,7) et `REFINE_FLASH_MS` (2 600 ms).
- **Fonctions exportées :**
  - `pickRefineTargets(history, count = REFINE_SENTENCE_COUNT)` — retourne les dernières phrases admissibles sous la forme `{ item, text }`. Ignore les deltas, les marqueurs hors ligne et les textes vides.
  - `acceptRefined(original, corrected, notes = '')` — retourne le texte corrigé ou `null` si la réponse est invalide, inchangée, de longueur disproportionnée ou non plausible.
  - `frPhoneticKey(word)` — retourne une clé phonétique française approximative, destinée à comparer des graphies proches.
  - `changedWordGroups(original, corrected)` — retourne les groupes de mots modifiés sous la forme `{ from, to }`, alignés par LCS.
  - `parseNoteDirectives(notes)` — extrait les consignes explicites de remplacement et retourne des paires `{ fromKey, toKey }`.
  - `isPlausibleRefinement(original, corrected, notes = '')` — retourne `true` si chaque changement est phonétiquement proche ou correspond exactement à une consigne explicite des notes.
  - `diffWordFlags(original, corrected)` — retourne les mots corrigés sous la forme `{ word, changed }`, pour le surlignage.
  - `flashRefinedWords(index, original, corrected, update, ms = REFINE_FLASH_MS)` — marque temporairement les mots modifiés dans l’historique via `update`, puis retire le marqueur avec `setTimeout`. Ne fait rien si aucun mot n’a changé.
  - `createNotesRefiner({ getHistory, setHistory, getNotes, isActive, post, editTranscription })` — configure le raffineur pour l’historique de l’application ; retourne `notify`, `reset` et `isInFlight`. Vérifie que l’item est toujours présent et inchangé avant de l’éditer.
  - `createTranscriptRefiner({ getTargets, getNotes, isActive, post, apply, debounceMs = REFINE_DEBOUNCE_MS })` — ordonnance les appels avec débounce, un seul appel en vol et relance si une notification arrive pendant celui-ci ; retourne `notify`, `reset` et `isInFlight`.
- **Points d’attention :**
  - `createTranscriptRefiner` attend que `post(sentences, notes)` retourne une liste de corrections de même longueur que `sentences`. Les erreurs sont silencieusement ignorées.
  - Les cibles et les notes sont lues au départ de l’appel. Les doublons de requête sont évités pour un même couple notes/phrases ; `reset()` annule le minuteur et réinitialise ce suivi, mais n’annule pas un appel en cours.
  - La comparaison phonétique est volontairement approximative ; les insertions et suppressions pures sont refusées. Les consignes de notes doivent être explicites.
  - Le calcul LCS est en `O(n·m)` ; il est prévu pour des phrases courtes. Le marqueur `refineFlash` est temporaire et doit rester exclu de la persistance.
  - Dépendances : API fournie par `post` (notamment `/api/refine-transcript` dans l’application), état d’historique fourni par l’appelant, et `Date.now` / `setTimeout` pour le surlignage.

### src/utils/afterSummary.js

- **Rôle** : calcule l’aperçu des actions proposées après le premier résumé (mail, rangement, dépôt) et les libellés affichés. Module pur, sans store ni appel réseau ; les règles doivent rester alignées sur celles du serveur.
- **Dépendance** : importe `draftRecipients` depuis `./mailDraft.js` pour déterminer la liste de destinataires affichée.

- `afterSummaryChoices(availability, { tagged })` → `{ email, storage, any }` : indique les actions disponibles et si la fenêtre doit s’ouvrir. Le tag est toujours proposé si la réunion n’est pas déjà taguée.
- `mailPlan(settings, tagId)` → `{ source, recipients, target }` : retourne les destinataires affichés et la liste qui recevra les ajouts. Avec un tag choisi, les ajouts ciblent sa liste, même si elle doit être créée à partir de la liste par défaut.
- `listAfterRemoval({ settings, target, recipients, address, seeded })` → `string[]` : calcule la liste après retrait d’une adresse. Si une liste de tag créée dans la fenêtre redevient identique à la liste par défaut, retourne `[]` pour supprimer cette copie.
- `storagePreview(settings, tag)` → `{ kind, path, library }` : détermine le dossier aperçu, dans l’ordre tag dédié, sous-dossier du tag, dossier personnel, dossier par défaut. Le dossier d’organisation est indiqué sans chemin (`path: ''`).
- `readablePath(path)` → `string` : convertit les segments d’un chemin séparé par `/` en libellé séparé par ` › `.
- `launchLabel(verbs, and)` → `string` : construit le libellé du bouton à partir des gestes, dans leur ordre d’exécution ; retourne `''` si aucun geste.
- `freshTagColor(palette, existing)` → `string` : choisit la première couleur inutilisée, ou reprend une couleur de la palette si elle est épuisée.

- **Points d’attention** :
  - `storagePreview` neutralise les `/` dans le libellé d’un tag ; un sous-dossier sans destination personnelle a un chemin et une bibliothèque vides.
  - `listAfterRemoval` compare les listes par longueur et ordre ; les valeurs sont filtrées par égalité stricte.
  - `freshTagColor` suppose une palette non vide : si elle est vide, le résultat peut être `undefined`.

### src/utils/aiErrorNotice.js

- Projette une notice d’erreur IA en données d’affichage pour `components/AiErrorNotice.svelte`. Ne décide ni de l’affichage ni de la réunion concernée.
- `providerSuffix(provider)` : ajoute ` (${provider})` si `provider` est renseigné, sinon renvoie `''`. Aucun effet de bord.
- `buildAiErrorNoticeView(notice, { t, formatMessage })` : prend une notice de type `credit`, `network` ou `service` et les fonctions de traduction ; renvoie `{ cls, icon, title, body }`. Fonction pure, sans effet de bord. `credit` utilise `formatMessage` avec le suffixe fournisseur ; `network` et `service` utilisent `t`.
- Attention : toute valeur de `kind` autre que `credit` ou `network` est traitée comme `service`. Sans fournisseur, aucun suffixe n’est ajouté. Dépend des fonctions d’internationalisation fournies par l’appelant.

### src/utils/allowedDomains.js

- Fournit des utilitaires client pour saisir des domaines autorisés. Miroir de `services/api/lib/auth/domains.js` : le serveur reste la référence et renormalise/dédoublonne les valeurs reçues.
- `normalizeDomain(value)` — convertit la valeur en chaîne, retire les espaces extérieurs, met en minuscules et supprime un préfixe `http://`, `https://` ou `@`, puis le chemin après `/`. Retourne la chaîne normalisée. Ne modifie pas ses arguments.
- `withDomain(domains, value)` — ajoute une saisie à la liste si elle contient un point et n’y figure pas déjà. Retourne `null` si elle ne contient pas de point, la même liste si le domaine est déjà présent, ou une nouvelle liste triée sinon. Ne modifie pas la liste d’origine.
- **Points d’attention :** la validation est minimale : la présence d’un point suffit. La déduplication repose sur `domains.includes()` après normalisation de la saisie ; les éléments existants ne sont pas renormalisés. Aucun effet de bord notable ni dépendance externe.

### src/utils/audioKeepAlive.js

- Génère et injecte une courte bouffée de bruit blanc à faible volume dans un flux audio pour éviter la mise en veille d’une piste silencieuse.
- **`injectKeepAliveSignal(audioContext, destination, gainNode)`**
  - Paramètres : contexte audio, destination audio et nœud de gain existant ou `null`.
  - Retour : nœud de gain à mémoriser ; renvoie `gainNode` inchangé si l’injection ne peut pas être effectuée.
  - Effets : crée une source temporaire, la connecte au gain puis à la destination, et la démarre. Le nœud source est déconnecté à la fin ; le gain est créé au premier appel puis réutilisable par l’appelant.
- **Points d’attention**
  - Dépend de l’API Web Audio et de `KEEP_ALIVE_VOLUME` (`../config/constants.js`).
  - Un contexte ou une destination absent entraîne un retour sans effet. Les erreurs d’injection sont journalisées dans la console et renvoient le gain fourni.
  - Le gain créé reste connecté à la destination : l’appelant doit le conserver et le déconnecter à l’arrêt.

### src/utils/backNavigation.js

- **Rôle :** détermine quoi fermer lors du bouton Retour Android. La première couche visible de `BACK_LAYERS` l’emporte ; si aucune n’est présente, l’application est minimisée. L’ordre de la table reflète l’empilement visuel.
- **`BACK_LAYERS`** — tableau exporté de `{ selector, action }` qui définit les couches et leur comportement (`ignore`, `minimize`, `self`, `outside`, `escape` ou `{ click }`). Ajouter une entrée pour chaque nouveau calque à prendre en charge.
- **`resolveBackAction(root, opts?)`** — prend un `ParentNode` et des options facultatives (`isVisible`, `layers`). Retourne une décision (`action`, et `target` pour `click`) sans effet de bord. Cherche la dernière correspondance visible pour chaque sélecteur ; si une cible `{ click }` manque, renvoie `escape`.
- **`performBackAction(decision, ports)`** — exécute une décision ; `ports` fournit `minimize` et, facultativement, `doc` (par défaut `document`). Clique la cible, clique `body` pour `outside`, appelle `minimize` ou envoie un `keydown` Échap depuis l’élément actif. `ignore` ne produit aucun effet.
- **Points d’attention :**
  - La visibilité par défaut est déterminée par `getClientRects()` ; elle peut être remplacée via `isVisible`.
  - Les décisions `ignore` protègent les fenêtres dont la fermeture entraînerait une action destructive. Le retour sans calque actif minimise l’app au lieu de la quitter.
  - Échap est réservé aux calques qui l’écoutent ; l’événement remonte depuis l’élément focalisé.
  - Dépendances navigateur : `Element`, `KeyboardEvent` et `document` (sauf si `doc` est fourni). `minimize` est fourni par l’appelant.

### src/utils/browserAudioSupport.js

- Détermine si l’appareil est considéré comme un ordinateur (`desktop`) et si le partage d’écran peut transmettre l’audio (`shareAudio`).
- `audioCaptureSupport({ userAgent = '', coarsePointer = false, native = false })` : retourne `{ desktop: boolean, shareAudio: boolean }`. Détection fondée sur l’UA et le pointeur tactile; ne déclenche aucun effet de bord.
- `currentAudioCaptureSupport()` : retourne le même diagnostic pour l’environnement courant, à partir de `navigator`, `window.matchMedia` et de `isNative`. Accède aux globals du navigateur.
- Points d’attention : `desktop` vaut `false` pour l’application native ou un pointeur tactile; `shareAudio` vaut `false` pour Firefox, Safari et iOS. La détection UA est volontaire : `getDisplayMedia` existe aussi dans des navigateurs où il ne fournit pas de son. L’import `isNative` provient de `../platform/index.js`.

### src/utils/configAlerts.js

- Transforme les constats de configuration du serveur en pastilles et textes destinés à l’interface.
- Fonctions et export :
  - `ALERT_LEVELS` : niveaux triés du plus grave au plus léger (`error`, `warning`, `tip`).
  - `alertText(issue, texts)` : renvoie le texte du constat, en remplaçant les variables `{clé}`. Utilise le texte générique `unknown`, puis le code, si aucune traduction n’est disponible.
  - `alertOf(issues, texts)` : renvoie `null` si la liste est vide ; sinon, renvoie la pastille avec le niveau le plus grave et les constats triés par gravité. Ne modifie pas le tableau d’origine.
  - `alertsBySection(issues, texts)` : regroupe les constats par `section` et renvoie une pastille par section.
  - `summaryAlert(issues, texts, { title = '', max = 4 } = {})` : produit une pastille récapitulative limitée à `max` lignes, avec un texte `more` indiquant le nombre de lignes masquées ; renvoie `null` si aucun constat.
  - `mergeAlerts(alerts)` : fusionne les lignes de plusieurs pastilles, les trie par gravité et renvoie la pastille globale, ou `null` si elle est vide.
- Points d’attention :
  - `texts` dépend du dictionnaire `uiText.configChecks` (`issues`, `unknown`, `more`) ; les traductions manquantes peuvent laisser apparaître le code ou une chaîne vide.
  - Les variables d’interpolation sont converties en chaînes ; une valeur `null` ou `undefined` devient vide.
  - Un niveau inconnu est classé après les niveaux connus ; si tous les niveaux sont inconnus, le premier constat détermine le niveau de la pastille.
  - `summaryAlert` ne borne pas les lignes si `max` est négatif ; `alertsBySection` attend des constats munis de `section`.
  - Aucune dépendance externe ; les fonctions ne modifient pas les entrées.

### src/utils/continuePromptSound.js

- Joue un bip discret pour l’invite « Poursuivre / Arrêter », en réutilisant le contexte audio fourni ou en créant un contexte temporaire.
- **`playContinuePromptSound(audioContext)`**
  - Paramètre : `audioContext`, contexte audio existant ou `null`.
  - Retour : aucun.
  - Effets : crée un oscillateur triangulaire à 880 Hz, avec un gain maximal de 0,08 sur 0,5 s. Ferme le contexte créé par la fonction à la fin du bip ; ne ferme pas celui fourni.
- **Points d’attention :**
  - Dépend de `window.AudioContext` ou `window.webkitAudioContext` ; ne fait rien si aucun n’est disponible.
  - Tente de reprendre un contexte suspendu ; ignore l’échec de `resume()`.
  - Les erreurs synchrones sont interceptées et signalées avec `console.warn`.

### src/utils/creditTone.js

- Détermine le ton d’un crédit de temps selon le temps restant, afin que les compteurs, jauges et anneaux utilisent les mêmes seuils.
- Exports :
  - `creditTone(remainingSeconds, limitSeconds)` — retourne `'high'`, `'mid'`, `'low'` ou `'out'`. Retourne `'out'` si la limite n’est pas positive ou s’il reste moins de 60 secondes. Aucun effet de bord.
  - `CREDIT_ZONES` — tableau de trois zones `[début, fin, ton]`, de vide à plein (`low`, `mid`, `high`). Constante exportée.
- Points d’attention :
  - Les seuils `CREDIT_TONE_HIGH` et `CREDIT_TONE_LOW` proviennent de `../config/constants.js`.
  - Les couleurs associées aux tons sont définies par les jetons CSS `--credit-*` dans `styles/tokens.css` ; ce fichier ne manipule pas directement les couleurs.

### src/utils/groupColors.js
- Définit la palette fermée des couleurs de groupes (`GROUP_COLORS`) et son repli (`GROUP_COLOR_FALLBACK`, `slate`), alignés sur la palette serveur et les jetons CSS `--tag-*`.
- `groupColorVars(color)` — prend un slug de couleur et retourne `{ dot, soft }`, avec les valeurs CSS `var(--tag-…)`. Pour un slug inconnu, utilise `slate`. Aucun effet de bord.
- Point d’attention : les couleurs retournées dépendent des jetons définis dans `src/styles/tokens.css`.

### src/utils/historyGroups.js

- Calcule les groupes d’historique côté client, selon la date locale du lecteur. Les clés sont stables et indépendantes des libellés pour préserver l’état replié lors d’un changement de langue.
- Fonctions exportées :
  - `historyGroupKey(item, now = new Date())` : retourne `this-week`, `last-week` ou une clé mensuelle `AAAA-MM`. Sans date lisible, classe l’élément dans `this-week`.
  - `historyGroupLabel(key, lang, texts)` : retourne le libellé fourni pour les deux groupes récents, ou le nom du mois et l’année. Utilise `fr-FR` ou `en-GB` selon `lang`, avec le français comme repli.
  - `groupHistory(items, lang, texts, now = new Date())` : retourne un tableau de `{ key, label, meetings }`, dans l’ordre de première apparition des clés dans `items`. Ne modifie pas les éléments ; aucun autre effet de bord notable.
- Points d’attention :
  - Les seuils sont des jours glissants de 7 et 14 jours, calculés avec des millisecondes et `Math.floor`, et non des semaines calendaires.
  - Les dates proviennent de `historyItemDate` (`./historyTitle.js`). Le calcul dépend du fuseau local et de l’ordre d’arrivée des éléments ; l’API est supposée fournir l’historique déjà trié.
  - `texts` doit contenir `groupThisWeek` et `groupLastWeek` ; les clés mensuelles sont interprétées comme `AAAA-MM`.

### src/utils/historySelection.js

- **Rôle** : convertit un document d’historique `/history` en données prêtes à afficher à l’écran. La fonction reste pure ; les effets de bord liés à la sélection sont gérés dans `App.svelte`.
- **Fonction exportée — `unpackHistoryItem(item, opts)`**
  - `item` : document d’historique ; `opts` : `defaultSummaryText`, `fallbackTemplate` et `selfLabel` (tous optionnels).
  - **Retour** : versions et texte du résumé, actions détectées et visibles, notes, durée de repli, transcription structurée et texte intégral.
  - **Effet de bord** : aucun.
- **Points d’attention**
  - Sans versions, reconstruit une version avec `LEGACY_VERSION_ID` si un résumé existe ; sans résumé, retourne une liste de versions vide et le texte par défaut.
  - Réinitialise toujours `summaryText`. Les actions peuvent être un tableau ou du JSON sérialisé ; `normalizeActions` les normalise et les actions avec `show: false` sont exclues de `visibleActions`.
  - Les transcriptions attribuées passent par `parseAttributedTranscript` ; `selfLabel` évite de confondre le micro avec un participant. Les lignes retournées ont toujours un `time` vide.
  - Une chaîne `actions` invalide en JSON provoque une exception. Dépend de `summary.js`, `transcriptAttribution.js` et `liveActionsMerge.js`.

### src/utils/mailDraft.js

- Prépare les données d’un brouillon ouvert dans l’application de messagerie via `mailto:`. Le destinataire envoie lui-même le mail ; aucun serveur ne le relaie. Pas de pièce jointe.
- `looksLikeEmail(value) → boolean` — vérifie qu’une valeur ressemble à une adresse unique, après conversion en chaîne et suppression des espaces périphériques. Validation permissive, à ne pas substituer à une validation serveur.
- `htmlToText(html) → string` — convertit le HTML de l’éditeur en texte, avec paragraphes séparés, listes indentées et séparateurs pour les lignes horizontales. Utilise `DOMParser` : nécessite un environnement disposant de cette API.
- `draftRecipients(settings, tagId) → {source, recipients}` — renvoie les destinataires du tag s’ils existent, sinon ceux par défaut de l’utilisateur. Copie la liste retenue ; n’ajoute pas l’utilisateur en copie.
- `storageFollowsTag(settings, tagId) → boolean` — indique si une destination ou un sous-dossier de stockage suit les règles du tag.
- `draftSubject(state, vars, builtin) → string` — développe le gabarit d’objet personnel, sinon celui de l’organisation, puis utilise l’objet intégré si aucun objet n’est produit. Dépend de `renderSubjectTemplate` (`./filename.js`).
- `buildMailto(draft) → {url, truncated}` — construit l’URL `mailto:` à partir de `to`, `subject`, `body`, et éventuellement `truncatedNote` et `max`. Encode les destinataires et les paramètres, convertit les fins de ligne du corps en CRLF et coupe le corps au-delà de `max` (20 000 caractères par défaut), en ajoutant la note fournie.
- Points d’attention : `mailto:` peut être refusé ou tronqué par les messageries mobiles si l’URL est longue ; aucun envoi ni effet de bord réseau n’est effectué par ce module. `MAILTO_BODY_MAX` exporte la limite par défaut.

### src/utils/modelPrices.js

- Fournit l’échelle de prix et le tri des modèles proposés, à partir de montants en euros fournis par le serveur. Ne chiffre aucun prix.
- Exporte `PRICE_LEVELS` (`4`) et `SUMMARY_PRICE_STEP` (`4`), constantes de configuration.
- `priceTiers(amounts, { levels = PRICE_LEVELS, step = 2 } = {})`
  - Convertit un tableau de montants en niveaux de `1` à `levels` ; renvoie `null` pour un montant inconnu ou invalide.
  - Échelle logarithmique relative au montant positif le plus bas ; zéro reçoit le niveau `1`. Aucun effet de bord.
- `pricedChoices(ids, prices, { step } = {})`
  - Associe les identifiants aux prix `{ model, unitEur }`, calcule leur niveau et renvoie `{ id, unitEur, tier }` triés par prix croissant. Les prix égaux conservent l’ordre d’origine ; les prix inconnus viennent en dernier. Si aucun prix n’est connu, l’ordre d’origine est conservé.
  - Aucun effet de bord ; dépend de `priceTiers`.
- `priceDelta(choices, selected, current)`
  - Renvoie, en euros par unité, le prix du modèle choisi moins celui du modèle en service ; renvoie `null` si le choix n’a pas changé ou si l’un des prix manque. Une valeur négative indique une économie.
  - Aucun effet de bord.
- Points d’attention : `priceTiers` exclut les prix nuls du calcul du minimum positif ; un montant nul reste au niveau `1`. Les options `levels` et `step` ne sont pas validées : `step` doit être positif pour une échelle exploitable. Les montants tarifaires proviennent du serveur (`lib/costs/estimate.js`, `referencePrices`).

### src/utils/portal.js

- Action Svelte qui déplace un élément DOM dans `<body>` par défaut, ou dans une cible fournie. Permet notamment d’échapper aux contraintes de positionnement imposées par les ancêtres.
- Exporte `portal(node, target = document.body)` :
  - `node` : élément HTML à déplacer ; `target` : élément qui le reçoit.
  - Retourne un objet Svelte avec `destroy()`, qui retire le nœud de son parent s’il en a encore un.
  - Effet de bord : ajoute immédiatement `node` à `target`, puis le retire à la destruction de l’action.
- Points d’attention : à appliquer avec `use:portal` sur un élément, pas directement sur un composant. Dépend de Svelte et de l’objet global `document` pour la cible par défaut ; `target` doit accepter `appendChild`.

### src/utils/quotaFormat.js

- Met en forme les durées et dates de quota selon la langue de l’interface et, lorsque pertinent, le fuseau horaire. Utilise `fill` depuis `./i18nFormat.js` pour interpoler les gabarits.
- Fonctions exportées :
  - `formatMinutes(minutes, texts)` — renvoie une durée formatée à partir des gabarits `minutesOnly`, `hoursOnly` et `hoursMinutes`. Renvoie `''` si `minutes` n’est pas fini ou est négatif. Aucun effet de bord notable.
  - `monthLabel(iso, lang = 'fr', opts = {})` — renvoie le nom du mois d’une date ISO, avec options `capitalize` et `timeZone` (UTC par défaut), ou `''` si la date est absente ou illisible. Utilise `Intl.DateTimeFormat`.
  - `periodMonths(period, lang = 'fr')` — renvoie `{ current, renewal }`, les mois de `period.start` et `period.end` dans `period.timeZone` (UTC par défaut). Aucun effet de bord notable.
  - `formatDay(value, lang = 'fr', options = {})` — renvoie le jour et le mois formatés, ou `''` si la valeur est absente ou illisible. Les dates civiles `AAAA-MM-JJ` sont interprétées en UTC pour préserver le jour ; les autres dates sont rendues dans `options.timeZone` (UTC par défaut).
  - `civilDay(date, timeZone = 'UTC')` — renvoie le jour civil `AAAA-MM-JJ` de `date` dans le fuseau indiqué. Utilise `Intl.DateTimeFormat`.
- Points d’attention :
  - Les langues prises en charge sont `fr` et `en` ; les autres valeurs retombent sur le français.
  - `formatMinutes` tronque les minutes décimales avant calcul. `formatDay` et `monthLabel` dépendent de l’analyse des dates par `Date` et des fuseaux reconnus par `Intl`.
  - `civilDay` ne valide ni ne transforme explicitement `date` : le résultat dépend de `Intl.DateTimeFormat` et peut lever une erreur pour une entrée ou un fuseau invalide.

### src/utils/recordingErrors.js

- Associe les erreurs de démarrage d’enregistrement à une clé de traduction pour afficher un message adapté ; une annulation ne produit aucun message.
- `startCancelledError()` — sans paramètre ; retourne une `Error` nommée `StartCancelled`. Sert à signaler une annulation comme un échec pour déclencher le nettoyage, sans afficher d’alerte.
- `recordingStartErrorKey(error)` — prend une erreur de type `unknown` ; retourne une clé `uiText` ou `null`. `StartCancelled` donne `null` ; les erreurs micro connues sont associées à une clé dédiée ; les autres donnent `alerts.recordingStartFailed`. Aucun effet de bord.
- Points d’attention : les erreurs reconnues le sont via leur propriété `name` (`getUserMedia`) ; une valeur non objet ou un nom inconnu utilise le message générique. Dépend d’aucune API externe.

### src/utils/relativeTime.js

- Formate un horodatage en ancienneté pour une liste, ou en date et heure à la minute pour une infobulle ou une fiche.
- **`formatSince(iso, lang, now = Date.now())`** : prend un horodatage, une langue (`'fr'` ou `'en'`) et un horodatage de référence facultatif (utile aux tests). Renvoie une chaîne relative ou `null` si l’horodatage est absent ou invalide. Ne modifie pas l’état ; borne à zéro les dates futures et utilise des unités allant des minutes aux années.
- **`formatDateTime(iso, lang)`** : prend un horodatage et une langue. Renvoie la date et l’heure localisées, sans secondes, ou `null` si l’horodatage est absent ou invalide. Aucun effet de bord notable.
- **Points d’attention :** dépend des API natives `Intl.RelativeTimeFormat` et `Date`. La locale est `en-US` pour `'en'`, `fr-FR` autrement. Le calcul des semaines, mois et années repose sur des durées fixes (7, 30 et 365 jours).

### src/utils/storageVocabulary.js

- Centralise les libellés et le type de logo associés au fournisseur de stockage, pour éviter les définitions divergentes dans l’interface.
- `storageLabel(providerId, fallback = 'Drive')` : retourne `OneDrive` pour `microsoft`, `Google Drive` pour `google`, sinon `fallback`. Aucun effet de bord.
- `libraryKind(providerId, driveName = '')` : retourne `google-drive` pour `google`; pour `microsoft`, retourne `sharepoint` si `driveName` contient ` / `, sinon `onedrive`; fournisseur inconnu : `''`. Aucun effet de bord.
- Points d’attention : `providerId` inconnu ou absent utilise le libellé de repli ou produit `''`. La détection SharePoint repose sur la convention de nom `Site / Bibliothèque`; les autres noms Microsoft sont traités comme un OneDrive. Dépendance de `StorageLogo` pour l’interprétation de `libraryKind`; aucune dépendance externe dans ce fichier.

### src/utils/tempKeyStart.js
- Encapsule l’appel à `/tempkey` au démarrage d’une réunion et transforme la réponse en verdict (`ok`, `auth`, `quota`, `ai_error` ou `unreachable`) ; laisse à l’appelant la décision selon la plateforme.
- Exporte `acquireStartTempKey({ lang, fetchRaw })` :
  - `lang` : langue à transmettre ; `fetchRaw` : fonction retournant la réponse HTTP brute, ou `null`.
  - Retourne une promesse de verdict. En cas de succès, fournit `secret` et `model` ; sinon, les informations propres au verdict (`quota`, `info` ou `error`).
  - Effet de bord notable : effectue une requête réseau vers `/tempkey?lang=…`.
- Points d’attention :
  - Une erreur de `fetchRaw` ou une réponse `null` donne `unreachable`. Une redirection d’authentification opaque donne `auth`.
  - Le statut `409` est interprété comme `quota` uniquement si le corps JSON contient `error: "quota_exhausted"` ; sinon, le traitement poursuit comme pour toute réponse non-OK.
  - Les réponses non-OK sont analysées par `inspectAiServiceError` ; le JSON d’une réponse OK est lu directement avec `res.json()`.
  - Dépend de `httpErrorHandler.js` (`isOpaqueAuthRedirect`, `inspectAiServiceError`) et de l’API `fetchRaw`, qui doit fournir une réponse brute pour permettre l’inspection du corps.

### src/utils/transcriptCorrections.js

- **Rôle** : normalise, valide et applique des corrections déterministes aux transcriptions. Les remplacements sont prévus à la clôture d’une ligne, pas sur les deltas.
- **Constantes exportées** : `CORRECTIONS_MAX` (50 règles), `VARIANTS_MAX` (10 variantes), `TERM_MAX` (60 caractères), `REPLACEMENT_MAX` (80), `FROM_FIELD_MAX` (400).
- **`foldKey(s)`** : convertit une valeur en chaîne et produit une clé insensible aux accents et à la casse ; unifie apostrophes, espaces et traits d’union.
- **`normalizeRules(raw)`** : retourne des règles sûres `{ from: string[], to: string }`. Nettoie et borne les termes, retire les variantes invalides ou en doublon (la première occurrence prévaut) et écarte les règles sans variante valide.
- **`compileCorrections(rules)`** : compile les règles normalisées et retourne `{ size, apply, parts }`. `apply(text)` renvoie le texte corrigé ; `parts(text)` renvoie les segments `{ text, changed }` pour le surlignage. Remplace les mots entiers, accents et séparateurs tolérés, termes les plus longs d’abord, en un seul passage. Préserve les graphies cibles exactes et adapte la majuscule en début de phrase.
- **`splitVariants(value)`** : découpe une chaîne en variantes sur virgules, points-virgules ou retours à la ligne ; retourne les éléments nettoyés non vides.
- **`newRowId()`** : sans paramètre, retourne un identifiant unique de ligne d’interface (`tc-…`). Effet de bord : incrémente un compteur de module.
- **`rulesToRows(rules)`** : convertit les règles normalisées en lignes d’interface `{ id, from, to }` ; crée un identifiant par ligne.
- **`rowsToRules(rows)`** : convertit les lignes d’interface en règles normalisées ; ignore les lignes invalides ou vides.
- **`rowsKey(rows)`** : retourne une empreinte JSON des valeurs saisies non vides, y compris les lignes incomplètes.
- **`checkRows(rows)`** : retourne un diagnostic par ligne (`null` ou `{ level, code, term }`). Les erreurs priment sur les avertissements ; une ligne vide retourne `null`.
- **`flashCorrections(corrected, update, ms = REFINE_FLASH_MS)`** : marque temporairement les mots corrigés dans l’historique via `update(updater)`, puis retire le marqueur après `ms`. Ignore les entrées vides ou sans différence visible ; effet de bord : planifie un `setTimeout`.
- **Points d’attention** :
  - Les limites d’application sont insensibles à la casse et aux accents ; les mots sont délimités par lettres, chiffres et `_`.
  - La protection des graphies cibles est sensible à la casse et aux accents. Le texte est normalisé en NFC pendant la découpe.
  - `checkRows` signale notamment les termes courts ou courants, sans les interdire ; la normalisation effective ne remplace pas ces avertissements.
  - Dépendances : `diffWordFlags` et `REFINE_FLASH_MS` depuis `transcriptRefine.js` ; les plafonds doivent rester cohérents avec leur équivalent serveur.

### src/utils/transcriptLive.js

- **Rôle** : applique les deltas et transcriptions finales à l’historique, en maintenant les lignes en cours en bas, en séparant les segments VAD et en clôturant les lignes silencieuses. Les lignes finalisées passent par les corrections puis la déduplication d’écho.
- **Exports** :
  - `PENDING_STALE_MS` — durée d’obsolescence des lignes sans `itemId` : `10_000` ms.
  - `LIVE_SILENCE_MS` — durée de silence avant clôture d’une ligne d’un autre flux : `1_500` ms.
  - `finalInsertIndex(history)` — retourne l’index d’insertion avant les lignes `isDelta` en fin d’historique ; ne modifie pas l’historique.
  - `findPendingForFinal(history, source, itemId)` — retourne l’index de la ligne en cours correspondant au segment, ou `-1`. Sans `itemId`, utilise `findPendingDeltaIndex` ; avec un identifiant, accepte en repli une ligne legacy sans `itemId`.
  - `applyLiveDelta(history, params)` — `params` contient `text`, `source`, `stamp`, et optionnellement `itemId`, `nowMs`, `correct`. Retourne `{ history, finalized, dropped, corrected }`. Fusionne ou ouvre une ligne, et peut en finaliser d’autres. Effet notable : `correct` ne s’applique qu’à la finalisation.
  - `applyLiveFinal(history, params)` — `params` contient `text`, `source`, `stamp`, et optionnellement `itemId`, `alreadyWritten`, `elapsedS`, `nowMs`, `correct`. Retourne `{ history, finalized, recompute, dropped, corrected }`. Remplace ou met à jour les lignes du segment, ou insère un final ; peut demander de recalculer le texte complet via `recompute`.
- **Points d’attention** :
  - `nowMs` est injectable pour les tests ; s’il est absent ou non fini, les lignes silencieuses des autres flux ne sont pas clôturées.
  - Les deltas composés uniquement d’espaces ne créent pas de ligne, mais sont conservés lors d’une fusion. Les fins de phrase (`.!?…`) déclenchent une clôture.
  - Les deltas avec `itemId` ne fusionnent qu’avec le même segment ; sans `itemId`, `PENDING_STALE_MS` sert de repli.
  - Les résultats `finalized`, `dropped`, `corrected` et `recompute` signalent à l’appelant les ajouts, retraits ou changements à répercuter.
  - Dépend de `transcriptDeltas.js` (`findPendingDeltaIndex`) et `transcriptEcho.js` (`applyEchoDedup`, `parseElapsedSeconds`). Les corrections organisationnelles sont fournies par l’appelant ; par défaut, le texte reste inchangé.

### src/utils/waveHistory.js

- Fournit les calculs purs de mesure et d’historique du niveau audio, sans dépendance à Web Audio ni au DOM.
- Exporte `STEP_MS` (`70`) et `CAPACITY` (`200`) : durée d’un pas et nombre maximal de barres conservées.
- Exporte `rmsOfBytes(bytes)` : reçoit un tableau d’octets de forme d’onde (`Uint8Array` ou `number[]`) et retourne le RMS entre `0` et `1`. Retourne `0` pour un tableau vide. Aucun effet de bord.
- Exporte `createLevelTracker(opts)` : accepte `gate`, `floor` et `decay` (valeurs par défaut indiquées dans le code) ; retourne un suivi avec `next(rms)`, qui met à jour le pic glissant et renvoie un niveau normalisé, gaté et perceptuel entre `0` et `1`, et un getter `peak`. Effet de bord : `next` modifie le pic interne.
- Exporte `createHistory(capacity)` : accepte une capacité, par défaut `CAPACITY` ; retourne un tampon avec `push(v)`, `items` et `reset()`. `push` ajoute une barre `{id, v}`, tronque les plus anciennes au-delà de la capacité et retourne le tableau ; `reset` vide l’historique sans réinitialiser les identifiants. Les méthodes modifient l’état interne.
- Points d’attention : `rmsOfBytes` suppose des valeurs d’octets centrées sur `128`. `push` ne valide ni `v` ni `capacity` ; les identifiants continuent de croître après `reset`.

### src/utils/transcriptAttribution.js

- **Rôle :** construit et relit les étiquettes de locuteur d’une transcription issue des flux micro (`local`) et audio de visio (`remote`). En mono-flux, conserve le texte brut sans attribution.
- **Exports :**
  - `REMOTE_SPEAKER_LABEL` — constante `'Visio'`, étiquette par défaut du flux distant.
  - `selfSpeakerLabel(rawName)` — prend le nom utilisateur brut (`string`, `null` ou `undefined`) ; retourne un nom nettoyé des crochets, ou `'Moi'` si le nom est invalide ou vide. Utilise `isValidUserName` (`userIdentity.js`).
  - `parseAttributedTranscript(rawText, selfLabel)` — prend le texte stocké et, facultativement, l’étiquette micro ; retourne des lignes `{text, source, speaker}` ou `null` si le texte ne paraît pas attribué. Déduit `source` des étiquettes reconnues.
  - `effectiveSpeakerLabels(history, rawSelfName)` — prend l’historique et le nom utilisateur ; retourne une étiquette par entrée, ou `''` pour les marqueurs de coupure hors ligne. Un nom distant explicite est hérité par les lignes distantes suivantes.
  - `buildAttributedTranscript(history, rawSelfName)` — prend l’historique et le nom utilisateur ; retourne `{text, attribution}`. Ajoute une étiquette à chaque changement de locuteur si les deux sources sont présentes ; sinon, joint le texte sans étiquettes et retourne `attribution: null`. Aucun effet de bord notable.
- **Points d’attention :**
  - Les marqueurs `offlineGapId` restent sans locuteur et ne réinitialisent pas le groupement des étiquettes.
  - La lecture inverse exige au moins deux étiquettes distinctes valides (1 à 60 caractères) et du texte ; sinon, `parseAttributedTranscript` retourne `null`.
  - Sans `selfLabel`, seule l’étiquette `[Visio]` est reconnue comme distante par `parseAttributedTranscript` ; les autres étiquettes sont classées locales.
  - `source` détermine le canal : un nom de participant ne transforme pas une ligne distante en ligne locale. Le nom micro affiché lors de la génération est celui fourni à l’appel courant.

### src/utils/recordUrl.js

- Construit l’URL de POST `/api/record` en ajoutant la langue de l’interface, utilisée notamment par Speechmatics pour la transcription.
- Exporte `recordUrl(base, params = {})` :
  - `base` : origine de l’API, se terminant par `/api`.
  - `params` : paramètres additionnels, par exemple `source`.
  - Retour : URL avec les paramètres encodés par `URLSearchParams`. La valeur de `lang` fournie dans `params` est remplacée par celle lue dans le stockage.
  - Effet de bord notable : lit `mybrief_language` dans `localStorage`; en cas d’absence, d’accès impossible ou d’erreur, utilise `fr`.
- Points d’attention : évite d’importer le store afin de fonctionner dans les tests Node sans `localStorage`. Les autres fournisseurs peuvent ignorer `lang`.
