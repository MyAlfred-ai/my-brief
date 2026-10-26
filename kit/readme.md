# Installer MyBrief

MyBrief aide à la tenue de réunions : transcription, résumé et détection des
actions, avec OpenAI. Frontend Svelte, backend Node (Fastify), base MongoDB.

## Ce qu'il faut avant de commencer

- Un serveur Linux — le cas par défaut est un **VPS Ubuntu (OVH)**. 2 Go de RAM
  suffisent : les images sont téléchargées, rien n'est compilé ici.
- Un **nom de domaine** pointant déjà sur l'IP du serveur, et les **ports 80 et
  443** libres et ouverts. Le certificat TLS est obtenu automatiquement auprès
  de Let's Encrypt, qui vérifie le domaine en HTTP : sans DNS en place, la
  demande échoue.
- Une **clé API OpenAI** — utile dès la première réunion, mais **pas bloquante
  pour installer** : l'assistant accepte de la laisser vide, et elle se règle
  ensuite dans l'application (Administration → IA), sans SSH ni redéploiement.

Docker n'est pas un prérequis : s'il manque, l'assistant propose de l'installer
(script officiel Docker pour Ubuntu). Si le compte utilisé n'est pas dans le
groupe `docker`, l'assistant préfixe de lui-même ses commandes par `sudo` et
rappelle comment s'en passer ensuite.

## Installation

Le kit d'une version est joint à sa publication GitHub, avec `SHA256SUMS` :

```bash
v=1.3.0
curl -fsSLO "https://github.com/MyAlfred-ai/my-brief/releases/download/v$v/mybrief-kit-v$v.tar.gz"
curl -fsSLO "https://github.com/MyAlfred-ai/my-brief/releases/download/v$v/SHA256SUMS"
sha256sum --ignore-missing -c SHA256SUMS
tar xzf "mybrief-kit-v$v.tar.gz" && cd kit
bash install.sh
```

L'assistant est l'**interface d'administration de l'installation** : il détecte
l'état du serveur et propose le bon parcours.

