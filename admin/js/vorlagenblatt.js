/* Die dritte Sicht: Vorlagen ansehen, bearbeiten, speichern, Probelauf.

   Paketvorlagen sind nur zu lesen - wer eine aendern will, dupliziert
   sie, und die Kopie verdeckt das Original. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { D, $, el, kurz } from './basis.js';
import { tr, sprachtext, sprache } from './sprache.js';
import { katalogFehlt } from './katalog.js';
import { funktionsAuswahl, kennungZuFunktion } from './aufzaehlungen.js';
import { musterVon, platzFuerRolle, typVomPlatz, typenVomPlatz, typPasstZuPlatz } from './erkennung.js';
import { musterZeile, musterName } from './musternamen.js';
import { ladeVorlagen, aendereVorlagen, setzeMeta, pruefeVorlage, hinweisTaugt, INSTANZ_ID } from './vorlagen.js';
import { kindZustaende, hatPunkt, feldAusFormel } from './werte.js';
import { opt } from './entwurf.js';
import { zeichneErgebnis } from './ergebnis.js';
import { delKnopf } from './schreiben.js';

import { rollenFeld } from './rollenwahl.js';


/* ================== Vorlagen verwalten ==================
   Dritte Sicht neben Quellen und Aliasen: links die Vorlagen, rechts
   die gewaehlte mit Probelauf. Paketvorlagen sind nur zu lesen —
   wer eine aendern will, dupliziert sie, und die Kopie verdeckt das
   Original. Damit bleibt das Paket immer der Auslieferungszustand. */

var vGewaehlt = null;        /* id der gewaehlten Vorlage */
var vEinlesen = null;        /* eingelesene, noch nicht gespeicherte Vorlage */
var vEntwurf = null;         /* Arbeitskopie beim Bearbeiten */
var vLoeschFrage = false;
var vJsonAuf = false;
var vOffeneZeile = null;

export function vorlageMitId(id) {
  var t = null;
  S.VORLAGEN.forEach(function (v) { if (v.id === id) { t = v; } });
  return t;
}

function ohneUnterstrich(v) {
  var k = {};
  Object.keys(v).forEach(function (f) { if (f.charAt(0) !== '_') { k[f] = v[f]; } });
  /* Halbfertige Ersatzquellen nicht mitspeichern: eine Zeile ohne
     Datenpunkt ist beim Bearbeiten nuetzlich, in der Vorlage waere sie
     nur Ballast. */
  if (Array.isArray(k.zustaende)) {
    k.zustaende = k.zustaende.map(function (z) {
      if (!z || !z.lesenSonst) { return z; }
      var liste = ersatzListe(z).filter(function (x) { return x && x.punkt; });
      var kopie = {};
      Object.keys(z).forEach(function (f) { kopie[f] = z[f]; });
      if (!liste.length) { delete kopie.lesenSonst; }
      else { kopie.lesenSonst = (liste.length === 1) ? liste[0] : liste; }
      return kopie;
    });
  }
  return k;
}

export function zeichneVorlagenListe() {
  var host = $('#tree');
  host.textContent = '';
  var filter = ($('#q').value || '').trim().toLowerCase();

  var liste = S.VORLAGEN.filter(function (v) {
    if (!filter) { return true; }
    return (v.id + ' ' + sprachtext(v.name)).toLowerCase().indexOf(filter) > -1;
  });

  if (vEinlesen) {
    host.appendChild(vListenZeile(vEinlesen, true));
  }
  if (!liste.length && !vEinlesen) {
    host.appendChild(el('div', 'empty', tr('tree.nothingFound')));
    return;
  }
  liste.forEach(function (v) { host.appendChild(vListenZeile(v, false)); });
}

function vListenZeile(v, eingelesen) {
  /* Zwei verschiedene Dinge, die im Objektbaum zwei verschiedene Klassen
     tragen: `pick` heisst waehlbar (Mauszeiger), `sel` heisst gewaehlt
     (Akzentfarbe). Diese Liste setzte nur `pick` — und `pick` faerbt
     nichts. Die angeklickte Vorlage stand deshalb unmarkiert da, waehrend
     rechts ihr Blatt aufgeschlagen war (26.08.2026). */
  var gewaehlt = (!eingelesen && v.id === vGewaehlt && !vEinlesen) ||
                 (eingelesen && vEinlesen);
  var d = el('div', 'node pick' + (gewaehlt ? ' sel' : ''));
  d.style.cursor = 'pointer';
  d.style.gap = '6px';
  var eigen = v._quelle === 'benutzer';
  d.appendChild(el('span', 'chip ' + (eingelesen ? 'warn' : (eigen ? 'ok' : 'mut')),
    eingelesen ? tr('tv.imported') : (eigen ? tr('tpl.own') : tr('tv.package'))));
  var nm = el('span', 'nm', sprachtext(v.name));
  d.appendChild(nm);
  var meta = el('span', null, v.id + '  v' + (v.version || 1));
  meta.style.fontFamily = 'var(--mono)';
  meta.style.fontSize = '10px';
  meta.style.color = 'var(--ink-3)';
  meta.style.marginLeft = 'auto';
  d.appendChild(meta);
  d.addEventListener('click', function () {
    if (!eingelesen) { vEinlesen = null; vGewaehlt = v.id; }
    vEntwurf = null;
    vLoeschFrage = false;
    vOffeneZeile = null;
    zeichneVorlagenListe();
    zeichneErgebnis();
  });
  return d;
}

/* Beim Bearbeiten wird auf einer Kopie gearbeitet — erst Speichern
   macht sie echt. Gleiche Regel wie beim Entwurf eines Geraets. */
function vArbeitsstand() {
  if (vEinlesen) { return vEinlesen; }
  if (vEntwurf) { return vEntwurf; }
  return vorlageMitId(vGewaehlt);
}

function vAendern(feld, wert) {
  if (!vEinlesen && !vEntwurf) {
    var o = vorlageMitId(vGewaehlt);
    if (!o) { return; }
    vEntwurf = JSON.parse(JSON.stringify(ohneUnterstrich(o)));
    vEntwurf._quelle = o._quelle;
  }
  feld(vEinlesen || vEntwurf, wert);
  zeichneErgebnis();
}

