// GENERE par outils/rappels-copie.js depuis public/index.html : ne pas modifier
// a la main. Les fonctions sont recopiees telles quelles ; check.js (controle 9)
// verifie que cette copie suit index.html. Voir §37 de la passation.
/* eslint-disable */
let concerts = [], process = [], taskStates = {}, tkCols = [], tkTasks = [];

function syncIsPlain(o){return o!==null&&typeof o==='object'&&!Array.isArray(o);}
var VENTES=[
  {id:0,label:'Pas en vente',cls:'ventes-0'},
  {id:1,label:'Faible',cls:'ventes-1'},
  {id:2,label:'Moyen',cls:'ventes-2'},
  {id:3,label:'Bon',cls:'ventes-3'},
  {id:4,label:'Complet',cls:'ventes-4'}
];
var SP_VIDE={billet:'',legende:'',crea:'',ville:'',rayon:'',vagues:[]};
var KNOWN_SALLES=['arena','zenith','vapeur','la vapeur','cube','cedre','c\xe8dre','spot','expo','parc','le k','tinqueux','k tinqueux'];
function villeRegroupee(v){v=String(v||'').trim();var a={'Chenove':'Dijon','Chenôve':'Dijon'};return a[v]||v;}
function lieuDepuisTexte(txt){
  var t=String(txt||'').trim(),parts=t.split(/\s+[-\u2013]\s+/);
  if(parts.length<2)return {salle:'',ville:t};
  function estSalle(x){x=x.toLowerCase().trim();return KNOWN_SALLES.some(function(k){return x.indexOf(k)>=0;});}
  // « Salle - Ville » quand le premier morceau est une salle connue, sinon
  // « Ville - Salle », l'ordre propose par le formulaire depuis toujours.
  var n=parts.length-1;
  if(estSalle(parts[0])&&!estSalle(parts[n]))return {salle:parts.slice(0,n).join(' - ').trim(),ville:parts[n].trim()};
  return {ville:parts[0].trim(),salle:parts.slice(1).join(' - ').trim()};
}
function normaliserLieu(c){
  if(estEvt(c)||!/\s[-\u2013]\s/.test(String(c.ville||'')))return c;
  var l=lieuDepuisTexte(c.ville);
  return Object.assign({},c,{salle:l.salle,ville:l.ville});
}
function lieuTexte(x){
  if(!x)return '';
  if(estEvt(x))return String(x.ville||'').trim();
  return [x.ville,x.salle].map(function(v){return String(v||'').trim();}).filter(Boolean).join(' - ');
}
function dateCourte(x,avecJour){
  if(!x)return '';
  var d=x instanceof Date?x:new Date(String(x).slice(0,10)+'T00:00:00');
  if(isNaN(d.getTime()))return '';
  var o={day:'numeric',month:'short'};
  if(avecJour)o.weekday='short';
  if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';
  return d.toLocaleDateString('fr-FR',o);
}
function tk(cid,tid){return cid+'-'+tid;}
function isNA(c,t){return !!taskStates['na-'+c.id+'-'+t.id];}
function estEvt(c){return !!(c&&c.evt);}
function evtProg(c){return c&&Array.isArray(c.prog)?c.prog:[];}
function evtFin(c){return c.dcFin&&c.dcFin>=(c.dc||'')?c.dcFin:c.dc;}
function evtTrie(l){
  return l.slice().sort(function(a,b){
    var x=(a.dc||'9999-99-99')+(a.h||'99:99'),y=(b.dc||'9999-99-99')+(b.h||'99:99');
    return x<y?-1:x>y?1:0;
  });
}
function evtApart(p){return !!p.concertId&&concerts.some(function(x){return x.id===p.concertId;});}
function evtEtapesSp(e){return e&&e.parSpectacle&&typeof e.parSpectacle==='object'?e.parSpectacle:{};}
function evtSuivis(e){return evtTrie(evtProg(e)).filter(function(p){return !p.annule&&!evtApart(p);});}
function evtVentes(p){var v=parseInt(p.ventes,10);return v>=0&&v<VENTES.length?v:0;}
function spSujet(e,p){
  return {id:p.id,art:p.art||'',dc:p.dc||'',da:p.da||e.da||'',salle:p.salle||'',ville:p.ville||'',
    ventes:evtVentes(p),annule:!!p.annule,notes:p.notes||'',spectacle:p,evenement:e};
}
function spPorteur(c){return c&&c.spectacle?c.spectacle:c;}
function spRead(c){var o=spPorteur(c);return o&&o.sponso?o.sponso:SP_VIDE;}
function spVaguesTriees(c){
  return spRead(c).vagues.slice().sort(function(a,b){
    if(!a.debut&&!b.debut)return 0;
    if(!a.debut)return 1;
    if(!b.debut)return -1;
    return a.debut<b.debut?-1:a.debut>b.debut?1:0;
  });
}
function etapeNumVague(t){
  if(!t||t.isCustom||t.cat!=='sp')return 0;
  var m=/\bvague\s*(\d+)/i.exec(t.nom||'');
  return m?parseInt(m[1],10):0;
}
function vagueDeLEtape(c,t){
  var n=etapeNumVague(t);if(!n)return null;
  var vs=spVaguesTriees(c);
  if(!vs.length)return c.spectacle?false:null;
  return vs[n-1]||false;
}
function calcDate(c,t){
  if(t.isCustom)return t.date?new Date(t.date):null;
  var override=taskStates['datemod-'+c.id+'-'+t.id];
  if(override)return new Date(override);
  var vg=vagueDeLEtape(c,t);
  if(vg&&vg.debut)return new Date(vg.debut);
  // Un evenement dure plusieurs jours : ce qui se fait apres (report comm a
  // J+1) part de son dernier jour, le reste de son premier.
  var base=t.ref==='annonce'?c.da:(t.jours>0&&estEvt(c)?evtFin(c):c.dc);if(!base)return null;var d=new Date(base);d.setDate(d.getDate()+t.jours);return d;
}
function prerequisLeve(s,tid){
  if(taskStates[tk(s.id,tid)]||taskStates['na-'+s.id+'-'+tid])return true;
  var t=process.find(function(x){return String(x.id)===String(tid);});
  return !!(t&&!sansEtapesSautees(s,[t]).length);
}
function isUnlocked(c,t){
  if(!t.prereq)return true;
  var e=c.spectacle?c.evenement:(estEvt(c)?c:null);
  // Concert, ou prerequis commun : sur l'evenement le cas echeant.
  if(!e||!evtEtapesSp(e)[t.prereq])return prerequisLeve(e||c,t.prereq);
  if(c.spectacle)return prerequisLeve(c,t.prereq);
  return evtSuivis(e).every(function(p){return prerequisLeve(spSujet(e,p),t.prereq);});
}
function etapesSujet(c){
  if(c.spectacle){
    if(evtApart(c.spectacle))return [];
    var m=evtEtapesSp(c.evenement);return process.filter(function(t){return m[t.id];});
  }
  if(estEvt(c)){var n=evtEtapesSp(c);return process.filter(function(t){return !n[t.id];});}
  return process;
}
function skipActif(c,cat){return !!taskStates['skip-'+c.id+'-'+cat]||!!(c.spectacle&&taskStates['skip-'+c.evenement.id+'-'+cat]);}
function sansEtapesSautees(c,l){
  var sp=skipActif(c,'sp'),col=skipActif(c,'col');
  return l.filter(function(t){
    if(sp&&t.cat==='sp')return false;
    if(col&&(t.cat==='col'||t.cat==='affp'))return false;
    return vagueDeLEtape(c,t)!==false;
  });
}
var RML_RELANCES=3,RML_BIENTOT=3;
function rmlIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function rmlEcart(iso,jour){
  var a=Date.UTC(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8,10)),b=Date.UTC(+jour.slice(0,4),+jour.slice(5,7)-1,+jour.slice(8,10));
  return Math.round((a-b)/864e5);
}
function rmlCleVille(v){return villeRegroupee(v).toLowerCase();}
function rmlVilleReglee(r,v){
  var k=rmlCleVille(v);if(!k)return null;
  var ns=Object.keys(r.villes||{});
  for(var i=0;i<ns.length;i++)if(rmlCleVille(ns[i])===k&&syncIsPlain(r.villes[ns[i]]))return {nom:ns[i],cfg:r.villes[ns[i]]};
  return null;
}
function rmlArtCle(a){return String(a||'').trim().toLowerCase();}
function rmlAjustement(cfg,art,tid){
  var a=rmlArtCle(art);if(!a)return null;
  var l=(cfg.artistes||[]).filter(function(x){return x&&rmlArtCle(x.art)===a&&(!x.tache||String(x.tache)===String(tid));});
  return l.filter(function(x){return x.tache;})[0]||l[0]||null;
}
function rmlMuet(r,email,cle){var m=(r.muets||{})[email];return !!(m&&m[cle]);}
function rmlSujets(){
  var out=[];
  concerts.forEach(function(c){
    if(!c||c.supprime||c.annule)return;
    if(!estEvt(c)){out.push({s:c,villes:[c.ville],fid:c.id,sp:null});return;}
    var vs=evtProg(c).filter(function(p){return !p.annule;}).map(function(p){return p.ville;});
    out.push({s:c,villes:vs.length?vs:[c.ville],fid:c.id,sp:null});
    evtSuivis(c).forEach(function(p){out.push({s:spSujet(c,p),villes:[p.ville],fid:c.id,sp:p.id});});
  });
  return out;
}
function rmlCalcul(r,jour,equipe){
  var out={};
  r=syncIsPlain(r)?r:{};
  function ranger(email,cle,it){
    email=String(email||'').toLowerCase();if(!equipe[email])return;
    var o=out[email]||(out[email]={auj:[],retard:[],bientot:[],vus:{}});
    if(o.vus[cle])return;o.vus[cle]=1;
    (it.ecart===0?o.auj:it.ecart<0?o.retard:o.bientot).push(it);
  }
  rmlSujets().forEach(function(x){
    var s=x.s;
    x.villes.forEach(function(v){
      var vr=rmlVilleReglee(r,v);if(!vr)return;
      var cfg=vr.cfg,suivies=syncIsPlain(cfg.taches)?cfg.taches:{};
      sansEtapesSautees(s,etapesSujet(s)).forEach(function(t){
        if(!suivies[t.id]||isNA(s,t)||taskStates[tk(s.id,t.id)]||!isUnlocked(s,t))return;
        var aj=rmlAjustement(cfg,s.art,t.id);
        if(aj&&aj.coupe)return;
        var j=aj&&aj.jours!==null&&aj.jours!==undefined&&aj.jours!==''&&isFinite(+aj.jours)?+aj.jours:null;
        var d=calcDate(s,j===null?t:Object.assign({},t,{jours:j}));
        if(!d||isNaN(d.getTime()))return;
        var iso=rmlIso(d),n=rmlEcart(iso,jour);
        if(n<-RML_RELANCES||n>RML_BIENTOT)return;
        var it={type:'etape',ecart:n,echeance:iso,tache:t.nom||'',tid:t.id,art:s.art||'',dc:s.dc||'',salle:s.salle||'',ville:villeRegroupee(v),fid:x.fid,sp:x.sp};
        (Array.isArray(cfg.dest)?cfg.dest:[]).concat(aj&&Array.isArray(aj.plus)?aj.plus:[]).forEach(function(e){
          if(!rmlMuet(r,String(e).toLowerCase(),'v|'+vr.nom+'|'+t.id))ranger(e,s.id+'|'+t.id,it);
        });
      });
    });
  });
  (Array.isArray(r.projets)?r.projets:[]).forEach(function(p){
    var col=p&&tkCols.find(function(c){return c.id===p.colId;});if(!col)return;
    tkTasks.forEach(function(t){
      if(t.colId!==p.colId||t.done||!t.date||(p.tache&&t.id!==p.tache))return;
      var iso=String(t.date).slice(0,10),n=rmlEcart(iso,jour);
      if(isNaN(n)||n<-RML_RELANCES||n>RML_BIENTOT)return;
      var it={type:'projet',ecart:n,echeance:iso,tache:t.nom||'',projet:col.nom||'',tkid:t.id};
      (Array.isArray(p.dest)?p.dest:[]).forEach(function(e){
        if(!rmlMuet(r,String(e).toLowerCase(),'p|'+p.id))ranger(e,'tk|'+t.id,it);
      });
    });
  });
  Object.keys(out).forEach(function(e){
    var o=out[e];delete o.vus;
    ['auj','retard','bientot'].forEach(function(k){o[k].sort(function(a,b){return a.echeance<b.echeance?-1:a.echeance>b.echeance?1:0;});});
    if(!o.auj.length&&!o.retard.length)delete out[e];
  });
  return out;
}

// Les cles d'app_data telles que l'appli les met en forme au chargement
// (normalizeSynced), puis le calcul du jour.
export function rappelsDuJour(d, jour, equipe) {
  concerts = (Array.isArray(d.concerts) ? d.concerts : []).map((c) => normaliserLieu(Object.assign({ salle: '', ventes: 0 }, c)));
  process = (Array.isArray(d.process) ? d.process : []).map((t) => Object.assign({ prereq: null, cat: t.cat || 'gen' }, t));
  taskStates = syncIsPlain(d.taskstates) ? d.taskstates : {};
  tkCols = Array.isArray(d.tkcols) ? d.tkcols : [];
  tkTasks = Array.isArray(d.tktasks) ? d.tktasks : [];
  return rmlCalcul(d.rappels, jour, equipe);
}
export { lieuTexte, dateCourte, rmlIso };
