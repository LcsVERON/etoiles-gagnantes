// Tests de la PWA et de la sécurité des pages (sans navigateur).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { firebaseConfig, configurationComplete } from '../js/firebase-config.js';

const RACINE = new URL('..', import.meta.url).pathname;
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

/** Tous les fichiers d'un dossier (récursif), chemins relatifs à la racine. */
function fichiers(dossier) {
  const out = [];
  const parcourir = (d) => {
    for (const nom of readdirSync(join(RACINE, d))) {
      const chemin = join(d, nom);
      if (statSync(join(RACINE, chemin)).isDirectory()) parcourir(chemin);
      else out.push(relative('.', chemin));
    }
  };
  parcourir(dossier);
  return out;
}

const PAGES = ['index.html', 'mentions-legales.html', 'confidentialite.html'];

/** Directives de la CSP d'une page : { 'script-src': ['self', ...], ... } */
function csp(page) {
  const m = lire(page).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, `${page} : CSP absente`);
  return Object.fromEntries(m[1].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
}

describe('service worker', () => {
  const sw = lire('sw.js');
  const liste = JSON.parse(`[${sw.match(/const FICHIERS = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '')}]`);

  test('chaque fichier de la liste existe', () => {
    for (const f of liste.filter((x) => x !== './')) assert.ok(existsSync(join(RACINE, f)), `absent : ${f}`);
  });

  test('tout ce qu\'il faut pour démarrer hors connexion est dans la liste', () => {
    const attendus = [
      ...PAGES, 'manifest.webmanifest',
      ...fichiers('css'), ...fichiers('icons'),
      ...fichiers('fonts').filter((f) => f.endsWith('.woff2')),
      ...fichiers('js').filter((f) => f.endsWith('.js')),
    ];
    for (const f of attendus) assert.ok(liste.includes(f), `manque dans sw.js : ${f}`);
    assert.ok(liste.includes('./'));
  });

  test('ne touche pas aux autres domaines (Firebase, Google)', () => {
    assert.match(sw, /if \(url\.origin !== self\.location\.origin\) return;/);
  });
});

describe('pages HTML : pas de code dans le HTML (CSP stricte)', () => {
  for (const page of PAGES) {
    test(page, () => {
      const h = lire(page);
      assert.doesNotMatch(h, /<script(?![^>]*\bsrc=)[^>]*>/i, 'script dans la page');
      assert.doesNotMatch(h, /<style[\s>]/i, 'bloc <style>');
      assert.doesNotMatch(h, /\sstyle\s*=/i, 'attribut style');
      assert.doesNotMatch(h, /\son[a-z]+\s*=/i, 'attribut onclick…');
      assert.doesNotMatch(h, /javascript:/i, 'lien javascript:');
      const c = csp(page);
      const tout = Object.values(c).flat().join(' ');
      assert.doesNotMatch(tout, /unsafe-inline|unsafe-eval|\*/, 'CSP trop large');
      // aucun plugin (Flash, etc.) : object-src 'none', ou tout interdit par défaut
      assert.deepEqual(c['object-src'] || c['default-src'], ["'none'"]);
    });
  }
});

describe('CSP de l\'appli', () => {
  const c = csp('index.html');

  test('scripts, styles, polices et images : seulement le site (+ Google pour la connexion)', () => {
    assert.deepEqual(c['default-src'], ["'self'"]);
    assert.deepEqual(c['script-src'], ["'self'", 'https://apis.google.com']);
    assert.deepEqual(c['style-src'], ["'self'"]);
    assert.deepEqual(c['font-src'], ["'self'"]);
    assert.deepEqual(c['img-src'], ["'self'"]);
    assert.deepEqual(c['base-uri'], ["'self'"]);
  });

  test('connexions : seulement Firestore, Authentication et les émulateurs locaux', () => {
    assert.deepEqual(c['connect-src'].sort(), [
      "'self'", 'http://127.0.0.1:8080', 'http://127.0.0.1:9099',
      'https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
    ].sort());
  });

  test('cadre de connexion : le domaine du projet Firebase (cohérent avec js/firebase-config.js)', () => {
    const attendu = configurationComplete
      ? `https://${firebaseConfig.authDomain}`
      : 'https://remplacer-par-ton-projet.firebaseapp.com';
    assert.ok(c['frame-src'].includes(attendu), `frame-src doit contenir ${attendu}`);
  });

  test('chaque adresse externe écrite dans notre code est autorisée par la CSP', () => {
    const autorises = new Set(Object.values(c).flat().filter((x) => x.startsWith('http')));
    const nosFichiers = fichiers('js').filter((f) => f.endsWith('.js') && !f.startsWith('js/vendor/'));
    for (const f of nosFichiers) {
      // on ignore les commentaires
      const code = lire(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
      for (const [url] of code.matchAll(/https?:\/\/[a-z0-9.-]+(:\d+)?/gi)) {
        if (/REMPLACER|firebaseapp\.com$/.test(url)) continue; // configuration (vérifiée ci-dessus)
        assert.ok(autorises.has(url), `${f} : ${url} absent de la CSP`);
      }
    }
  });
});

describe('manifeste', () => {
  const m = JSON.parse(lire('manifest.webmanifest'));

  test('champs nécessaires à l\'installation', () => {
    assert.equal(m.display, 'standalone');
    assert.equal(m.start_url, './');
    assert.equal(m.lang, 'fr');
    assert.ok(m.name && m.short_name);
  });

  test('icônes 192, 512 et adaptable présentes', () => {
    for (const i of m.icons) assert.ok(existsSync(join(RACINE, i.src)), i.src);
    assert.ok(m.icons.some((i) => i.sizes === '192x192'));
    assert.ok(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'));
    assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  });
});