export function zeichneVorlagenBlatt(host) {
  /* Die Knoepfe unten gehoeren zum Geraet, nicht zur Vorlage. In dieser
     Sicht waeren sie sonst noch auf das Geraet scharf, das vor dem
     Umschalten gewaehlt war. */
  /* Nicht nur sperren, sondern verstecken — ein grauer Knopf „Alias
     erzeugen" gehoert nicht unter eine Vorlage. */
  ['#btn-dry', '#btn-tpl', '#btn-checks'].forEach(function (w) {
    var b = $(w);
    if (b) { b.disabled = true; b.hidden = true; }
  });
  var ba0 = $('#btn-dry-alle');
  if (ba0) { ba0.hidden = true; }
  delKnopf(false);

  var v = vArbeitsstand();
  if (!v) {
    /* Dieselbe Erklaerung wie in den anderen beiden Modi. */
    var lh = el('div', 'empty leerhilfe');
    lh.appendChild(el('div', 'lh1', tr('help.templates')));
    host.appendChild(lh);
    return;
  }
  var eigen = v._quelle === 'benutzer' || !!vEinlesen;
  var vorhanden = vorlageMitId(v.id);
  var geaendert = !!vEntwurf || !!vEinlesen;

  /* --- Kopf --- */
  var head = el('div', 'reshead');
  var links = el('div');
  links.appendChild(el('div', 'ziel', sprachtext(v.name)));
  var unter = el('div', 'unter');
  unter.appendChild(el('span', 'chip ' + (eigen ? 'ok' : 'mut'),
    vEinlesen ? tr('tv.imported') : (eigen ? tr('tpl.own') : tr('tv.package'))));
  unter.appendChild(el('span', null, v.id + '  v' + (v.version || 1) +
    '  ·  ' + tr('tv.rank', v.rang || 0)));
  links.appendChild(unter);
  head.appendChild(links);
  host.appendChild(head);

  /* --- Was das Einlesen bewirken wuerde --- */
  if (vEinlesen) {
    var iw = el('div', 'aside w');
    iw.style.marginBottom = '11px';
    iw.appendChild(el('b', null, tr('tv.importTitle')));
    var was;
    if (!vorhanden) { was = tr('tv.importNew', v.id); }
    else if (vorhanden._quelle === 'benutzer') {
      was = tr('tv.importReplaces', v.id, vorhanden.version || 1, v.version || 1);
    } else { was = tr('tv.importShadows', v.id); }
    iw.appendChild(document.createTextNode(' ' + was));
    host.appendChild(iw);
  } else if (!eigen) {
    var pw = el('div', 'aside');
    pw.style.marginBottom = '11px';
    pw.appendChild(el('b', null, tr('tv.packageTitle')));
    pw.appendChild(document.createTextNode(' ' + tr('tv.packageText')));
    host.appendChild(pw);
  }

  /* --- Knoepfe. Ganz oben, weil man dort zuerst hinschaut. --- */
  var bar = el('div');
  bar.style.display = 'flex';
  bar.style.gap = '8px';
  bar.style.flexWrap = 'wrap';
  bar.style.alignItems = 'center';
  bar.style.margin = '0 0 12px';

  if (geaendert) {
    var bs = el('button', 'btn primary', vEinlesen ? tr('tv.importAndSave') : tr('tv.save'));
    bs.addEventListener('click', vSpeichern);
    bar.appendChild(bs);
    var bv = el('button', 'btn', tr('tv.discard'));
    bv.addEventListener('click', function () {
      vEinlesen = null; vEntwurf = null; vLoeschFrage = false;
      zeichneVorlagenListe(); zeichneErgebnis();
    });
    bar.appendChild(bv);
  }

  /* Zwei verschiedene Absichten, deshalb zwei Beschriftungen: eine
     mitgelieferte Vorlage will man meist *aendern* — dann behaelt die
     Kopie die Kennung und verdeckt das Original. Eine eigene Vorlage
     will man meist *abwandeln* — dann braucht die Kopie eine neue
     Kennung, sonst ueberschriebe sie das Vorbild. */
  var bd2 = el('button', 'btn', eigen ? tr('tv.duplicate') : tr('tv.makeOwn'));
  bd2.addEventListener('click', function () { vDuplizieren(v, !eigen); });
  bar.appendChild(bd2);

  var ba = el('button', 'btn', tr('tv.export'));
  ba.addEventListener('click', function () { vAusgeben(v); });
  bar.appendChild(ba);

  if (eigen && !vEinlesen && vorhanden && vorhanden._quelle === 'benutzer') {
    var bl = el('button', 'btn', vLoeschFrage ? tr('tv.deleteSure') : tr('tv.delete'));
    if (vLoeschFrage) {
      bl.style.background = 'var(--bad)';
      bl.style.borderColor = 'var(--bad)';
      bl.style.color = '#fff';
    }
    bl.addEventListener('click', function () {
      if (!vLoeschFrage) { vLoeschFrage = true; zeichneErgebnis(); return; }
      vLoeschen(v.id);
    });
    bar.appendChild(bl);
    /* Verdeckt sie eine mitgelieferte, kommt die wieder zum Vorschein. */
    if (vLoeschFrage) { bar.appendChild(el('span', 'hint', tr('tv.deleteHint'))); }
  }
  host.appendChild(bar);

  /* --- Kopfdaten --- */
  var kk = el('div', 'card');
  kk.style.marginBottom = '11px';
  var kh = el('div', 'ch');
  kh.appendChild(el('span', 'typ', tr('tpls.head')));
  if (geaendert) { kh.appendChild(el('span', 'chip warn', tr('tv.unsaved'))); }

  kk.appendChild(kh);
  var kb = el('div');
  kb.style.padding = '9px 12px 11px';
  kb.style.display = 'flex';
  kb.style.flexWrap = 'wrap';
  kb.style.gap = '9px 14px';

  function feld(label, wert, setzen, breit) {
    var l = el('label', 'feld');
    l.appendChild(el('span', 'feldlabel', label));
    var i = document.createElement('input');
    i.className = 'tx';
    i.type = 'text';
    i.value = wert === undefined || wert === null ? '' : String(wert);
    i.disabled = !eigen;
    if (breit) { i.style.minWidth = breit; }
    i.addEventListener('change', function () { vAendern(setzen, i.value); });
    l.appendChild(i);
    return l;
  }

  kb.appendChild(feld(tr('tpls.nameDe'), textIn(v.name, 'de'),
    function (x, w) { if (typeof x.name === 'string') { x.name = { de: x.name, en: x.name }; } x.name.de = w; }, '140px'));
  kb.appendChild(feld(tr('tpls.nameEn'), textIn(v.name, 'en'),
    function (x, w) { if (typeof x.name === 'string') { x.name = { de: x.name, en: x.name }; } x.name.en = w; }, '140px'));
  kb.appendChild(feld(tr('tpls.rank'), v.rang || 0,
    function (x, w) { x.rang = Number(w) || 0; }, '60px'));
  var rh = el('span', 'hint', eigen ? tr('tv.rankOwn') : tr('tv.rankPackage'));
  rh.style.flexBasis = '100%';
  kb.appendChild(rh);

  var lt = el('label', 'feld');
  lt.appendChild(el('span', 'feldlabel', tr('tpls.deviceType')));
  var st = el('select', 'tx');
  st.disabled = !eigen;
  st.appendChild(opt('', tr('tpls.noType')));
  (D ? Object.keys(D.patterns).sort() : []).forEach(function (m) {
    var o = opt(m, musterZeile(m));
    if (m === v.geraetetyp) { o.selected = true; }
    st.appendChild(o);
  });
  st.addEventListener('change', function () {
    vAendern(function (x, w) { x.geraetetyp = w || undefined; }, st.value);
  });
  lt.appendChild(st);
  kb.appendChild(lt);

  /* Wozu das Geraet zaehlt.

     Nicht dasselbe wie der Geraetetyp: `socket` sagt nur, dass etwas
     geschaltet wird - ob eine Steckdose, eine Lampe oder eine
     Druckerleiste, weiss allein die Vorlage. Gespeichert wird die
     Kennung aus dem Katalog des Admin, nicht der Anzeigename; daraus
     loest die Werkbank beides auf, den vorhandenen Eintrag und die
     Vorlage samt Uebersetzung und Bild. Leer heisst: nichts
     vorschlagen. */
  var lf = el('label', 'feld');
  lf.appendChild(el('span', 'feldlabel', tr('tpls.function')));
  var sf = el('select', 'tx');
  sf.disabled = !eigen;
  sf.appendChild(opt('', tr('tpls.noFunction')));
  funktionsAuswahl(v.funktion).forEach(function (x) {
    var o = opt(x.wert, x.text);
    if (x.gewaehlt) { o.selected = true; }
    sf.appendChild(o);
  });
  sf.addEventListener('change', function () {
    vAendern(function (x, w) { x.funktion = w || undefined; }, sf.value);
  });
  lf.appendChild(sf);
  if (katalogFehlt) { lf.appendChild(el('span', 'hint', tr('catalog.missing'))); }
  kb.appendChild(lf);

  kk.appendChild(kb);

  var nb = el('div');
  nb.style.padding = '0 12px 11px';
  nb.appendChild(feld(tr('tpls.nameHint'), (v.erkennung || {}).namenshinweis || '',
    function (x, w) { x.erkennung = x.erkennung || {}; if (w) { x.erkennung.namenshinweis = w; } else { delete x.erkennung.namenshinweis; } }, '260px'));
  /* Der Text ist ein Ausdruck, und ein unbrauchbarer Ausdruck faellt
     sonst nirgends auf: Er wird still zu „trifft nicht", und die Vorlage
     verliert leise ihren Namensbonus. Also hier sagen, wo er steht. */
  if (!hinweisTaugt((v.erkennung || {}).namenshinweis || '')) {
    var nbw = el('div', 'hint');
    nbw.style.color = 'var(--bad)';
    nbw.textContent = tr('tpls.nameHintBad');
    nb.appendChild(nbw);
  }
  nb.appendChild(el('div', 'hint', tr('tv.nameHintShort')));
  kk.appendChild(nb);
  host.appendChild(kk);

  /* --- Erkennung --- */
  var ek = el('div', 'card');
  ek.style.marginBottom = '11px';
  var eh = el('div', 'ch');
  eh.appendChild(el('span', 'typ', tr('tv.detection')));
  var erf = (v.erkennung || {}).erforderlich || [];
  eh.appendChild(el('span', 'chip mut', tr('tv.requiredCount', erf.length)));
  ek.appendChild(eh);
  var eb = el('div');
  eb.style.padding = '9px 12px 11px';
  var listenFeld = function (label, wert, setzen, hilfe) {
    var w = el('div');
    w.style.marginBottom = '9px';
    w.appendChild(feld(label, wert, setzen, '380px'));
    if (hilfe) { w.appendChild(el('div', 'hint', hilfe)); }
    return w;
  };
  var alsListe = function (text) {
    return String(text).split(',').map(function (t) { return t.trim(); })
      .filter(function (t) { return !!t; });
  };
  eb.appendChild(listenFeld(tr('tv.required2'), erf.join(', '), function (x, wert) {
    x.erkennung = x.erkennung || {};
    x.erkennung.erforderlich = alsListe(wert);
  }, tr('tv.requiredHelp')));
  if (!erf.length) {
    eb.appendChild(el('div', 'hint', tr('tpls.noRequired')));
  }
  var inh = (v.erkennung || {}).inhalt || {};
  Object.keys(inh).forEach(function (punkt) {
    var z = el('div', 'hint', tr('tpls.contentRow', punkt, inh[punkt]));
    z.style.fontFamily = 'var(--mono)';
    eb.appendChild(z);
  });
  eb.appendChild(listenFeld(tr('tv.forbidden'), ((v.erkennung || {}).verboten || []).join(', '),
    function (x, wert) {
      x.erkennung = x.erkennung || {};
      var l = alsListe(wert);
      if (l.length) { x.erkennung.verboten = l; } else { delete x.erkennung.verboten; }
    }, tr('tv.forbiddenHelp')));
  if (v.mehrfach) {
    eb.appendChild(el('div', 'hint', tr('tv.multi', v.kanalname || 'POWER%N%')));
  }
  ek.appendChild(eb);
  host.appendChild(ek);

  /* --- Datenpunkte --- */
  var zk = el('div', 'card');
  zk.style.marginBottom = '11px';
  var zh = el('div', 'ch');
  zh.appendChild(el('span', 'typ', tr('tpls.states')));
  zh.appendChild(el('span', 'chip mut', tr('tpls.statesCount', (v.zustaende || []).length)));
  if (eigen) {
    zh.appendChild(el('span', 'luecke'));
    zh.appendChild(el('span', 'hint', tr('tv.clickRow')));
  }
  zk.appendChild(zh);
  (v.zustaende || []).forEach(function (z, nr) {
    var auf = (vOffeneZeile === nr);
    var r = el('div', 'slot' + (eigen ? ' vklick' : '') + (auf ? ' offen' : ''));
    r.style.gridTemplateColumns = '1fr 1.1fr 1.2fr 90px 15px';
    r.appendChild(el('span', 'sn', z.name));
    r.appendChild(el('span', 'rx', z.rolle || '\u2014'));
    var pw = el('span', 'rx');
    pw.style.fontFamily = 'var(--mono)';
    pw.appendChild(document.createTextNode(z.lesen + (z.feld ? ' \u00b7 ' + z.feld : '')));
    /* Der Schreibpfad ist ein Pfad wie der Lesepfad davor, keine
       Statusmarke - als Chip las er sich wie \u201eVorgabe" daneben. */
    if (z.schreiben) { pw.appendChild(el('span', 'leise', ' \u2192 ' + z.schreiben)); }
    if (z.absolut) { pw.appendChild(el('span', 'chip warn', tr('tpls.absolute'))); }
    r.appendChild(pw);
    /* Dieselben zwei Angaben wie im Speichern-Dialog, gleiche Richtung
       und dieselben Woerter — vorher stand hier „Pflicht/freiwillig"
       und dort „Vorgabe / muss da sein", fuer genau dieselbe Sache. */
    var mm = el('span', 'rx');
    if (!z.vorgabeAus) { mm.appendChild(el('span', 'chip mut', tr('tpls.colDefault'))); }
    if (istPflichtpunkt(v, z)) { mm.appendChild(el('span', 'chip ok', tr('tpls.colRequired'))); }
    r.appendChild(mm);
    r.appendChild(el('span', 'ca2', eigen ? (auf ? '\u25be' : '\u25b8') : ''));
    if (eigen) {
      r.addEventListener('click', function () {
        vOffeneZeile = auf ? null : nr;
        zeichneErgebnis();
      });
    }
    zk.appendChild(r);
    if (eigen && auf) { zk.appendChild(vZeilenDetail(z, nr)); }
  });

  if (eigen) {
    var np = el('div');
    np.style.padding = '9px 12px 11px';
    var nKnopf = el('button', 'btn schmal', tr('tv.addState'));
    nKnopf.addEventListener('click', function () {
      vAendern(function (x) {
        x.zustaende = x.zustaende || [];
        x.zustaende.push({ name: 'NEU', typ: 'mixed', lesen: '', optional: true });
        vOffeneZeile = x.zustaende.length - 1;
      });
    });
    np.appendChild(nKnopf);
    zk.appendChild(np);
  }
  /* Das Rollenwissen ist kein Zeilenbestand - nur ein Vermerk, dass es
     da ist und wo es greift. */
  if (v.weiterePunkte && Object.keys(v.weiterePunkte).length) {
    var ww = el('div', 'hint');
    ww.style.padding = '7px 12px 10px';
    ww.textContent = tr('tpls.wissen', Object.keys(v.weiterePunkte).length);
    zk.appendChild(ww);
  }
  host.appendChild(zk);

  /* --- Probelauf --- */
  var pk = el('div', 'card');
  pk.style.marginBottom = '11px';
  var ph2 = el('div', 'ch');
  ph2.appendChild(el('span', 'typ', tr('tpls.tryout')));
  if (erf.length) { probeWerteHolen(ohneUnterstrich(v), zeichneErgebnis); }
  var treffer = erf.length
    ? probelauf(ohneUnterstrich(v), v._quelle === 'benutzer') : [];
  var gew = treffer.filter(function (t) { return t.gewinnt; }).length;
  ph2.appendChild(el('span', 'chip ' + (gew ? 'ok' : 'warn'), tr('tpls.hits', treffer.length, gew)));
  pk.appendChild(ph2);
  var pb2 = el('div');
  pb2.style.padding = '9px 12px 11px';
  if (!treffer.length) {
    pb2.appendChild(el('div', 'hint', erf.length ? tr('tpls.noHits') : tr('tpls.noRequired')));
  } else {
    treffer.slice(0, 40).forEach(function (t) {
      var r = el('div', 'slot');
      r.style.gridTemplateColumns = '1fr 110px 150px';
      var idl = el('span', 'sn', t.id);
      idl.style.fontFamily = 'var(--mono)';
      r.appendChild(idl);
      r.appendChild(el('span', 'rx', tr('tpls.evidence', t.eigen.belege)));
      r.appendChild(el('span', 'chip ' + (t.gewinnt ? 'ok' : 'bad'),
        t.gewinnt ? (t.gegner ? tr('tpls.beats', textIn(t.gegner.vorlage.name, sprache)) : tr('tpls.onlyOne'))
                  : tr('tpls.losesTo', textIn(t.gegner.vorlage.name, sprache))));
      pb2.appendChild(r);
    });
    if (treffer.length > 40) {
      pb2.appendChild(el('div', 'hint', tr('tpls.andMore', treffer.length - 40)));
    }
  }
  pk.appendChild(pb2);
  host.appendChild(pk);

  /* --- das JSON, zugeklappt: bei 16 Datenpunkten sind das 200 Zeilen,
         und darunter faende niemand mehr die Knoepfe --- */
  var jk = el('div', 'card');
  jk.style.marginBottom = '11px';
  var jh = el('div', 'ch');
  jh.appendChild(el('span', 'typ', tr('tv.json')));
  jh.appendChild(el('span', 'luecke'));
  var jb = el('button', 'btn schmal', vJsonAuf ? tr('tv.hide') : tr('tv.show'));
  jb.addEventListener('click', function () { vJsonAuf = !vJsonAuf; zeichneErgebnis(); });
  jh.appendChild(jb);
  jk.appendChild(jh);
  if (vJsonAuf) {
    var pre = el('div', 'raw');
    pre.style.margin = '9px 12px 11px';
    pre.style.whiteSpace = 'pre';
    pre.style.maxHeight = 'none';
    pre.textContent = JSON.stringify(ohneUnterstrich(v), null, 2);
    jk.appendChild(pre);
  }
  host.appendChild(jk);

}

