/**
 * Couplage entre le code et le routage Traefik.
 *
 * Deux noms de cookies sont câblés dans les règles des composes. Les renommer
 * côté code sans toucher les composes ne casse RIEN visiblement en test unitaire
 * — mais en production, toutes les requêtes partent dans le mauvais flux
 * d'authentification. Ces vérifications sont là pour que le rename échoue ici,
 * pas chez le client.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SESSION_COOKIE } from '../lib/auth/cookies.js';
import { OAUTH_STATE_COOKIE } from '../lib/auth/oauthState.js';
import { PROVIDERS } from '../lib/auth/providers.js';
import { CONNECT_PROVIDERS } from '../lib/connections/providers.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * Sur quel service vivent les labels qui DÉFINISSENT un middleware ?
 * Un middleware Traefik n'est déclaré qu'une fois, sur les labels d'un
 * conteneur, mais il est référençable par toute la stack — d'où le piège :
 * supprimer le service porteur retire la définition, et tous les routeurs qui
 * la référencent deviennent invalides, sans erreur visible.
 */
function serviceDefining(yaml, needle) {
  let service = null;
  const owners = new Set();
  for (const line of yaml.split('\n')) {
    const header = /^ {2}([a-z0-9_-]+):$/.exec(line);
    if (header) service = header[1];
    if (line.includes(needle)) owners.add(service);
  }
  return [...owners];
}

const COMPOSES = [
  // Traefik v3 sur cette stack : matcher au SINGULIER.
  {
    file: 'docker/docker-compose.yml',
    matcher: 'HeaderRegexp',
    noident: 'noident-dev',
    apiService: 'api-dev',
    oidc: 'oidc-dev',
    bearer: 'mobile-bearer-dev',
    // Flux mobile RAPATRIÉ dans l'API sur cette stack (Phase 7) : c'est ici
    // qu'il se valide avant d'être basculé chez le client.
    mauthService: 'api-dev',
    verifyUpstream: 'http://mybrief-api:3000/auth/verify',
  },
];

