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
//    mail du jour, a lui seul, ESSAIS_MAX fois par jour au plus.
//
// Envoi par Resend (https://resend.com) : secrets RESEND_API_KEY et
// RAPPELS_FROM (« Please Please <rappels@pleaseplease.fr> », domaine verifie
// chez Resend). Seuls les membres de team_members recoivent un mail.
import { createClient } from "npm:@supabase/supabase-js@2";
import { dateCourte, lieuTexte, rappelsDuJour } from "./calcul.mjs";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
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
  const p = [];
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

async function envoyer(to: string, subject: string, html: string, text: string) {
  const cle = Deno.env.get("RESEND_API_KEY");
  if (!cle) throw new Error("RESEND_API_KEY manquant");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + cle, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("RAPPELS_FROM") || "Please Please <onboarding@resend.dev>", to: [to], subject, html, text }),
  });
  if (!r.ok) throw new Error("Resend " + r.status + " : " + (await r.text()).slice(0, 300));
}

Deno.serve(async (req: Request) => {
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
    const donnees: Record<string, unknown> = {};
    for (const l of lignes || []) donnees[l.key] = l.value;
    const prenoms: Record<string, string> = {}, equipe: Record<string, number> = {};
    for (const m of membres || []) {
      const e = String(m.email || "").toLowerCase();
      if (e) { equipe[e] = 1; prenoms[e] = m.name || e; }
    }
    if (moi && !equipe[moi]) return json({ error: "Réservé à l'équipe" }, 403);

    const maintenant = paris();
    const jour = !moi && corps.dry && /^\d{4}-\d{2}-\d{2}$/.test(corps.jour || "") ? corps.jour : maintenant.jour;
    const mails = rappelsDuJour(donnees, jour, equipe) as Record<string, Mail>;

    // 3a. Essai : le mail du jour de la personne, a elle seule.
    if (moi) {
      const { count, error } = await admin.from("rappels_envois").select("id", { count: "exact", head: true })
        .eq("jour", maintenant.jour).eq("email", moi).eq("essai", true);
      if (error) throw error;
      if ((count || 0) >= ESSAIS_MAX) return json({ error: `Déjà ${ESSAIS_MAX} essais aujourd'hui.` }, 429);
      const m = mails[moi] || { auj: [], retard: [], bientot: [] };
      const nb = m.auj.length + m.retard.length;
      let statut = "envoye", detail = null;
      try {
        await envoyer(moi, "[Essai] " + sujet(m), mailHtml(prenoms[moi], m, jour, true), mailTexte(prenoms[moi], m, jour));
      } catch (e) { statut = "erreur"; detail = String((e as Error).message || e); }
      await admin.from("rappels_envois").insert({ jour: maintenant.jour, email: moi, essai: true, statut, nb, detail });
      return statut === "envoye" ? json({ email: moi, nb }) : json({ error: "L'essai n'est pas parti.", detail }, 502);
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