/* Ein Datenpunkt zum Aufklappen. Bewusst ohne Werte und ohne
   Detektor-Bericht: hier gibt es kein Geraet, an dem man das messen
   koennte. Was die Aenderung bewirkt, zeigt der Probelauf darunter. */
/* ============ Bausteine, die beide Detailansichten teilen ============
   Der Block am Geraet und der an der Vorlage sollen gleich aussehen und
   gleich bedienbar sein. Wo sie dasselbe zeigen, bauen sie es jetzt aus
   denselben Funktionen — sonst laufen die beiden auseinander, sobald man
   an einer Stelle etwas verbessert. */

/* Eine Zeile Beschriftung + Inhalt, wie im Detail am Geraet. */
export function dtZeile(d, k, inhalt, cls) {
  var r = el('div', 'dr');
  r.appendChild(el('div', 'k', k));
  if (inhalt === undefined || inhalt === null) {
    r.appendChild(el('div', cls || null, '\u2014'));
  } else if (typeof inhalt === 'string' || typeof inhalt === 'number') {
    r.appendChild(el('div', cls || null, String(inhalt)));
  } else {
    r.appendChild(inhalt);
  }
  d.appendChild(r);
  return r;
}

function dtFeld(beschriftung, element) {
  var l = el('label', 'fld');
  l.appendChild(el('span', null, beschriftung));
  l.appendChild(element);
  return l;
}

/* Rollenauswahl samt Begruendung. geraetetyp darf leer sein — dann
   entfaellt nur der Hinweis, welchen Platz die Rolle traefe. */
function rollenBlock(rolle, geraetetyp, setzen, typJetzt, setzeTyp) {
  var rb = el('div');
  /* Dasselbe durchsuchbare Feld wie am Geraet - ein Aussehen fuer alle
     Rollenwahlen. Ohne Belegt-Vermerk: in der Vorlage gibt es keinen
     Entwurf, gegen den man Plaetze zaehlen koennte. */
  rb.appendChild(rollenFeld({
    wert: rolle || '',
    muster: geraetetyp,
    leerErlaubt: true,
    breite: '300px',
    /* Wie am Geraet: der Platz bringt seinen Datentyp mit, also wird er
       beim Waehlen der Rolle gleich gesetzt. Eine Vorlage, deren Rolle
       stimmt und deren Typ nicht, faellt sonst lautlos aus dem Muster. */
    beiWahl: function (r) {
      var t = typVomPlatz(platzFuerRolle(geraetetyp, r));
      if (t && setzeTyp && typJetzt !== t) { setzeTyp(t); }
      setzen(r);
    }
  }));

  var must = geraetetyp && musterVon(geraetetyp);
  if (must) {
    var treffer = platzFuerRolle(geraetetyp, rolle);
    var erlaubt = typenVomPlatz(treffer);
    var hin = el('div', 'sugg');
    if (treffer) {
      hin.appendChild(document.createTextNode(tr('pattern.fitsOn')));
      hin.appendChild(el('b', null, String(treffer.role)));
      hin.appendChild(document.createTextNode(tr('pattern.toSlot', treffer.name, musterName(geraetetyp) || geraetetyp)));
      if (erlaubt.length) {
        hin.appendChild(document.createTextNode(
          tr('pattern.expectsType', erlaubt.join(tr('pattern.typeOr')))));
      }
    } else {
      hin.textContent = tr('pattern.noPlaceLong', musterName(geraetetyp) || geraetetyp);
    }
    rb.appendChild(hin);
    if (!typPasstZuPlatz(treffer, typJetzt)) {
      rb.appendChild(el('div', 'aside w',
        tr('pattern.typeMismatch', treffer.name, erlaubt.join(tr('pattern.typeOr')), typJetzt)));
    }
  }
  return rb;
}

/* Typ, Einheit, Nachkommastellen, Beschriftung — in dieser Reihenfolge
   und mit denselben Auswahlmoeglichkeiten wie am Geraet. */
function anzeigeBlock(hole, setze, platzhalter) {
  var af = el('div', 'fields');

  var selT = el('select', 'tx');
  [['', '\u2014'], ['boolean', 'boolean'], ['number', 'number'],
   ['string', 'string'], ['mixed', 'mixed']].forEach(function (o) {
    selT.appendChild(opt(o[0], o[1]));
  });
  selT.value = hole('typ') || '';
  selT.addEventListener('click', function (ev) { ev.stopPropagation(); });
  selT.addEventListener('change', function () { setze('typ', selT.value); });
  af.appendChild(dtFeld(tr('detail.type'), selT));

  var iU = el('input', 'tx');
  iU.type = 'text';
  iU.style.width = '70px';
  iU.value = hole('einheit') || '';
  iU.placeholder = '\u2014';
  iU.addEventListener('click', function (ev) { ev.stopPropagation(); });
  iU.addEventListener('change', function () { setze('einheit', iU.value); });
  af.appendChild(dtFeld(tr('detail.unit'), iU));

  var selD = el('select', 'tx');
  [['', tr('detail.asDelivered')], ['0', '0'], ['1', '1'], ['2', '2'], ['3', '3']]
    .forEach(function (o) { selD.appendChild(opt(o[0], o[1])); });
  var dec = hole('dec');
  selD.value = (dec === undefined || dec === null) ? '' : String(dec);
  selD.addEventListener('click', function (ev) { ev.stopPropagation(); });
  selD.addEventListener('change', function () { setze('dec', selD.value); });
  af.appendChild(dtFeld(tr('detail.decimals'), selD));

  var iC = el('input', 'tx');
  iC.type = 'text';
  iC.style.width = '150px';
  iC.value = hole('caption') || '';
  iC.placeholder = platzhalter || '';
  iC.addEventListener('click', function (ev) { ev.stopPropagation(); });
  iC.addEventListener('change', function () { setze('caption', iC.value); });
  af.appendChild(dtFeld(tr('detail.caption'), iC));

  return af;
}

/* Zaehlt dieser Datenpunkt fuer die Erkennung? Nicht aus optional
   abgelesen, sondern aus der Pflichtliste — die ist die Wahrheit. */
function istPflichtpunkt(v, z) {
  var erf = (v.erkennung || {}).erforderlich || [];
  return !!z.lesen && erf.indexOf(z.lesen) > -1;
}

/* lesenSonst darf ein Punktname, ein Objekt oder eine Liste sein — alle
   drei Formen kommen in Vorlagen vor. Nach innen immer eine Liste. */
function ersatzListe(z) {
  var s0 = z.lesenSonst;
  if (!s0) { return []; }
  var arr = Array.isArray(s0) ? s0 : [s0];
  return arr.map(function (x) {
    return (typeof x === 'string') ? { punkt: x } : x;
  });
}

/* Im Arbeitsstand bleibt eine noch leere Zeile stehen — sonst koennte
   man nie eine anlegen, weil sie im selben Atemzug wieder verschwaende.
   Weggeworfen wird sie erst beim Ablegen, in ohneUnterstrich. */
function schreibeErsatz(z, liste) {
  if (!liste.length) { delete z.lesenSonst; return; }
  z.lesenSonst = (liste.length === 1) ? liste[0] : liste;
}

function vZeilenDetail(z, nr) {
  var v = vArbeitsstand();
  var d = el('div', 'detail');

  /* Genau der Aufbau des Detailblocks am Geraet: Name, liest aus,
     schreibt nach, Formel, Schreibformel, Rolle, Anzeige. Nur was ein
     Geraet braucht, fehlt hier — Rohwert, Ergebnis und die Auswahl aus
     vorhandenen Objekten. Es gibt kein Geraet, an dem man das messen
     koennte. */
  var setz = function (feldname, wandeln) {
    return function (x, wert) {
      var zz = x.zustaende[nr];
      var w = wandeln ? wandeln(wert) : wert;
      if (w === '' || w === undefined || w === null) { delete zz[feldname]; }
      else { zz[feldname] = w; }
    };
  };
  var setzeFeld = function (feldname, wert, wandeln) {
    vAendern(setz(feldname, wandeln), wert);
  };

  var eingabe = function (wert, feldname, breite, platzhalter, wandeln) {
    var i = el('input', 'tx');
    i.type = 'text';
    i.value = wert === undefined || wert === null ? '' : String(wert);
    if (breite) { i.style.width = breite; }
    if (platzhalter) { i.placeholder = platzhalter; }
    i.addEventListener('click', function (ev) { ev.stopPropagation(); });
    i.addEventListener('change', function () { setzeFeld(feldname, i.value, wandeln); });
    return i;
  };

  dtZeile(d, tr('detail.name'), eingabe(z.name, 'name', '260px', tr('detail.namePlaceholder')));

  /* --- liest aus, mit JSON-Feld daneben --- */
  var qf = el('div', 'fields');
  qf.appendChild(dtFeld(tr('detail.datapoint'),
    eingabe(z.lesen, 'lesen', '260px', z.absolut ? '0_userdata.0.\u2026' : 'stat.POWER')));
  qf.appendChild(dtFeld(tr('detail.jsonField'), eingabe(z.feld, 'feld', '150px', '\u2014')));
  dtZeile(d, tr('detail.readsFrom'), qf);

  /* --- Ersatzquellen --- 
     Dasselbe steht bei Tasmota oft an mehreren Stellen, und welche ein
     Geraet gerade fuehrt, weiss man vorher nicht: die IP liegt in
     tele.INFO2, in tele.STATE oder in stat.STATUS5. Die Werkbank nimmt
     den ersten Weg, bei dem Objekt und Feld wirklich da sind. Ohne
     dieses Feld liess sich das nur in der ausgegebenen Datei aendern. */
  var sonstListe = ersatzListe(z);

  var sb = el('div');
  sonstListe.forEach(function (w, wi) {
    var zeile = el('div', 'fields');
    zeile.style.marginBottom = '5px';

    var setzeErsatz = function (teil, wert) {
      vAendern(function (x) {
        var zz = x.zustaende[nr];
        var liste = ersatzListe(zz);
        if (!liste[wi]) { return; }
        if (wert === '') { delete liste[wi][teil]; } else { liste[wi][teil] = wert; }
        if (!liste[wi].punkt) { liste.splice(wi, 1); }
        schreibeErsatz(zz, liste);
      }, wert);
    };

    var ip1 = el('input', 'tx');
    ip1.type = 'text'; ip1.value = w.punkt || ''; ip1.style.width = '210px';
    ip1.placeholder = 'tele.STATE';
    ip1.addEventListener('click', function (ev) { ev.stopPropagation(); });
    ip1.addEventListener('change', function () { setzeErsatz('punkt', ip1.value); });
    zeile.appendChild(dtFeld(tr('detail.datapoint'), ip1));

    var ip2 = el('input', 'tx');
    ip2.type = 'text'; ip2.value = w.feld || ''; ip2.style.width = '150px';
    ip2.placeholder = '—';
    ip2.addEventListener('click', function (ev) { ev.stopPropagation(); });
    ip2.addEventListener('change', function () { setzeErsatz('feld', ip2.value); });
    zeile.appendChild(dtFeld(tr('detail.jsonField'), ip2));

    var ip3 = el('input', 'tx');
    ip3.type = 'text'; ip3.value = w.leseformel || ''; ip3.style.width = '230px';
    ip3.placeholder = tr('detail.formulaPlaceholder');
    ip3.addEventListener('click', function (ev) { ev.stopPropagation(); });
    ip3.addEventListener('change', function () { setzeErsatz('leseformel', ip3.value); });
    zeile.appendChild(dtFeld(tr('detail.formula'), ip3));

    var x1 = el('button', 'btn schmal', tr('tv.removeFallback'));
    x1.type = 'button';
    x1.addEventListener('click', function (ev) {
      ev.stopPropagation();
      vAendern(function (x) {
        var zz = x.zustaende[nr];
        var liste = ersatzListe(zz);
        liste.splice(wi, 1);
        schreibeErsatz(zz, liste);
      }, null);
    });
    zeile.appendChild(dtFeld(' ', x1));

    sb.appendChild(zeile);
  });

  var plus = el('button', 'btn schmal', tr('tv.addFallback'));
  plus.type = 'button';
  plus.addEventListener('click', function (ev) {
    ev.stopPropagation();
    vAendern(function (x) {
      var zz = x.zustaende[nr];
      var liste = ersatzListe(zz);
      liste.push({ punkt: '' });
      schreibeErsatz(zz, liste);
    }, null);
  });
  sb.appendChild(plus);
  sb.appendChild(el('div', 'sugg', tr('tv.fallbackHint')));
  dtZeile(d, tr('tv.fallback'), sb);

  dtZeile(d, tr('detail.writesTo'),
    eingabe(z.schreiben, 'schreiben', '260px', tr('detail.noWrite')));

  var fb = el('div');
  fb.appendChild(eingabe(z.leseformel, 'leseformel', '100%', tr('detail.formulaPlaceholder')));
  if ((z.typ || '') === 'boolean') {
    fb.appendChild(el('div', 'sugg', tr('detail.formulaHint')));
  }
  dtZeile(d, tr('detail.formula'), fb);

  if (z.schreiben) {
    var wb = el('div');
    wb.appendChild(eingabe(z.schreibformel, 'schreibformel', '100%', tr('detail.writeFormulaPlaceholder')));
    wb.appendChild(el('div', 'sugg', tr('detail.writeFormulaHint')));
    dtZeile(d, tr('detail.writeFormula'), wb);
  }

  dtZeile(d, tr('detail.role'), rollenBlock(z.rolle, v.geraetetyp, function (neu) {
    setzeFeld('rolle', neu);
  }, z.typ, function (t) { setzeFeld('typ', t); }));

  dtZeile(d, tr('detail.display'), anzeigeBlock(
    function (was) {
      if (was === 'einheit') { return z.einheit; }
      if (was === 'dec') { return z.nachkommastellen; }
      if (was === 'caption') { return z.beschriftung; }
      return z.typ;
    },
    function (was, wert) {
      if (was === 'einheit') { return setzeFeld('einheit', wert); }
      if (was === 'dec') { return setzeFeld('nachkommastellen', wert, function (w) { return w === '' ? '' : Number(w); }); }
      if (was === 'caption') { return setzeFeld('beschriftung', wert); }
      setzeFeld('typ', wert);
    }, z.name));

  var haken = function (label, an, tut) {
    var l = el('label', 'fld');
    l.style.flexDirection = 'row';
    l.style.alignItems = 'center';
    l.style.gap = '5px';
    var c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = an;
    c.addEventListener('click', function (ev) { ev.stopPropagation(); });
    c.addEventListener('change', function () { vAendern(function (x) { tut(x.zustaende[nr], c.checked); }); });
    l.appendChild(c);
    l.appendChild(el('span', null, label));
    return l;
  };

  var zeile2 = el('div', 'fields');
  /* Beide Haken laufen in dieselbe Richtung wie im Speichern-Dialog:
     angehakt heisst „ja". Vorher stand hier „freiwillig" und „Vorgabe
     aus" — also zweimal die Umkehrung, was niemand zusammenbringt. */
  zeile2.appendChild(haken(tr('tpls.colDefault'), !z.vorgabeAus,
    function (zz, an) { if (an) { delete zz.vorgabeAus; } else { zz.vorgabeAus = true; } }));

  /* Ein Pflichtpunkt ist zweierlei in einem: er darf beim Anwenden
     nicht fehlen (optional) und er entscheidet ueber die Erkennung
     (erforderlich). Der Haken haelt beides zusammen — sonst koennten
     Liste und Zeile Verschiedenes behaupten. */
  zeile2.appendChild(haken(tr('tpls.colRequired'), istPflichtpunkt(v, z), function (zz, an) {
    var w = vArbeitsstand();
    w.erkennung = w.erkennung || {};
    var liste = (w.erkennung.erforderlich || []).slice();
    var pfad = zz.lesen;
    var i = liste.indexOf(pfad);
    if (an) {
      delete zz.optional;
      if (pfad && i === -1) { liste.push(pfad); }
      if (zz.schreiben && liste.indexOf(zz.schreiben) === -1) { liste.push(zz.schreiben); }
    } else {
      zz.optional = true;
      if (i > -1) { liste.splice(i, 1); }
      var j = zz.schreiben ? liste.indexOf(zz.schreiben) : -1;
      if (j > -1) { liste.splice(j, 1); }
    }
    w.erkennung.erforderlich = liste;
  }));

  zeile2.appendChild(haken(tr('tpls.absolute'), !!z.absolut,
    function (zz, an) { if (an) { zz.absolut = true; } else { delete zz.absolut; } }));
  var wKnopf = el('button', 'btn schmal', tr('tv.removeState'));
  wKnopf.addEventListener('click', function () {
    vAendern(function (x) { x.zustaende.splice(nr, 1); vOffeneZeile = null; });
  });
  zeile2.appendChild(wKnopf);
  dtZeile(d, tr('tv.inTemplate'), zeile2);

  var hw = el('div', 'sugg');
  hw.textContent = tr('tv.flagsHelp');
  dtZeile(d, '', hw);
  return d;
}

