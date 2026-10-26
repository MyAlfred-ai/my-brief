/**
 * Fakes de test — aucun réseau, aucun Mongo réel.
 *
 * fakeDb : collections en mémoire + journal des appels. Le sous-ensemble de
 * MongoDB implémenté couvre ce dont les routes ont besoin : filtres avec
 * opérateurs de comparaison, chemins pointés, $set/$setOnInsert/$unset/$inc/$max,
 * upsert réel, curseurs sort/skip/limit/project.
 *
 * Les opérateurs de comparaison ne sont PAS un luxe : sans $gt, une requête de
 * session `{expiresAt: {$gt: now}}` matcherait zéro document *sans erreur* et
 * les tests d'authentification passeraient au vert en testant le vide.
 *
 * Pour les mutations de tableaux ($push, $pull, arrayFilters), l'état est mis à
 * jour au mieux mais les tests s'appuient sur le JOURNAL (bons filtres, bons
 * opérateurs) plutôt que sur une ré-implémentation fidèle de MongoDB.
 *
 * fakeOpenai : réponses scriptées par méthode + journal des appels.
 */
import { buildApp } from '../app.js';
import { UpstreamError } from '../lib/openai.js';

/** Lecture d'un chemin pointé (`a.b.c`), comme Mongo. */
function getPath(doc, path) {
  if (!path.includes('.')) return doc?.[path];
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), doc);
}

function setPath(doc, path, value) {
  if (!path.includes('.')) {
    doc[path] = value;
    return;
  }
  const keys = path.split('.');
  const last = keys.pop();
  let node = doc;
  for (const key of keys) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[last] = value;
}

function unsetPath(doc, path) {
  if (!path.includes('.')) {
    delete doc[path];
    return;
  }
  const keys = path.split('.');
  const last = keys.pop();
  const node = keys.reduce((acc, key) => (acc == null ? undefined : acc[key]), doc);
  if (node && typeof node === 'object') delete node[last];
}

