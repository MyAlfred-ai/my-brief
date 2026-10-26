# Authentification et identité

Trois chemins d'identité **cohabitent** et convergent en un point unique :
`services/api/lib/auth/resolve.js`. Ce document dit lequel fait quoi, ce qui
protège chacun, et l'histoire des pannes qui ont façonné le dispositif.

---

## 1. Les chemins

| Chemin | Qui authentifie | Identité transmise | `authMode` |
|---|---|---|---|
| SSO OIDC (héritage) | Traefik, plugin `traefikoidc` | en-têtes `X-User-Email` / `X-User-Name` | `oidc` |
| **Google / Entra natifs** | **l'API** (OAuth 2.0 + PKCE) | cookie `mybrief_sess` | `sso` |
| Mot de passe | **l'API** | cookie `mybrief_sess` (opaque, stocké haché) | `password` |
| Mobile (Capacitor) | ForwardAuth : l'API (recette) ou le sidecar `mobile-auth` (installations pas encore basculées) | mêmes en-têtes que l'OIDC | `oidc` |

**Ordre de résolution** : marqueur de chemin natif → session native → en-têtes →
rien.

### `authMode` : pourquoi trois valeurs et pas deux

Le frontend en tire **deux décisions**, et une seule valeur ne suffisait pas :

- **`oidc`** est le seul cas où se déconnecter passe par le RP-logout de l'IdP.
  Le faire ailleurs fermerait la session Google ou Microsoft du navigateur, sans
  rapport avec MyBrief ;
- **`password`** est le seul cas où proposer un changement de mot de passe. Un
  compte `sso` n'en a pas — l'écrire `password` lui offrait un formulaire que le
  serveur ne pouvait qu'échouer.

---

## 2. `noident` : la protection centrale

Les routeurs Traefik qui n'appliquent **pas** l'OIDC (`/api/auth`, et `/api`
quand un cookie natif est présent) laisseraient n'importe qui envoyer
`X-User-Email: victime@…` et lire les données d'autrui.

Le middleware **`noident`** efface `X-User-Email`, `X-Auth-Request-User`,
`X-User-Name`, `X-User-Picture` **et** pose `X-Mybrief-Auth-Path: native`. Le
marqueur est infalsifiable de l'extérieur : il est réécrit à chaque passage. Sa
seule présence suffit à disqualifier l'identité par en-tête.

> **Tout routeur Traefik qui atteint `/api` doit porter `noident`.**
> `services/api/test/traefikWiring.test.js` refuse tout routeur vers `api` qui ne
> le cite pas, dans les **deux** syntaxes : `HeadersRegexp` (Traefik v2.11) et
> `HeaderRegexp` (v3). Recopier la forme de l'autre environnement fait rejeter le
> routeur **silencieusement**.

⚠️ **Les middlewares sont définis sur les labels d'UN service** (aujourd'hui
`api`) mais **utilisés par les autres**. Supprimer ce service, ou ses labels,
casse le login de toute la stack.

Le Bearer mobile n'est jamais lu dans `resolve.js` : le ForwardAuth le consomme
et réinjecte les mêmes en-têtes — il arrive au point 3, inchangé.

---

## 3. Rôles et comptes

**Deux rôles** : `user` et `admin`, stockés dans le document `user`. Il n'y a
**pas d'inscription publique** — les comptes sont créés par un administrateur, ou
par un domaine autorisé au retour d'un SSO.

L'interface n'ouvre un écran d'administration que sur le rôle **renvoyé par le
serveur** : aucune règle d'affichage locale (domaine de l'email, par exemple) ne
peut donner accès à un écran que l'API refuserait. `requireAdmin` garde les
routes.

### Compte d'amorçage

`ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD`, sans valeur par défaut : sur une base
vierge, l'API refuse de démarrer si l'un manque ou si le mot de passe fait moins
de 12 caractères. Le compte est créé au premier démarrage avec **changement de mot de passe obligatoire**. Le
seed n'écrase jamais un mot de passe déjà changé.

⚠️ Il n'est créé que sur une base **vierge** : sur une installation existante il
apparaîtrait avec un mot de passe par défaut connu de tous, et le premier à le
changer deviendrait administrateur.

### Désigner un administrateur ensuite