function vDuplizieren(v, gleicheKennung) {
  var k = JSON.parse(JSON.stringify(ohneUnterstrich(v)));
  if (gleicheKennung) {
    /* Uebernehmen statt abwandeln: gleiche Kennung, eine Version
       weiter — damit verdeckt sie die mitgelieferte. */
    k.version = (k.version || 1) + 1;
  } else {
    k.id = freierSchluessel(k.id + '-kopie');
    k.version = 1;
    k.rang = eigenerMaxRang() + 10;
    k.name = { de: textIn(k.name, 'de') + ' (Kopie)', en: textIn(k.name, 'en') + ' (copy)' };
  }
  if (typeof k.name === 'string') { k.name = { de: k.name, en: k.name }; }
  vEinlesen = null;
  vEntwurf = k;
  vEntwurf._quelle = 'benutzer';
  vGewaehlt = k.id;
  vLoeschFrage = false;
  zeichneVorlagenListe();
  zeichneErgebnis();
}

/* Ausgeben als Datei — dasselbe Format wie admin/vorlagen/*.json, damit
   eine gut gewordene Vorlage ohne Umbau ins Paket wandern kann. */
function vAusgeben(v) {
  var text = JSON.stringify(ohneUnterstrich(v), null, 2) + '\n';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = v.id + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

export function vEinlesenDatei(datei) {
  var leser = new FileReader();
  leser.onload = function () {
    var roh;
    try { roh = JSON.parse(String(leser.result)); } catch { roh = null; }
    var fehler = vPruefeEingelesen(roh);
    if (fehler) {
      vEinlesen = null;
      var host = $('#res');
      host.textContent = '';
      var w = el('div', 'aside w');
      w.appendChild(el('b', null, tr('tv.importBad')));
      w.appendChild(document.createTextNode(' ' + fehler));
      host.appendChild(w);
      return;
    }
    vEinlesen = ohneUnterstrich(roh);
    vEinlesen._quelle = 'benutzer';
    vEntwurf = null;
    vLoeschFrage = false;
    zeichneVorlagenListe();
    zeichneErgebnis();
  };
  leser.readAsText(datei);
}

/* Was eingelesen wird, wird gespeichert — und danach an jedem Geraet
   ausgewertet. Geprueft wurden bisher nur `id` und `zustaende`.

   Zwei Wege in den Totalschaden: `erkennung.erforderlich` als Text
   statt als Liste laesst `pruefeVorlage` an JEDEM Geraet werfen
   („map is not a function", gemessen 09.09.2026), ein fehlendes `name`
   wirft schon beim Oeffnen im Blatt. Die Knopfleiste „Einlesen und
   speichern" steht zu diesem Zeitpunkt laengst im DOM — man konnte
   also eine Vorlage speichern, die den Reiter danach unbrauchbar
   machte.

   Listenfelder werden nicht abgewiesen, wenn ein einzelner Text
   gemeint sein kann: `erforderlich: "tele.STATE"` ist eindeutig und
   wird zur Liste gemacht. Abgewiesen wird nur, was keinen Sinn ergibt. */
function vPruefeEingelesen(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) { return tr('tv.badNotObject'); }
  if (!o.id || typeof o.id !== 'string') { return tr('tv.badNoId'); }
  if (!Array.isArray(o.zustaende) || !o.zustaende.length) { return tr('tv.badNoStates'); }
  var schlecht = o.zustaende.filter(function (z) { return !z || !z.name || !z.lesen; });
  if (schlecht.length) { return tr('tv.badState', schlecht.length); }

  if (o.name !== undefined &&
      !(typeof o.name === 'string' ||
        (o.name && typeof o.name === 'object' && !Array.isArray(o.name)))) {
    return tr('tv.badName');
  }
  if (o.erkennung !== undefined &&
      (!o.erkennung || typeof o.erkennung !== 'object' || Array.isArray(o.erkennung))) {
    return tr('tv.badRecog');
  }
  var erk = o.erkennung || {};
  var listen = ['erforderlich', 'verboten'];
  for (var i = 0; i < listen.length; i++) {
    var w = erk[listen[i]];
    if (w === undefined) { continue; }
    if (typeof w === 'string') { erk[listen[i]] = [w]; continue; }
    if (!Array.isArray(w) || w.some(function (x) { return typeof x !== 'string'; })) {
      return tr('tv.badList', listen[i]);
    }
  }
  if (erk.inhalt !== undefined &&
      (!erk.inhalt || typeof erk.inhalt !== 'object' || Array.isArray(erk.inhalt))) {
    return tr('tv.badContent');
  }
  if (erk.namenshinweis !== undefined &&
      (typeof erk.namenshinweis !== 'string' || !hinweisTaugt(erk.namenshinweis))) {
    return tr('tv.badNameHint');
  }
  /* Ein Musternamen, den dieser Detector nicht kennt, wirft spaeter in
     der Musterwahl — und der Entwurf wird dann gar nicht erst
     gezeichnet. Lieber hier abweisen, wo noch jemand zusieht. */
  if (o.geraetetyp !== undefined &&
      (typeof o.geraetetyp !== 'string' || (o.geraetetyp && !musterVon(o.geraetetyp)))) {
    return tr('tv.badType', String(o.geraetetyp));
  }
  return null;
}

function vSpeichern() {
  var v = vArbeitsstand();
  if (!v) { return; }
  var rein = ohneUnterstrich(v);

  /* Aendert sich der Inhalt, zaehlt die Version weiter. Sonst traegt
     jedes Geraet fuer immer „vorlageVersion: 1" und gilt als aktuell —
     ein spaeteres Nachziehen haette nie etwas zu melden. Das Duplizieren
     zaehlte schon hoch, das Speichern nicht. */
  var alt = vorlageMitId(rein.id);
  if (alt) {
    var ohneV = function (x) {
      var k = JSON.parse(JSON.stringify(ohneUnterstrich(x)));
      delete k.version;
      return JSON.stringify(k);
    };
    /* Nie unter das fallen, was der Arbeitsstand schon traegt: beim
       Duplizieren einer mitgelieferten Vorlage steht dort bereits eine
       Version hoeher, damit die Kopie das Original verdeckt. Wuerde man
       stumpf die gespeicherte uebernehmen, faende die Kopie zurueck auf
       die Version des Pakets. */
    var vorschlag = Number(rein.version) || 1;
    var altV = Number(alt.version) || 1;
    rein.version = (ohneV(alt) !== ohneV(rein))
      ? Math.max(vorschlag, altV + 1)
      : Math.max(vorschlag, altV);
  }
  aendereVorlagen(rein.id, rein, function (err) {
    if (err) { return vMeldung(tr('tpls.failed') + ' ' + err, true); }
    ladeVorlagen(function () {
      vEinlesen = null; vEntwurf = null; vGewaehlt = rein.id;
      setzeMeta();
      zeichneVorlagenListe();
      zeichneErgebnis();
    });
  });
}

function vLoeschen(id) {
  aendereVorlagen(id, null, function (err) {
    if (err) { return vMeldung(tr('tpls.failed') + ' ' + err, true); }
    ladeVorlagen(function () {
      vEinlesen = null; vEntwurf = null; vLoeschFrage = false;
      vGewaehlt = vorlageMitId(id) ? id : null;
      setzeMeta();
      zeichneVorlagenListe();
      zeichneErgebnis();
    });
  });
}

function vMeldung(text, schlecht) {
  var host = $('#res');
  host.textContent = '';
  var w = el('div', 'aside' + (schlecht ? ' w' : ''));
  w.appendChild(el('b', null, text));
  host.appendChild(w);
}

/* ================== Aus einem Geraet eine Vorlage machen ==================
   Die Gegenrichtung zu wendeAn. Ableitbar ist, welche Punkte benutzt
   werden und wie sie gelesen werden. Nicht ableitbar ist, welche davon
   ein Geraet zu diesem Geraetetyp machen und woran man es am Namen
   erkennt — danach fragt der Dialog. */