/** Comparaison Mongo-like : les dates sont comparées par leur valeur temporelle. */
function cmp(a, b) {
  const av = a instanceof Date ? a.getTime() : a;
  const bv = b instanceof Date ? b.getTime() : b;
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

function eq(a, b) {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/**
 * Sémantique Mongo des champs TABLEAU : une condition de valeur (`{groupIds:
 * 'x'}`, `$in`, `$regex`, comparaisons) retient le document dès qu'UN élément
 * la satisfait ; `$ne` et `$nin` exigent qu'aucun ne la satisfasse. Sans ça,
 * « les membres du groupe X » (`{groupIds: id}`) ne matcherait aucun document
 * et les tests de groupes passeraient au vert en testant le vide.
 */
function anyElement(value, pred) {
  return Array.isArray(value) ? value.some(pred) : pred(value);
}

/** Applique une condition de champ : valeur littérale ou objet d'opérateurs. */
function matchValue(value, cond) {
  const isOperatorObject =
    cond &&
    typeof cond === 'object' &&
    !Array.isArray(cond) &&
    !(cond instanceof Date) &&
    Object.keys(cond).some((k) => k.startsWith('$'));
  if (!isOperatorObject) return eq(value, cond) || anyElement(value, (v) => eq(v, cond));

  return Object.entries(cond).every(([op, operand]) => {
    switch (op) {
      case '$eq':
        return eq(value, operand) || anyElement(value, (v) => eq(v, operand));
      case '$ne':
        return !eq(value, operand) && !anyElement(value, (v) => eq(v, operand));
      case '$gt':
        return anyElement(value, (v) => v !== undefined && v !== null && cmp(v, operand) > 0);
      case '$gte':
        return anyElement(value, (v) => v !== undefined && v !== null && cmp(v, operand) >= 0);
      case '$lt':
        return anyElement(value, (v) => v !== undefined && v !== null && cmp(v, operand) < 0);
      case '$lte':
        return anyElement(value, (v) => v !== undefined && v !== null && cmp(v, operand) <= 0);
      case '$in':
        return anyElement(value, (v) => operand.some((o) => eq(v, o)));
      case '$nin':
        return !anyElement(value, (v) => operand.some((o) => eq(v, o)));
      case '$exists':
        return (value !== undefined) === !!operand;
      case '$size':
        return Array.isArray(value) && value.length === operand;
      case '$regex':
        return anyElement(value, (v) =>
          new RegExp(operand, cond.$options || '').test(String(v ?? '')),
        );
      case '$options':
        return true; // consommé par $regex
      case '$type':
        return operand === 'string' ? typeof value === 'string' : true;
      default:
        throw new Error(`fakeDb: opérateur de filtre non supporté: ${op}`);
    }
  });
}

function matches(doc, query = {}) {
  return Object.entries(query).every(([key, cond]) => {
    if (key === '$or') return cond.some((sub) => matches(doc, sub));
    if (key === '$and') return cond.every((sub) => matches(doc, sub));
    if (key === '$nor') return !cond.some((sub) => matches(doc, sub));
    return matchValue(getPath(doc, key), cond);
  });
}

/**
 * Expressions d'agrégation acceptées dans un PIPELINE de mise à jour. Le
 * sous-ensemble est volontairement minuscule : seul `$strLenCP` sert
 * aujourd'hui (backfill de `transcriptionChars` au démarrage, qui mesure les
 * transcriptions SANS les rapatrier). Toute autre expression lève, plutôt que
 * de renvoyer silencieusement `undefined` — un backfill testé contre du vide
 * passerait au vert sans rien vérifier.
 */
function evalAggExpression(doc, expr) {
  if (typeof expr === 'string' && expr.startsWith('$')) return getPath(doc, expr.slice(1));
  if (!expr || typeof expr !== 'object') return expr;
  const [op, operand] = Object.entries(expr)[0] || [];
  switch (op) {
    case '$strLenCP':
      return [...String(evalAggExpression(doc, operand) ?? '')].length;
    default:
      throw new Error(`fakeDb: expression d'agrégation non supportée: ${op}`);
  }
}

function applyUpdate(doc, update = {}) {
  // Pipeline de mise à jour (Mongo 4.2+) : une liste d'étapes, pas un objet
  // d'opérateurs. `$set` y prend des EXPRESSIONS, pas des valeurs littérales.
  if (Array.isArray(update)) {
    for (const stage of update) {
      for (const [k, expr] of Object.entries(stage.$set || {}))
        setPath(doc, k, evalAggExpression(doc, expr));
    }
    return;
  }
  for (const [op, payload] of Object.entries(update)) {
    switch (op) {
      case '$set':
        for (const [k, v] of Object.entries(payload)) setPath(doc, k, v);
        break;
      case '$setOnInsert':
        break; // traité seulement à l'insertion, cf. buildUpsertDoc
      case '$unset':
        for (const k of Object.keys(payload)) unsetPath(doc, k);
        break;
      case '$inc':
        for (const [k, v] of Object.entries(payload)) setPath(doc, k, (getPath(doc, k) || 0) + v);
        break;
      case '$max':
        // Champ absent ou nul : la valeur s'inscrit — Mongo range `null` sous
        // tout nombre. Au-delà, pas de comparaison entre types : les appelants
        // n'y comparent que des nombres.
        for (const [k, v] of Object.entries(payload)) {
          const current = getPath(doc, k);
          if (current === undefined || current === null || cmp(v, current) > 0) setPath(doc, k, v);
        }
        break;
      case '$push':
        for (const [k, v] of Object.entries(payload)) {
          const list = getPath(doc, k);
          setPath(doc, k, Array.isArray(list) ? [...list, v] : [v]);
        }
        break;
      case '$pull':
        for (const [k, v] of Object.entries(payload)) {
          const list = getPath(doc, k);
          if (!Array.isArray(list)) continue;
          // Opérande SCALAIRE (`$pull: {groupIds: 'x'}`) : égalité d'élément.
          // Un objet est une CONDITION sur chaque élément (`{id: versionId}`).
          const isCondition = v && typeof v === 'object' && !(v instanceof Date);
          setPath(
            doc,
            k,
            list.filter((item) => (isCondition ? !matches(item, v) : !eq(item, v))),
          );
        }
        break;
      default:
        throw new Error(`fakeDb: opérateur de mise à jour non supporté: ${op}`);
    }
  }
}

/** Document créé par un upsert : égalités du filtre + $setOnInsert + $set. */
function buildUpsertDoc(filter, update) {
  const doc = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k.startsWith('$')) continue;
    if (
      v &&
      typeof v === 'object' &&
      !(v instanceof Date) &&
      Object.keys(v).some((o) => o.startsWith('$'))
    )
      continue;
    setPath(doc, k, v);
  }
  for (const [k, v] of Object.entries(update.$setOnInsert || {})) setPath(doc, k, v);
  applyUpdate(doc, update);
  return doc;
}

