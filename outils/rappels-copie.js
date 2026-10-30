// Recopie, depuis public/index.html, les fonctions dont la fonction serveur
// rappels-quotidiens a besoin pour savoir ce qui est a faire (calcul des
// echeances du plan, etapes sautees, evenements, reglages des rappels).
// Ecrit supabase/functions/rappels-quotidiens/calcul.mjs.
//
//   node outils/rappels-copie.js
//
// check.js (controle 9) regenere la copie en memoire et la compare au
// fichier : une fonction modifiee dans index.html sans relancer ce script
// bloque le deploiement. Apres l'avoir relance, redeployer la fonction
// (supabase/functions/README.md) : le depot n'est qu'une copie de reference.
'use strict';
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const SOURCE = path.join(RACINE, 'public', 'index.html');
const CIBLE = path.join(RACINE, 'supabase', 'functions', 'rappels-quotidiens', 'calcul.mjs');

// Dans l'ordre ou elles sont ecrites dans calcul.mjs. Une fonction appelee
// par l'une d'elles et absente d'ici fait echouer la fonction serveur
// (ReferenceError) : le banc de la fonction (outils/banc/rappels.mjs) le voit.
const NOMS = [
  'syncIsPlain', 'VENTES', 'SP_VIDE', 'KNOWN_SALLES',
  'villeRegroupee', 'lieuDepuisTexte', 'normaliserLieu', 'lieuTexte', 'dateCourte',
  'tk', 'isNA', 'estEvt', 'evtProg', 'evtFin', 'evtTrie', 'evtApart', 'evtEtapesSp',
  'evtSuivis', 'evtVentes', 'spSujet', 'spPorteur', 'spRead', 'spVaguesTriees',
  'etapeNumVague', 'vagueDeLEtape', 'calcDate', 'prerequisLeve', 'isUnlocked',
  'etapesSujet', 'skipActif', 'sansEtapesSautees',
  'RML_RELANCES', 'rmlIso', 'rmlEcart', 'rmlCleVille', 'rmlVilleReglee', 'rmlArtCle',
  'rmlAjustement', 'rmlMuet', 'rmlSujets', 'rmlCalcul',
];

// Le texte d'une declaration de premier niveau : « function nom(...){...} »
// ou « var nom=...; ». On suit les parentheses, crochets et accolades en
// sautant chaines et commentaires (une apostrophe dans un commentaire ne doit
// pas ouvrir de chaine).
function extraire(src, nom) {
  const m = new RegExp('^(function ' + nom + '\\(|var ' + nom + '=)', 'm').exec(src);
  if (!m) throw new Error('declaration introuvable dans index.html : ' + nom);
  const estVar = m[1].startsWith('var');
  let i = m.index, prof = 0, ouvert = false;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { i = src.indexOf('\n', i); continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i) + 2; continue; }
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
      i++; continue;
    }
    if ('([{'.includes(c)) { prof++; ouvert = true; }
    else if (')]}'.includes(c)) {
      prof--;
      if (!estVar && c === '}' && prof === 0 && ouvert) return src.slice(m.index, i + 1);
    } else if (estVar && c === ';' && prof === 0) return src.slice(m.index, i + 1);
    i++;
  }
  throw new Error('fin de declaration introuvable : ' + nom);
}

function generer() {
  const src = fs.readFileSync(SOURCE, 'utf8');
  return [
    '// GENERE par outils/rappels-copie.js depuis public/index.html : ne pas modifier',
    '// a la main. Les fonctions sont recopiees telles quelles ; check.js (controle 9)',
    '// verifie que cette copie suit index.html. Voir §37 de la passation.',
    '/* eslint-disable */',
    'let concerts = [], process = [], taskStates = {}, tkCols = [], tkTasks = [];',
    '',
    ...NOMS.map((n) => extraire(src, n)),
    '',
    '// Les cles d\'app_data telles que l\'appli les met en forme au chargement',
    '// (normalizeSynced), puis le calcul du jour.',
    'export function rappelsDuJour(d, jour, equipe) {',
    '  concerts = (Array.isArray(d.concerts) ? d.concerts : []).map((c) => normaliserLieu(Object.assign({ salle: \'\', ventes: 0 }, c)));',
    '  process = (Array.isArray(d.process) ? d.process : []).map((t) => Object.assign({ prereq: null, cat: t.cat || \'gen\' }, t));',
    '  taskStates = syncIsPlain(d.taskstates) ? d.taskstates : {};',
    '  tkCols = Array.isArray(d.tkcols) ? d.tkcols : [];',
    '  tkTasks = Array.isArray(d.tktasks) ? d.tktasks : [];',
    '  return rmlCalcul(d.rappels, jour, equipe);',
    '}',
    'export { lieuTexte, dateCourte, rmlIso };',
    '',
  ].join('\n');
}

module.exports = { generer, CIBLE };

if (require.main === module) {
  fs.writeFileSync(CIBLE, generer());
  console.log('Ecrit : ' + path.relative(RACINE, CIBLE));
}