export function textIn(n, l) {
  if (!n) { return ''; }
  if (typeof n === 'string') { return n; }
  return n[l] || n.en || n.de || '';
}

function relZu(id, kanal) {
  if (id && id.indexOf(kanal + '.') === 0) { return { p: kurz(id, kanal), abs: false }; }
  return { p: id || '', abs: true };
}

/* stat.POWER1 → stat.POWER%N%. Ersetzt wird nur am Ende eines
   Abschnitts und nur, wenn davor noch etwas steht — sonst wuerde aus
   ENERGY.Power beim Speichern Unsinn. */
function zuPlatzhalter(pfad, inst, vorspaenne) {
  var i = (inst === null || inst === undefined) ? '' : String(inst);
  if (!i) { return pfad; }
  return String(pfad).split('.').map(function (t) {
    if (!(t.length > i.length && t.slice(-i.length) === i)) { return t; }
    /* Nicht jede Endziffer ist eine Ausgangsnummer.

       Ersetzt wurde rein nach Endziffer: an einem Mehrfachgeraet mit
       Ausgang 2 wurde damit auch die IP-Zeile aus `tele.INFO2` zu
       `tele.INFO%N%` (gemessen 09.09.2026). Der Schaden zeigt sich erst
       am naechsten Geraet — und an Ausgang 1 meldete `andereAusgaenge`
       dieselbe Zeile als fremden Ausgang, „Andere weglassen" warf sie
       hinaus. `INFO2` heisst bei Tasmota die zweite Info-Seite, an
       jedem Ausgang gleich. */
    return (vorspaenne.indexOf(t.slice(0, -i.length)) === -1)
      ? t : t.slice(0, -i.length) + '%N%';
  }).join('.');
}

/* Welche Vorspaenne tragen wirklich die Ausgangsnummer?

   Drei Quellen, in dieser Reihenfolge belastbar: was die Vorlage im
   Original schon mit `%N%` fuehrte, der Vorspann aus `kanalname`
   (`POWER%N%` → `POWER`), und was mit derselben Nummer mehrfach
   vorkommt — `cmnd.POWER2` und `stat.POWER2` sagen gemeinsam mehr als
   ein einzelnes `tele.INFO2`. */
function ausgangsVorspaenne(zeilen, k) {
  var i = (k.instanz === null || k.instanz === undefined) ? '' : String(k.instanz);
  var raus = [];
  var dazu = function (v) { if (v && raus.indexOf(v) === -1) { raus.push(v); } };

  var kn = String(k.kanalname || 'POWER%N%');
  if (kn.indexOf('%N%') !== -1) { dazu(kn.split('%N%')[0]); }

  ((k.quelle && k.quelle.zustaende) || []).forEach(function (z) {
    [z.lesen, z.schreiben].forEach(function (pf) {
      String(pf || '').split('.').forEach(function (t) {
        var n = t.indexOf('%N%');
        if (n > 0) { dazu(t.slice(0, n)); }
      });
    });
  });

  if (i) {
    var wie = {};
    (zeilen || []).forEach(function (r) {
      if (r.weg) { return; }
      [r.lesenAbs ? '' : r.lesenRoh, r.schreibenAbs ? '' : r.schreibenRoh].forEach(function (pf) {
        String(pf || '').split('.').forEach(function (t) {
          if (t.length > i.length && t.slice(-i.length) === i) {
            var v = t.slice(0, -i.length);
            wie[v] = (wie[v] || 0) + 1;
          }
        });
      });
    });
    Object.keys(wie).forEach(function (v) { if (wie[v] > 1) { dazu(v); } });
  }
  return raus;
}

/* Welcher Pfad steht am Ende in der Vorlage? Bei einem Mehrfachgeraet
   tritt der Platzhalter an die Stelle der Ausgangsnummer. */
function zPfad(r, k, schreibend, zeilen) {
  var roh = schreibend ? r.schreibenRoh : r.lesenRoh;
  var abs = schreibend ? r.schreibenAbs : r.lesenAbs;
  if (!roh) { return ''; }
  if (!k.mehrfach || abs || !k.instanz) { return roh; }
  return zuPlatzhalter(roh, k.instanz,
    ausgangsVorspaenne(zeilen || (S.tplZ && S.tplZ.zeilen) || [], k));
}

/* Endet die Nummer eines Ausgangs in den Pfaden? Haeufigste Zahl am
   Ende eines Abschnitts gewinnt — cmnd.POWER1, stat.POWER1 sagen 1. */
function rateInstanz(zeilen, geraetName, vorspann) {
  var zaehler = {}, nurVorspann = {};
  zeilen.forEach(function (r) {
    if (r.lesenAbs) { return; }
    String(r.lesenRoh).split('.').forEach(function (t) {
      var m = /^(.*[^0-9])([0-9]{1,2})$/.exec(t);
      if (!m) { return; }
      zaehler[m[2]] = (zaehler[m[2]] || 0) + 1;
      if (vorspann && m[1] === vorspann) { nurVorspann[m[2]] = (nurVorspann[m[2]] || 0) + 1; }
    });
  });
  /* Zaehlt der Vorspann des Ausgangs mit (`POWER%N%` → `POWER`), gilt
     allein er: sonst hob ein `tele.INFO2` die Nummer eines Geraets an,
     das gar keinen zweiten Ausgang hat. Findet sich damit nichts,
     bleibt es beim alten Weg — besser eine geratene Nummer als keine. */
  if (Object.keys(nurVorspann).length) { zaehler = nurVorspann; }
  var mn = /^(.*[^0-9])([0-9]{1,2})$/.exec(geraetName || '');
  if (mn) { zaehler[mn[2]] = (zaehler[mn[2]] || 0) + 1; }
  var beste = '', wie = 0;
  Object.keys(zaehler).forEach(function (n) {
    if (zaehler[n] > wie || (zaehler[n] === wie && Number(n) < Number(beste))) {
      beste = n; wie = zaehler[n];
    }
  });
  return beste;
}

/* Eine Mehrfachvorlage beschreibt genau einen Ausgang — die anderen
   entstehen daraus. Zeigt der Entwurf noch auf POWER2, POWER3 …, waere
   die Vorlage an dieses eine Geraet gefesselt. Also einsammeln und
   sagen, statt still etwas Falsches zu speichern. */
function andereAusgaenge(zeilen, instanz, vorspaenne) {
  var raus = { punkte: [], nummern: [] };
  if (!instanz) { return raus; }
  var vs = vorspaenne || [];
  zeilen.forEach(function (r) {
    if (r.weg || r.lesenAbs) { return; }
    var fremd = null;
    String(r.lesenRoh).split('.').forEach(function (t) {
      var m = /^(.*[^0-9])([0-9]{1,2})$/.exec(t);
      /* Dieselbe Regel wie beim Platzhalter: nur was den Ausgang traegt.
         Sonst stand `tele.INFO2` an Ausgang 1 als fremder Ausgang da,
         und „Andere weglassen" warf die IP-Zeile hinaus. */
      if (m && m[2] !== String(instanz) && vs.indexOf(m[1]) !== -1) { fremd = m[2]; }
    });
    if (fremd) {
      raus.punkte.push(r.name);
      if (raus.nummern.indexOf(fremd) === -1) { raus.nummern.push(fremd); }
    }
  });
  raus.nummern.sort(function (a, b) { return Number(a) - Number(b); });
  return raus;
}

function schluesselAus(text) {
  return String(text || '').toLowerCase()
    .split('ä').join('ae').split('ö').join('oe').split('ü').join('ue').split('ß').join('ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').replace(/-+$/, '') || 'vorlage';
}

/* Der Rang entscheidet nur zwischen Vorlagen derselben Herkunft — der
   Zuschlag fuer „eigene" liegt in der Bewertung ueber jedem moeglichen
   Rang. Deshalb wird beim Vergeben auch nur im eigenen Zahlenraum
   gezaehlt: sonst schoebe eine mitgelieferte Vorlage mit hohem Rang die
   Nummern des Benutzers mit jedem Update vor sich her, ohne dass sich am
   Verhalten irgendetwas aenderte. */
function eigenerMaxRang() {
  var m = 0;
  S.VORLAGEN.forEach(function (v) {
    if (v._quelle === 'benutzer' && (v.rang || 0) > m) { m = v.rang || 0; }
  });
  return m;
}

function freierSchluessel(basis) {
  var da = {};
  S.VORLAGEN.forEach(function (v) { da[v.id] = 1; });
  if (!da[basis]) { return basis; }
  for (var i = 2; i < 99; i++) { if (!da[basis + '-' + i]) { return basis + '-' + i; } }
  return basis + '-neu';
}

export function vorlagenVorbereiten(e) {
  var quelle = null;
  S.VORLAGEN.forEach(function (v) { if (v.id === e.vorlage) { quelle = v; } });
  var maxRang = eigenerMaxRang();

  var mehrfach = !!(quelle && quelle.mehrfach);
  var inst = mehrfach ? e.instanz : null;

  var zeilen = [];
  e.states.forEach(function (s) {
    if (!s.n || !s.srcR) { return; }
    var r = relZu(s.srcR, e.kanal);
    var w = (s.srcW && s.srcW !== s.srcR) ? relZu(s.srcW, e.kanal) : null;
    var zv = null;
    if (quelle && s.ausVorlage) {
      (quelle.zustaende || []).forEach(function (z) { if (z.name === s.ausVorlage) { zv = z; } });
    }
    zeilen.push({
      s: s,
      name: s.n,
      /* Roh heisst: relativ zum Geraet, aber noch mit der konkreten
         Ausgangsnummer. Der Platzhalter wird erst gesetzt, wenn er
         gebraucht wird — sonst liesse sich der Haken „mehrere
         Ausgaenge" nicht mehr umlegen. */
      lesenRoh: r.p,
      lesenAbs: r.abs,
      schreibenRoh: w ? w.p : '',
      schreibenAbs: w ? w.abs : false,
      aus: !s.on,
      /* Vorschlag: was einen Schreibweg hat, traegt das Geraet. Was aus
         einer Vorlage kam, erbt deren Einstufung. Von Hand ergaenzte
         Punkte bleiben freiwillig — jeder Pflichtpunkt macht die
         Vorlage genauer und zugleich sproeder. */
      pflicht: r.abs ? false : (zv ? !zv.optional : !!w)
    });
  });

  var inhalte = [];
  zeilen.forEach(function (z) {
    var f = feldAusFormel(z.s.f);
    if (!f || z.lesenAbs) { return; }
    var oben = f.split('.')[0];
    var da = false;
    inhalte.forEach(function (x) { if (x.punkt === z.lesenRoh && x.feld === oben) { da = true; } });
    if (!da) { inhalte.push({ punkt: z.lesenRoh, feld: oben, an: false }); }
  });
  if (quelle && quelle.erkennung && quelle.erkennung.inhalt) {
    Object.keys(quelle.erkennung.inhalt).forEach(function (p) {
      var da = false;
      inhalte.forEach(function (x) {
        if (x.punkt === p) { da = true; x.an = true; x.feld = quelle.erkennung.inhalt[p]; }
      });
      if (!da) { inhalte.push({ punkt: p, feld: quelle.erkennung.inhalt[p], an: true }); }
    });
  }

  var geraetName = (e.kanal || '').split('.').pop();
  return {
    e: e,
    zeilen: zeilen,
    inhalte: inhalte,
    kopf: {
      modus: quelle ? 'update' : 'neu',
      quelle: quelle,
      id: quelle ? quelle.id : freierSchluessel(schluesselAus(geraetName)),
      nameDe: quelle ? textIn(quelle.name, 'de') : geraetName,
      nameEn: quelle ? textIn(quelle.name, 'en') : geraetName,
      geraetetyp: e.want || (quelle ? quelle.geraetetyp : '') || '',
      /* Was die Vorlage schon sagt, gilt; sonst das, was am Geraet
         eingestellt ist. Wer eine Vorlage aus einem Geraet baut, hat die
         Funktion dort meist gerade gesetzt - sie noch einmal auswaehlen
         zu muessen waere Arbeit ohne Gewinn. */
      funktion: (quelle && quelle.funktion) || kennungZuFunktion(e.funktion) || '',
      namenshinweis: quelle ? ((quelle.erkennung || {}).namenshinweis || '') : '',
      rang: quelle ? (quelle.rang || 0) : maxRang + 10,
      maxRang: maxRang,
      mehrfach: mehrfach,
      instanz: mehrfach ? String(inst === null || inst === undefined ? '' : inst)
                        : rateInstanz(zeilen, geraetName,
                            String((quelle && quelle.kanalname) || 'POWER%N%').split('%N%')[0]),
      kanalname: (quelle && quelle.kanalname) ? quelle.kanalname : 'POWER%N%',
      verboten: quelle ? (((quelle.erkennung || {}).verboten) || []).join(', ') : '',
      geraetName: geraetName
    }
  };
}