/**
 * Inclusion d'UN chemin pointé, avec la sémantique Mongo des TABLEAUX :
 * `'versions.generatedAt'` sur un tableau de sous-documents rend
 * `versions: [{generatedAt}, …]` — un sous-document sans le champ devient `{}`,
 * un scalaire du tableau disparaît. Sans elle, le chemin rendait `undefined` et
 * une route qui compte les versions sans lire leur HTML passait au vert en
 * comptant zéro. Rend `undefined` quand rien ne subsiste.
 */
function pickPath(value, keys) {
  if (!keys.length) return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => item && typeof item === 'object' && !(item instanceof Date))
      .map((item) => pickPath(item, keys) ?? {});
  }
  if (!value || typeof value !== 'object' || value instanceof Date) return undefined;
  const inner = pickPath(value[keys[0]], keys.slice(1));
  return inner === undefined ? undefined : { [keys[0]]: inner };
}

/** Fusion de deux chemins projetés d'un même document (`a.b` puis `a.c`, tableaux compris). */
function mergeProjected(a, b) {
  if (a === undefined) return b;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((item, i) => mergeProjected(item, b[i]));
  const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
  if (isPlain(a) && isPlain(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b)) out[k] = mergeProjected(out[k], v);
    return out;
  }
  return b;
}

/** Projection Mongo : whitelist si au moins un champ à 1, sinon simple exclusion. */
function project(doc, spec) {
  if (!spec) return doc;
  const included = Object.entries(spec).filter(([k, v]) => k !== '_id' && v);
  if (included.length > 0) {
    let out = {};
    for (const [k] of included) {
      const picked = pickPath(doc, k.split('.'));
      if (picked !== undefined) out = mergeProjected(out, picked);
    }
    if (spec._id !== 0 && doc._id !== undefined) out._id = doc._id;
    return out;
  }
  const out = { ...doc };
  for (const [k, v] of Object.entries(spec)) if (!v) delete out[k];
  return out;
}

function sortDocs(docs, spec) {
  if (!spec) return docs;
  const entries = Object.entries(spec);
  return [...docs].sort((a, b) => {
    for (const [key, dir] of entries) {
      const c = cmp(getPath(a, key), getPath(b, key));
      if (c !== 0) return dir < 0 ? -c : c;
    }
    return 0;
  });
}

