// Banc de la fonction serveur rappels-quotidiens, sans Deno ni Supabase : le
// vrai index.ts tourne sous Node (types retires par Node 22.6+) contre une
// fausse base (une sauvegarde) et un faux script Google. Aucune requete ne sort.
//
//   node outils/banc/rappels.mjs [sauvegarde.json] [--jour AAAA-MM-JJ] [--reglages rappels.json]
//
// Sans --reglages, la cle rappels de la sauvegarde. Rejoue les trois appels :
// simulation (dry), envoi de 9 h (deux passages : le second ne doit rien
// renvoyer), essai d'un membre ; ecrit les mails en HTML dans
// outils/banc/captures/rappels/ pour les regarder dans un navigateur.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.join(ICI, '..', '..');
const FN = path.join(DEPOT, 'supabase', 'functions', 'rappels-quotidiens');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
const jourForce = opt('--jour'), fichierReglages = opt('--reglages');

// ── Donnees : la sauvegarde la plus recente de .backup/, ou celle donnee ──
function lignesDe(f) {
  const b = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (b && b.data && typeof b.data === 'object') return b.data;
  if (b && typeof b.result === 'string') {
    const t = b.result, o = {};
    JSON.parse(t.slice(t.indexOf('[{'), t.lastIndexOf('}]') + 2)).forEach((r) => { o[r.key] = JSON.parse(r.value); });
    return o;
  }
  throw new Error(f + ' : format inconnu');
}
let source = args[0];
if (!source) {
  const d = path.join(DEPOT, '.backup');
  source = fs.readdirSync(d).filter((f) => /^(sauvegarde-ppcomm|app_data_backup).*\.json$/.test(f)).map((f) => path.join(d, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}
const data = lignesDe(source);
if (fichierReglages) data.rappels = JSON.parse(fs.readFileSync(fichierReglages, 'utf8'));
const MEMBRES = [
  { email: 'test@banc.local', name: 'Banc' }, { email: 'louka@banc.local', name: 'Louka' }, { email: 'anne@banc.local', name: 'Anne-Claire' },
  { email: 'echec@banc.local', name: 'Echec' },
];

// ── Fausse base : juste ce que la fonction appelle ──
const tables = {
  app_data: Object.entries(data).map(([key, value]) => ({ key, value })),
  team_members: MEMBRES,
  backup_config: [{ secret: 'secret-banc' }],
  rappels_envois: [],
};
let nextId = 1;
function requete(table) {
  let rows = () => tables[table], filtres = [], op = 'select', valeur = null, opts = {}, unique = false;
  const q = {
    select(_c, o) { if (op === 'select') opts = o || {}; else unique = true; return q; },
    in(c, l) { filtres.push((r) => l.includes(r[c])); return q; },
    eq(c, v) { filtres.push((r) => r[c] === v); return q; },
    insert(v) { op = 'insert'; valeur = v; return q; },
    update(v) { op = 'update'; valeur = v; return q; },
    maybeSingle() { unique = true; return q; },
    then(res, rej) { return Promise.resolve(executer()).then(res, rej); },
  };
  function executer() {
    const l = rows().filter((r) => filtres.every((f) => f(r)));
    if (op === 'insert') {
      if (table === 'rappels_envois' && !valeur.essai && tables.rappels_envois.some((r) => !r.essai && r.jour === valeur.jour && r.email === valeur.email)) {
        return { data: null, error: { code: '23505', message: 'doublon' } };
      }
      const r = { id: nextId++, ...valeur }; tables[table].push(r);
      return { data: unique ? { id: r.id } : null, error: null };
    }
    if (op === 'update') { l.forEach((r) => Object.assign(r, valeur)); return { data: null, error: null }; }
    if (opts.head) return { count: l.length, data: null, error: null };
    return { data: unique ? l[0] || null : l, error: null };
  }
  return q;
}
const client = { from: requete, auth: { getUser: async (j) => ({ data: { user: j === 'jeton-anne' ? { email: 'Anne@banc.local' } : null } }) } };

// ── index.ts sous Node : import npm: remplace par la fausse base ──
// Copie dans site/ (ignore par Git, refait a chaque passage).
const tmp = path.join(ICI, 'site', 'rappels-fonction');
fs.mkdirSync(tmp, { recursive: true });
fs.copyFileSync(path.join(FN, 'calcul.mjs'), path.join(tmp, 'calcul.mjs'));
const src = fs.readFileSync(path.join(FN, 'index.ts'), 'utf8')
  .replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, 'const createClient = () => globalThis.__faux;');
if (!src.includes('globalThis.__faux')) throw new Error('import de supabase-js introuvable dans index.ts');
fs.writeFileSync(path.join(tmp, 'index.ts'), src);
const envoyes = [];
globalThis.__faux = client;
let gestionnaire = null;
globalThis.Deno = {
  env: { get: (k) => ({ SUPABASE_URL: 'http://banc', SUPABASE_SERVICE_ROLE_KEY: 'x', RAPPELS_SCRIPT_URL: 'https://script.google.com/macros/s/banc/exec', RAPPELS_SCRIPT_SECRET: 'secret-script' })[k] },
  serve: (f) => { gestionnaire = f; },
};
const vraiFetch = globalThis.fetch;
// Faux script Google : memes reponses que google/rappels-mail/Code.gs (200
// meme en cas d'erreur, le champ ok tranche). Un destinataire en « echec@ »
// simule un refus de Gmail.
globalThis.fetch = async (url, init) => {
  if (String(url) !== 'https://script.google.com/macros/s/banc/exec') throw new Error('requete bloquee : ' + url);
  const b = JSON.parse(init.body);
  if (b.secret !== 'secret-script') return new Response('{"error":"Secret invalide"}', { status: 200 });
  if (b.to.startsWith('echec@')) return new Response('{"error":"Service invoked too many times"}', { status: 200 });
  envoyes.push({ to: [b.to], subject: b.subject, html: b.html, text: b.text });
  return new Response('{"ok":true,"reste":99}', { status: 200 });
};
await import(pathToFileURL(path.join(tmp, 'index.ts')).href);

// Horloge : 9 h a Paris le jour voulu (aujourd'hui par defaut).
const jour = jourForce || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
// Seul « maintenant » est fige : une date construite avec un argument reste vraie.
const VraiDate = Date;
function horloge(heureParis) {
  const [a, m, j] = jour.split('-').map(Number);
  let t = VraiDate.UTC(a, m - 1, j, heureParis, 5) - 3600e3; // heure d'hiver
  const h = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hourCycle: 'h23' }).format(new VraiDate(t)));
  if (h !== heureParis) t -= 3600e3;                            // heure d'ete
  globalThis.Date = class extends VraiDate { constructor(...x) { super(...(x.length ? x : [t])); } static now() { return t; } };
}
async function appel(corps, entetes) {
  const r = await gestionnaire(new Request('http://banc/', { method: 'POST', headers: { 'Content-Type': 'application/json', ...entetes }, body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() };
}

const sortie = path.join(ICI, 'captures', 'rappels');
fs.mkdirSync(sortie, { recursive: true });
horloge(9);
const dry = await appel({ dry: true }, { 'x-backup-secret': 'secret-banc' });
console.log('Simulation du', jour, ':', dry.status, Object.entries(dry.corps.mails || {}).map(([e, m]) => `${e} « ${m.sujet} »`).join(' ; ') || 'aucun mail');
const refus = await appel({}, { 'x-backup-secret': 'faux' });
console.log('Mauvais secret :', refus.status);
horloge(10);
console.log('A 10 h :', JSON.stringify((await appel({}, { 'x-backup-secret': 'secret-banc' })).corps));
horloge(9);
const un = await appel({}, { 'x-backup-secret': 'secret-banc' });
console.log('Envoi de 9 h :', un.status, JSON.stringify(un.corps));
const deux = await appel({}, { 'x-backup-secret': 'secret-banc' });
console.log('Second passage :', deux.status, JSON.stringify(deux.corps));
const essai = await appel({ essai: true }, { Authorization: 'Bearer jeton-anne' });
console.log('Essai d\'Anne-Claire :', essai.status, JSON.stringify(essai.corps));
const intrus = await appel({ essai: true }, { Authorization: 'Bearer inconnu' });
console.log('Essai sans session :', intrus.status);
console.log('Journal :', tables.rappels_envois.map((r) => `${r.email} ${r.statut}${r.essai ? ' (essai)' : ''}`).join(' ; '));
envoyes.forEach((m, i) => fs.writeFileSync(path.join(sortie, `${jour}-${i + 1}-${m.to[0].split('@')[0]}.html`), m.html));
console.log(envoyes.length + ' mail(s) ecrit(s) dans ' + path.relative(DEPOT, sortie));
globalThis.fetch = vraiFetch;
