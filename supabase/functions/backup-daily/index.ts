// backup-daily : sauvegarde automatique de app_data dans le bucket prive
// "backups". Appelee chaque nuit par pg_cron (voir la tache 'sauvegarde-app'
// dans cron.job). Rien ici n'est declenchable depuis l'application.
//
// Le fichier produit a EXACTEMENT le meme format que l'export manuel du menu
// Sauvegarde : il se restaure donc avec le bouton "Restaurer" de l'appli, sans
// code supplementaire. Ne pas changer ce format sans changer backupRestore().
//
// Authentification : la plateforme exige deja un JWT valide (verify_jwt), et on
// verifie en plus un secret partage, lu dans public.backup_config avec la cle
// de service. Ce secret n'existe qu'en base, il n'a jamais ete ecrit ailleurs.
import { createClient } from "npm:@supabase/supabase-js@2";

// Memes cles que BACKUP_KEYS cote application, et que la contrainte CHECK
// app_data_key_allowlist. Toute cle ajoutee a la contrainte doit l'etre ici
// aussi : artist_photos et city_groups (ajoutees le 22/09) ont manque aux
// sauvegardes nocturnes jusqu'au 23/09 faute de cette mise a jour. La reponse
// signale desormais toute cle presente en base mais absente de cette liste
// ("ignorees"), pour que l'oubli ne puisse plus passer inapercu.
const CLES = [
  "concerts", "taskstates", "process", "tkcols", "tktasks", "rsposts",
  "budget_templates", "style_adjustments", "regles_salles",
  "concert_media", "concert_tasks", "artist_photos", "city_groups",
];
const BUCKET = "backups";
const RETENTION_JOURS = 30;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// "2026-09-20" en temps universel : un nom de fichier par jour, stable quelle
// que soit l'heure a laquelle la tache tourne.
function jourUTC(d: Date) {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Secret partage
    const presente = req.headers.get("x-backup-secret") || "";
    const { data: conf, error: confErr } = await admin
      .from("backup_config").select("secret").maybeSingle();
    if (confErr) throw confErr;
    if (!conf?.secret || presente !== conf.secret) {
      return json({ error: "Secret invalide" }, 403);
    }

    // 2. Lecture de toutes les donnees
    const { data: rows, error: readErr } = await admin
      .from("app_data").select("key,value");
    if (readErr) throw readErr;

    const data: Record<string, unknown> = {};
    const illisibles: string[] = [];
    const ignorees: string[] = [];
    for (const r of rows || []) {
      if (!CLES.includes(r.key)) { ignorees.push(r.key); continue; }
      try { data[r.key] = JSON.parse(r.value); }
      catch { illisibles.push(r.key); }
    }

    // Garde-fou, dans le meme esprit que init() cote client : une base qui
    // repond "rien" sur les concerts signale un probleme de lecture, pas une
    // base vide. Mieux vaut pas de sauvegarde du tout qu'une sauvegarde vide
    // qu'on croirait bonne le jour ou on en a besoin.
    const concerts = data.concerts;
    if (!Array.isArray(concerts) || concerts.length === 0) {
      return json({
        error: "Sauvegarde refusée : aucun concert lu (" + (rows?.length ?? 0) + " ligne(s) reçue(s)).",
        illisibles,
      }, 500);
    }

    // 3. Ecriture du fichier, format identique a l'export manuel
    const maintenant = new Date();
    const payload = {
      app: "ppcomm-dashboard",
      version: 1,
      exportedAt: maintenant.toISOString(),
      exportedBy: "sauvegarde automatique",
      data,
    };
    const nom = "sauvegarde-ppcomm-auto-" + jourUTC(maintenant) + ".json";
    const corps = JSON.stringify(payload, null, 1);

    const { error: upErr } = await admin.storage.from(BUCKET).upload(nom, corps, {
      contentType: "application/json",
      upsert: true, // relance le meme jour : on remplace, pas de doublon
    });
    if (upErr) throw upErr;

    // 4. Retention : on ne garde que les RETENTION_JOURS derniers jours.
    // Si created_at venait a ne plus etre renseigne, le filtre ne se
    // declencherait jamais en silence : la reponse expose donc le nombre de
    // fichiers sans date et la date du plus ancien, pour que ca se voie.
    const limite = Date.now() - RETENTION_JOURS * 86400000;
    const { data: fichiers, error: listErr } = await admin.storage
      .from(BUCKET).list("", { limit: 1000 });
    if (listErr) throw listErr;

    const tous = fichiers || [];
    const sansDate = tous.filter((f) => !f.created_at).length;
    const perimes = tous
      .filter((f) => f.name !== nom && f.created_at && Date.parse(f.created_at) < limite)
      .map((f) => f.name);
    if (perimes.length) {
      const { error: delErr } = await admin.storage.from(BUCKET).remove(perimes);
      if (delErr) throw delErr;
    }

    const restants = tous.filter((f) => !perimes.includes(f.name));
    const dates = restants.map((f) => f.created_at).filter(Boolean).sort();

    return json({
      ok: true,
      fichier: nom,
      octets: corps.length,
      cles: Object.keys(data).length,
      concerts: concerts.length,
      supprimes: perimes.length,
      conserves: restants.length,
      plus_ancienne: dates[0] ?? null,
      sans_date: sansDate,
      illisibles,
      // Doit rester vide : une cle ici existe en base mais n'est pas sauvegardee.
      ignorees,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