export function createFakeDb(seed = {}) {
  const data = new Map(
    Object.entries(seed).map(([name, docs]) => [name, docs.map((d) => ({ ...d }))]),
  );
  const calls = [];
  // Pannes programmées : failNext('insertOne', err) fait échouer LE prochain
  // appel de cette opération (toutes collections) — pour tester les chemins
  // d'erreur de persistance sans toucher au reste du fake.
  const failures = new Map();

  function maybeFail(op) {
    const err = failures.get(op);
    if (err) {
      failures.delete(op);
      throw err;
    }
  }

  function docsOf(name) {
    if (!data.has(name)) data.set(name, []);
    return data.get(name);
  }

  function collection(name) {
    return {
      find(query = {}) {
        const call = {
          collection: name,
          op: 'find',
          query,
          sort: null,
          project: null,
          limit: null,
          skip: null,
        };
        calls.push(call);
        const cursor = {
          sort(spec) {
            call.sort = spec;
            return cursor;
          },
          project(spec) {
            call.project = spec;
            return cursor;
          },
          limit(n) {
            call.limit = n;
            return cursor;
          },
          skip(n) {
            call.skip = n;
            return cursor;
          },
          async toArray() {
            let out = docsOf(name)
              .filter((d) => matches(d, query))
              .map((d) => ({ ...d }));
            out = sortDocs(out, call.sort);
            if (call.skip) out = out.slice(call.skip);
            if (call.limit != null) out = out.slice(0, call.limit);
            return out.map((d) => project(d, call.project));
          },
        };
        return cursor;
      },
      async findOne(query = {}, options = {}) {
        calls.push({ collection: name, op: 'findOne', query, options });
        const found = docsOf(name).find((d) => matches(d, query));
        if (!found) return null;
        return project({ ...found }, options.projection);
      },
      async countDocuments(query = {}) {
        calls.push({ collection: name, op: 'countDocuments', query });
        return docsOf(name).filter((d) => matches(d, query)).length;
      },
      async insertOne(doc) {
        calls.push({ collection: name, op: 'insertOne', doc });
        maybeFail('insertOne');
        docsOf(name).push({ ...doc });
        return { insertedId: 'fake' };
      },
      async insertMany(docs) {
        calls.push({ collection: name, op: 'insertMany', docs });
        maybeFail('insertMany');
        for (const doc of docs) docsOf(name).push({ ...doc });
        return { insertedCount: docs.length };
      },
      async updateOne(filter, update, options = {}) {
        calls.push({ collection: name, op: 'updateOne', filter, update, options });
        maybeFail('updateOne');
        const target = docsOf(name).find((d) => matches(d, filter));
        if (target) {
          applyUpdate(target, update);
          return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
        }
        if (options.upsert) {
          docsOf(name).push(buildUpsertDoc(filter, update));
          return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1, upsertedId: 'fake' };
        }
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      },
      async updateMany(filter, update, options = {}) {
        calls.push({ collection: name, op: 'updateMany', filter, update, options });
        // Pannes programmables ici aussi : un serveur trop ancien refuse les
        // pipelines de mise à jour, et le backfill doit rester non bloquant.
        maybeFail('updateMany');
        const targets = docsOf(name).filter((d) => matches(d, filter));
        for (const target of targets) applyUpdate(target, update);
        return { matchedCount: targets.length, modifiedCount: targets.length };
      },
      async findOneAndUpdate(filter, update, options = {}) {
        calls.push({ collection: name, op: 'findOneAndUpdate', filter, update, options });
        const list = docsOf(name);
        const idx = list.findIndex((d) => matches(d, filter));
        if (idx < 0) {
          if (!options.upsert) return null;
          const created = buildUpsertDoc(filter, update);
          list.push(created);
          return options.returnDocument === 'before' ? null : { ...created };
        }
        const before = { ...list[idx] };
        applyUpdate(list[idx], update);
        return options.returnDocument === 'before' ? before : { ...list[idx] };
      },
      async deleteOne(filter = {}) {
        calls.push({ collection: name, op: 'deleteOne', filter });
        const list = docsOf(name);
        const idx = list.findIndex((d) => matches(d, filter));
        if (idx < 0) return { deletedCount: 0 };
        list.splice(idx, 1);
        return { deletedCount: 1 };
      },
      async deleteMany(filter = {}) {
        calls.push({ collection: name, op: 'deleteMany', filter });
        const before = docsOf(name).length;
        data.set(
          name,
          docsOf(name).filter((d) => !matches(d, filter)),
        );
        return { deletedCount: before - docsOf(name).length };
      },
      async findOneAndReplace(filter, doc, options = {}) {
        calls.push({ collection: name, op: 'findOneAndReplace', filter, doc, options });
        const list = docsOf(name);
        const idx = list.findIndex((d) => matches(d, filter));
        if (idx >= 0) list[idx] = { ...doc };
        else if (options.upsert) list.push({ ...doc });
        return { ...doc };
      },
      /** Le bootstrap en pose plusieurs au démarrage : no-op journalisé. */
      async createIndex(spec, options = {}) {
        calls.push({ collection: name, op: 'createIndex', spec, options });
        return 'fake_index';
      },
      /** Utilisé par la détection de doublons de casse au bootstrap. */
      aggregate(pipeline = []) {
        calls.push({ collection: name, op: 'aggregate', pipeline });
        return {
          async toArray() {
            return [];
          },
        };
      },
    };
  }

  return { collection, calls, data, failNext: (op, err) => failures.set(op, err) };
}

/**
 * Découpe factice des imports longs : le fichier part entier, sauf si
 * `script.split` en décide autrement. Jamais ffmpeg en test.
 */
