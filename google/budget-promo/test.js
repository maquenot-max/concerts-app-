#!/usr/bin/env node
/*
 * Test du script Google (Code.gs) sous Node, contre une fausse trame et un
 * faux Supabase : impossible d'exécuter Apps Script ailleurs que chez Google,
 * mais sa logique (contrôles, salle, cellules, lignes, insertion en radio) se
 * vérifie ici. Aucune dépendance.
 *
 * Usage : node google/budget-promo/test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const LISTE_SALLES = ['SALLE', 'LA VAPEUR - Dijon', 'ZENITH, Dijon', 'LE CEDRE, Chenôve', 'LES SALINES ROYALES, Arc-et-Senans',
  'ARENA, Reims', 'LE KABARET, Reims', 'LE CAPITOLE, Châlons-en-Champagne'];
const LISTE_CONTRATS = ['Type de contrat', 'Promotion Locale', 'Co-Réalisation', 'Cession'];
const STATUTS = ['Prévisionnel', 'Engagé'];

// ── Fausse feuille : cellules, validations, fusions ──────────────────────
function col(c) { return c.charCodeAt(0) - 64; }
function lettre(n) { return String.fromCharCode(64 + n); }
function cellules(a1) {
  const m = /^([A-Z])(\d+)(?::([A-Z])(\d+))?$/.exec(a1);
  const c1 = col(m[1]), r1 = +m[2], c2 = m[3] ? col(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
  const out = [];
  for (let r = r1; r <= r2; r++) { const ligne = []; for (let c = c1; c <= c2; c++) ligne.push(lettre(c) + r); out.push(ligne); }
  return out;
}
function regle(valeurs) {
  return {
    valeurs, getCriteriaType: () => 'VALUE_IN_LIST', getCriteriaValues: () => [valeurs.slice(), true],
    copy: () => constructeur(),
  };
}
function constructeur() {
  let v = [];
  const b = { requireValueInList(x) { v = x.slice(); return b; }, build: () => regle(v) };
  return b;
}
function nouvelleFeuille() {
  const f = { valeurs: {}, validations: {}, fusions: new Set(), insertions: [] };
  f.validations.D2 = regle(LISTE_SALLES);
  f.validations.D4 = regle(LISTE_CONTRATS);
  for (const [a, b] of [[13, 22], [27, 36], [41, 50], [55, 59]]) for (let r = a; r <= b; r++) f.validations['H' + r] = regle(STATUTS);
  for (let r = 55; r <= 59; r++) f.fusions.add('C' + r + ':F' + r);
  f.valeurs.D1 = 'NOM SPECTACLE'; f.valeurs.D2 = 'SALLE'; f.valeurs.D4 = 'Type de contrat';
  f.valeurs.D3 = 'DATE EXEMPLE'; f.valeurs.F7 = 'DATE EXEMPLE';
  f.valeurs.A60 = 'LIGNE SOUS LA RADIO';
  return f;
}
function ecrire(f, ref, v) {
  const r = f.validations[ref];
  // Comme Apps Script : une liste stricte refuse une valeur absente.
  if (r && v !== '' && r.valeurs.indexOf(v) < 0) throw new Error('La valeur « ' + v + ' » de ' + ref + ' viole la validation.');
  f.valeurs[ref] = v;
}
function plage(f, a1) {
  return {
    setValue(v) { ecrire(f, a1, v); return this; },
    setValues(t) { const cs = cellules(a1); assert.strictEqual(t.length, cs.length, 'setValues ' + a1 + ' : nombre de lignes'); cs.forEach((l, i) => { assert.strictEqual(t[i].length, l.length, 'setValues ' + a1 + ' : nombre de colonnes'); l.forEach((ref, j) => ecrire(f, ref, t[i][j])); }); return this; },
    getDataValidation() { return f.validations[a1] || null; },
    setDataValidation(r) { f.validations[a1] = r; return this; },
    merge() { f.fusions.add(a1); return this; },
    copyTo(dest, type) {
      const src = cellules(a1)[0];
      const [, r1, r2] = /^[A-Z](\d+):[A-Z](\d+)$/.exec(dest._a1).map(Number);
      if (type === 'PASTE_DATA_VALIDATION') for (let r = r1; r <= r2; r++) src.forEach((ref) => { const v = f.validations[ref]; if (v) f.validations[ref.replace(/\d+/, r)] = v; });
      f.copies = (f.copies || []).concat([type + ' ' + a1 + ' -> ' + dest._a1]);
    },
    _a1: a1,
  };
}
function decaler(f, apres, n) {
  const dec = (obj) => { const out = {}; for (const [ref, v] of Object.entries(obj)) { const m = /^([A-Z])(\d+)$/.exec(ref); out[+m[2] > apres ? m[1] + (+m[2] + n) : ref] = v; } return out; };
  f.valeurs = dec(f.valeurs); f.validations = dec(f.validations);
  f.fusions = new Set([...f.fusions].map((x) => x.replace(/\d+/g, (d) => (+d > apres ? String(+d + n) : d))));
  f.insertions.push([apres, n]);
}

// ── Faux services Google et Supabase ─────────────────────────────────────
function monde() {
  const classeurs = {}, journal = [];
  let n = 0;
  function classeur(id, nom) {
    const feuille = nouvelleFeuille();
    return classeurs[id] = { id, nom, feuille,
      getName: () => nom, getId: () => id, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit',
      getSheetByName: (x) => (x === 'PREV' ? Object.assign({ getRange: (a1) => plage(feuille, a1), insertRowsAfter: (r, k) => decaler(feuille, r, k) }, {}) : null) };
  }
  const TRAME = '1lkKhbzUofW0ZBOIxgIRl0w3HXiwJLd8bT90tlChtCQo';
  classeur(TRAME, 'AAAAMMJJ - BUDGET COM TRAME');
  const g = {
    SpreadsheetApp: {
      openById: (id) => classeurs[id], flush() {}, newDataValidation: constructeur,
      DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
      CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT', PASTE_DATA_VALIDATION: 'PASTE_DATA_VALIDATION' },
    },
    DriveApp: {
      getRootFolder: () => ({ nom: 'Mon Drive' }),
      getFileById: (id) => ({ makeCopy(nom, dossier) { assert.strictEqual(id, TRAME); journal.push('copie « ' + nom + ' » dans ' + dossier.nom); const c = classeur('copie' + (++n), nom); return { getId: () => c.id }; } }),
    },
    UrlFetchApp: {
      fetch(url, o) {
        const jeton = (o.headers.Authorization || '').replace('Bearer ', '');
        const rep = (code, corps) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(corps) });
        if (url.endsWith('/auth/v1/user')) return jeton === 'expire' ? rep(401, {}) : rep(200, { email: jeton === 'intrus' ? 'intrus@x.fr' : 'Communication@PleasePlease.fr' });
        if (url.indexOf('/rest/v1/team_members') > 0) return rep(200, url.indexOf('intrus') > 0 ? [] : [{ email: 'communication@pleaseplease.fr' }]);
        throw new Error('URL inattendue ' + url);
      },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => JSON.parse(s) }) },
  };
  const ctx = vm.createContext(Object.assign({ console }, g));
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8'), ctx, { filename: 'Code.gs' });
  return { ctx, classeurs, journal, derniere: () => classeurs['copie' + n] };
}
function poster(w, corps) { return w.ctx.doPost({ postData: { contents: JSON.stringify(corps) } }); }

// ── Cas ──────────────────────────────────────────────────────────────────
const ligne = (nom, o) => Object.assign({ nom, presta: '', qte: '', pu: '', total: '', com: '', statut: 'Prévisionnel' }, o);
const offertes = ['Newsletter Please Please mensuelle', 'Intégration agenda culturels', 'Post/Storys réseaux sociaux Please Please // ANTDT']
  .map((n) => ligne(n, { total: 0, com: 'OFFERT', statut: 'Engagé' }));
function budget(o) {
  return Object.assign({
    fichier: '20261206_FEU! CHATTERTON REIMS_BUDGET PROMO', artiste: 'FEU! CHATTERTON',
    salle: { nom: 'Arena', ville: 'Reims', libelle: 'ARENA, Reims', alias: [] },
    date: '2026-12-06', miseEnVente: '2026-03-12', contrat: 'Promotion Locale', montant: 3000,
    lignes: {
      street: [ligne('Collage grandes affiches (80x120)', { qte: 600, pu: 1.1 }), ligne('Impression de bandeaux', { qte: 600, pu: 0.3 }), ligne('Forfait impression et diffusion flyer Arena', { qte: 50000, total: 200 })],
      espaces: [ligne('Campagne DOOH', { presta: 'JC Decaux', total: 1160 })],
      digital: offertes.concat([1, 2, 3].map((i) => ligne('Sponsorisation Instagram / Facebook vague ' + i, { total: 200 }))),
      radio: [ligne('Jeu concours Bien Public', { type: '2x2 places' })],
    },
  }, o);
}
let ok = 0;
function cas(nom, fn) { try { fn(); ok++; console.log('  ok  ' + nom); } catch (e) { console.log('  ÉCHEC  ' + nom + '\n        ' + e.message); process.exitCode = 1; } }

console.log('Script Google du budget promo — test sous Node\n');

cas('doGet : version, nom de la trame, liste des salles', () => {
  const r = monde().ctx.doGet();
  assert.ok(r.ok); assert.strictEqual(r.trame, 'AAAAMMJJ - BUDGET COM TRAME'); assert.deepStrictEqual(r.salles, LISTE_SALLES);
});

cas('budget complet : en-tête, lignes, formules, rien d\'autre', () => {
  const w = monde(), r = poster(w, { token: 'bon', budget: budget() }), v = w.derniere().feuille.valeurs;
  assert.ok(r.ok, r.error); assert.strictEqual(r.salle, 'ARENA, Reims'); assert.strictEqual(r.salleAjoutee, false);
  assert.strictEqual(r.par, 'communication@pleaseplease.fr');
  assert.deepStrictEqual(w.journal, ['copie « 20261206_FEU! CHATTERTON REIMS_BUDGET PROMO » dans Mon Drive']);
  assert.strictEqual(v.D1, 'FEU! CHATTERTON'); assert.strictEqual(v.D2, 'ARENA, Reims'); assert.strictEqual(v.D4, 'Promotion Locale'); assert.strictEqual(v.B7, 3000);
  assert.strictEqual(v.D3.getFullYear() + '-' + (v.D3.getMonth() + 1) + '-' + v.D3.getDate(), '2026-12-6');
  assert.strictEqual(v.F7.getMonth() + 1 + '/' + v.F7.getDate(), '3/12');
  assert.deepStrictEqual([v.A13, v.C13, v.D13, v.F13, v.H13], ['Collage grandes affiches (80x120)', 600, 1.1, '=C13*D13', 'Prévisionnel']);
  assert.deepStrictEqual([v.A15, v.C15, v.D15, v.F15], ['Forfait impression et diffusion flyer Arena', 50000, '', 200]);
  assert.deepStrictEqual([v.A27, v.B27, v.F27], ['Campagne DOOH', 'JC Decaux', 1160]);
  assert.deepStrictEqual([v.A41, v.F41, v.G41, v.H41], ['Newsletter Please Please mensuelle', 0, 'OFFERT', 'Engagé']);
  assert.deepStrictEqual([v.A43, v.A44, v.F46], ['Post/Storys réseaux sociaux Please Please // ANTDT', 'Sponsorisation Instagram / Facebook vague 1', 200]);
  assert.deepStrictEqual([v.A55, v.C55, v.H55], ['Jeu concours Bien Public', '2x2 places', 'Prévisionnel']);
  assert.ok(!('E13' in v), 'la colonne E (fusionnée avec D) ne doit jamais être écrite');
  assert.strictEqual(v.A16, undefined, 'aucune ligne au-delà de celles envoyées');
});

cas('« Le K » retrouvé comme « LE KABARET, Reims » grâce à l\'alias', () => {
  const w = monde(), r = poster(w, { token: 'bon', budget: budget({ salle: { nom: 'Le K', ville: 'Reims', libelle: 'LE K, Reims', alias: ['LE KABARET'] } }) });
  assert.ok(r.ok, r.error); assert.strictEqual(r.salle, 'LE KABARET, Reims'); assert.strictEqual(r.salleAjoutee, false);
});

cas('salles écrites différemment (accents, « - » ou « , »)', () => {
  for (const [nom, ville, attendu] of [['Le Cèdre', 'Chenôve', 'LE CEDRE, Chenôve'], ['La Vapeur', 'Dijon', 'LA VAPEUR - Dijon'], ['Zenith', 'Dijon', 'ZENITH, Dijon']]) {
    const r = poster(monde(), { token: 'bon', budget: budget({ salle: { nom, ville, libelle: '?' } }) });
    assert.strictEqual(r.salle, attendu);
  }
});

cas('salle absente (Zénith de Strasbourg) : ajoutée à la liste de CE budget, la trame intacte', () => {
  const w = monde(), r = poster(w, { token: 'bon', budget: budget({ salle: { nom: 'Zenith', ville: 'Strasbourg', libelle: 'ZENITH, Strasbourg' } }) });
  assert.ok(r.ok, r.error); assert.strictEqual(r.salleAjoutee, true); assert.strictEqual(w.derniere().feuille.valeurs.D2, 'ZENITH, Strasbourg');
  assert.ok(w.derniere().feuille.validations.D2.valeurs.includes('ZENITH, Strasbourg'));
  assert.ok(!w.classeurs['1lkKhbzUofW0ZBOIxgIRl0w3HXiwJLd8bT90tlChtCQo'].feuille.validations.D2.valeurs.includes('ZENITH, Strasbourg'), 'la trame ne doit pas changer');
});

cas('radio au-delà de 5 lignes : lignes insérées avant la dernière, mise en forme copiée', () => {
  const radio = ['Jeu concours Bien Public', 'OP Speak + Spot Cherie FM', 'OP Speak + Spot K6FM', 'OP Speak + Spot Ici Bourgogne', "OP McDonald's", "Jeu concours J'aime Dijon", 'Ligne 7']
    .map((n) => ligne(n, { type: '2x2 places' }));
  const b = budget(); b.lignes.radio = radio;
  const w = monde(), r = poster(w, { token: 'bon', budget: b }), f = w.derniere().feuille;
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(f.insertions, [[58, 2]]);
  assert.strictEqual(f.valeurs.A61, 'Ligne 7'); assert.strictEqual(f.valeurs.H61, 'Prévisionnel');
  assert.strictEqual(f.valeurs.A62, 'LIGNE SOUS LA RADIO', 'ce qui suivait la section doit avoir glissé');
  assert.ok(f.fusions.has('C59:F59') && f.fusions.has('C60:F60'), 'fusion C:F sur les lignes insérées');
  assert.ok(f.validations.H59 && f.validations.H60, 'liste Statut sur les lignes insérées');
});

cas('concert sans date d\'annonce : la date d\'exemple de la trame est effacée', () => {
  const w = monde(), r = poster(w, { token: 'bon', budget: budget({ miseEnVente: '' }) });
  assert.ok(r.ok, r.error); assert.strictEqual(w.derniere().feuille.valeurs.F7, '');
});

cas('capacité dépassée en Street : refus, aucune copie', () => {
  const b = budget(); b.lignes.street = Array.from({ length: 11 }, (_, i) => ligne('L' + i, { total: 1 }));
  const w = monde(), r = poster(w, { token: 'bon', budget: b });
  assert.strictEqual(r.ok, false); assert.match(r.error, /street contient 11 lignes/); assert.deepStrictEqual(w.journal, []);
});

cas('jeton expiré ou absent : refus, aucune copie', () => {
  for (const token of ['expire', '']) {
    const w = monde(), r = poster(w, { token, budget: budget() });
    assert.strictEqual(r.ok, false); assert.match(r.error, /reconnecte-toi/); assert.deepStrictEqual(w.journal, []);
  }
});

cas('compte connecté mais hors de l\'équipe : refus, aucune copie', () => {
  const w = monde(), r = poster(w, { token: 'intrus', budget: budget() });
  assert.strictEqual(r.ok, false); assert.match(r.error, /Réservé aux membres/); assert.deepStrictEqual(w.journal, []);
});

console.log('\n' + ok + ' cas conformes' + (process.exitCode ? ', au moins un échec.' : '.'));
