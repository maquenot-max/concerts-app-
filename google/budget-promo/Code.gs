/**
 * Budget promo — création des budgets Google Sheets du dashboard Please Please.
 *
 * Copie la trame « AAAAMMJJ - BUDGET COM TRAME » dans le Drive du compte qui
 * exécute ce script (celui de Mathieu), la remplit avec ce que l'appli envoie,
 * et renvoie le lien du fichier. La forme, les formules, les listes et le logo
 * sont ceux de la trame, par construction : ce script n'écrit que des valeurs,
 * aux cellules prévues. Seule exception : la liste déroulante des salles (D2)
 * est retirée de la copie, la salle y étant écrite telle que l'appli la nomme.
 * Modifier la trame (couleurs, libellés, formules) ne demande donc aucun
 * changement ici, tant que les cellules ci-dessous gardent leur place.
 *
 * Qui peut l'appeler : l'appli envoie le jeton de session Supabase de la
 * personne connectée ; le script vérifie auprès de Supabase que ce jeton est
 * valide et que son e-mail figure dans team_members. Sans cela, il refuse.
 * L'adresse du script peut donc être connue : elle ne suffit pas.
 *
 * Installation et mise à jour : voir README.md à côté. Ce fichier est la copie
 * de référence ; le code qui tourne est celui du projet Apps Script.
 */

var VERSION = '2026-09-24.2';
var TRAME_ID = '1lkKhbzUofW0ZBOIxgIRl0w3HXiwJLd8bT90tlChtCQo';
var FEUILLE = 'PREV';
// Publics par conception (déjà dans le code du site) : ils ne donnent accès à
// rien sans session valide.
var SUPABASE_URL = 'https://vkehaerkbvfxlyjvrpzi.supabase.co';
var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrZWhhZXJrYnZmeGx5anZycHppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxMTUyMTMsImV4cCI6MjA5MjY5MTIxM30.I5VTTUYXA0uKg6_WZ2XKIcXmnFvWR38Hkh4RVzgr9qg';

// Emplacement des lignes dans la trame. Street, Espaces et Digital ont une
// capacité fixe : la formule des dépenses engagées (B9) additionne leurs
// cellules une par une, une ligne insérée y serait oubliée. La radio n'entre
// dans aucune formule : on peut l'agrandir.
var SECTIONS = {
  street:  { premiere: 13, capacite: 10 },
  espaces: { premiere: 27, capacite: 10 },
  digital: { premiere: 41, capacite: 10 },
  radio:   { premiere: 55, capacite: 5, extensible: true }
};

// Lecture seule, sans donnée personnelle : version et nom de la trame, pour le
// bouton « Tester » de l'appli.
function doGet() {
  try {
    var trame = SpreadsheetApp.openById(TRAME_ID);
    return json_({ ok: true, version: VERSION, trame: trame.getName() });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  }
}

function doPost(e) {
  try {
    var demande = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var par = verifierMembre_(demande.token);
    var b = demande.budget || {};
    controler_(b);

    var copie = DriveApp.getFileById(TRAME_ID).makeCopy(b.fichier, DriveApp.getRootFolder());
    var classeur = SpreadsheetApp.openById(copie.getId());
    var f = classeur.getSheetByName(FEUILLE);

    var salle = libelleSalle_(b.salle || {});
    f.getRange('D1').setValue(b.artiste || '');
    // Salle écrite telle que l'appli la nomme (« LE K, Reims »). La liste
    // déroulante de la trame est retirée de la copie : stricte, elle refuserait
    // toute salle qu'elle ne connaît pas, et aucune formule ne lit D2.
    f.getRange('D2').clearDataValidations().setValue(salle);
    // Dates toujours écrites : la trame contient des dates d'exemple
    // (01/01/2026) qu'il ne faut jamais laisser passer pour de vraies.
    f.getRange('D3').setValue(b.date ? dateDe_(b.date) : '');
    if (b.contrat) f.getRange('D4').setValue(b.contrat);
    f.getRange('B7').setValue(Number(b.montant) || 0);
    f.getRange('F7').setValue(b.miseEnVente ? dateDe_(b.miseEnVente) : '');
    ecrireLignes_(f, b.lignes || {});
    SpreadsheetApp.flush();

    return json_({ ok: true, url: classeur.getUrl(), id: classeur.getId(),
      salle: salle, par: par });
  } catch (err) {
    return json_({ ok: false, error: message_(err) });
  }
}