export function createFakeAudioChunker(script = {}) {
  const calls = [];
  return {
    calls,
    async split(path) {
      calls.push(path);
      if (typeof script.split === 'function') return script.split(path);
      return { paths: [path], cleanup: async () => {} };
    },
  };
}

export function createFakeOpenai(script = {}) {
  const calls = [];
  return {
    calls,
    async chat(params) {
      calls.push({ method: 'chat', params });
      const fn = script.chat;
      if (typeof fn === 'function') return fn(params, calls);
      return fn ?? 'réponse par défaut';
    },
    async transcribe(params) {
      calls.push({ method: 'transcribe', params });
      const fn = script.transcribe;
      if (typeof fn === 'function') return fn(params);
      return fn ?? { text: 'transcription par défaut' };
    },
    async realtimeClientSecret(lang, model) {
      calls.push({ method: 'realtimeClientSecret', lang, model });
      const fn = script.realtimeClientSecret;
      if (typeof fn === 'function') return fn(lang, model);
      return fn ?? { value: 'ek_test', expires_at: 123, session: {} };
    },
    async generateImage(params) {
      calls.push({ method: 'generateImage', params });
      const fn = script.generateImage;
      if (typeof fn === 'function') return fn(params);
      return fn ?? { b64: 'aW1hZ2UtZmFjdGljZQ==' };
    },
  };
}

/** Mailer factice : journalise au lieu d'envoyer. `enabled: false` simule l'absence de SMTP. */
export function createFakeMailer({ enabled = true } = {}) {
  const sent = [];
  return {
    enabled,
    sent,
    async sendPasswordReset(payload) {
      if (!enabled) throw new Error('mailer_disabled');
      sent.push(payload);
    },
    async sendDocument(payload) {
      if (!enabled) throw new Error('mailer_disabled');
      sent.push(payload);
    },
  };
}

/**
 * Sonde de clé OpenAI factice. Par défaut elle ACCEPTE : sans elle, tout test
 * qui enregistre une clé partirait vraiment sur api.openai.com.
 * @param {object} [script] - `{reject: {status, message}}` pour simuler un refus
 */
export function createFakeKeyVerifier(script = {}) {
  const calls = [];
  const verify = async (key) => {
    calls.push(key);
    if (script.reject) {
      throw new UpstreamError(
        script.reject.status || 401,
        JSON.stringify({
          error: { message: script.reject.message || 'Incorrect API key provided' },
        }),
      );
    }
    return { ok: true };
  };
  verify.calls = calls;
  return verify;
}

/**
 * Envoi Gmail scripté (routes/actions.js) : journal des appels + échec
 * programmable, sans jamais toucher Google.
 * @param {{fail?: Error}} [script] - `fail` est levée à chaque appel
 */
export function createFakeGmailSend(script = {}) {
  const calls = [];
  const send = async (payload) => {
    calls.push(payload);
    if (script.fail) throw script.fail;
  };
  send.calls = calls;
  return send;
}

/**
 * Dépôt sur Drive scripté (routes/actions.js) : journal des appels + échec
 * programmable, sans jamais toucher le fournisseur.
 * @param {{fail?: Error, result?: object}} [script]
 */
export function createFakeDriveStore(script = {}) {
  const calls = [];
  const store = async (payload) => {
    calls.push(payload);
    if (script.fail) throw script.fail;
    return {
      fileId: 'file-1',
      folderId: 'folder-1',
      folderPath: payload.folderPath || 'myBrief',
      cacheUsed: false,
      ...(script.result || {}),
    };
  };
  store.calls = calls;
  return store;
}

/**
 * Navigation dans le stockage scriptée (routes/actions/storage.js) : arborescence
 * en mémoire + journal, sans jamais toucher le fournisseur.
 *
 * L'arborescence est plate — `{ 'Clients': ['Acme', 'Beta'] }` — parce que ce
 * que les tests vérifient est le CHEMIN composé par la fenêtre, pas la fidélité
 * d'une hiérarchie factice.
 *
 * @param {{tree?: object, drives?: Array, fail?: Error, probe?: object|Function}} [script]
 */
