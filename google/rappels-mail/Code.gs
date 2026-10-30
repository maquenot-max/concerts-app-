// Rappels par mail (30/10/2026) : envoie, depuis le compte Google qui execute
// le script, les mails du matin prepares par la fonction Supabase
// rappels-quotidiens (§37 de la passation).
//
// Pourquoi Google : les DNS de pleaseplease.fr (OVH) ne sont pas accessibles,
// et le compte Brevo deja authentifie pour le domaine est tenu par Gigz. Un
// service d'envoi (Resend...) demandait l'un ou l'autre.
//
// MailApp et non GmailApp : il ne peut qu'envoyer (autorisation
// script.send_mail), sans lire ni toucher la boite du compte.
//
// Protection : un secret partage, cree par initialiser() dans les proprietes
// du script (jamais dans ce fichier : le depot est public) et recopie dans les
// secrets Supabase (RAPPELS_SCRIPT_SECRET). Sans lui, rien ne part.
var VERSION = '2026-10-30';
var NOM_EXPEDITEUR = 'Please Please · Rappels';

function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var secret = PropertiesService.getScriptProperties().getProperty('RAPPELS_SECRET');
    if (!secret || b.secret !== secret) return sortie({ error: 'Secret invalide' });
    if (b.test) return sortie({ ok: true, version: VERSION, reste: MailApp.getRemainingDailyQuota() });
    var a = String(b.to || '').trim();
    if (!/^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$/.test(a)) return sortie({ error: 'Destinataire invalide' });
    if (!b.subject || !b.html) return sortie({ error: 'Mail incomplet' });
    MailApp.sendEmail({
      to: a,
      subject: String(b.subject).slice(0, 200),
      body: String(b.text || ''),
      htmlBody: String(b.html),
      name: NOM_EXPEDITEUR,
    });
    return sortie({ ok: true, reste: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return sortie({ error: String((err && err.message) || err) });
  }
}

// Ouvrir l'adresse /exec dans un navigateur : le script repond, sans rien
// envoyer ni montrer.
function doGet() {
  return sortie({ ok: true, service: 'rappels-mail', version: VERSION });
}

// A executer une fois depuis l'editeur : cree le secret s'il n'existe pas et
// l'affiche dans le journal d'execution, et declenche l'autorisation d'envoi.
function initialiser() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('RAPPELS_SECRET');
  if (!s) {
    s = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    p.setProperty('RAPPELS_SECRET', s);
  }
  Logger.log('Secret a recopier dans Supabase (RAPPELS_SCRIPT_SECRET) : ' + s);
  Logger.log('Mails encore possibles aujourd\'hui : ' + MailApp.getRemainingDailyQuota());
}

function sortie(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