describe.each(COMPOSES)(
  'routage Traefik — $file',
  ({ file, matcher, noident, apiService, oidc, bearer, mauthService, verifyUpstream }) => {
    const yaml = readFileSync(join(ROOT, file), 'utf8');

    it('porte les middlewares partagés sur `api`, le service qui ne peut plus disparaître', () => {
      // `oidc` et `allowframe` sont référencés par les routeurs de plusieurs
      // services. Sur une installation, leurs définitions vivaient sur un
      // service depuis retiré (`n8n`) : ce retrait aurait emporté
      // la définition, invalidé /login, /oauth2 et /api, et tué le SSO sur tout
      // le domaine sans une seule erreur 5xx. Cette vérification interdit de
      // reposer une définition partagée sur un service jetable.
      for (const middleware of [oidc, 'allowframe']) {
        expect(serviceDefining(yaml, `middlewares.${middleware}.`)).toEqual(['api']);
      }
    });

    it('aiguille les sessions natives sur le nom de cookie réellement posé', () => {
      expect(yaml).toContain(`${matcher}(\`Cookie\`, \`(^|;\\\\s*)${SESSION_COOKIE}=\`)`);
    });

    it('aiguille le callback OIDC natif sur le cookie d état réellement posé', () => {
      // C'est ce cookie qui distingue le flux natif de celui du plugin, les deux
      // partageant l'URI de redirection enregistrée côté Entra.
      expect(yaml).toContain(`${matcher}(\`Cookie\`, \`(^|;\\\\s*)${OAUTH_STATE_COOKIE}=\`)`);
    });

    it("route l'URI de redirection héritée, telle qu'elle est déclarée côté Entra", () => {
      expect(PROVIDERS.entra.callbackPath).toBe('/oauth2/callback');
      expect(yaml).toContain(`Path(\`${PROVIDERS.entra.callbackPath}\`)`);
      // Le plugin doit viser exactement la même URI : c'est la seule enregistrée.
      expect(yaml).toContain(`callbackURL=${PROVIDERS.entra.callbackPath}`);
    });

    it('efface les en-têtes d identité sur toute route qui atteint l API sans OIDC', () => {
      // Sans `noident`, une route sans middleware d'authentification laisse
      // n'importe qui envoyer `X-User-Email: victime@…` (cf. lib/auth/resolve.js).
      const routerLines = yaml
        .split('\n')
        .filter((l) =>
          /routers\.[a-z-]*(oauth2|api-auth|api-native|api-dev-auth|api-dev-native)\.middlewares=/.test(
            l,
          ),
        );
      expect(routerLines.length).toBeGreaterThanOrEqual(3);
      for (const line of routerLines) expect(line).toContain(noident);
    });

    it('ne confond pas le cookie natif avec ceux du plugin ni avec un préfixe', () => {
      // La règle est extraite du compose et appliquée telle quelle : c'est le
      // prédicat de routage lui-même qu'on teste, pas une copie.
      const raw = new RegExp(`${matcher}\\(\`Cookie\`, \`([^\`]+)\`\\)`).exec(
        yaml.split('\n').find((l) => l.includes(OAUTH_STATE_COOKIE) && l.includes(matcher)),
      );
      const rule = new RegExp(raw[1].replace(/\\\\/g, '\\'));

      expect(rule.test(`${OAUTH_STATE_COOKIE}=abc`)).toBe(true);
      expect(rule.test(`autre=1; ${OAUTH_STATE_COOKIE}=abc`)).toBe(true);
      // Cookies posés par le plugin Traefik : ils doivent rester sur le plugin.
      expect(rule.test('_oidc_raczylo_session=zzz; _oidc_raczylo_csrf=yyy')).toBe(false);
      // Session native seule : le callback ne la concerne pas.
      expect(rule.test(`${SESSION_COOKIE}=tok`)).toBe(false);
      // Faux positif par suffixe — la raison d'être de l'ancre `(^|;\s*)`.
      expect(rule.test(`xx_${OAUTH_STATE_COOKIE}=abc`)).toBe(false);
    });

    it('achemine le retour de connexion Microsoft par le même routeur', () => {
      // La connexion d'un compte Microsoft revient sur `/oauth2/callback` — la
      // seule URI déclarable dans les app registrations on-prem. Elle n'y
      // arrive que si son cookie d'état satisfait la règle du routeur : d'où le
      // partage de `mybrief_oauth` avec le login, plutôt qu'un cookie dédié.
      //
      // Ce test échoue si quelqu'un donne un nom propre au cookie de connexion
      // sans élargir la règle des composes — l'oubli enverrait le retour
      // d'autorisation sur le plugin OIDC, et la connexion échouerait chez tous
      // les clients on-prem sans rien casser en test unitaire.
      const raw = new RegExp(`${matcher}\\(\`Cookie\`, \`([^\`]+)\`\\)`).exec(
        yaml.split('\n').find((l) => l.includes(OAUTH_STATE_COOKIE) && l.includes(matcher)),
      );
      const rule = new RegExp(raw[1].replace(/\\\\/g, '\\'));

      expect(CONNECT_PROVIDERS.microsoft.callbackPath).toBe(PROVIDERS.entra.callbackPath);
      expect(rule.test(`${CONNECT_PROVIDERS.microsoft.stateCookieName}=abc`)).toBe(true);

      // Le flux Google, lui, a son propre cookie ET son propre chemin sous
      // /api : il ne doit surtout pas emprunter ce routeur.
      expect(rule.test(`${CONNECT_PROVIDERS.google.stateCookieName}=abc`)).toBe(false);
      expect(CONNECT_PROVIDERS.google.callbackPath.startsWith('/api/')).toBe(true);
    });

    it('donne au callback natif une priorité supérieure au routeur /oauth2 du plugin', () => {
      const priorityOf = (router) => {
        const m = new RegExp(`routers\\.${router}\\.priority=(\\d+)`).exec(yaml);
        return m ? Number(m[1]) : null;
      };
      const nativeCallback = priorityOf('[a-z-]*api[a-z-]*-oauth2');
      const pluginAuth = priorityOf('[a-z-]*web[a-z-]*-auth');
      expect(nativeCallback).toBeGreaterThan(pluginAuth);
    });

    /**
     * Depuis la Phase 7, l'API sert AUSSI les chemins du flux mobile
     * (`/auth/mobile/*`, `/auth/verify`), qui vivent HORS de `/api` : les
     * routeurs `PathPrefix(/api)` ne les couvrent pas, ils ont les leurs. Un
     * routeur mobile mal câblé ne casse rien de visible côté web — il ouvre
     * l'émission de jetons.
     */
    const lines = yaml.split('\n');
    const serviceOf = (router) =>
      lines
        .find((l) => l.includes(`routers.${router}.service=`))
        ?.split('=')
        .pop()
        .trim() ??
      // Sans `service=`, Traefik rattache le routeur au service homonyme.
      router;
    const middlewaresOf = (router) =>
      lines.find((l) => l.includes(`routers.${router}.middlewares=`)) || '';
    const routers = [
      ...new Set(
        lines.flatMap((l) => [...l.matchAll(/routers\.([a-z0-9-]+)\./g)].map((m) => m[1])),
      ),
    ];

    it("n'atteint l'API que par un routeur qui établit ou efface l'identité", () => {
      // Trois façons ACCEPTABLES d'arriver sur l'API : le plugin OIDC a
      // authentifié et injecté l'identité ; le ForwardAuth mobile l'a fait ; ou
      // `noident` a effacé les en-têtes et l'API authentifie elle-même. Une
      // quatrième — aucun middleware — laisserait passer `X-User-Email: victime@…`.
      const onApi = routers.filter((r) => serviceOf(r) === apiService);
      expect(onApi.length).toBeGreaterThanOrEqual(4);
      for (const router of onApi) {
        const mw = middlewaresOf(router);
        expect(mw, `le routeur ${router} atteint l'API sans middleware`).not.toBe('');
        expect(
          mw.includes(oidc) || mw.includes(noident) || (!!bearer && mw.includes(bearer)),
          `le routeur ${router} atteint l'API sans établir ni effacer l'identité : ${mw}`,
        ).toBe(true);
      }
    });

    it.skipIf(!mauthService)(
      'envoie /auth/mobile/* au service qui implémente réellement ces routes',
      () => {
        // Le jour où l'un bascule sans l'autre, c'est un 404 sur le login mobile —
        // invisible depuis le web, donc invisible jusqu'au premier téléphone.
        const mauthRouters = routers.filter((r) => /mauth/.test(r));
        expect(mauthRouters.length).toBeGreaterThanOrEqual(2);
        for (const router of mauthRouters) expect(serviceOf(router)).toBe(mauthService);
      },
    );

    it.skipIf(!mauthService)(
      'fait valider le Bearer mobile par le service qui détient le secret',
      () => {
        expect(yaml).toContain(`${bearer}.forwardauth.address=${verifyUpstream}`);
        // Les quatre en-têtes recopiés vers l'upstream : c'est ce qui écrase toute
        // valeur forgée par le client (cf. routes/mobileAuth.js).
        expect(yaml).toContain(
          `${bearer}.forwardauth.authResponseHeaders=X-Auth-Request-User,X-User-Email,X-User-Name,X-User-Picture`,
        );
      },
    );

    it.skipIf(!mauthService)(
      "laisse /auth/mobile/start derrière un middleware qui établit l'identité",
      () => {
        // Sans plugin OIDC ni `noident` devant, la route est atteinte sans identité
        // fiable. Elle refuse alors d'émettre un OTT — mais autant que le câblage
        // soit correct plutôt que de compter sur ce refus.
        const start = routers.find((r) => /mauth-(start|pub)/.test(r) && /start/.test(r));
        const mw = middlewaresOf(start);
        expect(mw.includes(oidc) || mw.includes(noident)).toBe(true);
      },
    );
  },
);