export function createFakeDriveBrowser(script = {}) {
  const tree = script.tree || { '': ['Clients', 'Archives'], Clients: ['Acme'] };
  const calls = [];
  const record = (method) => (payload) => {
    calls.push({ method, ...payload });
    if (script.fail) throw script.fail;
    return payload;
  };

  const browser = {
    calls,
    async drives(payload) {
      record('drives')(payload);
      return script.drives || [{ id: '', name: 'Mon Drive', site: '' }];
    },
    async list(payload) {
      record('list')(payload);
      const cursor = payload.search ? 'recherche' : payload.cursor || '';
      const names = payload.search ? script.searchResults || ['Acme'] : tree[cursor] || [];
      return {
        folders: names.map((name) => ({ name, cursor: cursor ? `${cursor}/${name}` : name })),
        nextPageToken: '',
      };
    },
    async pathOf(payload) {
      record('pathOf')(payload);
      return payload.cursor || '';
    },
    async create(payload) {
      record('create')(payload);
      const cursor = payload.cursor ? `${payload.cursor}/${payload.name}` : payload.name;
      return { name: payload.name, cursor };
    },
    /**
     * Diagnostic : `script.probe` est un verdict par chemin (`{ 'CR/Acme':
     * 'missing' }`, clé = dossier, ou Drive pour une racine) ou une fonction
     * `(target) => verdict`. Tout le reste est trouvé.
     */
    async probe(payload) {
      record('probe')(payload);
      return payload.targets.map((target) => {
        if (typeof script.probe === 'function') return script.probe(target);
        return script.probe?.[target.folder || target.driveId] || 'found';
      });
    },
  };
  return browser;
}

/**
 * Client myBrain scripté (lib/myBrain/client.js) : journal des appels, réponses
 * et échecs programmables, sans jamais joindre un vrai cerveau.
 *
 * @param {{whoami?: object|Function, feed?: object|Function}} [script] — une
 *   valeur, ou une fonction `(payload, calls) => valeur` qui peut lever (une
 *   MyBrainError, typiquement) pour simuler un refus.
 */
export function createFakeMyBrain(script = {}) {
  const calls = [];
  let jobs = 0;
  const run = async (method, payload, fallback) => {
    calls.push({ method, ...payload });
    const scripted = script[method];
    if (typeof scripted === 'function') return scripted(payload, calls);
    return scripted ?? fallback();
  };
  return {
    calls,
    whoami: (payload) =>
      run('whoami', payload, () => ({
        application: 'myBrief',
        droits: ['lire', 'nourrir'],
        api: 'https://cerveau.example.test/api/v1',
      })),
    feed: (payload) =>
      run('feed', payload, () => {
        jobs += 1;
        return { job: `job-${jobs}`, pour: payload.deposit?.pour || null, avertissements: [] };
      }),
  };
}

/**
 * Sources de tarifs factices (lib/costs/sources) : réponses scriptées et
 * journal des appels, jamais de réseau. Par défaut elles ÉCHOUENT : un test qui
 * clique « Actualiser les tarifs » sans les scripter vérifie le repli, pas un
 * relevé imaginaire.
 *
 * @param {{prices?: object|Function, fx?: object|Function}} [script] — une
 *   valeur, ou une fonction qui la rend (et peut lever)
 */
export function createFakePriceSources(script = {}) {
  const calls = [];
  const answer = (value, args, unreachable) => {
    if (typeof value === 'function') return value(...args);
    if (value === undefined) throw new Error(unreachable);
    return value;
  };
  return {
    calls,
    prices: [
      {
        id: 'fake-prices',
        async fetchPrices(requests) {
          calls.push({ source: 'prices', requests });
          return answer(script.prices, [requests], 'source de tarifs injoignable');
        },
      },
    ],
    fx: [
      {
        id: 'fake-fx',
        async fetchRate() {
          calls.push({ source: 'fx' });
          return answer(script.fx, [], 'source de change injoignable');
        },
      },
    ],
  };
}

/**
 * Application prête à inject(), avec ses fakes accessibles.
 * `openaiClient` remplace le faux client OpenAI par un client fourni — un vrai
 * `createOpenAiClient` branché sur un serveur local, pour exercer l'envoi et
 * les relances eux-mêmes. `ai` vaut alors ce client.
 */