/* Der Entwurf als Vorlagenobjekt — genau das, was gespeichert wird. */
export function baueVorlage(z) {
  var k = z.kopf;
  var v = {
    id: k.id,
    version: k.modus === 'update' && k.quelle ? (k.quelle.version || 1) + 1 : 1,
    rang: Number(k.rang) || 0,
    name: { de: k.nameDe || k.id, en: k.nameEn || k.nameDe || k.id },
    geraetetyp: k.geraetetyp || undefined,
    funktion: k.funktion || undefined,
    erkennung: {}
  };

  var erf = [];
  z.zeilen.forEach(function (r) {
    if (r.weg || !r.pflicht || r.lesenAbs) { return; }
    var lp = zPfad(r, k, false, z.zeilen);
    var sp = zPfad(r, k, true, z.zeilen);
    if (erf.indexOf(lp) === -1) { erf.push(lp); }
    if (sp && !r.schreibenAbs && erf.indexOf(sp) === -1) { erf.push(sp); }
  });
  v.erkennung.erforderlich = erf;

  var verb = String(k.verboten || '').split(',').map(function (x) { return x.trim(); })
    .filter(function (x) { return !!x; });
  /* Ein Punkt kann nicht zugleich Pflicht und verboten sein — so eine
     Vorlage passt auf gar nichts. Der Widerspruch entsteht leicht: man
     traegt unten „darf es nicht geben" ein und vergisst, dass derselbe
     Punkt oben schon „muss da sein" ist. */
  v.widerspruch = verb.filter(function (x) { return erf.indexOf(x) !== -1; });
  if (verb.length) { v.erkennung.verboten = verb; }

  var inh = {};
  z.inhalte.forEach(function (x) { if (x.an) { inh[x.punkt] = x.feld; } });
  if (Object.keys(inh).length) { v.erkennung.inhalt = inh; }
  if (k.namenshinweis) { v.erkennung.namenshinweis = k.namenshinweis; }

  if (k.mehrfach && k.instanz) {
    v.mehrfach = { platzhalter: '%N%' };
    v.kanalname = k.kanalname || 'POWER%N%';
  }

  v.zustaende = z.zeilen.filter(function (r) { return !r.weg; }).map(function (r) {
    var s = r.s;
    var f = feldAusFormel(s.f);
    var zu = {
      name: r.name,
      rolle: s.role || undefined,
      typ: s.typ || undefined,
      einheit: s.unit || undefined,
      lesen: zPfad(r, k, false, z.zeilen)
    };
    if (r.lesenAbs) { zu.absolut = true; }
    if (r.schreibenRoh) { zu.schreiben = zPfad(r, k, true, z.zeilen); }
    if (f) { zu.feld = f; } else if (s.f) { zu.leseformel = s.f; }
    if (s.fw && r.schreibenRoh) { zu.schreibformel = s.fw; }
    if (!r.pflicht) { zu.optional = true; }
    if (r.aus) { zu.vorgabeAus = true; }
    if (s.caption) { zu.beschriftung = s.caption; }
    if (s.dec !== undefined && s.dec !== '') { zu.nachkommastellen = Number(s.dec); }
    if (s.states) { zu.werteliste = s.states; }
    if (s.hinweis) { zu.hinweis = s.hinweis; }
    /* Was die Vorlage sonst noch als Lesequelle kannte. Der gerade
       genommene Weg steht schon in `lesen` und faellt hier weg. */
    if (s.wege && s.wege.length > 1) {
      var rest = s.wege.filter(function (w) { return w.punkt !== zu.lesen; })
        .map(function (w) {
          var o = { punkt: w.punkt };
          if (w.feld) { o.feld = w.feld; }
          /* `leseformel`, nicht `formel`. `wendeAn` legt die Wege mit
             dem Schluessel `formel` ab, jeder Leser sucht in
             `lesenSonst` aber `leseformel` (vorlagen.js:462,
             vorlagenblatt.js:720). Die Formel jeder Ersatzquelle ging
             beim Aktualisieren still verloren: bei tasmota-steckdose
             landete der boolesche Alias an Geraeten ohne `stat.POWER`
             danach auf dem rohen JSON-Text von `tele.STATE` statt auf
             `POWER` (gemessen 09.09.2026). */
          if (w.formel) { o.leseformel = w.formel; }
          return o;
        });
      if (rest.length) { zu.lesenSonst = (rest.length === 1) ? rest[0] : rest; }
    }
    return zu;
  });

  /* Das Rollenwissen: alles, was am Geraet liegt und keine Zeile der
     Vorlage ist, wandert als Pfad→Rolle mit. Der Vorschlag ignoriert
     es; die Ansicht „Alle Datenpunkte des Geraets" liest daraus die
     Rollen, die hm-rpc am Geraet leer laesst. Rangfolge je Punkt: was
     die aktuelle Zeile sagt (Handarbeit im Entwurf), dann das
     gepflegte Wissen der Ursprungsvorlage, zuletzt die Geraeterolle.
     Ohne Rolle kein Eintrag - leeres Wissen hilft niemandem. */
  var zeilenQuellen = {};
  z.zeilen.forEach(function (r) {
    if (r.weg) { return; }
    if (r.lesenRoh && !r.lesenAbs) { zeilenQuellen[r.lesenRoh] = true; }
    if (r.schreibenRoh && !r.schreibenAbs) { zeilenQuellen[r.schreibenRoh] = true; }
  });
  var altesWissen = (k.modus === 'update' && k.quelle && k.quelle.weiterePunkte) || {};
  var wissen = {};
  kindZustaende(z.e.kanal).forEach(function (id) {
    var rel = relZu(id, z.e.kanal);
    if (rel.abs || zeilenQuellen[rel.p]) { return; }
    var zeilenRolle = '';
    z.e.states.forEach(function (s0) {
      if (!zeilenRolle && s0.srcR === id && s0.role) { zeilenRolle = s0.role; }
    });
    var o0 = S.objects[id];
    var rolle = zeilenRolle || altesWissen[rel.p] ||
                ((o0 && o0.common && o0.common.role) || '');
    if (rolle) { wissen[rel.p] = rolle; }
  });
  /* Gepflegtes Wissen zu Punkten, die dieses eine Geraet gerade nicht
     hat, bleibt erhalten - andere Geraete des Typs haben sie. */
  Object.keys(altesWissen).forEach(function (pf) {
    if (!zeilenQuellen[pf] && !wissen[pf]) { wissen[pf] = altesWissen[pf]; }
  });
  if (Object.keys(wissen).length) { v.weiterePunkte = wissen; }

  /* Was die Ursprungsvorlage sonst noch mitbringt — etwa
     nebenwirkungen — bleibt erhalten. Sonst fiele beim Aktualisieren
     still unter den Tisch, was der Dialog gar nicht anzeigt. */
  var bekannt = { id: 1, version: 1, rang: 1, name: 1, geraetetyp: 1,
                  funktion: 1, erkennung: 1, mehrfach: 1, kanalname: 1,
                  zustaende: 1, weiterePunkte: 1 };
  if (k.modus === 'update' && k.quelle) {
    Object.keys(k.quelle).forEach(function (feld) {
      if (feld.charAt(0) === '_' || bekannt[feld]) { return; }
      v[feld] = k.quelle[feld];
    });
  }

  return JSON.parse(JSON.stringify(v));      /* undefined weg */
}

/* Kandidaten fuer den Probelauf. Nicht jeder Knoten im Baum — nur die,
   unter denen der erste Pflichtpunkt ueberhaupt vorkommt. Sonst muesste
   hatPunkt fuer tausende Knoten die Kleinschreibkarte aufbauen, und das
   dauert auf einer grossen Anlage sichtbar lange. */
function kandidatenFuer(v) {
  var erk = v.erkennung || {};
  var erf = erk.erforderlich || [];
  if (!erf.length) { return []; }
  var ph = v.mehrfach ? (v.mehrfach.platzhalter || '%N%') : null;
  var raus = {};

  function sammle(pfad) {
    var teile = ph ? String(pfad).split(ph) : [String(pfad)];
    var vorn = teile[0];
    if (vorn) {
      var suche = ('.' + vorn).toLowerCase();
      S.keysSorted.forEach(function (id) {
        if (id.indexOf('alias.') === 0) { return; }
        if (!S.objects[id] || S.objects[id].type !== 'state') { return; }
        var i = id.toLowerCase().indexOf(suche);
        if (i < 1) { return; }
        var kanal = id.slice(0, i);
        if (kanal.split('.').length >= 3) { raus[kanal] = 1; }
      });
      return;
    }

    /* Der Platzhalter kann auch ganz vorn stehen. Eine Tasmota nennt
       ihre Ausgaenge cmnd.POWER%N% — da bleibt ein Vorspann uebrig, an
       dem sich der Kanal abschneiden laesst. Ein Homematic-Doppelaktor
       nennt sie %N%.STATE, und dann ist der Vorspann leer: der Kanal
       ist die Nummer selbst. Frueher stieg die Suche hier aus und die
       Vorlage fand kein einziges Geraet. Jetzt laeuft sie ueber den
       Nachspann und nimmt das Segment davor als Ausgangsnummer. */
    var nach = (teile[1] || '').toLowerCase();
    if (!nach) { return; }
    S.keysSorted.forEach(function (id) {
      if (id.indexOf('alias.') === 0) { return; }
      if (!S.objects[id] || S.objects[id].type !== 'state') { return; }
      if (id.toLowerCase().slice(-nach.length) !== nach) { return; }
      var t = id.slice(0, id.length - nach.length).split('.');
      t.pop();
      if (t.length >= 3) { raus[t.join('.')] = 1; }
    });
  }

  sammle(erf[0]);
  /* Auch ueber die Inhaltspruefung suchen. Ein Geraet, das seine
     Ausgaenge nur in tele/STATE meldet und noch keinen cmnd-Punkt hat,
     waere sonst kein Kandidat — der Probelauf einer Mehrfach-Vorlage
     fand ein Geraet statt vier. Was am Ende wirklich passt, entscheidet
     `pruefeVorlage`; hier geht es nur darum, niemanden zu uebersehen. */
  Object.keys(erk.inhalt || {}).forEach(sammle);

  return Object.keys(raus).sort();
}

/* Der Probelauf braucht Werte, nicht nur Objekte.
   `pruefeVorlage` prueft auch `erkennung.inhalt` und schaut dafuer in
   den Wert des Punktes — steht dort nichts, gilt die Vorlage als
   unpassend. Geladen werden die Werte aber nur fuer den gewaehlten
   Kanal, und im Vorlagen-Tab ist keiner gewaehlt. Also meldete jede
   Vorlage mit `inhalt` „0 Geraete getroffen", auch die, die im
   Quellen-Tab zwanzig Geraete erkennt.

   Hier werden die fehlenden Werte einmal nachgeladen und danach neu
   gezeichnet. Was einmal vergeblich abgefragt wurde, wird nicht wieder
   abgefragt — sonst laedt ein Punkt ohne Wert endlos. */
var probeGeholt = {};

function probeWerteHolen(v, danach) {
  var erk = v.erkennung || {};
  if (!erk.inhalt) { return false; }
  var ph = v.mehrfach ? (v.mehrfach.platzhalter || '%N%') : null;
  var fehlt = [];
  kandidatenFuer(v).forEach(function (kanal) {
    Object.keys(erk.inhalt).forEach(function (p0) {
      var pfad = ph ? String(p0).split(ph).join('1') : p0;
      var id = hatPunkt(kanal, pfad);
      if (id && S.werte[id] === undefined && !probeGeholt[id]) { fehlt.push(id); }
    });
  });
  if (!fehlt.length) { return false; }
  var offen = fehlt.length;
  fehlt.forEach(function (id) {
    probeGeholt[id] = 1;
    socket.emit('getState', id, function (err, st) {
      if (!err && st) { S.werte[id] = st; }
      if (--offen === 0) { danach(); }
    });
  });
  return true;
}

