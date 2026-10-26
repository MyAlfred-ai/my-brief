# Migrer une instance historique vers le kit

Cette procédure concerne une instance MyBrief déployée depuis un clone Git et
ses scripts historiques. Elle ne doit être exécutée que sur une instance à la
fois, pendant une fenêtre de maintenance, avec une sauvegarde vérifiée.

Le kit réutilise le volume Mongo existant : il ne copie ni ne recrée la base.
L'identité du projet Compose et le nom réel du volume doivent donc être établis
avant tout démarrage du kit. Ne jamais lancer `docker compose down -v` pendant
la migration.

## 1. Relever et sauvegarder l'installation en place

Depuis le clone historique, relever les valeurs effectivement utilisées par
son `update.sh` : le nom du projet Compose, le fichier Compose et le chemin du
`.env`. Ne pas supposer que le nom du projet est celui du dossier. La
documentation d'instance et les variables `COMPOSE_PROJECT_NAME`,
`COMPOSE_FILE` et `ENV_FILE` de l'ancien script sont les références.

Avec les mêmes paramètres que l'ancien déploiement, vérifier les services :

```bash
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" ps
```

Faire une sauvegarde Mongo avec l'outil de l'installation historique et
confirmer que le fichier produit est présent et non vide :

```bash
bash install.sh backup
```

Noter également le nom du volume réellement monté dans `/data/db` et le
nombre de documents de chaque collection applicative. Le nom du volume est
visible dans les montages du conteneur Mongo :

```bash
mongo_cid=$(docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" ps -q mongo)
docker inspect "$mongo_cid" \
  --format '{{index .Config.Labels "com.docker.compose.project"}}'
docker inspect "$mongo_cid" \
  --format '{{range .Mounts}}{{if eq .Destination "/data/db"}}{{.Name}}{{end}}{{end}}'
```

La première commande `docker inspect` donne le nom de projet réellement utilisé
par le conteneur. C'est cette valeur, y compris si l'ancien script avait un
défaut différent, qu'il faut conserver dans le `.env` du kit.

Pour relever les comptes, réunions et autres collections avant et après la
bascule, exécuter cette lecture seule dans chaque stack :

```bash
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" exec -T mongo sh -c \
  'exec mongosh --quiet -u root -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin mybrief --eval \
  '\''db.getCollectionNames().sort().forEach(n => print(n + "\t" + db.getCollection(n).countDocuments({})))'\'''
```

Conserver la sortie localement, sans la publier : les noms de collections et
les volumes sont des informations d'exploitation de l'instance.

## 2. Préparer le kit sans toucher aux données

Obtenir le kit de la release MyBrief approuvée et l'extraire dans un nouveau
dossier, distinct du clone historique. Copier le `.env` existant vers le
dossier du kit, sans le remplacer par `env.example` : il contient les secrets
et paramètres propres à cette instance.

Dans le `.env` du kit :

- conserver exactement `COMPOSE_PROJECT_NAME` et `MONGO_PASS` ;
- conserver `CONNECTIONS_ENC_KEY` et les autres secrets encore utilisés par
  cette version ;
- définir `MYBRIEF_VERSION` sur la version publiée qui correspond au code
  actuellement en service ;
- conserver le mode réseau de l'instance et régler `COMPOSE_FILE` pour le
  Compose standard ou la surcouche proxy appropriée ;
- vérifier chaque variable conservée par rapport à `kit/env.example` et
  aux fichiers Compose du kit.

Protéger le fichier et confirmer que le Compose du kit résout le même volume
Mongo qu'à l'étape 1, avant de démarrer un service :

```bash
chmod 600 .env
docker compose --project-directory "$PWD" --env-file "$PWD/.env" \
  -p "$COMPOSE_PROJECT_NAME" -f docker-compose.yml config
```

Si l'installation est derrière un proxy, ajouter également le fichier
`docker-compose.proxy.yml` avec un second `-f`, dans le même ordre que celui
défini par `COMPOSE_FILE`.

Contrôler la section `volumes.mongo_data` de la sortie. Le nom doit être
identique au volume historique relevé précédemment. Si l'ancien Compose
utilisait un nom explicite différent du nom calculé à partir du projet,
configurer une surcouche `docker-compose.override.yml` qui déclare ce volume
comme externe, avec son nom exact. Ne pas continuer si les noms ne concordent
pas. Vérifier aussi que le mode proxy et les réseaux configurés correspondent
à l'instance.

## 3. Basculer pendant la fenêtre de maintenance

Arrêter l'ancienne stack avec les paramètres relevés, sans supprimer ses
volumes :

```bash
docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" stop
```

Depuis le nouveau dossier `kit/`, déployer d'abord la même version
que celle qui était en service. Cette première opération sauvegarde également
Mongo avant le déploiement :

```bash
VERSION=1.3.0  # remplacer par la version publiée identique à celle en service
bash update.sh "$VERSION"
```

L'update doit terminer avec le code `0`. Le kit vérifie la signature des
images, leur état de santé et restaure automatiquement l'état précédent si
la nouvelle stack n'est pas saine.

## 4. Vérifier avant de retirer l'ancien clone

Confirmer les points suivants avant de rouvrir l'instance :

1. `docker compose ps` dans le dossier du kit montre les services attendus en
   état sain.
2. La sonde de santé et l'URL publique de l'instance répondent.
3. Le nom du volume Mongo monté est toujours celui relevé avant la migration.
4. La sortie de comptage Mongo est identique à l'inventaire initial pour les
   collections et documents existants.
5. Un administrateur peut se connecter et consulter plusieurs réunions
   existantes.

Conserver l'ancien clone, la sauvegarde et les inventaires jusqu'à validation
explicite de l'instance. Ne supprimer aucun volume. La suppression éventuelle
du clone Git est une étape distincte, après la période de vérification et
conformément à la fiche de déploiement du client.

## Limites de la validation locale

Le smoke local automatise le passage d'un Compose historique minimal
(service Mongo et volume nommé par le projet) vers le kit, avec une donnée
témoin, puis vérifie les mises à jour et retours arrière. Il vérifie le
contrat de conservation du volume, mais ne remplace pas le relevé des noms de
volumes, réseaux, réglages et services de chaque instance réelle. Une
migration client doit suivre les étapes ci-dessus et être validée sur son
environnement propre.
