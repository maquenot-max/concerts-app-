#!/usr/bin/env node
/*
 * Prepare le banc de test : copie public/ dans outils/banc/site/, remplace
 * supabase-js par le faux client (harness.js) et charge une sauvegarde comme
 * fausse base. A relancer apres chaque modification du code.
 *
 * Usage : node outils/banc/prepare.js [sauvegarde.json]
 *   Sans argument : la sauvegarde la plus recente de .backup/ (export de
 *   l'appli "sauvegarde-ppcomm-*.json", ou ancien format app_data_backup_*).
 *
 * site/ contient des donnees reelles : il est hors du depot (.gitignore).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ICI = __dirname;
const DEPOT = path.join(ICI, '..', '..');
const SITE = path.join(ICI, 'site');

// Lignes {key, value} a partir d'une sauvegarde, quel que soit son format.
function lignesDe(fichier) {
  const brut = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  // Export de l'appli ou sauvegarde nocturne : {app, data: {cle: valeur}}
  if (brut && brut.data && typeof brut.data === 'object') {
    return Object.keys(brut.data).map((k) => ({ key: k, value: JSON.stringify(brut.data[k]) }));
  }
  // Ancien format : resultat d'une requete SQL, lignes {key, value} dans un texte
  if (brut && typeof brut.result === 'string') {
    const t = brut.result;
    return JSON.parse(t.slice(t.indexOf('[{'), t.lastIndexOf('}]') + 2)).map((r) => ({ key: r.key, value: r.value }));
  }
  throw new Error(fichier + ' : format de sauvegarde inconnu');
}

let source = process.argv[2];
if (!source) {
  const dossier = path.join(DEPOT, '.backup');
  const candidats = fs.existsSync(dossier)
    ? fs.readdirSync(dossier).filter((f) => /^(sauvegarde-ppcomm|app_data_backup).*\.json$/.test(f))
      .map((f) => path.join(dossier, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    : [];
  if (!candidats.length) throw new Error('Aucune sauvegarde dans .backup/ : passer un fichier en argument.');
  source = candidats[0];
}
const lignes = lignesDe(source);

fs.mkdirSync(SITE, { recursive: true });
let html = fs.readFileSync(path.join(DEPOT, 'public', 'index.html'), 'utf8');
const avant = html.length;
// Parametre de version : sans lui, le navigateur peut garder en cache un
// ancien harness.js et faire tourner les tests sur une version perimee.
const v = Date.now();
html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js[^"]*"[^>]*><\/script>/,
  '<script src="data.js?v=' + v + '"></script><script src="harness.js?v=' + v + '"></script>');
if (html.length === avant) throw new Error('balise supabase-js introuvable dans public/index.html');
fs.writeFileSync(path.join(SITE, 'index.html'), html);
fs.copyFileSync(path.join(DEPOT, 'public', 'style.css'), path.join(SITE, 'style.css'));
fs.cpSync(path.join(DEPOT, 'public', 'favicon_io'), path.join(SITE, 'favicon_io'), { recursive: true });
fs.copyFileSync(path.join(ICI, 'harness.js'), path.join(SITE, 'harness.js'));
fs.writeFileSync(path.join(SITE, 'data.js'), 'window.__BANC_DATA=' + JSON.stringify(lignes) + ';\n');

console.log('Banc pret (' + path.relative(DEPOT, source) + ', ' + lignes.length + ' cles).');
console.log('Servir : python3 -m http.server 8765 --directory ' + path.relative(process.cwd(), SITE));