| Variable | Effet | Portée |
|---|---|---|
| `ADMIN_EMAILS=a@x.fr,b@x.fr` | promus **à chaque démarrage** (idempotent), créés s'ils ne se sont jamais connectés | on peut nommer l'admin avant sa 1re connexion SSO |
| `ADMIN_EMAIL_DOMAINS=x.fr` | **tout compte** d'un domaine, à chaque démarrage | déploiements internes seulement, vide chez les clients |
| `LEGACY_ADMIN_DOMAIN=x.fr` | migration **unique** : ne promeut que les comptes antérieurs au champ `role` | jamais un compte créé depuis (il naît `role: 'user'`) |

Retirer un email ne rétrograde personne. C'est le trou de `LEGACY_ADMIN_DOMAIN`
qui a laissé un exploitant sans accès à sa propre administration : quand aucun
administrateur n'existe, l'API **le signale au démarrage** — sans quoi rien à
l'écran ne l'explique, le menu étant simplement absent.

### Comptes sans adresse : supprimés au démarrage

Le `/init` de n8n upsertait le document `user` sur l'en-tête `x-user-email`, et
écrivait `null` pour tout champ absent : une requête arrivée sans l'en-tête
laissait un compte `{ email: null }`. L'administration d'une installation l'affichait
« null » (2026-09), **sans pouvoir le modifier ni le supprimer** — ses routes
désignent un compte par son adresse, que leur schéma exige valide. Et personne
n'a d'accès SSH à cette machine.

Aucun chemin de connexion ne peut atteindre un compte sans `email` ni
`emailLower` : le démarrage le **supprime** (`removeAddresslessUsers`, journalisé
avec son `_id`). On a écarté un bouton de suppression dédié : il aurait fallu
exposer des `_id` à l'écran pour un état qu'aucun code actuel ne produit.

Deux limites voulues. Seul le document `user` part, jamais les données : le
filtre de purge d'une adresse nulle retrouverait **tout** document sans email.
Et rien ne part si la base ne contient aucun autre compte — vidée, elle serait
prise pour une base vierge, et le compte d'amorçage y apparaîtrait.

### Doublons d'adresse : cachés, pas supprimés