// ── Contrôles ────────────────────────────────────────────────────────────
function verifierMembre_(jeton) {
  if (!jeton) throw new Error('Connexion requise : reconnecte-toi dans l\'appli.');
  var entetes = { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + jeton };
  var u = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', { headers: entetes, muteHttpExceptions: true });
  if (u.getResponseCode() !== 200) throw new Error('Session expirée : reconnecte-toi dans l\'appli.');
  var email = String(JSON.parse(u.getContentText()).email || '').toLowerCase();
  // Lu avec le jeton de la personne : les règles d'accès de la base ne
  // renvoient la ligne que si elle est membre de l'équipe.
  var m = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/team_members?select=email&email=eq.' + encodeURIComponent(email),
    { headers: entetes, muteHttpExceptions: true });
  if (m.getResponseCode() !== 200 || JSON.parse(m.getContentText()).length !== 1) {
    throw new Error('Réservé aux membres de l\'équipe.');
  }
  return email;
}

function controler_(b) {
  if (!b.fichier) throw new Error('Nom de fichier manquant.');
  Object.keys(SECTIONS).forEach(function (k) {
    var n = ((b.lignes || {})[k] || []).length, s = SECTIONS[k];
    if (!s.extensible && n > s.capacite) {
      throw new Error('La section ' + k + ' contient ' + n + ' lignes ; la trame n\'en prévoit que ' + s.capacite + '.');
    }
  });
}

// ── Salle (cellule D2) ───────────────────────────────────────────────────
// L'appli envoie le libellé complet ; nom et ville seuls en secours.
function libelleSalle_(salle) {
  return String(salle.libelle || [salle.nom, salle.ville].filter(Boolean).join(', '));
}

// ── Lignes ───────────────────────────────────────────────────────────────
function vide_(v) { return v === '' || v === null || v === undefined; }

function ecrireLignes_(f, lignes) {
  ['street', 'espaces', 'digital'].forEach(function (k) {
    var ls = lignes[k] || [];
    if (!ls.length) return;
    var p = SECTIONS[k].premiere, dern = p + ls.length - 1;
    // A:D puis F:H — la colonne E est fusionnée avec D sur chaque ligne.
    f.getRange('A' + p + ':D' + dern).setValues(ls.map(function (l) {
      return [l.nom || '', l.presta || '', vide_(l.qte) ? '' : Number(l.qte), vide_(l.pu) ? '' : Number(l.pu)];
    }));
    f.getRange('F' + p + ':H' + dern).setValues(ls.map(function (l, i) {
      var r = p + i;
      var total = !vide_(l.qte) && !vide_(l.pu) ? '=C' + r + '*D' + r : (vide_(l.total) ? '' : Number(l.total));
      return [total, l.com || '', l.statut || 'Prévisionnel'];
    }));
  });

  var radio = lignes.radio || [];
  if (!radio.length) return;
  var s = SECTIONS.radio, p = s.premiere, sup = radio.length - s.capacite;
  if (sup > 0) {
    // Lignes insérées avant la dernière de la section, pour garder sa bordure
    // basse ; on leur donne la mise en forme, la liste Statut et la fusion C:F
    // des lignes du milieu.
    var milieu = p + s.capacite - 2;
    f.insertRowsAfter(milieu, sup);
    var modele = f.getRange('A' + milieu + ':H' + milieu);
    var nouvelles = f.getRange('A' + (milieu + 1) + ':H' + (milieu + sup));
    modele.copyTo(nouvelles, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    modele.copyTo(nouvelles, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    for (var r = milieu + 1; r <= milieu + sup; r++) f.getRange('C' + r + ':F' + r).merge();
  }
  var dern = p + radio.length - 1;
  f.getRange('A' + p + ':C' + dern).setValues(radio.map(function (l) { return [l.nom || '', l.presta || '', l.type || '']; }));
  f.getRange('G' + p + ':H' + dern).setValues(radio.map(function (l) { return [l.com || '', l.statut || 'Prévisionnel']; }));
}

// ── Outils ───────────────────────────────────────────────────────────────
// « 2026-12-06 » -> date locale (fuseau du projet : Europe/Paris).
function dateDe_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

function message_(err) { return (err && err.message) || String(err); }

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
