#!/usr/bin/env node
/*
 * Verification mecanique avant deploiement. Aucune dependance, aucun npm.
 *
 * Netlify lance ce script comme "command" dans netlify.toml : un echec ici
 * annule la mise en ligne. C'est le but — mieux vaut un deploiement refuse
 * qu'une page blanche en production. Contrairement a un hook Git, ca ne se
 * contourne pas avec --no-verify.
 *
 * Les controles correspondent a des defauts reellement rencontres :
 *  1. un bloc <script> qui ne compile plus  -> appli entierement blanche ;
 *  2. un getElementById() qui pointe dans le vide (btn-taches, 20/09) ;
 *  3. un id HTML en double -> le second devient inatteignable ;
 *  4. esc() dans un litteral JS d'attribut -> injection (voir §6.6 de la
 *     passation) : le navigateur decode &#39; avant de lire le JavaScript ;
 *  5. une valeur interpolee sans escJs() dans ce meme type de litteral
 *     (revue du 22/09) ;
 *  6. une donnee inseree sans esc() dans un attribut HTML ordinaire
 *     (revue du 23/09) ;
 *  7. des listes de cles d'app_data qui divergent entre l'appli et la
 *     sauvegarde nocturne (artist_photos et city_groups non sauvegardees
 *     du 22 au 23/09) ;
 *  8. une taille de texte hors de l'echelle de style.css (12,5 / 13,5 /
 *     11,5 px arrives avec la newsletter et les evenements, revue du 25/09).
 *
 * Usage : node check.js
 */
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const FICHIER = path.join(__dirname, 'public', 'index.html');
const src = fs.readFileSync(FICHIER, 'utf8');
const erreurs = [];

/** Numero de ligne (1-indexe) d'une position dans le fichier. */
function ligneDe(index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

function signaler(ligne, message) {
  erreurs.push(`public/index.html:${ligne}  ${message}`);
}

// ── 1. Chaque bloc <script> inline doit compiler ────────────────────────────
// vm.Script analyse et compile sans executer, exactement comme `node --check`,
// et dans le meme mode "script" que le navigateur pour un <script> sans type.
let nbBlocs = 0;
for (const m of src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
  nbBlocs++;
  const code = m[1];
  const ligneBloc = ligneDe(m.index);
  try {
    new vm.Script(code, { filename: 'bloc' + nbBlocs + '.js' });
  } catch (e) {
    // Le numero de ligne de l'erreur est relatif au bloc : on le ramene au fichier.
    const rel = (String(e.stack || '').match(/bloc\d+\.js:(\d+)/) || [])[1];
    const ligne = rel ? ligneBloc + Number(rel) - 1 : ligneBloc;
    signaler(ligne, `le bloc <script> ne compile pas — ${e.message}`);
  }
}
if (!nbBlocs) erreurs.push('public/index.html : aucun bloc <script> inline trouve — le fichier est-il intact ?');

// ── 2. Tout getElementById('...') litteral doit viser un id existant ────────
// On ne regarde que les appels dont l'identifiant est ecrit en clair : les
// identifiants construits (getElementById('rslist-'+date)) ne matchent pas.
const idsDeclares = new Set();
for (const m of src.matchAll(/id="([^"]+)"/g)) idsDeclares.add(m[1]);

for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) {
  if (!idsDeclares.has(m[1])) {
    signaler(ligneDe(m.index), `getElementById('${m[1]}') — aucun id="${m[1]}" dans le fichier`);
  }
}