Un document `user` peut porter une adresse sans `emailLower` : le doublon d'un
compte servi de même adresse (casse différente, second upsert de l'ère n8n),
que l'index unique a laissé sans clé au backfill. Aucun chemin de connexion ne
l'atteint, mais l'administration le listait (2026-09) : la même personne deux
fois, la ligne en trop EN TÊTE (un `emailLower` absent passe devant tout au
tri), « SSO uniquement », jamais connectée, et des boutons qui agissaient sur
le vrai compte, puisque les routes désignent un compte par son adresse. Sa
corbeille supprimait donc la personne.

`SERVED_ACCOUNT` (`emailLower` de type texte, `lib/repositories/users.js`)
filtre toute lecture qui liste ou compte des comptes : liste, effectifs des
groupes, garde du dernier administrateur, statistiques, alerte « aucun
administrateur ». Et l'upsert de `/init`, qui tombait sur le doublon quand
celui-ci passait le premier dans l'ordre naturel : son `$set: { emailLower }`
heurtait l'index unique, et chaque ouverture de l'app finissait en 500.
Supprimer un compte emporte ses doublons, sans quoi le backfill suivant ferait
du doublon le compte, et la personne supprimée reviendrait.

Alternative écartée : les supprimer au démarrage, comme les comptes sans
adresse. Un doublon a un propriétaire et parfois des champs d'un autre temps
(rôle, mot de passe) qu'un humain voudra relire avant de fusionner ;
`warnDuplicateEmails` les signale à chaque démarrage, et cachés, ils ne gênent
plus rien. La suppression reste un geste humain :
`install/purge-duplicate-account.sh`, qui liste avant d'agir et garde une copie
de ce qu'il supprime.

### Groupes d'utilisateurs

Des ensembles de comptes définis par l'administration (onglet **Groupes**).
Ils portent des règles, la première étant le quota de minutes de réunion
(plus bas), et le modèle est posé pour que les suivantes s'y accrochent sans
le refaire.

Trois décisions, et leur alternative écartée :

- **Un groupe « Défaut » (`id: 'default'`), créé au démarrage, jamais
  supprimé, et l'invariant « un compte est toujours dans au moins un
  groupe »** : tout compte y naît (administration, première connexion SSO,
  compte d'amorçage, `ADMIN_EMAILS`), et un compte retiré de son dernier groupe
  y retombe (`normalizeGroupIds`, réappliqué à chaque écriture). L'alternative
  — un groupe par défaut IMPLICITE, « les comptes qui n'en ont aucun » — rendait
  l'écran illisible : on ne pouvait ni y ajouter quelqu'un ni l'en retirer, et
  une règle par groupe n'aurait pas su quoi appliquer au vide. Le groupe se
  renomme librement : « Défaut » n'est qu'un nom de naissance, et le seed
  (`$setOnInsert` seul) ne le réécrit jamais.
- **L'appartenance vit sur le compte (`user.groupIds`), pas dans une
  collection de liaison** : elle est lue à chaque ouverture de l'app (`/init`,
  `/auth/session`, `/auth/login` renvoient les groupes RÉSOLUS, nom et couleur,
  parce que l'utilisateur n'a pas accès aux routes d'administration) et le sera
  à chaque règle de quota, alors qu'elle change rarement. Index multikey sur
  `groupIds` ; « les membres du groupe X » est `GET /admin/users?group=`, la même
  liste que l'onglet Utilisateurs. Corollaire : supprimer un groupe le retire
  d'abord de tous les comptes (`detachGroup`), puis ramène au défaut ceux
  laissés sans groupe, et seulement ensuite supprime le document — un échec au
  milieu laisse un groupe vide, jamais des membres fantômes.
- **Le backfill du démarrage (`seedDefaultGroup`) inscrit les comptes
  historiques EN BASE**, et pas seulement à la lecture : la liste des membres du
  groupe par défaut interroge l'index, elle ne verrait pas un compte sans champ,
  et l'effectif affiché serait faux. Non bloquant, comme les autres reprises.

Palette FERMÉE et partagée avec les tags (`GROUP_COLORS` ↔ jetons `--tag-*`) :
une pastille est une pastille, deux jeux de couleurs voisines se confondraient.
Changer de groupe n'est pas un changement de droits : les sessions restent
ouvertes, contrairement à un changement de rôle.

**Le quota de minutes** (`meetingMinutesPerMonth`, `lib/quota.js`) est la
première règle portée par un groupe : des minutes par personne et par mois
civil, `null` = illimité. Cinq décisions :

- **le plus généreux des groupes d'un compte s'applique, « illimité »
  l'emporte** : être ajouté à un groupe ne retire jamais de minutes, l'admin
  limite « Défaut » pour un quota de base et exempte par un groupe illimité ;
  l'alternative (le plus restrictif, ou le premier) rendait un second groupe
  imprévisible ;
- **le mois civil, à l'heure de Paris** : il se lit sans explication
  (« renouvelé le 1er »), là où une fenêtre glissante demande un calcul, et
  c'est à l'heure de Paris que les organisations lisent « le 1er ». UTC, le
  premier choix pour son déterminisme, renouvelait à 1 h du matin l'hiver,
  2 h l'été, et comptait pour le mois d'avant une réunion commencée le 1er à
  0 h 30. Les bornes restent des instants UTC en ISO, comparables tels quels à
  `lastConnecion` ; elles partent avec leur fuseau (`period.timeZone`), faute
  de quoi l'écran nommerait « septembre » la borne du 1er octobre à minuit —
  le 30 septembre à 22 h UTC ;
- **ce qui compte est `meetingDuration`** (le chronomètre, écrit à l'arrêt),
  sur les réunions datées `lastConnecion` dans le mois : une réunion en cours
  ne compte donc qu'à son arrêt, et **le quota s'applique au démarrage, jamais
  en cours** (on ne coupe pas la parole pour une minute de trop ; le
  dépassement se voit le mois suivant). « Atteint » = moins d'une minute
  pleine, ce qui fait coïncider le refus avec le « 0 min » de l'écran ;
- **une réunion supprimée garde ses minutes jusqu'à la fin de son mois** : le
  quota mesure ce qui a été transcrit, et payé chez OpenAI, pas ce que
  l'historique garde. Calculé sur les seuls documents `resume`, il rendait ses
  minutes à toute réunion supprimée — un compte au quota atteint s'en
  redonnait depuis l'historique (2026-10). Avant de partir, la réunion laisse
  une **trace** (`deletedMeetingUsage`, `keepDeletedUsage`) : propriétaire,
  `meetingId`, date, durée, sous les noms de champs de `resume` pour que le
  même filtre et la même somme valent ; rien de ce qui a été dit. Un index TTL
  l'efface à la fin du mois de sa réunion, quand elle cesse de compter. Une
  réunion compte une fois, pour sa plus longue durée connue (même
  `meetingId` : trace et réunion recréée ne s'additionnent pas). Supprimée
  pendant l'enregistrement — « Supprimer la réunion » envoie la suppression
  avant la clôture —, elle reçoit sa durée de l'arrêt qui suit
  (`recordLateStop`). L'enregistrement vide que l'arrêt efface lui-même
  (`discardIfEmpty`) ne laisse rien, comme avant. Alternative écartée : un
  **compteur mensuel par compte**, incrémenté à l'arrêt. La durée s'écrit
  plusieurs fois sur une même réunion (arrêt, premier résumé, chaque
  régénération, qui renvoie la durée connue) : il aurait fallu retenir,
  réunion par réunion, ce qui était déjà compté — et remplir le compteur du
  mois en cours au déploiement, le quota étant en production. La trace ne
  change ni la règle ni sa source tant que la réunion existe. Son prix : tout
  nouveau chemin de suppression d'une réunion doit appeler `keepDeletedUsage`
  d'abord ;
- **deux portes seulement** (`routes/ai.js`) : `/tempkey` (démarrage d'une
  réunion en direct, les rotations en cours de réunion passent sans risque
  puisque l'état ne bouge pas avant l'arrêt) et `/record` pour l'import, **pas
  pour les segments hors ligne** (`?source=offline`) : ils appartiennent à une
  réunion déjà commencée et les refuser perdrait ce qui a été dit. Refus en
  **409 `quota_exhausted`** avec l'état dans le corps : pas 429, que le client
  inspecte pour reconnaître un crédit OpenAI épuisé, ni 402.

L'écran lit le même état (`/init`, `GET /quota`, relu après chaque fin de
réunion) pour l'afficher autour de l'avatar et sous le nom (`quotaNow`,
`ui/CreditAvatar.svelte`) et retenir
« Démarrer » avant le clic ; pendant une réunion il déduit le chronomètre en
direct (`liveElapsedStore`), puisque le serveur ne comptera qu'à l'arrêt. Le
serveur reste seul juge : un 409 arrivé malgré tout (quota consommé sur un
autre appareil) est traité comme tel, pas comme une panne de l'IA
(`utils/tempKeyStart.js`).

Le renouvellement, lui, ne se voit pas tout seul : aucun compteur n'est
stocké, le serveur recalcule le mois à chaque lecture, mais un onglet resté
ouvert — ou l'app native gardée en mémoire — gardait l'état du mois écoulé et
retenait « Démarrer » jusqu'au rechargement, le 1er au matin. Le store se relit
donc une fois `period.end` passé (`watchRenewal`) : une comparaison d'horloge
chaque minute, pas un minuteur calé sur la borne, qui ne compte pas la veille
du poste et tomberait des heures trop tard au réveil.

Même défaut, autre cause : l'administration relève un quota, ou change le
compte de groupe — le message de refus invite justement à le lui demander —,
et « Démarrer » restait retenu jusqu'au rechargement. Un clic sur
« Démarrer » retenu relit donc le serveur avant de refuser
(`confirmQuotaExhausted`), le bouton occupé pendant la relecture pour qu'un
double clic ne lance pas deux réunions. Sans réponse, l'état affiché fait foi,
sauf s'il porte sur un mois écoulé : `/tempkey` tranchera.

**Le droit aux infographies** (`infographicAllowed`, `rightsOf`) est le premier
DROIT porté par un groupe : un booléen, là où le quota est une mesure. Quatre
décisions :

- **cumulatif** : un compte a le droit dès qu'UN de ses groupes le donne,
  comme il garde le quota le plus généreux. L'administrateur le réserve à
  quelques personnes en le retirant à « Défaut » ;
- **« Défaut » le donne au déploiement**, par LECTURE : un groupe antérieur
  au champ vaut « accordé » s'il est le groupe par défaut, « refusé » sinon
  (`normalizeInfographicAllowed`), et un groupe créé ensuite naît sans. Une
  reprise en base au démarrage a été écartée : la lecture suffit, et le
  « non » d'un administrateur, lui, est écrit ;
- **l'interrupteur « Proposer l'infographie » de l'onglet IA reste
  au-dessus** : il dit si l'installation propose l'image (organisation
  vérifiée chez OpenAI, coût), les groupes disent à qui. L'identité porte le
  droit des groupes seul (`rights` dans `/init`, `/auth/session`,
  `/auth/login`), les capacités publiques portent l'interrupteur, et l'écran
  les combine (`canGenerateInfographic`) : un interrupteur rallumé se voit
  sans recharger la page ;
- **les portes** (`/resume`, `/infographic/regenerate`, `infographicVerdict`
  dans routes/meetings.js) vérifient les deux. Un refus de régénération est
  un **409** (`infographic_disabled`, `infographic_not_allowed`), jamais un
  403, que le client lit comme une session perdue : le 403 d'origine de
  `infographic_disabled` déconnectait l'utilisateur. Sans le droit, une image
  existante reste visible, téléchargeable et supprimable.

### Sécurité des mots de passe

- **scrypt** (`node:crypto`, aucune dépendance native), jamais renvoyés par
  l'API (projection centralisée dans `lib/repositories/users.js`) ;
- **sessions révocables** : un reset, une désactivation ou une suppression ferme
  immédiatement toutes les sessions du compte ;
- cookie `HttpOnly; Secure; SameSite=Lax` ;
- rate-limit **par IP et par compte** ;
- **réponses indifférenciées** sur `/auth/login` et `/auth/forgot-password` pour
  empêcher l'énumération des comptes.

---

## 4. SSO natif (Google, Entra)

Un seul flux (`routes/auth/ssoFlow.js`) sert tous les fournisseurs ; le registre
`lib/auth/providers.js` décrit ce qui les distingue, et rien d'autre. À
l'arrivée, l'utilisateur reçoit une session **native**, identique à celle d'un
mot de passe : un seul type de session à révoquer, expirer et router.

Les deux routes sont des **navigations top-level**, pas des `fetch` : elles
répondent par des redirections, jamais du JSON. Les échecs partent vers
`/signin?error=<slug>`.

### Les URI de redirection

| Fournisseur | URI | À déclarer |
|---|---|---|
| Google | `https://<domaine>/api/auth/google/callback` | console Google Cloud (l'écran d'administration affiche l'URI exacte) |
| Entra | `https://<domaine>/oauth2/callback` | **déjà déclarée** — héritée du plugin |

⚠️ **Ne jamais renommer `/oauth2/callback` sans accès admin Entra.** Sur les
installations on-prem, cette URI est déjà enregistrée dans l'app registration et
personne côté MyBrief n'a les droits d'en déclarer une autre. On hérite donc de
l'existante : même URI, même clientId, même secret — seul change qui répond
derrière. Ce callback vit **hors du préfixe `/api`** et exige un routeur Traefik
dédié portant `noident`.

Un repli d'endpoints existe pour Google si la découverte échoue au démarrage
(ces URLs sont stables depuis des années). **Aucun équivalent pour Entra** : ses
endpoints dépendent du tenant, les deviner enverrait vers le mauvais annuaire.

### Domaines autorisés

Un utilisateur qui se connecte depuis un domaine de la liste obtient
automatiquement son compte (rôle `user`) ; les autres sont refusés.

⚠️ **Une liste vide n'autorise personne** à se créer un compte. C'est volontaire :
« vide = tout le monde » ouvrirait l'application à n'importe quel compte Google.
Les comptes déjà créés par un administrateur continuent de fonctionner quel que
soit leur domaine.

### Quelle adresse identifie la personne

**Google** : `email`, refusé s'il est marqué non vérifié.

**Entra** : `email`, `preferred_username` (l'UPN), `upn` — et **toutes** servent :

- le compte existant se cherche sous chacune. L'identité stockée dépend de
  l'installation : selon sa configuration, le plugin posait `email` ou
  `preferred_username`. Ne chercher que sous la première donnait, à qui a deux adresses
  différentes, un second compte à l'historique vide — ou un refus de domaine ;
- la création prend la première dont le domaine est autorisé ;
- un seul compte **désactivé** parmi elles suffit à refuser : sinon l'autre
  adresse contournerait la désactivation.

⚠️ **`userinfo` ne porte jamais `preferred_username` ni `upn` chez Microsoft.**
Sa réponse est documentée comme complète : `sub`, les noms, `picture`, `email`.
Le repli sur l'UPN ne lisait que `userinfo` : un compte sans attribut `mail` dans
l'annuaire ne pouvait pas se connecter, pendant que les tests passaient — ils
simulaient un `userinfo` qui n'existe pas. Ces claims viennent donc de
l'**id_token**, lu sans vérifier sa signature (reçu directement du token
endpoint sur TLS, OIDC Core §3.1.3.7), mais seulement s'il est émis pour notre
`clientId` et pour le même `sub`.

L'id_token **complète** `userinfo`, il ne le contredit jamais : `email` et
`email_verified` n'en sont pas repris — une attestation « vérifiée » venue d'une
autre source que l'adresse ferait entrer une adresse non vérifiée chez Google.

### Photo de profil : Google seulement

L'avatar affiche la photo (`picture`) que publie l'IdP, recopiée **sur le
compte** à chaque connexion — pas sur la session : elle survit à une connexion
ultérieure par mot de passe, et une photo changée chez Google arrive à la
connexion suivante (l'API ne garde aucun jeton pour la relire entre-temps).

Entra publie aussi `picture`, mais c'est une adresse Microsoft Graph qui exige
un jeton : un `<img>` n'en a pas, la photo ne s'afficherait jamais. Son
`pictureOf` rend donc vide — et une connexion Entra n'efface pas une photo
donnée par Google. La recopier (proxy authentifié, ou téléchargement à la
connexion) a été écarté : un stockage d'images et un scope Graph de plus pour
une icône de 31 px.

Seule une adresse **HTTPS** est retenue (`pictureUrl`, `lib/identity.js`) ; le
chemin plugin la lit dans `X-User-Picture`, que `noident` efface comme les
autres en-têtes d'identité. Le front la charge en `referrerpolicy="no-referrer"`
— posé **avant** `src`, sinon Chromium recharge une photo en cache avec le
référent.

### Les identifiants se règlent depuis l'administration

Le flux étant joué par l'API et non par Traefik, clientId et secret se saisissent
dans **Administration → Authentification**, sans redéploiement, et le flux est
testable en local.

---

## 5. Modes de la page de connexion

Carte « Page de connexion » (voir / régler / tester) dans l'administration.
Chaque mode a **deux verrous** : un réglage d'administration **et** un drapeau
d'environnement.

- **L'environnement reste le coupe-circuit** : un mode affiché dans
  l'administration mais désactivé par l'environnement reste masqué.
- Un mode masqué disparaît de la sonde publique `GET /api/auth/config`, et sa
  route répond **501**.
- Le **SSO historique** (plugin) est **masquable, pas retiré** — une installation
  l'utilise encore.
- Garde `no_login_mode_left` : l'enregistrement est refusé s'il ne laisserait
  **aucun** mode affiché. La garde juge **l'état d'arrivée**, pas le champ
  modifié — couper le dernier SSO et le mot de passe dans le même envoi doit
  échouer.
- Le bouton « Tester » ouvre le **flux réel**, pas un aperçu.

---

## 6. Bascule Entra : plugin Traefik → API native

Passer l'authentification Entra du plugin au flux natif **sans aucune
modification côté Entra** et **sans nouveau secret**. Concerne les installations
on-prem.

### Ce que la bascule apporte

| | Plugin | Natif |
|---|---|---|
| Identité vers l'API | en-tête `X-User-Email` | cookie `mybrief_sess` |
| Session | cookies `_oidc_raczylo_*` | la même que mot de passe et Google |
| Config des identifiants | labels Traefik, restart requis | base + administration |
| Pannes supprimées | — | plugin non chargé au boot, `Invalid state parameter`, double jeu de cookies, HTTP 431 |

### Cohabitation : rien ne bascule tant que personne ne s'en sert

Les deux flux partagent `/oauth2/callback`. Le discriminant est le cookie d'état
`mybrief_oauth`, posé **uniquement** par le flux natif :

```
Path(`/oauth2/callback`) && HeadersRegexp(`Cookie`, `(^|;\s*)mybrief_oauth=`)  → API    (prio 80)
Path(`/login`) || PathPrefix(`/oauth2`)                                        → plugin (prio 60)
```

Tant que le flux natif n'est pas activé, ce cookie n'existe pas et le plugin
garde le callback : **déployer ne change rien de visible**. Corollaire utile : le
**mobile reste sur le plugin** après la bascule web — son flux ne pose pas ce
cookie.

### Procédure

**1. Pré-vol.** Lancer une connexion en production, lire `redirect_uri=` dans
l'URL d'autorisation Microsoft : doit valoir exactement
`https://<domaine>/oauth2/callback` — c'est la **seule hypothèse critique** du
dispositif. Vérifier aussi l'expiration du client secret : il se renouvelle côté
Entra, ce que nous ne pouvons pas faire, et il devient le chemin critique unique
une fois les trois méthodes unifiées.

**2. Déploiement (sans bascule).** `git pull` + `up -d`. Le fournisseur Entra
natif est amorcé en base depuis les variables existantes, **désactivé**. Vérifier
que le routeur `*-api-oauth2` apparaît dans le dashboard Traefik.

**3. Bascule du web** — hors heures ouvrées, la bascule est sèche (les flux en
vol échouent, l'utilisateur se reconnecte) :

```bash
ENTRA_LOGIN_ENABLED=1
API_AUTH_MIDDLEWARES=mybrief-noident,allowframe
WEB_AUTH_MIDDLEWARES=allowframe
OIDC_ENABLED=false
```

Contrôles : l'écran affiche « Continuer avec Microsoft » ; la connexion pose un
cookie `mybrief_sess` ; `/api/init` répond 200 ; Administration →
Authentification affiche Entra **Actif**.

**4. Retour arrière** : recommenter les 4 variables, `up -d`. Les labels du
plugin n'ont jamais été retirés.

**5. Bascule du mobile** (étape séparée, après validation du web) — **deux
variables qui vont toujours ensemble** :

```bash
MOBILE_START_MIDDLEWARES=mybrief-noident
MOBILE_AUTH_IDENTITY=session
```

⚠️ **N'en changer qu'une casse quelque chose.** Sans `mybrief-noident`, les
en-têtes ne sont plus effacés et un client forgerait `X-User-Email` pour obtenir
un jeton mobile au nom de n'importe qui. Sans `session`, le sidecar attend des
en-têtes que plus personne n'injecte et répond 503.

**6. Retrait du plugin** — une fois web ET mobile basculés et observés, dans un
commit séparé, après plusieurs jours.

**Ordre recommandé** : la plus petite installation d'abord, observation quelques
jours, puis les autres. Le mobile dans le même ordre.

---

## 7. Historique des pannes du plugin OIDC

Conservé parce que ces symptômes reviennent tant que le plugin est en service.

### 7.1 « Invalid state parameter (CSRF mismatch) »

**Cause racine**, confirmée par lecture de `auth_flow.go` / `session.go` en
v0.8.24 **et** v1.0.27 : le plugin génère un CSRF **unique par session**, l'écrit
dans le cookie et le passe en `state`. Deux initiations concurrentes s'écrasent —
le `state` qui revient ne correspond plus au dernier CSRF écrit, et le plugin
répond une page 400 **sans aucune récupération**.

**Déclencheur « après quelques heures »** : les ID tokens Google expirent en ~1 h
et, sans `offline_access`, aucun refresh token n'est émis. Chaque accès protégé
relance alors le flux complet ; au réveil d'un onglet ou au retour du réseau,
plusieurs initiations partent en même temps.

**Ce qui n'est PAS la cause** (vérifié, pour ne pas y revenir) :
`cookieSameSite`/`cookieSecure` ne sont **pas des options du plugin** (les labels
ajoutés étaient des no-op ; `Lax` est correct) ; les chunks de cookie périmés
sont bien expirés ; la clé de session est persistée ; upgrader le plugin ne
corrige rien — l'architecture est identique.

**Correctifs, dans l'ordre où ils ont été posés :**

1. **`public/auth-recover.html`** — page servie à la place de l'erreur (middleware
   Traefik `errors` sur le statut 400, en position **outermost**). Elle purge SW,
   caches et cookies non-HttpOnly, puis relance **un seul** flux propre. Garde
   anti-boucle : 2 essais automatiques (`sessionStorage`), remis à zéro par
   `main.js` au démarrage réussi. Le 400 n'est émis que par le plugin — nginx
   statique n'en renvoie jamais.
2. **SPA public, API protégée** — le shell ne déclenche plus de redirection OIDC
   automatique. Un routeur dédié (`/login` + `/oauth2/*`) porte l'OIDC ; l'API
   reste la vraie frontière de sécurité. `forceReauth()` navigue vers `/login` :
   **une navigation top-level = une seule initiation**, donc pas de clobber.
3. **`OIDC_SESSION_KEY` persistante** (`openssl rand -base64 32`) — sans clé
   stable, chaque restart Traefik invalide les cookies OIDC en vol. Contrôlée au
   démarrage côté serveur.

⚠️ Le SPA étant public, `VITE_ADMIN_PASSWORD` — compilé dans le bundle, donc
lisible par tous — a été **supprimé du front**. Il est aujourd'hui **déprécié et
plus lu** : le gating admin est un rôle en base, pas un secret compilé.

### 7.2 Déconnexions vers 40-50 min, application morte à 1 h

Course entre la rotation des refresh tokens côté IdP et la boucle de démontage du
frontend. Deux corrections : côté serveur, ne pas invalider une session sur un
refresh concurrent ; côté client, ne pas enchaîner les démontages.

À ne pas confondre avec les toasts « Connexion perdue » à 45-50 min, qui viennent
de la **rotation du WebSocket OpenAI** et non de l'authentification (cf.
[TRANSCRIPTION.md §4](./TRANSCRIPTION.md)).

### 7.3 Plugin non chargé au boot — panne silencieuse de 3 jours

**Symptôme** (2026-07-18) : application affichée mais historique vide, login n8n
mort, `Unexpected token '<', "<!DOCTYPE"` sur les appels API.

**Cause** : après un reboot serveur, le Traefik partagé en mode
`experimental.plugins` a voulu **télécharger** le plugin ; le DNS Docker n'était
pas prêt. Plugins désactivés pour toute la session → middleware `oidc`
inexistant → les routeurs qui le référencent sont **retirés** → les requêtes
tombent sur le catch-all SPA, qui répond `index.html` en **HTTP 200**. Le plugin
ne se (re)charge qu'au **démarrage** de Traefik : la panne est restée silencieuse
trois jours.

**Correctif immédiat** : `docker restart traefik`.

**Prévention, par ordre d'impact :**

1. **vendorer le plugin** (`--experimental.localPlugins…`, image construite depuis
   `docker/traefik/`) — zéro dépendance réseau au boot, cause racine éliminée ;
2. fiabiliser le DNS Docker (`/etc/docker/daemon.json` → `{"dns":["1.1.1.1","8.8.8.8"]}`) ;
3. persister le cache de plugins si le mode download est conservé ;
4. **sonder le routage** : le discriminateur fiable est l'en-tête `server`, pas le
   `content-type` — un `/api/*` derrière OIDC répond légitimement 302 quand tout
   va bien, mais **jamais `server: nginx`** :

```bash
# cron */5 — alerte si un chemin /api/* est servi par le nginx du SPA
srv=$(curl -s -o /dev/null -D - https://<domaine>/api/ping | awk 'tolower($1)=="server:"{print tolower($2)}')
case "$srv" in *nginx*) echo "ALERTE: router API down — /api/ servi par le SPA (server=$srv)" ;; esac
```

---

## 8. Développer sans Traefik ni OIDC

`vite.config.local.js` **reproduit le routage Traefik** : il injecte les en-têtes
d'identité (`x-user-email: dev@myalfred.ai`) que poserait le plugin, sauf pour
les requêtes portant un cookie de session native ou visant `/api/auth`, qu'il
traite comme le middleware `noident`.

```bash
npm run dev:backend           # Mongo + API (docker/docker-compose.dev.yml)
npm run dev:local             # Vite :5173, proxy /api → :3000, OIDC simulé
npm run dev:local:password    # DEV_FAKE_OIDC=0 : plus de simulation
```

Ou, sans redémarrer le serveur, depuis la console du navigateur :
`document.cookie = 'mybrief_dev_no_oidc=1; path=/'`.
