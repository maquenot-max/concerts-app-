// purge-media : menage cote serveur du bucket public "concert-media".
// Appelee chaque nuit par pg_cron (tache 'purge-medias'), apres la sauvegarde.
//
// Pourquoi : la purge historique tourne dans le navigateur (sweepExpiredMedia,
// a l'ouverture de l'appli). Elle retire la ligne de concert_media puis lance
// la suppression du fichier sans en verifier le resultat : si l'appel echoue,
// le fichier reste dans un bucket PUBLIC et plus rien ne le reference
// (constate le 22/09 : une photo de rapport du 13/09 toujours en ligne).
// Cette fonction rattrape ces oublis ; elle ne remplace pas la purge cliente,
// qui reste la seule a nettoyer les LIGNES de concert_media.
//
// Ce qui est supprime : tout fichier du bucket qui n'est reference par aucune
// entree NON expiree de concert_media, et qui a plus de GRACE_HEURES (un envoi
// en cours ecrit le fichier avant la ligne de donnees).
// Ce qui n'est JAMAIS touche : les prefixes permanents ci-dessous. Les photos
// d'artistes et de newsletter peuvent figurer dans des e-mails deja envoyes :
// les supprimer casserait ces e-mails.
//
// Authentification : meme secret partage que backup-daily (public.backup_config,
// lu avec la cle de service). Corps {"dry": true} : simulation, rien n'est
// supprime, la reponse liste ce qui le serait.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "concert-media";
const PREFIXES_PERMANENTS = ["artist-photos/", "newsletter-photos/"];
const GRACE_HEURES = 24;
const PROFONDEUR_MAX = 4; // idConcert/categorie/fichier : 3 niveaux attendus

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Fichier = { name: string; created_at: string | null };

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
    const corpsRequete = await req.json().catch(() => ({}));
    const simulation = corpsRequete?.dry === true;

    // 2. Chemins encore references par une entree non expiree
    const { data: ligne, error: readErr } = await admin
      .from("app_data").select("value").eq("key", "concert_media").maybeSingle();
    if (readErr) throw readErr;
    // Garde-fou : sans lecture fiable de concert_media, on ne supprime rien
    // (une liste vide ferait tout disparaitre).
    if (!ligne) return json({ error: "concert_media introuvable : purge annulée" }, 500);
    let medias: unknown;
    try { medias = JSON.parse(ligne.value); } catch { medias = null; }
    if (!Array.isArray(medias)) return json({ error: "concert_media illisible : purge annulée" }, 500);
    const maintenant = Date.now();
    const references = new Set<string>();
    for (const m of medias as Record<string, unknown>[]) {
      const path = typeof m?.path === "string" ? m.path : "";
      const exp = typeof m?.expiresAt === "string" ? Date.parse(m.expiresAt) : NaN;
      if (path && !(exp < maintenant)) references.add(path);
    }

    // 3. Inventaire du bucket, hors prefixes permanents
    const fichiers: Fichier[] = [];
    async function parcourir(dossier: string, profondeur: number) {
      if (profondeur > PROFONDEUR_MAX) return;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(BUCKET)
          .list(dossier, { limit: 1000, offset });
        if (error) throw error;
        for (const e of data || []) {
          const chemin = (dossier ? dossier + "/" : "") + e.name;
          if (PREFIXES_PERMANENTS.some((p) => (chemin + "/").startsWith(p))) continue;
          // Un dossier n'a pas d'id dans la reponse de list()
          if (e.id === null) await parcourir(chemin, profondeur + 1);
          else fichiers.push({ name: chemin, created_at: e.created_at ?? null });
        }
        if (!data || data.length < 1000) break;
      }
    }
    await parcourir("", 1);

    // 4. Selection et suppression
    const limite = maintenant - GRACE_HEURES * 3600000;
    const aSupprimer = fichiers
      .filter((f) => !references.has(f.name))
      .filter((f) => f.created_at && Date.parse(f.created_at) < limite)
      .map((f) => f.name);
    if (!simulation && aSupprimer.length) {
      const { error: delErr } = await admin.storage.from(BUCKET).remove(aSupprimer);
      if (delErr) throw delErr;
    }

    return json({
      ok: true,
      simulation,
      examines: fichiers.length,
      references: references.size,
      supprimes: simulation ? 0 : aSupprimer.length,
      fichiers: aSupprimer,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