// ── 3. Pas d'id HTML en double ──────────────────────────────────────────────
// Les identifiants assembles en JS (id="sp-st-'+v.id+'") sont ignores : ils
// sont uniques a l'execution, pas dans le source.
const vus = new Map();
for (const m of src.matchAll(/id="([^"]+)"/g)) {
  const id = m[1];
  if (/['"+${}]/.test(id)) continue;
  if (vus.has(id)) signaler(ligneDe(m.index), `id="${id}" en double (deja ligne ${vus.get(id)})`);
  else vus.set(id, ligneDe(m.index));
}

// ── 4. Pas d'echappement HTML dans un litteral JS d'attribut ────────────────
// Motif recherche : onclick="fn(\''+esc(valeur)+'\')". Le navigateur decode
// &#39; AVANT de lire le JavaScript, donc esc() y laisse passer une apostrophe
// qui referme la chaine. Il faut escJs(), ou escJs(safeUrl()) pour une URL.
const MOTIFS = [
  { motif: "\\''+esc(", conseil: 'utiliser escJs()' },
  { motif: "\\''+escUrl(", conseil: 'utiliser escJs(safeUrl(...))' },
];
for (const { motif, conseil } of MOTIFS) {
  let i = src.indexOf(motif);
  while (i !== -1) {
    signaler(ligneDe(i), `${motif.trim()} — echappement HTML dans un litteral JavaScript : ${conseil}`);
    i = src.indexOf(motif, i + 1);
  }
}

// ── 5. Toute valeur placee dans un litteral JS d'attribut passe par escJs ───
// Motif recherche : onclick="fn(\''+valeur+'\')" sans escJs(). Un identifiant
// "sur" en apparence (Date.now()) ne l'est pas : tout membre de l'equipe peut
// reecrire les donnees via l'API, et un id contenant une apostrophe
// executerait du code chez les autres (dont les administrateurs). Revue du
// 22/09 : 74 interpolations de ce type, toutes passees a escJs().
for (const m of src.matchAll(/\\''\+(?!escJs\()/g)) {
  signaler(ligneDe(m.index), "\\''+ sans escJs() — valeur non echappee dans un litteral JavaScript d'attribut");
}

// ── 6. Une donnee placee dans un attribut HTML passe par esc() ──────────────
// Motif recherche : attribut="...'+x.y+'..." ou une propriete d'objet (donc a
// priori une donnee lue en base) est inseree sans esc/escUrl/escJs/jsNum.
// Revue du 23/09 : l'id d'une vague sponso (id="sp-st-'+v.id+'") et les champs
// de la config Budget (value="'+(r.qte||'')+'") etaient inseres bruts. Tout
// membre peut les reecrire via l'API : un guillemet suivi de
// autofocus onfocus=... s'executait a l'affichage, y compris chez un admin.
// Ne sont pas signales : les valeurs sans point (variables locales, nombres,
// chaines deja echappees plus haut), les ternaires (ils choisissent entre des
// litteraux) et quelques proprietes de constantes du code (classes CSS...).
const SURES = /^(esc|escUrl|escJs|jsNum|tidLit|icon|pct)\(/;
const CONSTANTES = [/\.cls$/, /^opts\.\w+$/, /^p\.val$/, /^TAB_PARENT\[\w+\]$/];
for (const m of src.matchAll(/([a-zA-Z][\w:-]*)="[^"<>]*?'\+(.+?)\+'/g)) {
  const expr = m[2].trim();
  if (SURES.test(expr) || expr.includes('?')) continue;
  if (!/[A-Za-z_$][\w$]*(\.|\[)/.test(expr)) continue;
  if (CONSTANTES.some((re) => re.test(expr))) continue;
  signaler(ligneDe(m.index), `${m[1]}="...'+${expr}+'..." — donnee inseree sans esc() dans un attribut HTML`);
}

// ── 7. Les listes de cles d'app_data concordent ─────────────────────────────
// Ajouter une cle demande de toucher cinq endroits (§2 de la passation), dont
// trois dans ce depot. L'oubli de CLES dans backup-daily a laisse
// artist_photos et city_groups hors des sauvegardes nocturnes du 22 au 23/09.
// On verifie que BACKUP_KEYS (export et restauration) et CLES (sauvegarde
// nocturne) sont identiques, et que toute cle synchronisee (ALL_SAVE_KEYS) est
// sauvegardee. La contrainte CHECK et les policies, en base, restent a tenir a
// la main (voir supabase/migrations/).
// Attention : Netlify ne relance pas ce script quand seul supabase/ change
// (voir netlify.toml). Apres une modification de backup-daily, le lancer en
// local.
const FICHIER_BACKUP = path.join(__dirname, 'supabase', 'functions', 'backup-daily', 'index.ts');
function listeDe(texte, nom, fichier) {
  const m = texte.match(new RegExp('\\b' + nom + '\\s*=\\s*\\[([^\\]]*)\\]'));
  if (!m) { erreurs.push(`${fichier} : liste ${nom} introuvable`); return null; }
  return [...m[1].matchAll(/['"]([\w-]+)['"]/g)].map((x) => x[1]);
}
const manquantes = (a, b) => a.filter((k) => !b.includes(k));
const backupKeys = listeDe(src, 'BACKUP_KEYS', 'public/index.html');
const saveKeys = listeDe(src, 'ALL_SAVE_KEYS', 'public/index.html');
const cles = fs.existsSync(FICHIER_BACKUP)
  ? listeDe(fs.readFileSync(FICHIER_BACKUP, 'utf8'), 'CLES', 'supabase/functions/backup-daily/index.ts')
  : (erreurs.push('supabase/functions/backup-daily/index.ts introuvable'), null);
if (backupKeys && cles) {
  manquantes(backupKeys, cles).forEach((k) => erreurs.push(`cle "${k}" dans BACKUP_KEYS mais pas dans CLES de backup-daily : elle ne serait pas sauvegardee la nuit`));
  manquantes(cles, backupKeys).forEach((k) => erreurs.push(`cle "${k}" dans CLES de backup-daily mais pas dans BACKUP_KEYS : l'export et la restauration l'ignoreraient`));
}
if (backupKeys && saveKeys) {
  manquantes(saveKeys, backupKeys).forEach((k) => erreurs.push(`cle "${k}" synchronisee (ALL_SAVE_KEYS) mais absente de BACKUP_KEYS : ni exportee ni restauree`));
}

// ── 8. Tailles de texte : l'echelle de style.css ────────────────────────────
// Des pixels entiers, jamais sous 12 px (plancher de lisibilite, §5 de la
// passation), sauf les exceptions documentees : les touches de la recherche,
// l'etiquette de montant des barres sponso et le rapport PDF. La revue du 25/09
// avait trouve des 12,5 / 13,5 / 11,5 px et quatre textes sous le plancher
// sans explication, arrives avec les modules recents.
const FICHIER_CSS = path.join(__dirname, 'public', 'style.css');
const EXCEPTIONS_12 = [/^\.cmdk-foot kbd$/, /^\.sp-bar$/, /^#bilan-report\b/, /^\.bilan-/, /^\.rpt-/];
if (fs.existsSync(FICHIER_CSS)) {
  // Commentaires blanchis (meme longueur) pour garder les numeros de ligne.
  const css = fs.readFileSync(FICHIER_CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const ligneCss = (idx) => css.slice(0, idx).split('\n').length;
  for (const bloc of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = bloc[1].trim().replace(/\s+/g, ' ');
    for (const m of bloc[2].matchAll(/font-size:\s*([\d.]+)px/g)) {
      const px = Number(m[1]), ligne = ligneCss(bloc.index + bloc[1].length + 1 + m.index);
      if (!Number.isInteger(px)) erreurs.push(`public/style.css:${ligne}  font-size ${px}px (${sel}) : pixels entiers seulement (12, 13, 14…)`);
      else if (px < 12 && !sel.split(',').every((x) => EXCEPTIONS_12.some((r) => r.test(x.trim())))) erreurs.push(`public/style.css:${ligne}  font-size ${px}px (${sel}) : sous le plancher de 12 px sans etre une exception documentee`);
    }
  }
} else erreurs.push('public/style.css introuvable');

// ── Verdict ─────────────────────────────────────────────────────────────────
if (erreurs.length) {
  console.error('\nVerification echouee — ' + erreurs.length + ' probleme(s) :\n');
  erreurs.forEach((e) => console.error('  ' + e));
  console.error('\nDeploiement annule.\n');
  process.exit(1);
}
console.log(`Verification OK — ${nbBlocs} bloc(s) <script>, ${vus.size} id(s) statique(s), aucun probleme.`);
