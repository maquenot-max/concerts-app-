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
//   __banc.activite                  journal d'activite (imite le trigger de la
//                                    base : chaque ecriture y est comparee)
// Scenarios de demarrage : sessionStorage.banc = 'illisible' (valeur de
// concerts corrompue), 'refuse' (acces refuse) ou 'activite' (journal
// d'activite pre-rempli : deux collegues, une semaine de gestes), puis recharger.
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
    nextAt: nextAt,
    get: function (k) { return DB[k] ? JSON.parse(DB[k].value) : undefined; },
    // Ecriture d'un "collegue" directement en base, puis evenement temps reel.
    remote: function (key, fn, who, silent) {
      var row = DB[key], avant = row.value; var v = JSON.parse(row.value); var r = fn(v); if (r !== undefined) v = r;
      row.value = JSON.stringify(v); row.updated_at = nextAt(); row.updated_by = who || 'collegue@banc.local';
      B.actNoter(key, avant, row.value, row.updated_by);
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

  // ── Journal d'activite : imite le trigger app_data_log_activity (14/10) ──
  // Meme comparaison que la base (supabase/migrations/*_journal_activite.sql) :
  // element par element (id) pour une liste d'objets, cle par cle pour un
  // objet, et d'un element modifie, les seuls champs qui changent ; ecritures
  // d'une meme personne sur un meme element a moins de 15 min regroupees ;
  // un aller-retour ne laisse rien.
  var ACT = B.activite = [], actSeq = 0;
  function canon(v) {
    if (v === undefined) return 'undefined';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function egal(a, b) { return canon(a) === canon(b); }
  function nul(v) { return v === undefined ? null : v; }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function champsDiff(a, b) {
    var ks = {}, o = {}, n = {}, vu = false;
    Object.keys(a || {}).concat(Object.keys(b || {})).forEach(function (k) { ks[k] = 1; });
    Object.keys(ks).forEach(function (k) {
      var x = a ? a[k] : undefined, y = b ? b[k] : undefined;
      if (!egal(x, y)) { o[k] = nul(x); n[k] = nul(y); vu = true; }
    });
    return vu ? { ancien: o, nouveau: n } : { ancien: null, nouveau: null };
  }
  // Valeur entiere de plus de 8 000 caracteres : taille et empreinte (md5 en base).
  function trim(v) {
    var t = JSON.stringify(v);
    if (v === null || t.length <= 8000) return v;
    var h = 5381; for (var i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) | 0;
    return { trop_long: t.length, md5: String(h) };
  }
  function listeIds(v) {
    if (v === undefined) return true;
    if (!Array.isArray(v)) return false;
    var ids = {};
    return v.every(function (e) { if (!isObj(e) || !('id' in e) || ids[String(e.id)]) return false; ids[String(e.id)] = 1; return true; });
  }
  function actDiff(o, n) {
    var out = [], ref = n === undefined ? o : n;
    if (Array.isArray(ref) && listeIds(o) && listeIds(n)) {
      var A = {}, Bn = {};
      (o || []).forEach(function (e) { A[String(e.id)] = e; });
      (n || []).forEach(function (e) { Bn[String(e.id)] = e; });
      Object.keys(A).concat(Object.keys(Bn).filter(function (k) { return !(k in A); })).forEach(function (id) {
        var a = A[id], b = Bn[id];
        if (egal(a, b)) return;
        if (!a) out.push({ item: id, op: 'add', old: null, nw: b });
        else if (!b) out.push({ item: id, op: 'remove', old: a, nw: null });
        else { var f = champsDiff(a, b); out.push({ item: id, op: 'change', old: f.ancien, nw: f.nouveau }); }
      });
    } else if (isObj(ref) && (o === undefined || isObj(o)) && isObj(n)) {
      var ks = {};
      Object.keys(o || {}).concat(Object.keys(n)).forEach(function (k) { ks[k] = 1; });
      Object.keys(ks).forEach(function (k) {
        var a = o ? o[k] : undefined, b = n[k];
        if (egal(a, b)) return;
        out.push({ item: k, op: a === undefined ? 'add' : b === undefined ? 'remove' : 'change', old: nul(a), nw: nul(b) });
      });
    } else if (!egal(o, n)) out.push({ item: '', op: o === undefined ? 'add' : 'change', old: trim(nul(o)), nw: trim(n) });
    return out;
  }
  function actNoter(key, avantTxt, apresTxt, email) {
    var o, n;
    try { o = avantTxt == null ? undefined : JSON.parse(avantTxt); n = JSON.parse(apresTxt); } catch (e) { return; }
    var t = new Date(), parElement = Array.isArray(n);
    actDiff(o, n).forEach(function (d) {
      var champs = parElement && d.item !== '', ex = null;
      ACT.forEach(function (l) {
        if (l.key === key && l.item === d.item && l.email === email && t - new Date(l.at) < 15 * 60000 && (!ex || l.at > ex.at)) ex = l;
      });
      if (!ex) {
        ACT.push({ id: ++actSeq, first_at: t.toISOString(), at: t.toISOString(), email: email, key: key, item: d.item, op: d.op, old_value: d.old, new_value: d.nw, writes: 1 });
        return;
      }
      var op2, av, ap, f;
      if (ex.op === 'add' && d.op === 'remove') { ACT.splice(ACT.indexOf(ex), 1); return; }
      if (ex.op === 'add') { op2 = 'add'; av = null; ap = champs ? Object.assign({}, ex.new_value, d.nw) : d.nw; }
      else if (d.op === 'remove') { op2 = 'remove'; ap = null; av = champs && ex.op === 'change' ? Object.assign({}, d.old, ex.old_value) : ex.old_value; }
      else if (ex.op === 'remove') {
        op2 = 'change'; av = ex.old_value; ap = d.nw;
        if (champs) { f = champsDiff(av, ap); av = f.ancien; ap = f.nouveau; }
      } else {
        op2 = 'change';
        if (champs) { f = champsDiff(Object.assign({}, d.old, ex.old_value), Object.assign({}, ex.new_value, d.nw)); av = f.ancien; ap = f.nouveau; }
        else { av = ex.old_value; ap = d.nw; }
      }
      if (op2 === 'change' && egal(nul(av), nul(ap))) { ACT.splice(ACT.indexOf(ex), 1); return; }
      ex.op = op2; ex.old_value = nul(av); ex.new_value = nul(ap); ex.at = t.toISOString(); ex.writes++;
    });
  }
  B.actNoter = actNoter;
  B.activiteDemo = demoActivite; // pour tour.mjs (sans recharger la page)
  if (scenario === 'activite') demoActivite();

  // Une semaine de gestes de deux collegues et de soi, sur les vrais concerts
  // du banc : de quoi voir chaque sorte de phrase de la page Activite.
  function demoActivite() {
    var cs = B.get('concerts') || [], posts = B.get('rsposts') || [], auj = new Date();
    auj.setHours(0, 0, 0, 0);
    var avenir = cs.filter(function (c) { return !c.supprime && !c.evt && c.dc && new Date(c.dc) >= auj; })
      .sort(function (a, b) { return a.dc < b.dc ? -1 : 1; });
    if (avenir.length < 4) avenir = cs.filter(function (c) { return !c.evt; }).slice(-4);
    var c1 = avenir[0], c2 = avenir[1], c3 = avenir[2], c4 = avenir[3];
    var L = 'louka@banc.local', An = 'anne@banc.local', M = 'test@banc.local';
    function ilya(min) { return new Date(Date.now() - min * 60000).toISOString(); }
    function jour(j, h, m) { var d = new Date(); d.setDate(d.getDate() - j); d.setHours(h, m, 0, 0); return d.toISOString(); }
    function dans(j) { var d = new Date(); d.setDate(d.getDate() + j); return d.toISOString().slice(0, 10); }
    function ligne(email, at, key, item, op, old, nw, debut) {
      ACT.push({ id: ++actSeq, first_at: debut || at, at: at, email: email, key: key, item: String(item), op: op, old_value: nul(old), new_value: nul(nw), writes: debut ? 5 : 1 });
    }
    // Une action de report, presente en base pour que ses modifications se lisent.
    var action = { id: 'rpdemo1', type: 'action', concertId: c2.id, rub: 'diffusion', modele: 'flyers', titre: 'Dépôt de flyers', quand: { mode: 'periode', du: dans(-6), au: dans(-2) }, chiffres: { flyers: 500, 'lieux de dépôt': 12 }, texte: '', lien: '', cree: jour(2, 10, 5) };
    var media = B.get('concert_media') || []; media.push(action); DB.concert_media.value = JSON.stringify(media);
    // Un post supprime hier par Louka : absent de la base, a remettre.
    var p2 = posts[1];
    if (p2) DB.rsposts.value = JSON.stringify(posts.filter(function (x) { return x.id !== p2.id; }));
    // Aujourd'hui
    ligne(M, ilya(8), 'taskstates', c1.id + '-19', 'add', null, true);
    ligne(M, ilya(9), 'taskstates', c1.id + '-30', 'add', null, true);
    ligne(M, ilya(11), 'taskstates', c1.id + '-16', 'add', null, true);
    if (posts[0]) ligne(L, ilya(30), 'rsposts', posts[0].id, 'change', { legend: posts[0].legend || '', status: posts[0].status || '' }, { legend: 'Plus que quelques places : on vous attend !', status: 'ready' });
    ligne(M, ilya(55), 'concerts', c2.id, 'change', { da: c2.da || null }, { da: dans(8) });
    ligne(L, ilya(70), 'concerts', c3.id, 'change', { notes: c3.notes || '' }, { notes: 'Affiches livrées lundi, reste 40 flyers à déposer chez les disquaires. Jeu concours calé avec la radio locale, annonce prévue vendredi.' }, ilya(82));
    ligne(L, ilya(84), 'rsposts', 'rs-vieux-1', 'remove', { id: 'rs-vieux-1', date: '2026-02-03', type: 'annonce', concert: 'ANCIEN CONCERT', proj: 'pp' }, null);
    ligne(L, ilya(84), 'rsposts', 'rs-vieux-2', 'remove', { id: 'rs-vieux-2', date: '2026-01-20', type: 'actu', proj: 'pp' }, null);
    // Hier
    ligne(An, jour(1, 17, 48), 'concert_media', action.id, 'change', { chiffres: { flyers: 300, 'lieux de dépôt': 8 } }, { chiffres: { flyers: 500, 'lieux de dépôt': 12 } });
    ligne(An, jour(1, 16, 20), 'taskstates', c4.id + '-9', 'add', null, true);
    if (p2) ligne(L, jour(1, 15, 40), 'rsposts', p2.id, 'remove', p2, null);
    ligne(M, jour(1, 14, 31), 'tktasks', 'tkdemo1', 'remove', { id: 'tkdemo1', nom: 'Relancer JC Decaux', colId: 'pp', date: dans(3), done: false }, null);
    ligne(L, jour(1, 11, 10), 'taskstates', c2.id + '-8', 'remove', true, null);
    // Les jours d'avant
    ligne(An, jour(2, 10, 5), 'concert_media', action.id, 'add', null, action);
    ligne(M, jour(3, 18, 2), 'concerts', c1.id, 'change', { budget: '1200' }, { budget: '1500' });
    var sp = c1.sponso || { billet: '', vagues: [] };
    ligne(M, jour(3, 17, 55), 'concerts', c1.id, 'change', { sponso: sp }, { sponso: Object.assign({}, sp, { vagues: (sp.vagues || []).concat([{ id: 'spdemo', debut: dans(4), fin: dans(8) }]) }) });
    ligne(L, jour(4, 9, 30), 'rsposts', 'rsdemo2', 'add', null, { id: 'rsdemo2', date: dans(5), type: 'focus', proj: 'pp', concertId: c3.id });
    ligne(L, jour(4, 9, 32), 'rsposts', 'rsdemo3', 'add', null, { id: 'rsdemo3', date: dans(6), type: 'concours', proj: 'pp', concertId: c4.id });
    ligne(M, jour(5, 16, 0), 'concerts', c4.id, 'change', { ventes: 2 }, { ventes: 3 });
    ligne(An, jour(6, 12, 15), 'taskstates', 'skip-' + c3.id + '-sp', 'add', null, true);
  }

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
    // Faux script Google du budget promo (google/budget-promo/Code.gs) : version
    // et nom de la trame en GET, creation simulee en POST (rien n'est cree).
    if (url.indexOf('script.google.com') >= 0) {
      await B.wait(B.latency * 4);
      if (method === 'GET') return rep({ ok: true, version: 'banc', trame: 'AAAAMMJJ - BUDGET COM TRAME' });
      var demande = JSON.parse(init.body || '{}');
      B.scriptAppels.push(demande);
      if (B.scriptErreur) return rep({ ok: false, error: B.scriptErreur });
      if (demande.token !== session.access_token) return rep({ ok: false, error: 'Session expirée : reconnecte-toi dans l\'appli.' });
      return rep({ ok: true, url: 'https://docs.google.com/spreadsheets/d/BANC' + B.scriptAppels.length + '/edit', salle: demande.budget.salle.libelle, par: 'test@banc.local' });
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
        actNoter(keyEq, row.value, body.value, 'test@banc.local');
        row.value = body.value; row.updated_at = nextAt(); row.updated_by = 'test@banc.local';
        setTimeout(function () { B.fire(keyEq); }, 5); // echo temps reel de notre propre ecriture
        return rep([pick(row, q.get('select'))]);
      }
      if (method === 'POST') {
        var upsert = /merge-duplicates/.test(header(init, 'Prefer'));
        B.writes.push({ m: upsert ? 'UPSERT' : 'POST', key: body.key, octets: (body.value || '').length, t: Date.now() });
        if (B.denied) return rep({ message: 'new row violates row-level security policy' }, 403);
        if (DB[body.key] && !upsert) return rep({ message: 'duplicate key' }, 409);
        actNoter(body.key, DB[body.key] ? DB[body.key].value : null, body.value, 'test@banc.local');
        DB[body.key] = { key: body.key, value: body.value, updated_at: nextAt(), updated_by: 'test@banc.local' };
        return rep([pick(DB[body.key], q.get('select') || 'updated_at')], 201);
      }
    }
    if (p === '/rest/v1/team_members') {
      // Deux collegues fictifs, pour les prenoms du journal d'activite.
      var membres = [{ email: 'test@banc.local', name: 'Banc', role: B.role }, { email: 'louka@banc.local', name: 'Louka', role: 'member' }, { email: 'anne@banc.local', name: 'Anne-Claire', role: 'member' }];
      var em = (q.get('email') || '').replace(/^eq\./, '');
      return rep(em ? membres.filter(function (m) { return m.email === em; }) : membres);
    }
    if (p === '/rest/v1/activity_log') {
      // Comme la policy activity_log_select_admin : rien pour un membre.
      B.log.push('GET activity_log');
      if (B.denied || B.role !== 'admin') return rep([]);
      var bornes = [], and = q.get('and'), at = q.get('at');
      if (and) and.slice(1, -1).split(',').forEach(function (c) { var m = /^at\.(gte|lt)\.(.+)$/.exec(c); if (m) bornes.push([m[1], m[2]]); });
      if (at) { var m2 = /^(gte|lt)\.(.+)$/.exec(at); if (m2) bornes.push([m2[1], m2[2]]); }
      var lignes = ACT.filter(function (l) {
        return bornes.every(function (b) { var t = new Date(l.at), v = new Date(b[1]); return b[0] === 'gte' ? t >= v : t < v; });
      }).sort(function (a, b) { return a.at < b.at ? 1 : -1; }).slice(0, +(q.get('limit') || 1000));
      return rep(JSON.parse(JSON.stringify(lignes)));
    }
    if (p.indexOf('/storage/v1/object/public/') === 0) {
      // Lecture d'une image (recadrage du report, 30/09) : celle envoyee dans
      // cette session si elle existe ; sinon la vraie si le script de test
      // la fournit (__banc.imagesReelles = true, images servies par
      // Playwright) ; sinon une image unie de 800 x 600.
      var ch = decodeURIComponent(p.replace('/storage/v1/object/public/concert-media/', ''));
      var up = B.uploads.filter(function (u) { return u.path === ch && u.blob; }).pop();
      if (up) return new Response(up.blob, { status: 200, headers: { 'Content-Type': up.type || 'image/jpeg' } });
      if (B.imagesReelles) return realFetch(input, init);
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