export function buildTestApp({
  seed,
  openai,
  openaiClient,
  mailer,
  config,
  verifyApiKey,
  gmailSend,
  graphSend,
  driveStore,
  driveBrowser,
  myBrain,
  priceSources,
  audioChunker,
} = {}) {
  const db = createFakeDb(seed);
  const ai = openaiClient || createFakeOpenai(openai);
  const mail = mailer === undefined ? createFakeMailer() : mailer;
  const verify = verifyApiKey === undefined ? createFakeKeyVerifier() : verifyApiKey;
  const gmail = gmailSend === undefined ? createFakeGmailSend() : gmailSend;
  const graph = graphSend === undefined ? createFakeGmailSend() : graphSend;
  const drive = driveStore === undefined ? createFakeDriveStore() : driveStore;
  const browser = driveBrowser === undefined ? createFakeDriveBrowser() : driveBrowser;
  const brain = myBrain === undefined ? createFakeMyBrain() : myBrain;
  const sources = priceSources === undefined ? createFakePriceSources() : priceSources;
  const chunker = audioChunker === undefined ? createFakeAudioChunker() : audioChunker;
  // Révocation : jamais de réseau en test, on ne journalise que l'appel.
  const revokeCalls = [];
  const gmailRevoke = async (payload) => {
    revokeCalls.push(payload);
    return true;
  };
  gmailRevoke.calls = revokeCalls;
  const app = buildApp({
    db,
    openai: ai,
    mailer: mail,
    config,
    verifyApiKey: verify,
    gmailSend: gmail,
    graphSend: graph,
    gmailRevoke,
    driveStore: drive,
    driveBrowser: browser,
    myBrain: brain,
    priceSources: sources,
    audioChunker: chunker,
  });
  return {
    app,
    db,
    ai,
    mailer: mail,
    verifyApiKey: verify,
    gmailSend: gmail,
    graphSend: graph,
    gmailRevoke,
    driveStore: drive,
    driveBrowser: browser,
    myBrain: brain,
    priceSources: sources,
    audioChunker: chunker,
  };
}

/**
 * Document `user` prêt à semer. Le rôle vit en base : une route protégée par
 * `requireAdmin` exige que ce document existe, les en-têtes d'identité seuls ne
 * suffisent pas.
 */
export function userDoc(email, { role = 'user', ...rest } = {}) {
  return {
    email,
    emailLower: email.trim().toLowerCase(),
    name: email.split('@')[0],
    role,
    disabled: false,
    authProviders: ['oidc'],
    mustChangePassword: false,
    ...rest,
  };
}

/**
 * Document `userGroups` prêt à semer (cf. lib/repositories/groups.js). Le
 * groupe par défaut est celui que le démarrage crée : en test, on le sème
 * explicitement quand une route doit le résoudre.
 */
export function groupDoc(id, { name = id, color = 'slate', isDefault = false, ...rest } = {}) {
  return {
    id,
    name,
    nameLower: name.trim().toLowerCase().replace(/\s+/g, ' '),
    description: '',
    color,
    isDefault,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    createdBy: null,
    ...rest,
  };
}

export const defaultGroupDoc = (over = {}) =>
  groupDoc('default', { name: 'Défaut', isDefault: true, ...over });

/** En-têtes d'identité tels qu'injectés par Traefik. */
export function identityHeaders(email = 'user@example.com', name = 'Test User') {
  return {
    'x-user-email': email,
    // Traefik émet des octets UTF-8 que Node relit en latin1 — on reproduit.
    'x-user-name': Buffer.from(name, 'utf8').toString('latin1'),
  };
}

/** En-têtes d'une requête arrivée par le routeur de session native. */
export function sessionCookieHeaders(token) {
  return {
    cookie: `mybrief_sess=${token}`,
    // Posé par le middleware Traefik `noident` : marque le chemin natif et
    // interdit à l'API de faire confiance aux en-têtes d'identité.
    'x-mybrief-auth-path': 'native',
  };
}

/** Corps multipart minimal (champ fichier `data`) pour /record. */
export function multipartBody(content = 'fake-audio-bytes', filename = 'audio.webm') {
  const boundary = '----mybrief-test-boundary';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="data"; filename="${filename}"\r\n` +
        'Content-Type: audio/webm\r\n\r\n',
    ),
    Buffer.isBuffer(content) ? content : Buffer.from(content),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
