// rappels-quotidiens : le mail du matin de chaque membre de l'equipe, d'apres
// les reglages de la page « Rappels par mail » (cle rappels d'app_data, 30/10).
// Ce qui est a faire est calcule par calcul.mjs, copie des fonctions de
// l'appli generee par outils/rappels-copie.js (check.js, controle 9).
//
// Deux appelants :
//  - pg_cron (tache 'rappels-mail', a 7 h et 8 h UTC) avec le secret de
//    backup_config, comme la sauvegarde. N'envoie qu'a 9 h, heure de Paris
//    (7 h UTC l'ete, 8 h l'hiver), une fois par jour et par personne : la
//    ligne de rappels_envois est posee AVANT l'envoi, un second passage ne
//    renvoie rien. Corps {"dry": true} : simulation, ni envoi ni trace,
//    avec {"jour": "AAAA-MM-JJ"} pour un autre jour.
//  - l'appli (bouton « M'envoyer un essai ») avec la session d'un membre : son
//    mail du jour, a lui seul, ESSAIS_MAX fois par jour au plus. Un admin peut
//    l'envoyer a un autre membre ({"pour": e-mail}) et montrer un exemple sur
//    un concert precis ({"exemple": {"fid", "tid", "sp"?}}), comme s'il etait
//    du jour (30/10 : montrer a Anne-Claire le rappel d'accreditation).
//
// Envoi par le script Google google/rappels-mail (MailApp, compte de
// Mathieu) : secrets RAPPELS_SCRIPT_URL (son adresse /exec) et
// RAPPELS_SCRIPT_SECRET. Les DNS de pleaseplease.fr sont inaccessibles, ce
// qui excluait un service d'envoi a domaine verifie (Resend, Brevo...).
// Seuls les membres de team_members recoivent un mail.
import { createClient } from "npm:@supabase/supabase-js@2";
import { dateCourte, lieuTexte, normaliserLieu, rappelsDuJour } from "./calcul.mjs";

const CLES = ["concerts", "taskstates", "process", "tkcols", "tktasks", "rappels"];
const SITE = "https://dashboardppcomm.netlify.app/";
const ESSAIS_MAX = 5;
const HEURE_ENVOI = 9;

type Item = {
  type: string; ecart: number; echeance: string; tache: string;
  art?: string; dc?: string; salle?: string; ville?: string; fid?: string; sp?: string | null;
  projet?: string;
};
type Mail = { auj: Item[]; retard: Item[]; bientot: Item[] };

