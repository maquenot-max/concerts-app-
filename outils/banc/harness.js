// Banc de test : faux supabase-js + fausse API REST/Storage en memoire.
// Aucune requete ne part vers supabase.co : tout est intercepte ici, et toute
// autre requete externe est bloquee. Mode d'emploi : README.md a cote.
//
// Outils exposes dans la console, sous window.__banc :
//   __banc.get(cle)                  valeur actuelle en fausse base
//   __banc.remote(cle, fn, qui, sil) ecriture d'un "collegue" (fn modifie la
//                                    valeur), suivie d'un evenement temps reel
//                                    sauf si sil = true (a declencher ensuite
//                                    avec __banc.fire(cle), dans l'ordre voulu)
//   __banc.denied = true             la session perd l'acces : lectures vides,
//                                    ecritures refusees (comme RLS)
//   __banc.writes / log / uploads    journal des ecritures, lectures, envois
// Scenarios de demarrage : sessionStorage.banc = 'illisible' (valeur de
// concerts corrompue) ou 'refuse' (acces refuse), puis recharger.
(function () {
  var seq = 0;
  function nextAt() {
    seq++;
    return '2026-09-23T12:00:00.' + String(seq).padStart(6, '0') + '+00:00';
  }
  var DB = {};
  (window.__BANC_DATA || []).forEach(function (r) {
    DB[r.key] = { key: r.key, value: r.value, updated_at: nextAt(), updated_by: 'init@banc.local' };
  });
  // Cles ajoutees apres la sauvegarde du 12/09, pre-remplies comme par la migration.
  [['artist_photos', '{}'], ['city_groups', '[]'], ['concert_media', '[]'], ['concert_tasks', '[]'], ['tkcols', '[]'], ['tktasks', '[]'], ['rsposts', '[]']].forEach(function (d) {
    if (!DB[d[0]]) DB[d[0]] = { key: d[0], value: d[1], updated_at: nextAt(), updated_by: 'init@banc.local' };
  });

  // Scenarios de demarrage : sessionStorage.banc = 'illisible' | 'refuse'
  var scenario = sessionStorage.getItem('banc') || '';
  if (scenario === 'illisible') DB.concerts.value = '{pas du json';
  var B = window.__banc = {
    db: DB, role: 'admin', latency: 25, denied: false, loggedIn: true,
    writes: [], log: [], uploads: [], deletes: [], channel: null,
    scriptAppels: [], scriptErreur: '',
    sallesTrame: ['SALLE', 'LA VAPEUR - Dijon', 'ZENITH, Dijon', 'LE CEDRE, Chenôve', 'LES SALINES ROYALES, Arc-et-Senans', 'ARENA, Reims', 'LE KABARET, Reims', 'LE CAPITOLE, Châlons-en-Champagne'],
    nextAt: nextAt,
    get: function (k) { return DB[k] ? JSON.parse(DB[k].value) : undefined; },
    // Ecriture d'un "collegue" directement en base, puis evenement temps reel.
    remote: function (key, fn, who, silent) {
      var row = DB[key]; var v = JSON.parse(row.value); var r = fn(v); if (r !== undefined) v = r;
      row.value = JSON.stringify(v); row.updated_at = nextAt(); row.updated_by = who || 'collegue@banc.local';
      if (!silent) B.fire(key);
    },
    fire: function (key) {
      var row = DB[key];
      (B.channel ? B.channel.handlers : []).forEach(function (h) {
        h({ eventType: 'UPDATE', new: { key: key, updated_by: row.updated_by, updated_at: row.updated_at } });
      });
    },
    wait: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  };
  if (scenario === 'refuse') B.denied = true;

  // ── Faux supabase-js ──────────────────────────────────────────────────
  var session = { access_token: 'jeton-banc', user: { id: 'u-banc', email: 'test@banc.local', user_metadata: { name: 'Banc' } } };
  var client = {
    auth: {
      getSession: async function () { return { data: { session: B.loggedIn ? session : null } }; },
      onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; },
      // Jamais resolue : evite le location.reload() de handleUnauthorized pendant les tests.
      signOut: function () { B.log.push('signOut'); return new Promise(function () {}); },
      signInWithPassword: async function () { return { error: { message: 'banc' } }; },
      resetPasswordForEmail: async function () { return {}; },
      updateUser: async function () { return { error: null }; },
      mfa: {
        getAuthenticatorAssuranceLevel: async function () { return { data: { currentLevel: 'aal1', nextLevel: 'aal1' } }; },
        listFactors: async function () { return { data: { totp: [], all: [] } }; },
        enroll: async function () { return { error: { message: 'banc' } }; },
        challenge: async function () { return { error: { message: 'banc' } }; },
        verify: async function () { return { error: { message: 'banc' } }; },
        unenroll: async function () { return { error: null }; }
      }
    },
    channel: function () {
      return {
        handlers: [],
        on: function (t, f, cb) { this.handlers.push(cb); return this; },
        subscribe: function (cb) { B.channel = this; setTimeout(function () { cb('SUBSCRIBED'); }, 0); return this; }
      };
    }
  };
  window.supabase = { createClient: function () { return client; } };

  // ── Fausse API ────────────────────────────────────────────────────────
  function rep(body, status) {
    return new Response(body === null ? null : JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  }
  function pick(row, select) {
    var cols = (select || 'key,value,updated_at').split(',');
    var o = {}; cols.forEach(function (c) { o[c] = row[c]; }); return o;
  }
  function header(init, name) {
    var h = init.headers || {}; for (var k in h) if (k.toLowerCase() === name.toLowerCase()) return h[k]; return '';
  }
  var realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : input.url;
    var method = (init.method || 'GET').toUpperCase();
    // Faux script Google du budget promo (google/budget-promo/Code.gs) : liste
    // des salles de la trame en GET, creation simulee en POST (rien n'est cree).
    if (url.indexOf('script.google.com') >= 0) {
      await B.wait(B.latency * 4);
      if (method === 'GET') return rep({ ok: true, version: 'banc', trame: 'AAAAMMJJ - BUDGET COM TRAME', salles: B.sallesTrame });
      var demande = JSON.parse(init.body || '{}');
      B.scriptAppels.push(demande);
      if (B.scriptErreur) return rep({ ok: false, error: B.scriptErreur });
      if (demande.token !== session.access_token) return rep({ ok: false, error: 'Session expirée : reconnecte-toi dans l\'appli.' });
      var s = demande.budget.salle, norm = function (x) { return String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
      var noms = [s.nom].concat(s.alias || []).map(norm), trouvee = B.sallesTrame.filter(function (it) {
        var p = it.split(/\s*,\s*|\s+-\s+/); return noms.indexOf(norm(p[0])) >= 0 && norm(p.slice(1).join(' ')) === norm(s.ville);
      })[0];
      return rep({ ok: true, url: 'https://docs.google.com/spreadsheets/d/BANC' + B.scriptAppels.length + '/edit', salle: trouvee || s.libelle, salleAjoutee: !trouvee, par: 'test@banc.local' });
    }
    if (url.indexOf('supabase.co') < 0) {
      if (url.indexOf(location.origin) === 0 || url.charAt(0) === '/') return realFetch(input, init);
      B.log.push('BLOQUE ' + method + ' ' + url);
      throw new TypeError('banc : requete externe bloquee ' + url);
    }
    await B.wait(B.latency);
    var u = new URL(url), p = u.pathname, q = u.searchParams;
    if (p === '/rest/v1/app_data') {
      var keyEq = (q.get('key') || '').replace(/^eq\./, '');
      if (method === 'GET') {
        B.log.push('GET ' + (q.get('key') || 'toutes'));
        if (B.denied) return rep([]);
        var rows;
        if (/^in\./.test(q.get('key') || '')) {
          var liste = q.get('key').slice(4, -1).split(',');
          rows = liste.filter(function (k) { return DB[k]; }).map(function (k) { return DB[k]; });
        } else if (keyEq) rows = DB[keyEq] ? [DB[keyEq]] : [];
        else rows = Object.keys(DB).map(function (k) { return DB[k]; });
        return rep(rows.map(function (r) { return pick(r, q.get('select')); }));
      }
      var body = JSON.parse(init.body || '{}');
      if (method === 'PATCH') {
        var row = DB[keyEq], cond = q.get('updated_at');
        B.writes.push({ m: 'PATCH', key: keyEq, octets: (body.value || '').length, t: Date.now() });
        if (B.denied || !row) return rep([]);
        var attendu = cond === 'is.null' ? null : String(cond).replace(/^eq\./, '');
        if (row.updated_at !== attendu) { B.log.push('CONFLIT ' + keyEq); return rep([]); }
        row.value = body.value; row.updated_at = nextAt(); row.updated_by = 'test@banc.local';
        setTimeout(function () { B.fire(keyEq); }, 5); // echo temps reel de notre propre ecriture
        return rep([pick(row, q.get('select'))]);
      }
      if (method === 'POST') {
        var upsert = /merge-duplicates/.test(header(init, 'Prefer'));
        B.writes.push({ m: upsert ? 'UPSERT' : 'POST', key: body.key, octets: (body.value || '').length, t: Date.now() });
        if (B.denied) return rep({ message: 'new row violates row-level security policy' }, 403);
        if (DB[body.key] && !upsert) return rep({ message: 'duplicate key' }, 409);
        DB[body.key] = { key: body.key, value: body.value, updated_at: nextAt(), updated_by: 'test@banc.local' };
        return rep([pick(DB[body.key], q.get('select') || 'updated_at')], 201);
      }
    }
    if (p === '/rest/v1/team_members') {
      return rep([{ email: 'test@banc.local', name: 'Banc', role: B.role }]);
    }
    if (p.indexOf('/storage/v1/object/public/') === 0) {
      var cv = document.createElement('canvas'); cv.width = 800; cv.height = 600;
      var ctx = cv.getContext('2d'); ctx.fillStyle = '#2a4a9e'; ctx.fillRect(0, 0, 800, 600);
      var blob = await new Promise(function (r) { cv.toBlob(r, 'image/png'); });
      return new Response(blob, { status: 200, headers: { 'Content-Type': 'image/png' } });
    }
    if (p.indexOf('/storage/v1/object/') === 0) {
      var chemin = p.replace('/storage/v1/object/concert-media/', '');
      if (method === 'POST') { B.uploads.push({ path: chemin, size: init.body && init.body.size, type: init.body && init.body.type, blob: init.body }); return rep({ Key: chemin }); }
      if (method === 'DELETE') { B.deletes.push(chemin); return rep({}); }
    }
    if (p === '/functions/v1/team-admin') return rep({ members: [{ email: 'test@banc.local', name: 'Banc', role: B.role, mfa: false, last_sign_in_at: null }] });
    B.log.push('NON GERE ' + method + ' ' + p);
    return rep({ message: 'non gere par le banc' }, 404);
  };
})();
