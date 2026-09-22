#!/usr/bin/env node
/*
 * Verification mecanique avant deploiement. Aucune dependance, aucun npm.
 *
 * Netlify lance ce script comme "command" dans netlify.toml : un echec ici
 * annule la mise en ligne. C'est le but — mieux vaut un deploiement refuse
 * qu'une page blanche en production. Contrairement a un hook Git, ca ne se
 * contourne pas avec --no-verify.
 *
 * Les cinq controles correspondent a des bugs reellement rencontres :
 *  1. un bloc <script> qui ne compile plus  -> appli entierement blanche ;
 *  2. un getElementById() qui pointe dans le vide (btn-taches, 20/09) ;
 *  3. un id HTML en double -> le second devient inatteignable ;
 *  4. esc() dans un litteral JS d'attribut -> injection (voir §6.6 de la
 *     passation) : le navigateur decode &#39; avant de lire le JavaScript ;
 *  5. une valeur interpolee sans escJs() dans ce meme type de litteral
 *     (revue du 22/09).
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

// ── Verdict ─────────────────────────────────────────────────────────────────
if (erreurs.length) {
  console.error('\nVerification echouee — ' + erreurs.length + ' probleme(s) :\n');
  erreurs.forEach((e) => console.error('  ' + e));
  console.error('\nDeploiement annule.\n');
  process.exit(1);
}
console.log(`Verification OK — ${nbBlocs} bloc(s) <script>, ${vus.size} id(s) statique(s), aucun probleme.`);