// Le bouton d'essai appelle depuis le navigateur : il faut repondre a la
// demande prealable (OPTIONS) et autoriser l'origine, comme team-admin.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Date et heure a Paris, quel que soit le fuseau du serveur (UTC).
function paris(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour) };
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function pluriel(n: number, mot: string) { return n + " " + mot + (n > 1 ? "s" : ""); }
function jourLong(iso: string) {
  const d = new Date(iso + "T12:00:00Z");
  const t = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function dateIso(iso?: string) { return iso ? dateCourte(new Date(iso + "T00:00:00")) : ""; }
function lien(it: Item) {
  if (it.type === "projet") return SITE + "#taches";
  return SITE + "#kanban/" + encodeURIComponent(it.fid || "") + (it.sp ? "/" + encodeURIComponent(it.sp) : "");
}
function quand(it: Item) {
  if (it.ecart < 0) return it.ecart === -1 ? "depuis hier" : "depuis " + -it.ecart + " jours";
  if (it.ecart > 0) return dateIso(it.echeance);
  return "";
}
function lieu(it: Item) {
  return it.type === "projet" ? "Projet « " + (it.projet || "") + " »"
    : [lieuTexte({ salle: it.salle, ville: it.ville }), dateIso(it.dc)].filter(Boolean).join(" · ");
}

function sujet(m: Mail) {
  const p: string[] = [];
  if (m.auj.length) p.push(pluriel(m.auj.length, "tâche") + " aujourd'hui");
  if (m.retard.length) p.push(m.retard.length + " en retard");
  return p.join(", ") || "Rien à faire aujourd'hui";
}

// Gabarit e-mail : tableaux et styles en ligne, lu par tous les clients.
function mailHtml(prenom: string, m: Mail, jour: string, essai: boolean) {
  const groupe = (titre: string, couleur: string, items: Item[]) => !items.length ? "" :
    `<tr><td style="padding:22px 0 6px;font:600 12px/16px Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${couleur}">${esc(titre)}</td></tr>` +
    items.map((it) => {
      const q = quand(it);
      return `<tr><td style="padding:12px 0;border-top:1px solid #ecebe6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:top">
<div style="font:700 16px/20px Helvetica,Arial,sans-serif;letter-spacing:.02em;text-transform:uppercase;color:#141417">${esc(it.type === "projet" ? it.tache : it.art)}</div>
<div style="font:13px/18px Helvetica,Arial,sans-serif;color:#6b6973;margin-top:2px">${esc(lieu(it))}</div>
${it.type === "projet" ? "" : `<div style="font:15px/21px Helvetica,Arial,sans-serif;color:#141417;margin-top:6px">${esc(it.tache)}${q ? ` <span style="color:${it.ecart < 0 ? "#b0261d" : "#6b6973"}">· ${esc(q)}</span>` : ""}</div>`}
${it.type === "projet" && q ? `<div style="font:13px/18px Helvetica,Arial,sans-serif;color:${it.ecart < 0 ? "#b0261d" : "#6b6973"};margin-top:4px">${esc(q)}</div>` : ""}
</td>
<td style="vertical-align:top;text-align:right;padding-left:12px"><a href="${esc(lien(it))}" style="display:inline-block;padding:7px 12px;border-radius:8px;background:#141417;color:#ffffff;font:500 13px Helvetica,Arial,sans-serif;text-decoration:none;white-space:nowrap">Ouvrir</a></td>
</tr></table></td></tr>`;
    }).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(sujet(m))}</title></head>
<body style="margin:0;padding:0;background:#e9e7e2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9e7e2"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px"><tr><td style="padding:28px 28px 24px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font:600 13px/16px Helvetica,Arial,sans-serif;letter-spacing:.04em;color:#141417"><span style="color:#ff7550">●</span> PLEASE PLEASE · RAPPELS${essai ? " · ESSAI" : ""}</td></tr>
<tr><td style="padding-top:18px;font:600 22px/28px Helvetica,Arial,sans-serif;color:#141417">Bonjour ${esc(prenom)},</td></tr>
<tr><td style="padding-top:8px;font:15px/22px Helvetica,Arial,sans-serif;color:#3d3b44">${esc(jourLong(jour))} : voici ce qui t'attend.</td></tr>
${essai ? `<tr><td style="padding-top:12px;font:13px/19px Helvetica,Arial,sans-serif;color:#6b6973">Ceci est un mail d'essai : il montre à quoi ressemblent les rappels du tableau de bord. Le vrai part chaque matin à 9 h, seulement quand une tâche tombe ce jour-là ou reste en retard.</td></tr>` : ""}
${groupe("En retard", "#b0261d", m.retard)}
${groupe("Aujourd'hui", "#a86400", m.auj)}
${groupe("Dans les jours qui viennent", "#55535c", m.bientot)}
${!m.auj.length && !m.retard.length && !m.bientot.length ? `<tr><td style="padding-top:18px;font:15px/22px Helvetica,Arial,sans-serif;color:#3d3b44">Rien à faire aujourd'hui : ce mail ne partirait pas.</td></tr>` : ""}
<tr><td style="padding-top:24px"><a href="${SITE}" style="font:500 14px Helvetica,Arial,sans-serif;color:#c4502c">Ouvrir le tableau de bord</a></td></tr>
</table></td></tr></table>
<p style="max-width:600px;margin:14px auto 0;font:12px/18px Helvetica,Arial,sans-serif;color:#6b6973">Tu reçois ce mail parce que tu suis des rappels dans le tableau de bord. Une tâche cochée ne revient plus. <a href="${SITE}#rappels" style="color:#c4502c">Gérer mes rappels</a></p>
</td></tr></table></body></html>`;
}

function mailTexte(prenom: string, m: Mail, jour: string) {
  const g = (t: string, l: Item[]) => !l.length ? "" : "\n" + t.toUpperCase() + "\n" + l.map((it) =>
    "- " + (it.type === "projet" ? it.tache : it.art + " : " + it.tache) + " (" + lieu(it) + (quand(it) ? ", " + quand(it) : "") + ")\n  " + lien(it)).join("\n") + "\n";
  return `Bonjour ${prenom},\n\n${jourLong(jour)} : voici ce qui t'attend.\n` + g("En retard", m.retard) + g("Aujourd'hui", m.auj) +
    g("Dans les jours qui viennent", m.bientot) + `\nTableau de bord : ${SITE}\nGérer mes rappels : ${SITE}#rappels\n`;
}

// Une ligne de mail pour un concert et une etape donnes, comme si elle tombait
// ce jour-la : l'exemple d'un essai, quelle que soit sa vraie echeance.
function exemple(d: Record<string, unknown>, ex: { fid?: string; tid?: number | string; sp?: string }, jour: string): Item | null {
  const concerts = Array.isArray(d.concerts) ? d.concerts as Record<string, any>[] : [];
  const process = Array.isArray(d.process) ? d.process as Record<string, any>[] : [];
  const c = concerts.find((x) => String(x.id) === String(ex.fid));
  const t = process.find((x) => String(x.id) === String(ex.tid));
  if (!c || !t) return null;
  const p = ex.sp && Array.isArray(c.prog) ? c.prog.find((x: Record<string, any>) => String(x.id) === String(ex.sp)) : null;
  const s = normaliserLieu(Object.assign({ salle: "" }, p || c));
  return { type: "etape", ecart: 0, echeance: jour, tache: t.nom || "", art: s.art || "", dc: s.dc || "",
    salle: s.salle || "", ville: s.ville || "", fid: c.id, sp: p ? p.id : null };
}

// Apps Script repond 200 meme en cas d'erreur, apres une redirection que
// fetch suit : seul le champ ok de la reponse dit si le mail est parti.
async function envoyer(to: string, subject: string, html: string, text: string) {
  const url = Deno.env.get("RAPPELS_SCRIPT_URL"), secret = Deno.env.get("RAPPELS_SCRIPT_SECRET");
  if (!url || !secret) throw new Error("RAPPELS_SCRIPT_URL ou RAPPELS_SCRIPT_SECRET manquant");
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret, to, subject, html, text }),
  });
  const brut = await r.text();
  let rep: { ok?: boolean; error?: string } = {};
  try { rep = JSON.parse(brut); } catch { throw new Error("Script Google : réponse illisible (" + r.status + ") " + brut.slice(0, 120)); }
  if (!rep.ok) throw new Error("Script Google : " + (rep.error || "HTTP " + r.status));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const corps = await req.json().catch(() => ({}));

    // 1. Qui appelle : pg_cron (secret partage) ou un membre (sa session).
    let moi = "";
    const secret = req.headers.get("x-backup-secret") || "";
    if (secret) {
      const { data: conf, error } = await admin.from("backup_config").select("secret").maybeSingle();
      if (error) throw error;
      if (!conf?.secret || secret !== conf.secret) return json({ error: "Secret invalide" }, 403);
    } else {
      const jeton = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data: u } = await admin.auth.getUser(jeton);
      moi = (u?.user?.email || "").toLowerCase();
      if (!moi) return json({ error: "Connexion requise" }, 401);
    }

    // 2. Les donnees et l'equipe.
    const [{ data: lignes, error: e1 }, { data: membres, error: e2 }] = await Promise.all([
      admin.from("app_data").select("key,value").in("key", CLES),
      admin.from("team_members").select("email,name"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    // value est une colonne texte : du JSON a relire, comme dans backup-daily.
    const donnees: Record<string, unknown> = {};
    for (const l of lignes || []) {
      try { donnees[l.key] = typeof l.value === "string" ? JSON.parse(l.value) : l.value; }
      catch { throw new Error("Clé illisible dans app_data : " + l.key); }
    }
    const prenoms: Record<string, string> = {}, equipe: Record<string, number> = {};
    for (const m of membres || []) {
      const e = String(m.email || "").toLowerCase();
      if (e) { equipe[e] = 1; prenoms[e] = m.name || e; }
    }
    if (moi && !equipe[moi]) return json({ error: "Réservé à l'équipe" }, 403);

    const maintenant = paris();
    const jour = !moi && corps.dry && /^\d{4}-\d{2}-\d{2}$/.test(corps.jour || "") ? corps.jour : maintenant.jour;
    const mails = rappelsDuJour(donnees, jour, equipe) as Record<string, Mail>;

    // 3a. Essai : le mail du jour de la personne, a elle seule ; un admin
    // peut viser un autre membre, ou montrer un exemple sur un concert.
    if (moi) {
      let dest = moi;
      if (corps.pour || corps.exemple) {
        const { data: moiRow, error } = await admin.from("team_members").select("role").eq("email", moi).maybeSingle();
        if (error) throw error;
        if (moiRow?.role !== "admin") return json({ error: "Réservé aux administrateurs" }, 403);
      }
      if (corps.pour) {
        dest = String(corps.pour).trim().toLowerCase();
        if (!equipe[dest]) return json({ error: "Ce destinataire n'est pas dans l'équipe" }, 400);
      }
      const { count, error } = await admin.from("rappels_envois").select("id", { count: "exact", head: true })
        .eq("jour", maintenant.jour).eq("email", dest).eq("essai", true);
      if (error) throw error;
      if ((count || 0) >= ESSAIS_MAX) return json({ error: `Déjà ${ESSAIS_MAX} essais aujourd'hui.` }, 429);
      let m = mails[dest] || { auj: [], retard: [], bientot: [] };
      if (corps.exemple) {
        const it = exemple(donnees, corps.exemple, jour);
        if (!it) return json({ error: "Concert ou étape introuvable" }, 404);
        m = { auj: [it], retard: [], bientot: [] };
      }
      const nb = m.auj.length + m.retard.length;
      let statut = "envoye", detail: string | null = dest === moi ? null : "envoyé par " + moi;
      try {
        await envoyer(dest, "[Essai] " + sujet(m), mailHtml(prenoms[dest], m, jour, true), mailTexte(prenoms[dest], m, jour));
      } catch (e) { statut = "erreur"; detail = String((e as Error).message || e); }
      await admin.from("rappels_envois").insert({ jour: maintenant.jour, email: dest, essai: true, statut, nb, detail });
      return statut === "envoye" ? json({ email: dest, nb }) : json({ error: "L'essai n'est pas parti.", detail }, 502);
    }

    // 3b. Simulation : ce qui partirait, sans rien envoyer ni noter.
    if (corps.dry) {
      return json({
        jour, heure: maintenant.heure,
        mails: Object.fromEntries(Object.entries(mails).map(([e, m]) => [e, { sujet: sujet(m), ...m }])),
      });
    }

    // 3c. Envoi du matin : a 9 h a Paris seulement, une fois par personne.
    if (maintenant.heure !== HEURE_ENVOI) return json({ ignore: `il est ${maintenant.heure} h à Paris` });
    const envoyes: string[] = [], erreurs: Record<string, string> = {}, deja: string[] = [];
    for (const [email, m] of Object.entries(mails)) {
      const nb = m.auj.length + m.retard.length;
      const { data: pose, error } = await admin.from("rappels_envois")
        .insert({ jour, email, essai: false, statut: "envoi", nb }).select("id").maybeSingle();
      if (error) {
        if (error.code === "23505") { deja.push(email); continue; } // deja parti aujourd'hui
        throw error;
      }
      try {
        await envoyer(email, sujet(m), mailHtml(prenoms[email], m, jour, false), mailTexte(prenoms[email], m, jour));
        await admin.from("rappels_envois").update({ statut: "envoye" }).eq("id", pose!.id);
        envoyes.push(email);
      } catch (e) {
        const msg = String((e as Error).message || e);
        await admin.from("rappels_envois").update({ statut: "erreur", detail: msg }).eq("id", pose!.id);
        erreurs[email] = msg;
      }
    }
    return json({ jour, envoyes, erreurs, deja });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