| Cas | Ce qu'il fait |
|---|---|
| **VPS vierge** (défaut) | Vérifie DNS et ports, installe Docker si absent, pose 4 questions (domaine, email Let's Encrypt, clé OpenAI — vide autorisé, email du premier administrateur), tire au hasard les secrets (mot de passe MongoDB, `CONNECTIONS_ENC_KEY`, mot de passe provisoire du premier administrateur, affiché dans le résumé final), écrit `.env` en permissions 600, démarre la stack complète (Traefik + TLS inclus), attend que l'API soit saine et sonde `https://<domaine>`. Si un Traefik tourne déjà sur ce serveur, il le signale et propose de basculer sur le parcours ci-dessous : deux Traefik ne peuvent pas se partager les ports 80/443. |
| **Traefik déjà en place** (v3.x) | Même stack sans reverse-proxy ni certificat : détecte le conteneur Traefik et propose son réseau, demande en plus l'entrypoint TLS et le certresolver, et vérifie que le réseau existe — s'y tromper donne un `504 Gateway Timeout` sans la moindre erreur au démarrage. Écrit `COMPOSE_FILE=docker-compose.proxy.yml` dans `.env` : les commandes `docker compose` manuelles visent ensuite le bon fichier sans option `-f`. |
| **Installation existante** | Le menu bascule sur : état des services, mise à jour, sauvegarde MongoDB, journaux, réinstallation (reconfiguration du `.env`). Jamais d'écrasement silencieux : un `.env` présent est copié en `.env.bak.<horodatage>` avant toute réécriture, et le remplacement demande confirmation. La réinstallation reprend les secrets du `.env` en place — un nouveau `MONGO_PASS` laisserait la base injoignable, une nouvelle `CONNECTIONS_ENC_KEY` les comptes reliés et la clé myBrain illisibles —, mais pas les réglages ajoutés à la main (SMTP, app mobile, version figée…), qui restent dans la copie. |

Chaque parcours existe aussi en commande directe. Les commandes d'exploitation
ne posent aucune question : elles s'utilisent telles quelles en cron ou en CI.

```bash
bash install.sh status    # état des services + sondes HTTP + disque
bash install.sh update    # pull des images + relance + sonde
bash install.sh backup    # dump MongoDB horodaté dans ./backups/
bash install.sh logs api  # journaux d'un service
bash install.sh --help    # rappel des commandes
```

`install` et `proxy`, eux, exigent un terminal — ils posent des questions et
refusent de deviner. Pour une installation entièrement scriptée : écrire `.env`
(cf. `env.example`) puis `docker compose up -d`, ce que l'assistant fait de
toute façon.

Les images `ghcr.io/myalfred-ai/*` sont publiques et signées : aucun
identifiant de registre n'est demandé ni enregistré sur le serveur.

Pour convertir une installation historique déployée depuis un clone Git,
suivre [la procédure de migration](../docs/MIGRER-UNE-INSTANCE.md) avant de
retirer l'ancien dossier ou de modifier les volumes.

### Installation manuelle (sans assistant)

```bash
cp env.example .env && $EDITOR .env
docker compose up -d
```

Trois valeurs sont réellement obligatoires dans `.env` : `DOMAIN`, `MONGO_PASS`
et `ACME_EMAIL` (cette dernière uniquement pour la stack complète — avec
`docker-compose.proxy.yml`, c'est le proxy en place qui gère le certificat).
`OPENAI_API_KEY` peut rester vide et se régler ensuite dans l'application.

Le mot de passe MongoDB se génère, il ne s'invente pas — **en hexadécimal**,
car il est interpolé tel quel dans l'URL `mongodb://` (un `/` de base64 la
rendrait invalide) :

```bash
openssl rand -hex 24
```

Deux autres secrets, que l'assistant tire lui aussi : `ADMIN_SEED_PASSWORD`, le
mot de passe provisoire du compte d'amorçage — sans lui, c'est `admin`, connu
de tous —, et `CONNECTIONS_ENC_KEY`, qui chiffre au repos les comptes Gmail et
Outlook reliés et la clé myBrain — sans elle, ils sont stockés en clair :

```bash
openssl rand -hex 9     # ADMIN_SEED_PASSWORD
openssl rand -hex 32    # CONNECTIONS_ENC_KEY
```

Le site répond en HTTPS sur `https://<DOMAIN>` au bout d'une minute environ, le
temps de l'émission du certificat. Suivre l'avancement :

```bash
docker compose logs -f traefik
```

### Première connexion

Ouvrir `https://<DOMAIN>` et se connecter avec `ADMIN_SEED_EMAIL` /
`ADMIN_SEED_PASSWORD`. L'assistant tire ce mot de passe au hasard et l'affiche
dans son résumé final ; il reste dans `.env`. Sans lui — installation manuelle
qui ne l'a pas renseigné —, c'est `admin` : quiconque connaît l'adresse du
compte peut le prendre avant vous. **Le changement de mot de passe est
imposé immédiatement** — le compte est inutilisable tant qu'il n'est pas fait,
y compris en appelant l'API directement.

Ce compte d'amorçage n'est créé **que si la base est vierge**. Sur une
installation qui contient déjà des comptes, il ne l'est pas : un mot de passe
par défaut connu permettrait au premier venu de devenir administrateur.
Utiliser alors `ADMIN_EMAILS` pour désigner les administrateurs.

Ensuite, tout se fait depuis l'application :

- **Administration → Utilisateurs** : créer les comptes ;
- **Administration → Authentification** : brancher Google ou Entra ID,
  restreindre les domaines email autorisés ;
- **Administration → IA** : la clé OpenAI.

### Désigner un administrateur sur une installation existante

Le compte d'amorçage n'est créé que sur une base vierge. Ailleurs, l'accès
administrateur se donne par le déploiement — c'est volontaire : sans cela,
n'importe quel compte pourrait se promouvoir.

```bash
# dans .env, puis : docker compose up -d
ADMIN_EMAILS=prenom@client.fr,autre@client.fr
```

Les comptes listés sont promus à chaque démarrage (idempotent) et créés s'ils ne
se sont jamais connectés. Retirer un email ne rétrograde personne.

Pour un déploiement **interne**, où l'on maîtrise la création des comptes du
domaine, `ADMIN_EMAIL_DOMAINS=monentreprise.fr` promeut tout compte du domaine,
à chaque démarrage. À laisser vide chez un client : un domaine entier
administrateur n'y est jamais ce qu'on veut.

> L'API prévient dans ses journaux quand **aucun** compte administrateur
> n'existe — situation où l'administration est inaccessible sans que rien à
> l'écran ne l'explique, le menu étant simplement absent.

> Un compte sans le rôle `admin` ne voit pas l'entrée « Administration ». C'est
> la même règle que celle appliquée par l'API sur `/api/admin/*` : l'interface
> n'affiche jamais un écran que le serveur refuserait.

## Clé OpenAI

Elle alimente la transcription, les résumés et la détection d'actions. Deux
endroits, dans cet ordre de priorité :

1. **Administration → IA** — la clé est **vérifiée auprès d'OpenAI avant d'être
   enregistrée** : une clé invalide est refusée là, avec le message d'OpenAI,
   au lieu de casser l'application pour tout le monde. Un bouton « Tester »
   sonde la clé réellement utilisée sans rien changer.
2. `OPENAI_API_KEY` dans `.env` — amorçage. La clé saisie dans l'interface
   prime sur celle-ci.

Sans clé, l'application démarre et enregistre, mais transcription et résumés
répondent 503 en disant où la régler. Remplacer une clé expirée ne demande donc
ni SSH ni redéploiement.

## Authentification

L'installation démarre en **email / mot de passe**, géré par l'API. Aucun
fournisseur d'identité n'est requis pour commencer.

Google et Entra ID s'ajoutent ensuite depuis l'onglet **Authentification** de
l'administration : identifiants saisis dans l'interface, stockés en base,
actifs sans redéploiement. Les URI de redirection à déclarer chez le
fournisseur sont affichées dans cet onglet.

> La stack historique (`docker/docker-compose.yml`) utilise en plus un plugin
> OIDC monté dans Traefik. Une installation neuve n'en a pas besoin et ne doit pas en
> installer : l'API joue elle-même le flux OAuth.

## Sur un serveur qui a déjà un Traefik

`bash install.sh proxy`, ou à la main avec `docker-compose.proxy.yml` : même
stack, sans reverse-proxy ni certificat.

```bash
docker compose -f docker-compose.proxy.yml up -d
```

Renseigner en plus `TRAEFIK_NETWORK` (le réseau que le Traefik existant utilise
pour joindre les conteneurs — `docker network ls`), et si besoin
`TRAEFIK_ENTRYPOINT` et `TRAEFIK_CERTRESOLVER`. Le Traefik en place doit être
en **version 3.x** ; en v2.11, les labels du compose sont à adapter.

> ⚠️ **Ne jamais exposer l'API derrière un autre proxy sans reproduire le
> middleware `mybrief-noident`.** L'API accepte une identité fournie par
> en-tête HTTP (héritage du plugin OIDC). Ce middleware efface ces en-têtes à
> l'entrée ; sans lui, n'importe qui peut envoyer `X-User-Email: victime@…` et
> lire les données d'un autre compte. Les cinq lignes sont commentées dans les
> deux composes, et `services/api/test/traefikWiring.test.js` échoue si un
> routeur les perd.

## Mise à jour

```bash
bash install.## Mise à jour

```bash
./update.sh 1.3.1             # ou : bash install.sh update 1.3.1
```

`update.sh` installe une **version publiée** (`X.Y.Z`) et rien d'autre :

1. contrôle du `.env` et de la place disque ;
2. sauvegarde MongoDB et `.env` dans `sauvegardes/` ;
3. téléchargement des images de la version ;
4. **vérification de leur signature** (cosign, workflow de version du dépôt) ;
5. démarrage, puis attente du contrôle de santé de l'API ;
6. en cas d'échec : **retour automatique** à la version précédente et
   restauration de la sauvegarde.

Codes de sortie : `0` à jour, `1` rien n'a changé, `2` retour arrière
incomplet (intervention requise). `./rollback.sh [X.Y.Z]` revient à la version
précédente ; `./backup.sh` fait une sauvegarde à la demande.

`MYBRIEF_VERSION` (dans `.env`) porte la version en service : ne pas la modifier
à la main, `update.sh` s'en charge.ar d'authentification mobile n'est pas démarré par défaut. Pour
l'activer, générer son secret de signature puis :

```bash
docker compose --profile mobile up -d
```

Ajouter `MOBILE_AUTH_JWT_SECRET` dans `.env` (`openssl rand -hex 32`). Le
changer déconnecte toutes les applications mobiles déjà installées.

## Sauvegarde

Toutes les données applicatives sont dans MongoDB (comptes, comptes-rendus,
modèles). Le volume `mongo_data` est le seul à sauvegarder :

```bash
bash install.sh backup        # dump gzippé horodaté dans ./backups/
```

ou à la main — `MONGO_PASS` est lu par le shell de l'hôte, pas par le
conteneur, il faut donc charger le `.env` d'abord :

```bash
set -a; . ./.env; set +a
docker compose exec -T mongo mongodump --archive --gzip -u root -p "$MONGO_PASS" --authenticationDatabase admin > mybrief-$(date +%F).archive.gz
```

Gardez aussi une copie de `.env` hors du serveur : sans `MONGO_PASS`, le volume
ne s'ouvre plus ; sans `CONNECTIONS_ENC_KEY`, une base restaurée ailleurs a
perdu ses comptes reliés, que chacun doit relier de nouveau, et sa clé myBrain,
à ressaisir dans Administration → MyBrain.

### Restaurer

```bash
set -a; . ./.env; set +a
docker compose exec -T mongo mongorestore --archive --gzip --drop \
  -u root -p "$MONGO_PASS" --authenticationDatabase admin < backups/<archive>.archive.gz
```

⚠️ `--drop` **remplace** les collections présentes par celles de l'archive :
tout ce qui a été créé depuis la sauvegarde est perdu. C'est le geste d'un
retour arrière assumé, pas d'une reprise de données. Pour rapatrier des
documents **sans rien écraser** — le cas d'un ancien volume Mongo — voir
[Récupérer les données d'un ancien volume](#récupérer-les-données-dun-ancien-volume-mongo),
qui verse sans `--drop`.

Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde : la tester
une fois sur un serveur de test est le seul moyen de savoir qu'elle vaut
quelque chose.

## Vérifier que tout va bien

```bash
bash install.sh status        # ou : docker compose ps
```

`mongo`, `api` et `web` doivent être `healthy` ; `traefik` (image officielle,
sans healthcheck) affiche simplement `Up`. En cas de doute :

```bash
docker compose logs api --tail 50
```

L'API refuse de démarrer sans `MONGO_URL` et le dit explicitement dans ses
journaux (`[api] MONGO_URL manquant`) — un conteneur qui redémarre en boucle
vient presque toujours d'une variable manquante dans `.env`, `MONGO_PASS` en
tête. `OPENAI_API_KEY`, elle, n'empêche pas le démarrage : sans clé l'API se
lance et le signale, et seules l'IA et la transcription répondent 503.

Ces sondes ne disent rien des symptômes qui dépendent du **contenu de la
base** — « je ne vois pas mes réunions », « je ne suis pas administrateur ».
Pour ceux-là, voir plus bas : `diagnose-account.sh`.

## « Je ne vois pas mes réunions » / « je ne suis pas administrateur »

Ces deux symptômes ne se diagnostiquent pas depuis le code : ils dépendent de ce
que contient la base. `diagnose-account.sh` répond, en **lecture seule** :

```bash
ssh utilisateur@serveur 'bash -s' -- --email prenom@societe.fr < kit/diagnose-account.sh
```

Il n'a besoin ni du bon répertoire ni du fichier `.env` : il interroge
directement les conteneurs en cours d'exécution — c'est la stack vivante qu'on
veut observer. Ajouter `--project <nom>` seulement si plusieurs stacks compose
cohabitent sur l'hôte (le script les liste quand il hésite).

Il affiche le volume Mongo réellement monté, la volumétrie, **sous quelles
adresses les réunions sont enregistrées**, le rôle réel du compte, et les
journaux de démarrage de l'API. Les trois causes qu'il permet de trancher :

| Ce qu'on lit | Ce que ça veut dire |
|---|---|
| `reunions: 0` alors qu'il y en avait | Le déploiement parle à un **autre volume Mongo** (le nom de projet compose a changé). Rien n'est perdu : les données sont dans l'ancien volume — voir ci-dessous. |
| Votre adresse absente de la liste des propriétaires | Vos réunions sont sous une **autre adresse** — typiquement un annuaire qui a changé d'identifiant. |
| `role` différent de `admin` | Renseigner `ADMIN_EMAILS` (ou `ADMIN_EMAIL_DOMAINS`) puis redémarrer. |

### Récupérer les données d'un ancien volume Mongo

Un dossier renommé, un `-p` différent, un passage de `docker/` à `install/` :
Docker crée alors un volume **neuf** et l'application démarre sur une base
vide. Les données sont intactes dans l'ancien volume, que plus personne ne
monte.

```bash
# 1. Inspecter tous les volumes — LECTURE SEULE
ssh utilisateur@serveur 'bash -s' < kit/recover-mongo-volume.sh
```

Chaque volume est **copié** avant d'être ouvert par un mongod jetable : ouvrir
directement une base d'une version antérieure la ferait migrer sur place, de
façon irréversible. Le volume qui porte vos réunions est celui dont la
collection `resume` compte le plus de documents.

```bash
# 2. Rapatrier ses données dans la stack en service
ssh utilisateur@serveur 'bash -s' -- --restore <volume> --yes < kit/recover-mongo-volume.sh
```

Le versement se fait **sans `--drop`** : rien de ce qui existe n'est écrasé,
seuls les documents absents sont ajoutés. L'archive `mongodump` est conservée
dans le répertoire de l'utilisateur — c'est la sauvegarde. L'API est
redémarrée à la fin pour reposer ses index et normaliser les documents repris.
Le volume source n'est jamais modifié.

`--yes` est nécessaire ici : le script étant lui-même lu sur l'entrée standard,
il n'y a aucun terminal où poser la question — `ssh -t` n'y change rien, il
refuse d'allouer un pseudo-terminal quand l'entrée standard est un fichier. La
sécurité ne repose donc pas sur la confirmation mais sur les vérifications
faites avant elle : un volume source sans le moindre document applicatif est
refusé, et le contenu de la source est affiché avant tout versement.

Le script affiche les compteurs de la base en service **avant et après** : c'est
la preuve que la restauration a produit un effet, et de quelle ampleur.

### Un compte en double

Au démarrage, l'API signale deux documents `user` à la même adresse : l'un sert
l'application, l'autre est un doublon inerte, sans clé `emailLower`. Personne ne
s'y connecte et l'administration ne l'affiche plus, mais il reste en base.
`purge-duplicate-account.sh` le supprime, en **lecture seule** par défaut :

```bash
# 1. Le compte servi et ses doublons — LECTURE SEULE
ssh utilisateur@serveur 'bash -s' -- --email prenom@societe.fr < kit/purge-duplicate-account.sh
# 2. Supprimer les doublons listés
ssh utilisateur@serveur 'bash -s' -- --email prenom@societe.fr --apply < kit/purge-duplicate-account.sh
```

Avant de supprimer, il dépose une copie complète des doublons dans
`~/backups/maintenance/`, hors de la rotation des sauvegardes ; son en-tête donne
la commande qui la remet en base. Il ne touche jamais le compte servi, ni un
document qui porte la clé d'une autre adresse, et refuse tout s'il n'existe pas
de compte servi. Les réunions sont rattachées à l'adresse, pas au document de
compte : le doublon parti, rien ne manque à personne.
