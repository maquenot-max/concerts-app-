#!/usr/bin/env node
/*
 * Tour du banc dans Safari et Chrome : memes ecrans, memes largeurs, planches
 * cote a cote et mesures (erreurs JavaScript, page qui deborde de cote, texte
 * hors des polices de l'interface). Cree le 26/09/2026 : le premier tour dans
 * Safari a trouve deux defauts invisibles dans Chrome.
 *
 * Aucune dependance : safaridriver (livre avec macOS) et Chrome sans interface,
 * pilotes par fetch et WebSocket (Node 22 ou plus).
 *
 * Prerequis : le banc servi (voir README) ; pour Safari, l'option « Autoriser
 * l'automatisation a distance » cochee dans son menu Developpement.
 *
 * Usage : node outils/banc/tour.mjs [--url http://localhost:8766/]
 *           [--largeurs 1440,1024,390] [--navigateurs safari,chrome] [--ecrans fiche]
 * Sortie : outils/banc/captures/<date>/index.html (hors du depot : les captures
 * montrent des donnees reelles).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map((a) => a.trim().split(/\s+/)).map(([k, v]) => [k, v || '']));
const URL_BANC = args.url || 'http://localhost:8766/';
const LARGEURS = (args.largeurs || '1440,1024,390').split(',').map(Number);
const NAVIGATEURS = (args.navigateurs || 'safari,chrome').split(',');
const FILTRE = args.ecrans || '';
const HAUTEUR = 900;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const d = new Date(), deux = (x) => String(x).padStart(2, '0');
const horodatage = d.getFullYear() + deux(d.getMonth() + 1) + deux(d.getDate()) + '-' + deux(d.getHours()) + deux(d.getMinutes()) + deux(d.getSeconds());
const SORTIE = path.join(path.dirname(new URL(import.meta.url).pathname), 'captures', horodatage);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Chaque ecran part d'un chargement neuf de l'appli (la fausse base revient a
// son etat initial), puis ce code est joue dans la page.
const AIDES = "var C=function(n){return concerts.find(function(x){return x.art===n;});};"
  + "var E=function(){return concerts.find(estEvt);};";
const ECRANS = [
  ['01-tableau-de-bord', "showTab('kanban')"],
  ['02-concerts-liste', "showTab('concerts')"],
  ['03-concerts-salles', "showTab('concerts');setConcertsView('salle')"],
  ['04-concerts-calendrier', "showTab('concerts');setConcertsView('calendar')"],
  ['05-concerts-passes', "showTab('past')"],
  ['06-taches', "showTab('taches')"],
  ['07-planning-rs', "showTab('rs')"],
  ['08-sponso', "showTab('sponso')"],
  ['09-process', "showTab('process')"],
  ['10-budget-config', "showTab('budgetconfig')"],
  ['11-fiche-apercu', "showTab('concerts');openFiche(C('EIFFEL').id)"],
  ['12-fiche-plan', "showTab('concerts');openFiche(C('EIFFEL').id,'plan')"],
  ['13-fiche-sponso', "showTab('concerts');openFiche(C('EIFFEL').id,'sponso')"],
  ['14-fiche-infos', "showTab('concerts');openFiche(C('EIFFEL').id,'infos')"],
  ['15-evenement-apercu', "showTab('concerts');openFiche(E().id,'apercu')"],
  ['16-evenement-plan', "showTab('concerts');openFiche(E().id,'plan')"],
  ['17-spectacle', "showTab('concerts');openFiche(E().id);ficheChoisirSpectacle(E().prog[0].id)"],
  ['18-newsletter', "showTab('kanban');openNewsletterModal()"],
  ['19-aide', "showTab('kanban');openHelp()"],
].filter(([n]) => n.includes(FILTRE));

// Transitions et animations coupees : une fenetre Safari cachee derriere
// d'autres (visibilityState « hidden ») les fige a leur debut, et la capture
// montrait l'onglet qu'on vient de quitter encore en blanc, ou la fiche encore
// hors de l'ecran (constate le 26/09).
const CAPTEUR = "if(!window.__tourErreurs){window.__tourErreurs=[];"
  + "addEventListener('error',function(e){__tourErreurs.push(e.message+' @'+String(e.filename||'').split('/').pop()+':'+e.lineno);});"
  + "addEventListener('unhandledrejection',function(e){__tourErreurs.push('rejet : '+(e.reason&&e.reason.message||e.reason));});"
  + "var st=document.createElement('style');st.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.appendChild(st);}";

// Mesures dans la page. « police » : texte visible qui n'est ni en Geist (Mono
// compris), ni en Anton (noms d'artistes depuis la palette Braise du 26/09), ni
// en Bricolage Grotesque (rapport PDF) : un bouton qui garde la police du
// navigateur, par exemple.
const MESURES = "var de=document.documentElement,W=de.clientWidth,police={};"
  + "document.querySelectorAll('body *').forEach(function(el){if(!el.offsetParent&&getComputedStyle(el).position!=='fixed')return;"
  + "var t=/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)&&el.type!=='checkbox'&&el.type!=='radio'||[].some.call(el.childNodes,function(n){return n.nodeType===3&&n.textContent.trim();});"
  + "if(!t)return;var f=getComputedStyle(el).fontFamily;if(/Geist|Anton|Bricolage|monospace/.test(f))return;"
  + "var k=el.tagName.toLowerCase()+(typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\\s+/)[0]:'');police[k]=(police[k]||0)+1;});"
  + "return {largeur:W,contenu:de.scrollWidth,erreurs:(window.__tourErreurs||[]).slice(),police:Object.keys(police).map(function(k){return k+' ×'+police[k];})};";

async function safari() {
  const port = 20000 + Math.floor(Math.random() * 10000);
  const proc = spawn('safaridriver', ['-p', String(port)], { stdio: 'ignore' });
  await sleep(1500);
  async function wd(m, p, b) {
    const r = await fetch('http://localhost:' + port + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
    const j = await r.json();
    if (j.value && j.value.error) throw new Error(j.value.message);
    return j.value;
  }
  let s;
  try { s = await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } }); }
  catch (e) { proc.kill(); throw new Error('Safari refuse la session : ' + e.message); }
  const S = '/session/' + s.sessionId;
  return {
    nom: 'safari', version: 'Safari ' + s.capabilities.browserVersion,
    // La taille demandee est celle de la fenetre : on corrige d'apres innerWidth.
    async taille(w, h) {
      await wd('POST', S + '/window/rect', { x: 0, y: 0, width: w, height: h + 80 });
      const m = await this.js('return [innerWidth, innerHeight]');
      if (m[0] !== w || m[1] !== h) await wd('POST', S + '/window/rect', { width: 2 * w - m[0], height: 2 * h + 80 - m[1] });
      await sleep(500);
    },
    aller: (url) => wd('POST', S + '/url', { url }),
    js: (code) => wd('POST', S + '/execute/sync', { script: code, args: [] }),
    async capture(f) { fs.writeFileSync(f, Buffer.from(await wd('GET', S + '/screenshot'), 'base64')); },
    async fin() { try { await wd('DELETE', S); } catch {} proc.kill(); },
  };
}

async function chrome() {
  const port = 30000 + Math.floor(Math.random() * 10000);
  const profil = fs.mkdtempSync(path.join(SORTIE, 'profil-'));
  // Port aleatoire et groupe de processus a part : un Chrome reste ouvert par
  // un tour precedent ne doit pas capter celui-ci.
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + profil,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore', detached: true });
  let cibles = [];
  for (let i = 0; i < 50 && !cibles.length; i++) {
    try { cibles = (await (await fetch('http://127.0.0.1:' + port + '/json/list')).json()).filter((t) => t.type === 'page'); } catch {}
    if (!cibles.length) await sleep(200);
  }
  if (!cibles.length) throw new Error('Chrome ne repond pas (' + CHROME + ')');
  const ws = new WebSocket(cibles[0].webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let n = 0;
  const attente = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (!m.id || !attente.has(m.id)) return;
    const [ok, ko] = attente.get(m.id);
    attente.delete(m.id);
    if (m.error) ko(new Error(m.error.message)); else ok(m.result);
  };
  const send = (method, params = {}) => new Promise((ok, ko) => { const i = ++n; attente.set(i, [ok, ko]); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  return {
    nom: 'chrome', version: (await send('Browser.getVersion')).product,
    taille: (w, h, dpr = 2) => send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false }),
    aller: (url) => send('Page.navigate', { url }),
    async js(code) {
      const r = await send('Runtime.evaluate', { expression: '(function(){' + code + '})()', returnByValue: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    },
    async capture(f) { fs.writeFileSync(f, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); },
    async fin() {
      ws.close();
      try { process.kill(-proc.pid); } catch {}
      await sleep(800);
      fs.rmSync(profil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    },
  };
}

// Safari garde une barre de defilement classique sur un Mac reglé ainsi : on
// met Chrome a la meme largeur utile pour comparer ce qui est comparable.
const utile = {};
let compteur = Date.now();
async function tour(nav, mesures) {
  for (const w of LARGEURS) {
    await nav.taille(utile[w] || w, HAUTEUR);
    fs.mkdirSync(path.join(SORTIE, nav.nom + '-' + w), { recursive: true });
    for (const [nom, prep] of ECRANS) {
      const t = 't=' + (++compteur);
      // Une sauvegarde differee en attente declencherait « Quitter la page ? ».
      try { await nav.js('if(window.pendingSaveKeys)for(var k in pendingSaveKeys)delete pendingSaveKeys[k];'); } catch {}
      await nav.aller(URL_BANC + '?' + t + '#kanban');
      let pret = false;
      for (let i = 0; i < 80 && !pret; i++) {
        try { pret = await nav.js("return location.search==='?" + t + "'&&window.appDataLoaded===true"); } catch {}
        if (!pret) await sleep(250);
      }
      if (!pret) throw new Error(nav.nom + ' : l\'appli ne se charge pas sur ' + URL_BANC + ' (banc servi ?)');
      await nav.js(CAPTEUR);
      let erreurPrep = null;
      try { await nav.js(AIDES + prep + ';return true;'); } catch (e) { erreurPrep = e.message; }
      await sleep(1200);
      const m = await nav.js(MESURES);
      if (nav.nom === 'safari' && !utile[w]) utile[w] = m.largeur;
      await nav.capture(path.join(SORTIE, nav.nom + '-' + w, nom + '.png'));
      if (erreurPrep) m.erreurs.unshift('preparation : ' + erreurPrep);
      mesures.push({ nav: nav.nom, w, ecran: nom, ...m });
      const alertes = [m.erreurs.length && 'ERREURS ' + m.erreurs.join(' | '), m.contenu > m.largeur + 1 && 'DEBORDE ' + m.contenu + ' px pour ' + m.largeur,
        m.police.length && 'police : ' + m.police.join(', ')].filter(Boolean);
      console.log(nav.nom.padEnd(7), String(w).padEnd(5), nom.padEnd(24), alertes.join(' · ') || 'ok');
    }
  }
}

// Planches : les navigateurs cote a cote, en une image par ecran (capturee par Chrome).
async function planches(nav) {
  const dossier = path.join(SORTIE, 'planches');
  fs.mkdirSync(dossier, { recursive: true });
  for (const w of LARGEURS) {
    const larg = w > 800 ? 760 : 390;
    for (const [nom] of ECRANS) {
      const html = '<body style="margin:0;background:#888;font:13px sans-serif"><div style="display:flex;gap:12px;padding:8px">'
        + NAVIGATEURS.map((n) => '<figure style="margin:0"><figcaption style="color:#fff;padding:0 0 4px">' + n + ' ' + w + '</figcaption><img src="file://'
          + path.join(SORTIE, n + '-' + w, nom + '.png') + '" style="width:' + larg + 'px;display:block"></figure>').join('') + '</div></body>';
      const f = path.join(dossier, w + '-' + nom + '.html');
      fs.writeFileSync(f, html);
      const largeur = NAVIGATEURS.length * (larg + 12) + 4;
      await nav.taille(largeur, 400, 1);
      await nav.aller('file://' + f);
      await sleep(400);
      await nav.taille(largeur, await nav.js('return document.body.scrollHeight'), 1);
      await sleep(150);
      await nav.capture(path.join(dossier, w + '-' + nom + '.png'));
      fs.unlinkSync(f);
    }
  }
}

function sommaire(mesures, versions) {
  const lignes = [];
  for (const w of LARGEURS) {
    for (const [nom] of ECRANS) {
      const cellules = NAVIGATEURS.map((n) => {
        const m = mesures.find((x) => x.nav === n && x.w === w && x.ecran === nom);
        const notes = m ? [...m.erreurs, m.contenu > m.largeur + 1 ? 'déborde : ' + m.contenu + ' px pour ' + m.largeur : '', m.police.length ? 'police : ' + m.police.join(', ') : ''].filter(Boolean) : ['absent'];
        return '<td><a href="' + n + '-' + w + '/' + nom + '.png"><img src="' + n + '-' + w + '/' + nom + '.png" loading="lazy"></a>'
          + (notes.length ? '<p class="alerte">' + notes.map((t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('<br>') + '</p>' : '') + '</td>';
      });
      lignes.push('<tr><th>' + nom + '<br><small>' + w + ' px</small></th>' + cellules.join('') + '</tr>');
    }
  }
  fs.writeFileSync(path.join(SORTIE, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Tour du banc ' + horodatage + '</title>'
    + '<style>body{font:14px system-ui;margin:16px}table{border-collapse:collapse}th,td{vertical-align:top;padding:8px;border-bottom:1px solid #ddd;text-align:left}'
    + 'img{width:380px;border:1px solid #ccc}.alerte{color:#b00;max-width:380px}</style>'
    + '<h1>Tour du banc</h1><p>' + versions.join(' · ') + '</p><table><tr><th></th>' + NAVIGATEURS.map((n) => '<th>' + n + '</th>').join('') + '</tr>' + lignes.join('') + '</table>');
}

fs.mkdirSync(SORTIE, { recursive: true });
const mesures = [];
const versions = [];
let navChrome = null;
for (const n of NAVIGATEURS) {
  const nav = n === 'safari' ? await safari() : await chrome();
  versions.push(nav.version);
  console.log('──', nav.version);
  try {
    await tour(nav, mesures);
  } finally {
    if (n === 'chrome') navChrome = nav; else await nav.fin();
  }
}
try {
  if (navChrome && NAVIGATEURS.length > 1) await planches(navChrome);
} finally {
  if (navChrome) await navChrome.fin();
}
fs.writeFileSync(path.join(SORTIE, 'mesures.json'), JSON.stringify(mesures, null, 1));
sommaire(mesures, versions);
console.log('\n' + mesures.length + ' captures : ' + path.relative(process.cwd(), path.join(SORTIE, 'index.html')));
