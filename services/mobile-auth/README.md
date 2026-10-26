# mybrief-mobile-auth

> ⚠️ **En cours de retrait.** Ce flux a été rapatrié dans l'API
> (`services/api/routes/mobileAuth.js`) : mêmes chemins, mêmes réponses, mêmes
> variables d'environnement, mais une seule résolution d'identité pour tout le
> produit (`lib/auth/resolve.js`) et une couverture de tests réelle
> (`services/api/test/mobileAuth.test.js`).
>
> État de la bascule :
> - `docker/docker-compose.yml` (dev/recette) : **basculé** sur l'API, le
>   conteneur reste démarré mais n'est plus routé (retour arrière immédiat) ;
> - `install/docker-compose*.yml` et les installations à plugin OIDC : **encore sur ce sidecar**, en
>   attente de la validation d'un login mobile complet en recette.
>
> Une fois la validation faite : retirer le service des composes restants, puis
> supprimer ce dossier. Le secret `MOBILE_AUTH_JWT_SECRET` doit être identique
> des deux côtés pendant toute la transition — sinon les jetons émis par l'un
> sont refusés par l'autre.

Sidecar d'authentification pour l'app mobile Capacitor (~200 lignes, Node 22,
une seule dépendance : `jsonwebtoken`).

## Rôle

L'auth MyBrief est un cookie de session posé en bordure par le plugin Traefik
`traefikoidc`, et Google interdit OAuth dans les WebViews embarquées
(`disallowed_useragent`). Ce service fait le pont :

```
App native ──ouvre navigateur système──▶ /auth/mobile/start  (derrière le middleware oidc)
                                              │ identité via x-auth-request-user / x-user-*
                                              ▼
                                    OTT usage unique (60 s, lié PKCE)
                                              │ page 200 → mybrief://auth/callback?ott=…
App native ◀──────────── deep link ───────────┘
     │
     └──POST /auth/mobile/exchange {ott, verifier}──▶ JWT HS256 (30 j)
     
Appels API : Authorization: Bearer <jwt>
Traefik (routeur « bearer » sur /n8n) ──ForwardAuth──▶ GET /auth/verify
     └── réinjecte X-Auth-Request-User / X-User-Email / X-User-Name / X-User-Picture
         => les workflows n8n voient exactement le même contrat qu'avec le cookie.
```

## Endpoints

| Méthode | Chemin | Exposition | Rôle |
|---|---|---|---|
| GET | `/auth/mobile/start?cc=<sha256(verifier)>` | Traefik, **derrière `oidc`** | Mint l'OTT, page de retour vers l'app |
| POST | `/auth/mobile/exchange` | Traefik, public + CORS | `{ott, verifier}` → `{token, user}` |
| GET | `/auth/verify` | Interne (ForwardAuth) | Valide le Bearer, renvoie les en-têtes identité |
| GET | `/healthz` | Interne | Healthcheck |

## Env

| Variable | Défaut | Rôle |
|---|---|---|
| `MOBILE_AUTH_JWT_SECRET` | — (requis, ≥ 32 car.) | Signature HS256. `openssl rand -hex 32` |
| `MOBILE_JWT_TTL_DAYS` | `30` | Durée de vie du JWT |
| `OTT_TTL_SECONDS` | `60` | Durée de vie de l'OTT |
| `APP_CALLBACK` | `mybrief://auth/callback` | Deep link de retour |
| `PORT` | `8080` | Port d'écoute |

## Notes de sécurité

- OTT usage unique + TTL court + **liaison PKCE** : un OTT intercepté par une
  app squattant le scheme `mybrief://` est inutilisable sans le `verifier`.
- `/auth/verify` renvoie **toujours** les 4 en-têtes (même vides) : ForwardAuth
  écrase donc toute tentative de forge côté client.
- JWT stateless non révocable en V1 : la rotation de `MOBILE_AUTH_JWT_SECRET`
  invalide tous les jetons émis. Store OTT en mémoire (mono-réplica).

## Test local

```bash
MOBILE_AUTH_JWT_SECRET=$(openssl rand -hex 32) node server.js
curl -s localhost:8080/healthz
# start (simule les en-têtes injectés par traefikoidc)
curl -s 'localhost:8080/auth/mobile/start?cc=<challenge>' -H 'x-user-email: test@myalfred.ai'
curl -s -X POST localhost:8080/auth/mobile/exchange -d '{"ott":"…","verifier":"…"}'
curl -s localhost:8080/auth/verify -H 'Authorization: Bearer <jwt>' -i
```