/* Was faengt diese Vorlage, und wer gewinnt dort heute? */
export function probelauf(vorlage, alsEigene) {
  /* Nie am Original arbeiten — sonst stuende hinterher _quelle im
     gespeicherten JSON. */
  var neu = JSON.parse(JSON.stringify(vorlage));
  /* Nur rechnen, was auch zutrifft. Eine eigene Vorlage bekommt in der
     Bewertung 1000 Punkte Vorsprung; setzte man das hier immer, meldete
     das Blatt einer mitgelieferten Vorlage Siege, die sie nie erringt —
     Steckdose 18 und Lampe 23 „gewonnen" bei 26 Geraeten, obwohl je
     Geraet nur eine gewinnen kann. Im Dialog „Als Vorlage speichern"
     stimmt es dagegen: dort wird sie gerade zu einer eigenen. */
  if (alsEigene) { neu._quelle = 'benutzer'; }
  var raus = [];
  kandidatenFuer(neu).forEach(function (p) {
    var t = pruefeVorlage(neu, p);
    if (!t.passt) { return; }

    /* Wer gewinnt hier heute, mit dem Bestand wie er ist? Beim
       Aktualisieren ist das oft die Vorlage selbst — dann wechselt
       nichts, auch wenn sie den Vergleich gegen alle anderen gewinnt. */
    var jetzt = null, andere = null;
    S.VORLAGEN.forEach(function (v) {
      var x = pruefeVorlage(v, p);
      if (!x.passt) { return; }
      if (!jetzt || x.punkte > jetzt.punkte) { jetzt = x; }
      if (v.id !== neu.id && (!andere || x.punkte > andere.punkte)) { andere = x; }
    });
    raus.push({
      id: p, eigen: t, gegner: andere,
      gewinnt: !andere || t.punkte > andere.punkte,
      wechsel: !!(jetzt && jetzt.vorlage.id !== neu.id &&
                  (!andere || t.punkte > andere.punkte))
    });
  });
  return raus;
}

export function tplKnopf(an) {
  var b = $('#btn-tpl');
  if (b) {
    b.disabled = !an;
    b.title = an ? '' : tr('tpls.pickDeviceFirst');
  }
}

export function zeigeVorlagenDialog() {
  if (!S.entwurf || !S.current) { return; }
  S.tplZ = vorlagenVorbereiten(S.entwurf);
  var b = $('#btn-tpl-save');
  if (b) { b.hidden = false; b.disabled = false; }
  zeichneVorlagenDialog();
  $('#dlg-tpl').showModal();
}

/* Zeigt die Kennung auf eine fremde Vorlage?

   `freierSchluessel` laeuft beim Radio-Wechsel und beim Vorbereiten,
   nicht nach der Handeingabe im Kennungsfeld. `aendereVorlagen` ersetzt
   bei gleicher Kennung ohne Rueckfrage (`liste[i] = vorlage`), im Modus
   „neu" sogar mit Version 1: Wer die Kennung einer anderen eigenen
   Vorlage eintippte, ueberschrieb sie still — gemessen 09.09.2026, aus
   „I30 Opfer" v7 mit einem Zustand wurde „Tasmota-Lampe" v1 mit
   vierzehn. Die eigene Quelle ist ausgenommen: sie zu ersetzen ist ja
   gerade der Sinn von „aktualisieren". */
function fremdeMitId(k) {
  if (!k || !k.id) { return null; }
  var t = vorlageMitId(k.id);
  if (!t) { return null; }
  if (k.modus === 'update' && k.quelle && k.quelle.id === k.id) { return null; }
  return t;
}

function tplFeld(label, wert, aendern, breit) {
  var l = el('label', 'feld');
  l.appendChild(el('span', 'feldlabel', label));
  var i = document.createElement('input');
  i.className = 'tx';
  i.type = 'text';
  i.value = wert === undefined || wert === null ? '' : String(wert);
  if (breit) { i.style.minWidth = breit; }
  i.addEventListener('input', function () { aendern(i.value); });
  i.addEventListener('change', function () { aendern(i.value); zeichneVorlagenDialog(); });
  l.appendChild(i);
  return l;
}

export function zeichneVorlagenDialog() {
  var z = S.tplZ;
  if (!z) { return; }
  var k = z.kopf;
  var body = $('#tpl-body');
  body.textContent = '';

  /* --- aktualisieren oder neu --- */
  if (k.quelle) {
    var wahl = el('div', 'card');
    wahl.style.marginBottom = '11px';
    var wh = el('div', 'ch');
    wh.appendChild(el('span', 'typ', tr('tpls.whatToDo')));
    wahl.appendChild(wh);
    var wb = el('div');
    wb.style.padding = '9px 12px 11px';
    [['update', tr('tpls.updateIt', textIn(k.quelle.name, sprache), (k.quelle.version || 1) + 1),
      k.quelle._quelle === 'paket' ? tr('tpls.shadowsPackage') : ''],
     ['neu', tr('tpls.saveAsNew'), tr('tpls.saveAsNewHint')]].forEach(function (w) {
      var r = el('label');
      r.style.display = 'block';
      r.style.margin = '3px 0';
      r.style.fontSize = '12.5px';
      var rb = document.createElement('input');
      rb.type = 'radio';
      rb.name = 'tplmodus';
      rb.checked = k.modus === w[0];
      rb.addEventListener('change', function () {
        if (!rb.checked) { return; }
        k.modus = w[0];
        if (w[0] === 'neu') {
          k.id = freierSchluessel(schluesselAus(k.nameDe || k.geraetName));
          k.rang = k.maxRang + 10;
        } else {
          k.id = k.quelle.id;
          k.rang = k.quelle.rang || 0;
        }
        zeichneVorlagenDialog();
      });
      r.appendChild(rb);
      r.appendChild(document.createTextNode(' ' + w[1]));
      if (w[2]) {
        var hn = el('span', 'chip mut', w[2]);
        hn.style.marginLeft = '6px';
        r.appendChild(hn);
      }
      wb.appendChild(r);
    });
    wahl.appendChild(wb);
    body.appendChild(wahl);
  }

  /* --- Kopfdaten --- */
  var kk = el('div', 'card');
  kk.style.marginBottom = '11px';
  var kh = el('div', 'ch');
  kh.appendChild(el('span', 'typ', tr('tpls.head')));
  kh.appendChild(el('span', 'chip mut', k.id));
  kk.appendChild(kh);
  var kb = el('div');
  kb.style.padding = '9px 12px 11px';
  kb.style.display = 'flex';
  kb.style.flexWrap = 'wrap';
  kb.style.gap = '9px 14px';

  kb.appendChild(tplFeld(tr('tpls.nameDe'), k.nameDe, function (x) { k.nameDe = x; }, '150px'));
  kb.appendChild(tplFeld(tr('tpls.nameEn'), k.nameEn, function (x) { k.nameEn = x; }, '150px'));
  var kf = tplFeld(tr('tpls.id'), k.id, function (x) { k.id = schluesselAus(x); }, '150px');
  var stoert = fremdeMitId(k);
  if (stoert) {
    var kw = el('span', 'hint');
    kw.style.color = 'var(--bad)';
    kw.style.flexBasis = '100%';
    kw.textContent = tr('tpls.idTaken', textIn(stoert.name, sprache), stoert.version || 1);
    kf.appendChild(kw);
  }
  kb.appendChild(kf);

  var lt = el('label', 'feld');
  lt.appendChild(el('span', 'feldlabel', tr('tpls.deviceType')));
  var st = el('select', 'tx');
  st.appendChild(opt('', tr('tpls.noType')));
  (D ? Object.keys(D.patterns).sort() : []).forEach(function (m) {
    var o = opt(m, musterZeile(m));
    if (m === k.geraetetyp) { o.selected = true; }
    st.appendChild(o);
  });
  st.addEventListener('change', function () { k.geraetetyp = st.value; zeichneVorlagenDialog(); });
  lt.appendChild(st);
  kb.appendChild(lt);

  /* Die Funktion gehoert in die Vorlage, nicht nur ans einzelne Geraet.

     Der Geraetetyp sagt, *wie* etwas gebaut ist - `socket` heisst
     geschaltet, mehr nicht. Ob eine Steckdose, eine Waschmaschine oder
     eine Druckerleiste daran haengt, weiss allein die Vorlage. Sie traegt
     die Funktion, und der naechste Alias aus dieser Vorlage bekommt sie
     vorgeschlagen. Bisher liess sie sich nur nachtraeglich im
     Vorlagenblatt setzen - beim Speichern gab es das Feld nicht. */
  var lf2 = el('label', 'feld');
  lf2.appendChild(el('span', 'feldlabel', tr('tpls.function')));
  var sf2 = el('select', 'tx');
  sf2.appendChild(opt('', tr('tpls.noFunction')));
  funktionsAuswahl(k.funktion).forEach(function (x) {
    var o = opt(x.wert, x.text);
    if (x.gewaehlt) { o.selected = true; }
    sf2.appendChild(o);
  });
  sf2.addEventListener('change', function () { k.funktion = sf2.value; });
  lf2.appendChild(sf2);
  if (katalogFehlt) { lf2.appendChild(el('span', 'hint', tr('catalog.missing'))); }
  kb.appendChild(lf2);

  kb.appendChild(tplFeld(tr('tpls.rank'), k.rang, function (x) { k.rang = x; }, '60px'));
  var rh2 = el('div', 'hint', tr('tv.rankOwn'));
  rh2.style.flexBasis = '100%';
  kb.appendChild(rh2);
  kk.appendChild(kb);

  var nh = el('div');
  nh.style.padding = '0 12px 11px';
  var nf = tplFeld(tr('tpls.nameHint'), k.namenshinweis, function (x) { k.namenshinweis = x; }, '260px');
  if (!hinweisTaugt(k.namenshinweis)) {
    var nw = el('span', 'hint');
    nw.style.color = 'var(--bad)';
    nw.style.flexBasis = '100%';
    nw.textContent = tr('tpls.nameHintBad');
    nf.appendChild(nw);
  }
  nh.appendChild(nf);
  var nt = el('div', 'hint', tr('tpls.nameHintHelp', k.geraetName));
  nt.style.marginTop = '4px';
  nh.appendChild(nt);
  kk.appendChild(nh);

  /* --- mehrere Ausgaenge --- */
  var mf = el('div');
  mf.style.padding = '0 12px 12px';
  var ml = el('label');
  ml.style.display = 'block';
  ml.style.fontSize = '12.5px';
  var mcb = document.createElement('input');
  mcb.type = 'checkbox';
  mcb.checked = !!k.mehrfach;
  mcb.addEventListener('change', function () {
    k.mehrfach = mcb.checked;
    if (k.mehrfach && !k.instanz) {
      k.instanz = rateInstanz(z.zeilen, k.geraetName,
        String(k.kanalname || 'POWER%N%').split('%N%')[0]);
    }
    zeichneVorlagenDialog();
  });
  ml.appendChild(mcb);
  ml.appendChild(document.createTextNode(' ' + tr('tpls.multiple')));
  mf.appendChild(ml);

  if (k.mehrfach) {
    var mz = el('div');
    mz.style.display = 'flex';
    mz.style.flexWrap = 'wrap';
    mz.style.gap = '9px 14px';
    mz.style.marginTop = '6px';
    mz.appendChild(tplFeld(tr('tpls.whichNumber'), k.instanz,
      function (x) { k.instanz = String(x).trim(); }, '60px'));
    mz.appendChild(tplFeld(tr('tpls.channelName'), k.kanalname,
      function (x) { k.kanalname = x; }, '140px'));
    mf.appendChild(mz);
    mf.appendChild(el('div', 'hint',
      k.instanz ? tr('tpls.multipleHelp', k.instanz) : tr('tpls.multipleNoNumber')));
    var fremd = andereAusgaenge(z.zeilen, k.instanz, ausgangsVorspaenne(z.zeilen, k));
    if (fremd.punkte.length) {
      var fw2 = el('div', 'aside w');
      fw2.style.margin = '9px 0 0';
      fw2.appendChild(el('b', null, tr('tpls.otherOutputs', fremd.punkte.length, fremd.nummern.join(', '))));
      fw2.appendChild(document.createTextNode(' ' + tr('tpls.otherOutputsText')));
      /* Nicht nur schimpfen, sondern es koennen: die fremden Zeilen
         fliegen aus der Vorlage — das Geraet bleibt unangetastet. */
      var fb = el('button', 'btn schmal', tr('tpls.dropOthers'));
      fb.style.marginTop = '8px';
      fb.addEventListener('click', function () {
        z.zeilen.forEach(function (r) {
          if (fremd.punkte.indexOf(r.name) > -1) { r.weg = true; }
        });
        zeichneVorlagenDialog();
      });
      fw2.appendChild(el('div', null, '')).appendChild(fb);
      mf.appendChild(fw2);
    }
    var weg = z.zeilen.filter(function (r) { return r.weg; });
    if (weg.length) {
      var wz = el('div', 'hint');
      wz.style.marginTop = '7px';
      wz.appendChild(document.createTextNode(tr('tpls.droppedCount', weg.length) + '  '));
      var zb = el('button', 'btn schmal', tr('tpls.undrop'));
      zb.addEventListener('click', function () {
        z.zeilen.forEach(function (r) { r.weg = false; });
        zeichneVorlagenDialog();
      });
      wz.appendChild(zb);
      mf.appendChild(wz);
    }
  } else {
    mf.appendChild(el('div', 'hint', tr('tpls.multipleOff')));
  }
  kk.appendChild(mf);

  /* --- Punkte, die es nicht geben darf --- */
  var vf = el('div');
  vf.style.padding = '0 12px 12px';
  vf.appendChild(tplFeld(tr('tv.forbidden'), k.verboten, function (x) { k.verboten = x; }, '280px'));
  vf.appendChild(el('div', 'hint', tr('tv.forbiddenHelp')));
  kk.appendChild(vf);

  body.appendChild(kk);

  /* --- Zustaende --- */
  var zk = el('div', 'card');
  zk.style.marginBottom = '11px';
  var zh = el('div', 'ch');
  var drin = z.zeilen.filter(function (r) { return !r.weg; });
  zh.appendChild(el('span', 'typ', tr('tpls.states')));
  zh.appendChild(el('span', 'chip mut', tr('tpls.statesCount', drin.length)));
  zk.appendChild(zh);

  /* Drei verschiedene Fragen je Zeile, deshalb drei Spalten. Frueher
     stand nur ein Haken links, und der bedeutete "muss vorhanden sein" —
     an dieser Stelle liest aber jeder "ist ausgewaehlt", weil er genau
     das in jeder anderen Liste dieses Adapters bedeutet. */
  var erkl = el('div', 'hint');
  erkl.style.padding = '8px 12px 0';
  erkl.appendChild(document.createTextNode(tr('tpls.statesHelp')));
  zk.appendChild(erkl);

  var abgewaehlt = z.zeilen.filter(function (r) { return !r.weg && r.aus; });
  if (abgewaehlt.length) {
    var az = el('div', 'hint');
    az.style.padding = '6px 12px 0';
    az.appendChild(document.createTextNode(tr('tpls.someOff', abgewaehlt.length) + '  '));
    var ab = el('button', 'btn schmal', tr('tpls.dropOff'));
    ab.addEventListener('click', function () {
      abgewaehlt.forEach(function (r) { r.weg = true; r.pflicht = false; });
      zeichneVorlagenDialog();
    });
    az.appendChild(ab);
    zk.appendChild(az);
  }

  var kopfz = el('div', 'slot vzeile vkopf');
  [tr('tpls.colInTemplate'), tr('tpls.colDefault'), tr('tpls.colRequired'),
   tr('tpls.colName'), tr('tpls.colPath')]
    .forEach(function (t) { kopfz.appendChild(el('span', null, t)); });
  zk.appendChild(kopfz);

  var absDa = false;
  z.zeilen.forEach(function (r) {
    if (!r.weg && r.lesenAbs) { absDa = true; }
    var row = el('div', 'slot vzeile');
    if (r.weg) { row.style.opacity = '.45'; }

    var haken = function (an, gesperrt, titel, tut) {
      var w = el('span');
      var c = document.createElement('input');
      c.type = 'checkbox';
      c.checked = an;
      c.disabled = !!gesperrt;
      c.title = titel;
      c.addEventListener('change', function () { tut(c.checked); });
      w.appendChild(c);
      return w;
    };

    /* 1. Kommt der Punkt ueberhaupt in die Vorlage? */
    row.appendChild(haken(!r.weg, false, tr('tpls.colInTemplate'), function (an) {
      r.weg = !an;
      if (r.weg) { r.pflicht = false; }
      zeichneVorlagenDialog();
    }));

    /* 2. Ist er beim naechsten Geraet vorgehakt? Kommt vom Haken am
          Geraet, laesst sich hier aber noch drehen. */
    row.appendChild(haken(!r.aus, r.weg, tr('tpls.colDefault'), function (an) {
      r.aus = !an;
      zeichneVorlagenDialog();
    }));

    /* 3. Muss er da sein, damit die Vorlage ueberhaupt greift? */
    row.appendChild(haken(r.pflicht, r.lesenAbs || r.weg, tr('tpls.colRequired'), function (an) {
      r.pflicht = an;
      zeichneVorlagenDialog();
    }));

    row.appendChild(el('span', 'sn', r.name));

    var pw = el('span', 'rx pf');
    pw.style.fontFamily = 'var(--mono)';
    pw.title = zPfad(r, k, false, z.zeilen) + (r.schreibenRoh ? '  → ' + zPfad(r, k, true, z.zeilen) : '');
    pw.appendChild(document.createTextNode(zPfad(r, k, false, z.zeilen)));
    if (r.schreibenRoh) { pw.appendChild(el('span', 'chip mut', '→ ' + zPfad(r, k, true, z.zeilen))); }
    if (r.lesenAbs) { pw.appendChild(el('span', 'chip warn', tr('tpls.absolute'))); }
    row.appendChild(pw);

    zk.appendChild(row);
  });
  body.appendChild(zk);

  if (absDa) {
    var aw = el('div', 'aside w');
    aw.style.marginBottom = '11px';
    aw.appendChild(el('b', null, tr('tpls.absoluteTitle')));
    aw.appendChild(document.createTextNode(tr('tpls.absoluteText')));
    body.appendChild(aw);
  }

  /* --- Inhaltspruefungen --- */
  if (z.inhalte.length) {
    var ik = el('div', 'card');
    ik.style.marginBottom = '11px';
    var ih = el('div', 'ch');
    ih.appendChild(el('span', 'typ', tr('tpls.content')));
    ik.appendChild(ih);
    var ib = el('div');
    ib.style.padding = '9px 12px 11px';
    z.inhalte.forEach(function (x) {
      var r = el('label');
      r.style.display = 'block';
      r.style.margin = '3px 0';
      r.style.fontSize = '12.5px';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = x.an;
      cb.addEventListener('change', function () { x.an = cb.checked; zeichneVorlagenDialog(); });
      r.appendChild(cb);
      var t = el('span', null, ' ' + tr('tpls.contentRow', x.punkt, x.feld));
      t.style.fontFamily = 'var(--mono)';
      r.appendChild(t);
      ib.appendChild(r);
    });
    ib.appendChild(el('div', 'hint', tr('tpls.contentHelp')));
    ik.appendChild(ib);
    body.appendChild(ik);
  }

  /* --- Probelauf --- */
  var neu = baueVorlage(z);
  var pk = el('div', 'card');
  pk.style.marginBottom = '11px';
  var ph = el('div', 'ch');
  ph.appendChild(el('span', 'typ', tr('tpls.tryout')));
  var treffer = [];
  var fehlerErk = !neu.erkennung.erforderlich.length;
  if (!fehlerErk) {
    probeWerteHolen(neu, zeichneVorlagenDialog);
    treffer = probelauf(neu, true);
  }
  var gew = treffer.filter(function (t) { return t.gewinnt; }).length;
  var wech = treffer.filter(function (t) { return t.wechsel; }).length;
  ph.appendChild(el('span', 'chip ' + (gew ? 'ok' : 'warn'), tr('tpls.hits', treffer.length, gew)));
  if (wech) { ph.appendChild(el('span', 'chip warn', tr('tpls.takesOver', wech))); }
  pk.appendChild(ph);
  var pb = el('div');
  pb.style.padding = '9px 12px 11px';
  if (fehlerErk) {
    pb.appendChild(el('div', 'hint', tr('tpls.noRequired')));
  } else if (!treffer.length) {
    pb.appendChild(el('div', 'hint', tr('tpls.noHits')));
  } else {
    treffer.slice(0, 40).forEach(function (t) {
      var r = el('div', 'slot');
      r.style.gridTemplateColumns = '1fr 150px 130px';
      var idl = el('span', 'sn', t.id);
      idl.style.fontFamily = 'var(--mono)';
      if (t.id === (z.e.kanal || '')) { idl.style.fontWeight = '700'; }
      r.appendChild(idl);
      r.appendChild(el('span', 'rx', tr('tpls.evidence', t.eigen.belege)));
      var w = el('span', 'chip ' + (t.gewinnt ? 'ok' : 'bad'),
        t.gewinnt ? (t.gegner ? tr('tpls.beats', textIn(t.gegner.vorlage.name, sprache)) : tr('tpls.onlyOne'))
                  : tr('tpls.losesTo', textIn(t.gegner.vorlage.name, sprache)));
      r.appendChild(w);
      pb.appendChild(r);
    });
    if (treffer.length > 40) {
      pb.appendChild(el('div', 'hint', tr('tpls.andMore', treffer.length - 40)));
    }
  }
  pk.appendChild(pb);
  body.appendChild(pk);

  /* --- das fertige JSON --- */
  var jk = el('div', 'card');
  var jh = el('div', 'ch');
  jh.appendChild(el('span', 'typ', tr('tpls.json')));
  jh.appendChild(el('span', 'chip mut', 'v' + neu.version));
  jk.appendChild(jh);
  var pre = el('div', 'raw');
  pre.style.margin = '9px 12px 11px';
  pre.style.whiteSpace = 'pre';
  pre.style.maxHeight = 'none';
  pre.textContent = JSON.stringify(neu, null, 2);
  jk.appendChild(pre);
  body.appendChild(jk);

  var b = $('#btn-tpl-save');
  if (b) {
    b.disabled = fehlerErk || !k.id || !!fremdeMitId(k) ||
      !hinweisTaugt(k.namenshinweis) ||
      !z.zeilen.filter(function (r) { return !r.weg; }).length;
    b.textContent = k.modus === 'update' ? tr('tpls.saveUpdate') : tr('tpls.saveNew');
  }
  var tt = $('#tpl-titel');
  if (tt) { tt.textContent = tr('tpls.title', z.e.kanal.split('.').pop()); }
}

export function speichereVorlageAusDialog() {
  if (!S.tplZ) { return; }
  var neu = baueVorlage(S.tplZ);

  /* Widerspricht sie sich, wird nicht gespeichert — eine Vorlage, die
     auf nichts passen kann, hilft niemandem und ist spaeter schwer zu
     durchschauen. */
  if (neu.widerspruch && neu.widerspruch.length) {
    var body0 = $('#tpl-body');
    var alt0 = body0.querySelector('.widerspruch');
    if (alt0) { alt0.remove(); }
    var w0 = el('div', 'aside w widerspruch');
    w0.appendChild(el('b', null, tr('tpls.contradiction')));
    w0.appendChild(document.createTextNode(' ' + tr('tpls.contradictionText',
      neu.widerspruch.join(', '))));
    body0.insertBefore(w0, body0.firstChild);
    body0.scrollTop = 0;
    return;
  }
  delete neu.widerspruch;

  var b = $('#btn-tpl-save');
  if (b) { b.disabled = true; b.textContent = tr('tpls.saving'); }

  aendereVorlagen(neu.id, neu, function (err) {
    var body = $('#tpl-body');
    if (err) {
      body.textContent = '';
      var w = el('div', 'aside w');
      w.appendChild(el('b', null, tr('tpls.failed')));
      w.appendChild(document.createTextNode(' ' + err));
      body.appendChild(w);
      if (b) { b.disabled = false; b.textContent = tr('tpls.saveNew'); }
      return;
    }
    ladeVorlagen(function () {
      setzeMeta();
      body.textContent = '';
      var m = el('div');
      m.style.fontSize = '13px';
      m.appendChild(el('b', null, tr('tpls.saved', neu.id, neu.version)));
      m.appendChild(el('div', null, tr('tpls.savedWhere', INSTANZ_ID)));
      body.appendChild(m);
      if (b) { b.hidden = true; }
      if (S.current) { zeichneErgebnis(); }
    });
  });
}
