/* Die dritte Sicht: Vorlagen ansehen, bearbeiten, speichern, Probelauf.

   Paketvorlagen sind nur zu lesen - wer eine aendern will, dupliziert
   sie, und die Kopie verdeckt das Original. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import { D, $, el, kurz } from './basis.js';
import { tr, sprachtext, sprache } from './sprache.js';
import { katalogFehlt } from './katalog.js';
import { funktionsAuswahl, kennungZuFunktion } from './aufzaehlungen.js';
import { musterVon, platzFuerRolle, typenFuerRolle } from './erkennung.js';
import { musterZeile, musterName } from './musternamen.js';
import { ladeVorlagen, aendereVorlagen, setzeMeta, pruefeVorlage, wendeAn, hinweisTaugt, INSTANZ_ID } from './vorlagen.js';
import { kindZustaende, hatPunkt, feldAusFormel, pfadTeile, pfadAus } from './werte.js';
import { opt } from './entwurf.js';
import { zeichneErgebnis } from './ergebnis.js';
import { delKnopf } from './schreiben.js';

import { rollenFeld } from './rollenwahl.js';
import { istAlteVorlage } from './migration.js';


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
  S.VORLAGEN.forEach(function (tpl) { if (tpl.id === id) { t = tpl; } });
  return t;
}

function ohneUnterstrich(tpl) {
  var tplKopie = {};
  Object.keys(tpl).forEach(function (f) { if (f.charAt(0) !== '_') { tplKopie[f] = tpl[f]; } });
  /* Halbfertige Ersatzquellen nicht mitspeichern: eine Zeile ohne
     Datenpunkt ist beim Bearbeiten nuetzlich, in der Vorlage waere sie
     nur Ballast. */
  if (Array.isArray(tplKopie.points)) {
    tplKopie.points = tplKopie.points.map(function (tplZeile) {
      if (!tplZeile || !tplZeile.readFallback) { return tplZeile; }
      var liste = ersatzListe(tplZeile).filter(function (x) { return x && x.point; });
      var kopie = {};
      Object.keys(tplZeile).forEach(function (f) { kopie[f] = tplZeile[f]; });
      if (!liste.length) { delete kopie.readFallback; }
      else { kopie.readFallback = (liste.length === 1) ? liste[0] : liste; }
      return kopie;
    });
  }
  return tplKopie;
}

export function zeichneVorlagenListe() {
  var host = $('#tree');
  host.textContent = '';
  var filter = ($('#q').value || '').trim().toLowerCase();

  var liste = S.VORLAGEN.filter(function (tpl) {
    if (!filter) { return true; }
    return (tpl.id + ' ' + sprachtext(tpl.name)).toLowerCase().indexOf(filter) > -1;
  });

  if (vEinlesen) {
    host.appendChild(vListenZeile(vEinlesen, true));
  }
  if (!liste.length && !vEinlesen) {
    host.appendChild(el('div', 'empty', tr('tree.nothingFound')));
    return;
  }
  liste.forEach(function (tpl) { host.appendChild(vListenZeile(tpl, false)); });
}

function vListenZeile(tpl, eingelesen) {
  /* Zwei verschiedene Dinge, die im Objektbaum zwei verschiedene Klassen
     tragen: `pick` heisst waehlbar (Mauszeiger), `sel` heisst gewaehlt
     (Akzentfarbe). Diese Liste setzte nur `pick` — und `pick` faerbt
     nichts. Die angeklickte Vorlage stand deshalb unmarkiert da, waehrend
     rechts ihr Blatt aufgeschlagen war (26.08.2026). */
  var gewaehlt = (!eingelesen && tpl.id === vGewaehlt && !vEinlesen) ||
                 (eingelesen && vEinlesen);
  var d = el('div', 'node pick' + (gewaehlt ? ' sel' : ''));
  d.style.cursor = 'pointer';
  d.style.gap = '6px';
  var eigen = tpl._quelle === 'benutzer';
  d.appendChild(el('span', 'chip ' + (eingelesen ? 'warn' : (eigen ? 'ok' : 'mut')),
    eingelesen ? tr('tv.imported') : (eigen ? tr('tpl.own') : tr('tv.package'))));
  var nm = el('span', 'nm', sprachtext(tpl.name));
  d.appendChild(nm);
  var meta = el('span', null, tpl.id + '  tpl' + (tpl.version || 1));
  meta.style.fontFamily = 'var(--mono)';
  meta.style.fontSize = '10px';
  meta.style.color = 'var(--ink-3)';
  meta.style.marginLeft = 'auto';
  d.appendChild(meta);
  d.addEventListener('click', function () {
    if (!eingelesen) { vEinlesen = null; vGewaehlt = tpl.id; }
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

/* Den Namen einer Vorlage in einer Sprache setzen.

   Das Einlesen nimmt eine Datei auch ohne `name` an (die Liste zeigt dann
   die Kennung). Die Namensfelder schrieben aber blind in `tpl.name.de` —
   ohne `name` warf das, `vAendern` brach ab, und die Eingabe ging
   verloren: den fehlenden Namen konnte man nie nachtragen (Ricardo,
   19.09.2026). Ein Name als blosser Text wird wie bisher zu beiden
   Sprachen. */
function setzeName(tpl, sprache, w) {
  if (typeof tpl.name === 'string') { tpl.name = { de: tpl.name, en: tpl.name }; }
  if (!tpl.name || typeof tpl.name !== 'object' || Array.isArray(tpl.name)) { tpl.name = {}; }
  tpl.name[sprache] = w;
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

/* Das Feld „Geraetetyp" — ein Suchfeld mit eigener Liste, nicht mehr ein
   <select> mit 52 Eintraegen (C33).

   Ein <select> laesst sich nicht durchsuchen. Die Beschriftung beginnt
   mit dem deutschen Namen („Steckdose · socket"), also fand die
   Tipp-Navigation des Browsers den Rohnamen nicht: wer `socket` tippte,
   landete nirgends. Die Musterwahl beim Alias kann beides seit jeher;
   hier nicht, und das war der Unterschied, ueber den Ricardo am
   20.09.2026 gestolpert ist.

   Dieselbe Bauart wie `musterwahl.js`: Eingabefeld plus eigene Liste,
   kein <datalist> — dessen Fenster malt das Betriebssystem, und in
   eingebetteten Ansichten landet es neben dem Fenster. Ohne Bewertung
   allerdings: hier wird eine Vorlage bearbeitet, es gibt kein Geraet,
   gegen das sich etwas bewerten liesse. */
function geraetetypFeld(tpl, eigen) {
  var alle = (D ? Object.keys(D.patterns).sort() : []).map(function (m) {
    /* Der Wert ist der TYP, nicht der Musterschluessel — und beschriftet
       wird ebenfalls nach dem Typ. Fuer die drei Muster, die anders
       heissen als ihr Typ (`blinds`, `mediaPlayer`, `levelSlider`),
       kennt der Admin zum Schluessel keinen Beinamen, und im Feld stand
       am Rollladen deshalb „blinds" statt „Jalousien · blind" (I37,
       15.09.2026). */
    return D.patterns[m].type || m;
  }).filter(function (t, n, arr) { return arr.indexOf(t) === n; });

  var wrap = el('div', 'feldwrap');
  var feldEin = el('input', 'tx musterwahl');
  feldEin.type = 'text';
  feldEin.setAttribute('autocomplete', 'off');
  feldEin.disabled = !eigen;
  feldEin.value = tpl.deviceType ? musterZeile(tpl.deviceType) : '';
  feldEin.placeholder = tr('tpls.noType');
  wrap.appendChild(feldEin);
  var liste = el('div', 'vorschlaege musterliste');
  liste.hidden = true;
  wrap.appendChild(liste);

  var markiert = -1;
  var treffer = [];

  var setzen = function (typ) {
    liste.hidden = true;
    feldEin.value = typ ? musterZeile(typ) : '';
    vAendern(function (tplNeu, w) { tplNeu.deviceType = w || undefined; }, typ);
  };

  var malen = function () {
    /* Beim Aufklappen steht der gewaehlte Typ im Feld — das ist kein
       Suchtext, sonst saehe man nur den einen Eintrag und muesste erst
       loeschen, um wechseln zu koennen. */
    var roh = String(feldEin.value || '').trim();
    var such = (roh && roh !== musterZeile(tpl.deviceType)) ? roh.toLowerCase() : '';
    treffer = such
      ? alle.filter(function (t) {
        /* Ueber Rohnamen UND Beinamen: „steckdose" findet socket,
           „socket" auch. */
        return t.toLowerCase().indexOf(such) > -1
          || String(musterName(t) || '').toLowerCase().indexOf(such) > -1;
      })
      : alle.slice();

    liste.textContent = '';
    /* „kein Typ" gehoert dazu — eine Vorlage ohne Geraetetyp ist
       erlaubt, und ohne diesen Eintrag kaeme man nicht mehr zurueck. */
    if (!such) {
      var z0 = el('div', 'vz' + (tpl.deviceType ? '' : ' gewaehlt'));
      z0.appendChild(el('span', null, tr('tpls.noType')));
      z0.addEventListener('mousedown', function (ev) { ev.preventDefault(); setzen(''); });
      liste.appendChild(z0);
    }
    if (!treffer.length) {
      var leer = el('div', 'vz zurueck');
      leer.appendChild(el('span', null, tr('pattern.noMatch', feldEin.value)));
      liste.appendChild(leer);
    }
    treffer.forEach(function (t, n) {
      var z = el('div', 'vz' + (n === markiert ? ' an' : '') + (t === tpl.deviceType ? ' gewaehlt' : ''));
      z.appendChild(el('span', null, musterZeile(t)));
      /* mousedown statt click: sonst greift der Fokusverlust zuerst und
         die Liste ist weg, bevor der Klick ankommt. */
      z.addEventListener('mousedown', function (ev) { ev.preventDefault(); setzen(t); });
      liste.appendChild(z);
    });
    liste.hidden = false;
  };

  feldEin.addEventListener('focus', function () { markiert = -1; malen(); });
  feldEin.addEventListener('input', function () { markiert = -1; malen(); });
  feldEin.addEventListener('blur', function () {
    /* Was im Feld steht, ist nur Suchtext — gespeichert wird beim
       Klicken. Beim Verlassen also den gewaehlten Typ zurueckschreiben,
       sonst bliebe ein halbgetippter Rest stehen. */
    setTimeout(function () {
      liste.hidden = true;
      feldEin.value = tpl.deviceType ? musterZeile(tpl.deviceType) : '';
    }, 150);
  });
  feldEin.addEventListener('keydown', function (ev) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (liste.hidden) { malen(); return; }
      markiert += (ev.key === 'ArrowDown' ? 1 : -1);
      if (markiert < 0) { markiert = treffer.length - 1; }
      if (markiert >= treffer.length) { markiert = 0; }
      malen();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (treffer[markiert]) { setzen(treffer[markiert]); }
      else if (treffer.length === 1) { setzen(treffer[0]); }
    } else if (ev.key === 'Escape') {
      liste.hidden = true;
      feldEin.value = tpl.deviceType ? musterZeile(tpl.deviceType) : '';
    }
  });
  return wrap;
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

  var tpl = vArbeitsstand();
  if (!tpl) {
    /* Dieselbe Erklaerung wie in den anderen beiden Modi. */
    var lh = el('div', 'empty leerhilfe');
    lh.appendChild(el('div', 'lh1', tr('help.templates')));
    host.appendChild(lh);
    return;
  }
  var eigen = tpl._quelle === 'benutzer' || !!vEinlesen;
  var vorhanden = vorlageMitId(tpl.id);
  var geaendert = !!vEntwurf || !!vEinlesen;

  /* --- Kopf --- */
  var head = el('div', 'reshead');
  var links = el('div');
  links.appendChild(el('div', 'ziel', sprachtext(tpl.name)));
  var unter = el('div', 'unter');
  unter.appendChild(el('span', 'chip ' + (eigen ? 'ok' : 'mut'),
    vEinlesen ? tr('tv.imported') : (eigen ? tr('tpl.own') : tr('tv.package'))));
  unter.appendChild(el('span', null, tpl.id + '  tpl' + (tpl.version || 1) +
    '  ·  ' + tr('tv.rank', tpl.priority || 0)));
  links.appendChild(unter);
  head.appendChild(links);
  host.appendChild(head);

  /* Der Kopfhinweis ist { de, en } oder eine Zeichenkette. Dieselbe
     Wahl wie beim Namen: eingestellte Sprache, sonst Englisch. */
  var kopfHinweis = sprachtext(tpl.note);
  if (kopfHinweis) {
    var khw = el('div', 'hint');
    khw.style.margin = '0 0 11px';
    khw.style.whiteSpace = 'pre-wrap';
    khw.textContent = kopfHinweis;
    host.appendChild(khw);
  }

  /* --- Was das Einlesen bewirken wuerde --- */
  if (vEinlesen) {
    var iw = el('div', 'aside w');
    iw.style.marginBottom = '11px';
    iw.appendChild(el('b', null, tr('tv.importTitle')));
    var was;
    if (!vorhanden) { was = tr('tv.importNew', tpl.id); }
    else if (vorhanden._quelle === 'benutzer') {
      was = tr('tv.importReplaces', tpl.id, vorhanden.version || 1, tpl.version || 1);
    } else { was = tr('tv.importShadows', tpl.id); }
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
  bd2.addEventListener('click', function () { vDuplizieren(tpl, !eigen); });
  bar.appendChild(bd2);

  var ba = el('button', 'btn', tr('tv.export'));
  ba.addEventListener('click', function () { vAusgeben(tpl); });
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
      vLoeschen(tpl.id);
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

  kb.appendChild(feld(tr('tpls.nameDe'), textIn(tpl.name, 'de'),
    function (tplNeu, w) { setzeName(tplNeu, 'de', w); }, '140px'));
  kb.appendChild(feld(tr('tpls.nameEn'), textIn(tpl.name, 'en'),
    function (tplNeu, w) { setzeName(tplNeu, 'en', w); }, '140px'));
  kb.appendChild(feld(tr('tpls.rank'), tpl.priority || 0,
    function (tplNeu, w) { tplNeu.priority = Number(w) || 0; }, '60px'));
  var rh = el('span', 'hint', eigen ? tr('tv.rankOwn') : tr('tv.rankPackage'));
  rh.style.flexBasis = '100%';
  kb.appendChild(rh);

  var lt = el('label', 'feld');
  lt.appendChild(el('span', 'feldlabel', tr('tpls.deviceType')));
  lt.appendChild(geraetetypFeld(tpl, eigen));
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
  funktionsAuswahl(tpl.enumFunction).forEach(function (x) {
    var o = opt(x.wert, x.text);
    if (x.gewaehlt) { o.selected = true; }
    sf.appendChild(o);
  });
  sf.addEventListener('change', function () {
    vAendern(function (tplNeu, w) { tplNeu.enumFunction = w || undefined; }, sf.value);
  });
  lf.appendChild(sf);
  if (katalogFehlt) { lf.appendChild(el('span', 'hint', tr('catalog.missing'))); }
  kb.appendChild(lf);

  kk.appendChild(kb);

  var nb = el('div');
  nb.style.padding = '0 12px 11px';
  nb.appendChild(feld(tr('tpls.nameHint'), (tpl.detection || {}).nameHint || '',
    function (tplNeu, w) { tplNeu.detection = tplNeu.detection || {}; if (w) { tplNeu.detection.nameHint = w; } else { delete tplNeu.detection.nameHint; } }, '260px'));
  /* Der Text ist ein Ausdruck, und ein unbrauchbarer Ausdruck faellt
     sonst nirgends auf: Er wird still zu „trifft nicht", und die Vorlage
     verliert leise ihren Namensbonus. Also hier sagen, wo er steht. */
  if (!hinweisTaugt((tpl.detection || {}).nameHint || '')) {
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
  var erf = (tpl.detection || {}).required || [];
  eh.appendChild(el('span', 'chip mut', tr('tv.requiredCount', erf.length)));
  ek.appendChild(eh);
  var eb = el('div');
  eb.style.padding = '9px 12px 11px';
  var erkHinweis = sprachtext((tpl.detection || {}).note);
  if (erkHinweis) {
    var ehw = el('div', 'hint');
    ehw.style.whiteSpace = 'pre-wrap';
    ehw.style.marginBottom = '9px';
    ehw.textContent = erkHinweis;
    eb.appendChild(ehw);
  }
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
  eb.appendChild(listenFeld(tr('tv.required2'), erf.join(', '), function (tplNeu, wert) {
    tplNeu.detection = tplNeu.detection || {};
    tplNeu.detection.required = alsListe(wert);
  }, tr('tv.requiredHelp')));
  if (!erf.length) {
    eb.appendChild(el('div', 'hint', tr('tpls.noRequired')));
  }
  var inh = (tpl.detection || {}).content || {};
  Object.keys(inh).forEach(function (punkt) {
    var z = el('div', 'hint', tr('tpls.contentRow', punkt, inh[punkt]));
    z.style.fontFamily = 'var(--mono)';
    eb.appendChild(z);
  });
  eb.appendChild(listenFeld(tr('tv.forbidden'), ((tpl.detection || {}).forbidden || []).join(', '),
    function (tplNeu, wert) {
      tplNeu.detection = tplNeu.detection || {};
      var l = alsListe(wert);
      if (l.length) { tplNeu.detection.forbidden = l; } else { delete tplNeu.detection.forbidden; }
    }, tr('tv.forbiddenHelp')));
  if (tpl.multiple) {
    eb.appendChild(el('div', 'hint', tr('tv.multi', tpl.channelName || 'POWER%N%')));
  }
  ek.appendChild(eb);
  host.appendChild(ek);

  /* --- Datenpunkte --- */
  var zk = el('div', 'card');
  zk.style.marginBottom = '11px';
  var zh = el('div', 'ch');
  zh.appendChild(el('span', 'typ', tr('tpls.states')));
  zh.appendChild(el('span', 'chip mut', tr('tpls.statesCount', (tpl.points || []).length)));
  /* Aufklappen geht bei allen Vorlagen, auch bei den mitgelieferten —
     dort nur zum Ansehen.

     Vorher war die Zeilenansicht an `eigen` gebunden: wer sehen wollte,
     welche Ersatzquellen oder Formeln eine mitgelieferte Vorlage fuehrt,
     musste erst „Eigene Kopie zum Bearbeiten" druecken und hatte danach
     eine Kopie im Bestand, die er gar nicht wollte. Aufgefallen beim
     Beheben von H9: der vierte Leseweg fuer die IP liess sich in der
     Vorlagendatei ergaenzen, im Reiter aber nur ueber diesen Umweg
     nachsehen (Ricardo, 20.09.2026). */
  zh.appendChild(el('span', 'luecke'));
  zh.appendChild(el('span', 'hint', eigen ? tr('tv.clickRow') : tr('tv.clickRowRead')));
  zk.appendChild(zh);
  (tpl.points || []).forEach(function (tplZeile, nr) {
    var auf = (vOffeneZeile === nr);
    var r = el('div', 'slot vklick' + (auf ? ' offen' : ''));
    r.style.gridTemplateColumns = '1fr 1.1fr 1.2fr 90px 15px';
    var zeilenHinweis = sprachtext(tplZeile.note);
    if (zeilenHinweis) { r.title = zeilenHinweis; }
    r.appendChild(el('span', 'sn', tplZeile.name));
    r.appendChild(el('span', 'rx', tplZeile.role || '\u2014'));
    var pw = el('span', 'rx');
    pw.style.fontFamily = 'var(--mono)';
    pw.appendChild(document.createTextNode(tplZeile.read + (tplZeile.jsonField ? ' \u00b7 ' + tplZeile.jsonField : '')));
    /* Der Schreibpfad ist ein Pfad wie der Lesepfad davor, keine
       Statusmarke - als Chip las er sich wie \u201eVorgabe" daneben. */
    if (tplZeile.write) { pw.appendChild(el('span', 'leise', ' \u2192 ' + tplZeile.write)); }
    if (tplZeile.absolute) { pw.appendChild(el('span', 'chip warn', tr('tpls.absolute'))); }
    /* Dass eine Zeile Ersatzwege hat, stand hier nicht \u2014 man sah nur den
       ersten (\u201eIP \u00b7 text \u00b7 tele.STATE \u00b7 IPAddress") und haette nie
       vermutet, dass drei weitere dahinterliegen. Die Zahl ist die
       Auskunft, die den Unterschied macht; welche es sind, steht
       aufgeklappt (Ricardo, 20.09.2026). */
    var ersatzZahl = ersatzListe(tplZeile).length;
    if (ersatzZahl) {
      pw.appendChild(el('span', 'chip mut', tr('tpls.fallbacks', ersatzZahl)));
    }
    r.appendChild(pw);
    /* Dieselben zwei Angaben wie im Speichern-Dialog, gleiche Richtung
       und dieselben Woerter — vorher stand hier „Pflicht/freiwillig"
       und dort „Vorgabe / muss da sein", fuer genau dieselbe Sache. */
    var mm = el('span', 'rx');
    if (!tplZeile.offByDefault) { mm.appendChild(el('span', 'chip mut', tr('tpls.colDefault'))); }
    if (istPflichtpunkt(tplZeile)) { mm.appendChild(el('span', 'chip ok', tr('tpls.colRequired'))); }
    r.appendChild(mm);
    r.appendChild(el('span', 'ca2', auf ? '\u25be' : '\u25b8'));
    r.addEventListener('click', function () {
      vOffeneZeile = auf ? null : nr;
      zeichneErgebnis();
    });
    zk.appendChild(r);
    if (auf) { zk.appendChild(vZeilenDetail(tplZeile, nr, eigen)); }
  });

  if (eigen) {
    var np = el('div');
    np.style.padding = '9px 12px 11px';
    var nKnopf = el('button', 'btn schmal', tr('tv.addState'));
    nKnopf.addEventListener('click', function () {
      vAendern(function (tplNeu) {
        tplNeu.points = tplNeu.points || [];
        tplNeu.points.push({ name: 'NEU', type: 'mixed', read: '', optional: true });
        vOffeneZeile = tplNeu.points.length - 1;
      });
    });
    np.appendChild(nKnopf);
    zk.appendChild(np);
  }
  /* Das Rollenwissen ist kein Zeilenbestand - nur ein Vermerk, dass es
     da ist und wo es greift. */
  if (tpl.extraPoints && Object.keys(tpl.extraPoints).length) {
    var ww = el('div', 'hint');
    ww.style.padding = '7px 12px 10px';
    ww.textContent = tr('tpls.wissen', Object.keys(tpl.extraPoints).length);
    zk.appendChild(ww);
  }
  host.appendChild(zk);

  /* --- Probelauf --- */
  var pk = el('div', 'card');
  pk.style.marginBottom = '11px';
  var ph2 = el('div', 'ch');
  ph2.appendChild(el('span', 'typ', tr('tpls.tryout')));
  if (erf.length) { probeWerteHolen(ohneUnterstrich(tpl), zeichneErgebnis); }
  var treffer = erf.length
    ? probelauf(ohneUnterstrich(tpl), tpl._quelle === 'benutzer') : [];
  var gew = treffer.filter(function (t) { return t.gewinnt; }).length;
  ph2.appendChild(el('span', 'chip ' + (gew ? 'ok' : 'warn'), tr('tpls.hits', treffer.length, gew)));
  /* „Getroffen" heisst nur, dass die Erkennung anspringt. Wie oft die
     Vorlage danach gar nicht antreten kann, weil eine Pflichtzeile ihre
     Quelle nicht findet, gehoert daneben — das ist die Zahl, an der man
     beim Bauen einer Vorlage merkt, dass ihre Erkennung breiter greift
     als ihre Zeilen. Neutral gefaerbt: eine Spezialvorlage SOLL auf die
     meisten Geraete nicht passen. */
  var passtNicht = treffer.filter(function (t) { return !t.greift; }).length;
  if (passtNicht) {
    var cl = el('span', 'chip mut', tr('tpls.fitsNot', passtNicht));
    cl.title = tr('tpls.needsRowHint');
    ph2.appendChild(cl);
  }
  pk.appendChild(ph2);
  var pb2 = el('div');
  pb2.style.padding = '9px 12px 11px';
  if (!treffer.length) {
    pb2.appendChild(el('div', 'hint', erf.length ? tr('tpls.noHits') : tr('tpls.noRequired')));
  } else {
    treffer.slice(0, 40).forEach(function (t) {
      var r = el('div', 'slot');
      /* Die Kennung darf schrumpfen, die Marke rechts nicht: ihr Text
         ist nicht umbrechbar (`.chip` steht auf nowrap) und wuerde in
         einer festen Spalte abgeschnitten. */
      r.style.gridTemplateColumns = 'minmax(0,1fr) 72px 64px auto';
      var idl = el('span', 'sn', t.id);
      idl.style.fontFamily = 'var(--mono)';
      idl.style.wordBreak = 'break-all';
      r.appendChild(idl);
      r.appendChild(el('span', 'rx', tr('tpls.evidence', t.eigen.belege)));
      /* Wie viele Zeilen dort wirklich entstehen. Die Belege sagen, wie
         gut die Erkennung greift; erst die Zeilen sagen, was dabei
         herauskommt. */
      r.appendChild(el('span', 'rx',
        t.zeilen === 1 ? tr('tpls.rowBuilt') : tr('tpls.rowsBuilt', t.zeilen)));
      /* Drei Ausgaenge, nicht zwei: gewonnen und getragen, duenn
         gewonnen, verloren. Der mittlere sah ohne eigene Marke aus wie
         ein Erfolg. */
      if (!t.greift) {
        /* Passt hier nicht — und es steht dabei, woran es liegt. Ohne
           den Namen der Zeile raet man, welches Feld am Geraet fehlt. */
        var cn = el('span', 'chip bad', t.fehlendeZeile
          ? tr('tpls.needsRow', t.fehlendeZeile) : tr('tpls.buildsNone'));
        cn.title = tr('tpls.needsRowHint');
        r.appendChild(cn);
      } else {
        r.appendChild(el('span', 'chip ' + (t.gewinnt ? 'ok' : 'bad'),
          t.gewinnt ? (t.gegner ? tr('tpls.beats', textIn(t.gegner.vorlage.name, sprache)) : tr('tpls.onlyOne'))
                    : tr('tpls.losesTo', textIn(t.gegner.vorlage.name, sprache))));
      }
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
    pre.textContent = JSON.stringify(ohneUnterstrich(tpl), null, 2);
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
      /* Wie am Geraet: nur ein eindeutiger Typ wird gesetzt. */
      var moegliche = typenFuerRolle(geraetetyp, r);
      if (moegliche.length === 1 && setzeTyp && typJetzt !== moegliche[0]) { setzeTyp(moegliche[0]); }
      setzen(r);
    }
  }));

  var must = geraetetyp && musterVon(geraetetyp);
  if (must) {
    var treffer = platzFuerRolle(geraetetyp, rolle, typJetzt);
    var erlaubt = typenFuerRolle(geraetetyp, rolle);
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
    if (treffer && typJetzt && erlaubt.length && erlaubt.indexOf(typJetzt) === -1) {
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
/* Ist diese Zeile Pflicht? Das steht an der Zeile selbst (`optional`),
   nicht in der Erkennungsliste.

   Bis zum 02.10.2026 las diese Funktion `erkennung.erforderlich` — also
   die Frage „muss das Geraet diesen Punkt haben, damit die Vorlage
   ueberhaupt greift". Das ist eine andere Frage als „darf diese Zeile
   beim Anwenden fehlen", und beide Antworten gehen in den Vorlagen
   weit auseinander: an der HmIP-Heizgruppe sind SET, ACTUAL, HUMIDITY
   und VALVE Pflicht, in der Erkennungsliste steht aber nur
   `1.SET_POINT_TEMPERATURE` — also stand eine Marke statt vier
   (Ricardo, 02.10.2026). Nachgezaehlt wichen **16 von 17** Vorlagen ab.

   Teils ist das Absicht: `tasmota-lampe` schreibt eigens, `stat.POWER`
   stehe bewusst nicht in der Erkennungsliste, weil der mqtt-Adapter den
   Punkt erst beim ersten Schalten anlegt — gelesen wird ersatzweise aus
   `tele.STATE`. Pflicht ist die Zeile trotzdem, und ueber den Hauptweg
   war das nie zu sehen.

   Die Erkennungsbedingungen stehen eigens im Kasten „Erkennung" darueber,
   samt Zaehler; sie brauchen diese Marke nicht. */
function istPflichtpunkt(tplZeile) {
  return !tplZeile.optional;
}

/* lesenSonst darf ein Punktname, ein Objekt oder eine Liste sein — alle
   drei Formen kommen in Vorlagen vor. Nach innen immer eine Liste. */
function ersatzListe(tplZeile) {
  var s0 = tplZeile.readFallback;
  if (!s0) { return []; }
  var arr = Array.isArray(s0) ? s0 : [s0];
  return arr.map(function (x) {
    return (typeof x === 'string') ? { point: x } : x;
  });
}

/* Im Arbeitsstand bleibt eine noch leere Zeile stehen — sonst koennte
   man nie eine anlegen, weil sie im selben Atemzug wieder verschwaende.
   Weggeworfen wird sie erst beim Ablegen, in ohneUnterstrich. */
function schreibeErsatz(tplZeile, liste) {
  if (!liste.length) { delete tplZeile.readFallback; return; }
  tplZeile.readFallback = (liste.length === 1) ? liste[0] : liste;
}

function vZeilenDetail(tplZeile, nr, eigen) {
  var tplJetzt = vArbeitsstand();
  var d = el('div', 'detail');
  var zeilenHinweis = sprachtext(tplZeile.note);
  if (zeilenHinweis) {
    var hw0 = el('div', 'hint');
    hw0.style.whiteSpace = 'pre-wrap';
    hw0.textContent = zeilenHinweis;
    d.appendChild(hw0);
  }

  /* Genau der Aufbau des Detailblocks am Geraet: Name, liest aus,
     schreibt nach, Formel, Schreibformel, Rolle, Anzeige. Nur was ein
     Geraet braucht, fehlt hier — Rohwert, Ergebnis und die Auswahl aus
     vorhandenen Objekten. Es gibt kein Geraet, an dem man das messen
     koennte. */
  var setz = function (feldname, wandeln) {
    return function (tpl, wert) {
      var tplZeileFrisch = tpl.points[nr];
      var w = wandeln ? wandeln(wert) : wert;
      if (w === '' || w === undefined || w === null) { delete tplZeileFrisch[feldname]; }
      else { tplZeileFrisch[feldname] = w; }
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

  dtZeile(d, tr('detail.name'), eingabe(tplZeile.name, 'name', '260px', tr('detail.namePlaceholder')));

  /* --- liest aus, mit JSON-Feld daneben --- */
  var qf = el('div', 'fields');
  qf.appendChild(dtFeld(tr('detail.datapoint'),
    eingabe(tplZeile.read, 'read', '260px', tplZeile.absolute ? '0_userdata.0.\u2026' : 'stat.POWER')));
  qf.appendChild(dtFeld(tr('detail.jsonField'), eingabe(tplZeile.jsonField, 'jsonField', '150px', '\u2014')));
  dtZeile(d, tr('detail.readsFrom'), qf);

  /* --- Ersatzquellen --- 
     Dasselbe steht bei Tasmota oft an mehreren Stellen, und welche ein
     Geraet gerade fuehrt, weiss man vorher nicht: die IP liegt in
     tele.INFO2, in tele.STATE oder in stat.STATUS5. Die Werkbank nimmt
     den ersten Weg, bei dem Objekt und Feld wirklich da sind. Ohne
     dieses Feld liess sich das nur in der ausgegebenen Datei aendern. */
  var sonstListe = ersatzListe(tplZeile);

  var sb = el('div');
  sonstListe.forEach(function (ersatz, wi) {
    var zeile = el('div', 'fields');
    zeile.style.marginBottom = '5px';

    var setzeErsatz = function (teil, wert) {
      vAendern(function (tpl) {
        var tplZeileFrisch = tpl.points[nr];
        var liste = ersatzListe(tplZeileFrisch);
        if (!liste[wi]) { return; }
        if (wert === '') { delete liste[wi][teil]; } else { liste[wi][teil] = wert; }
        if (!liste[wi].point) { liste.splice(wi, 1); }
        schreibeErsatz(tplZeileFrisch, liste);
      }, wert);
    };

    var ip1 = el('input', 'tx');
    ip1.type = 'text'; ip1.value = ersatz.point || ''; ip1.style.width = '210px';
    ip1.placeholder = 'tele.STATE';
    ip1.addEventListener('click', function (ev) { ev.stopPropagation(); });
    ip1.addEventListener('change', function () { setzeErsatz('point', ip1.value); });
    zeile.appendChild(dtFeld(tr('detail.datapoint'), ip1));

    var ip2 = el('input', 'tx');
    ip2.type = 'text'; ip2.value = ersatz.jsonField || ''; ip2.style.width = '150px';
    ip2.placeholder = '—';
    ip2.addEventListener('click', function (ev) { ev.stopPropagation(); });
    ip2.addEventListener('change', function () { setzeErsatz('jsonField', ip2.value); });
    zeile.appendChild(dtFeld(tr('detail.jsonField'), ip2));

    var ip3 = el('input', 'tx');
    ip3.type = 'text'; ip3.value = ersatz.readFormula || ''; ip3.style.width = '230px';
    ip3.placeholder = tr('detail.formulaPlaceholder');
    ip3.addEventListener('click', function (ev) { ev.stopPropagation(); });
    ip3.addEventListener('change', function () { setzeErsatz('readFormula', ip3.value); });
    zeile.appendChild(dtFeld(tr('detail.formula'), ip3));

    var x1 = el('button', 'btn schmal', tr('tv.removeFallback'));
    x1.type = 'button';
    x1.addEventListener('click', function (ev) {
      ev.stopPropagation();
      vAendern(function (tpl) {
        var tplZeileFrisch = tpl.points[nr];
        var liste = ersatzListe(tplZeileFrisch);
        liste.splice(wi, 1);
        schreibeErsatz(tplZeileFrisch, liste);
      }, null);
    });
    zeile.appendChild(dtFeld(' ', x1));

    sb.appendChild(zeile);
  });

  var plus = el('button', 'btn schmal', tr('tv.addFallback'));
  plus.type = 'button';
  plus.addEventListener('click', function (ev) {
    ev.stopPropagation();
    vAendern(function (tpl) {
      var tplZeileFrisch = tpl.points[nr];
      var liste = ersatzListe(tplZeileFrisch);
      liste.push({ point: '' });
      schreibeErsatz(tplZeileFrisch, liste);
    }, null);
  });
  sb.appendChild(plus);
  sb.appendChild(el('div', 'sugg', tr('tv.fallbackHint')));
  dtZeile(d, tr('tv.fallback'), sb);

  dtZeile(d, tr('detail.writesTo'),
    eingabe(tplZeile.write, 'write', '260px', tr('detail.noWrite')));

  var fb = el('div');
  fb.appendChild(eingabe(tplZeile.readFormula, 'readFormula', '100%', tr('detail.formulaPlaceholder')));
  if ((tplZeile.type || '') === 'boolean') {
    fb.appendChild(el('div', 'sugg', tr('detail.formulaHint')));
  }
  dtZeile(d, tr('detail.formula'), fb);

  if (tplZeile.write) {
    var wb = el('div');
    wb.appendChild(eingabe(tplZeile.writeFormula, 'writeFormula', '100%', tr('detail.writeFormulaPlaceholder')));
    wb.appendChild(el('div', 'sugg', tr('detail.writeFormulaHint')));
    dtZeile(d, tr('detail.writeFormula'), wb);
  }

  dtZeile(d, tr('detail.role'), rollenBlock(tplZeile.role, tplJetzt.deviceType, function (neu) {
    setzeFeld('role', neu);
  }, tplZeile.type, function (t) { setzeFeld('type', t); }));

  dtZeile(d, tr('detail.display'), anzeigeBlock(
    function (was) {
      if (was === 'einheit') { return tplZeile.unit; }
      if (was === 'dec') { return tplZeile.decimals; }
      if (was === 'caption') { return tplZeile.caption; }
      return tplZeile.type;
    },
    function (was, wert) {
      if (was === 'einheit') { return setzeFeld('unit', wert); }
      if (was === 'dec') { return setzeFeld('decimals', wert, function (w) { return w === '' ? '' : Number(w); }); }
      if (was === 'caption') { return setzeFeld('caption', wert); }
      setzeFeld('type', wert);
    }, tplZeile.name));

  var haken = function (label, an, tut) {
    var l = el('label', 'fld');
    l.style.flexDirection = 'row';
    l.style.alignItems = 'center';
    l.style.gap = '5px';
    var c = document.createElement('input');
    c.type = 'checkbox';
    c.checked = an;
    c.addEventListener('click', function (ev) { ev.stopPropagation(); });
    c.addEventListener('change', function () { vAendern(function (tpl) { tut(tpl.points[nr], c.checked); }); });
    l.appendChild(c);
    l.appendChild(el('span', null, label));
    return l;
  };

  var zeile2 = el('div', 'fields');
  /* Beide Haken laufen in dieselbe Richtung wie im Speichern-Dialog:
     angehakt heisst „ja". Vorher stand hier „freiwillig" und „Vorgabe
     aus" — also zweimal die Umkehrung, was niemand zusammenbringt. */
  zeile2.appendChild(haken(tr('tpls.colDefault'), !tplZeile.offByDefault,
    function (tplZeileFrisch, an) { if (an) { delete tplZeileFrisch.offByDefault; } else { tplZeileFrisch.offByDefault = true; } }));

  /* Der Haken setzt nur noch `optional` an der Zeile — also genau das,
     was er behauptet.

     Vorher schrieb er zusaetzlich in `erkennung.erforderlich`, „damit
     Liste und Zeile nicht Verschiedenes behaupten". Das sind aber zwei
     verschiedene Fragen: ob ein Geraet einen Punkt haben muss, damit die
     Vorlage ueberhaupt greift, und ob eine Zeile beim Anwenden fehlen
     darf. Wer hier hakte, verengte unbemerkt die Erkennung — bei
     `tasmota-lampe` haette das Anhaken von SET die Vorlage an
     `stat.POWER` gebunden, das es an einem frisch eingebundenen Geraet
     noch gar nicht gibt. Die Erkennungsliste wird im Kasten „Erkennung"
     darueber gepflegt, mit eigenem Feld. */
  zeile2.appendChild(haken(tr('tpls.colRequired'), istPflichtpunkt(tplZeile), function (tplZeileFrisch, an) {
    if (an) { delete tplZeileFrisch.optional; } else { tplZeileFrisch.optional = true; }
  }));

  zeile2.appendChild(haken(tr('tpls.absolute'), !!tplZeile.absolute,
    function (tplZeileFrisch, an) { if (an) { tplZeileFrisch.absolute = true; } else { delete tplZeileFrisch.absolute; } }));
  var wKnopf = el('button', 'btn schmal', tr('tv.removeState'));
  wKnopf.addEventListener('click', function () {
    vAendern(function (tpl) { tpl.points.splice(nr, 1); vOffeneZeile = null; });
  });
  zeile2.appendChild(wKnopf);
  dtZeile(d, tr('tv.inTemplate'), zeile2);

  var hw = el('div', 'sugg');
  hw.textContent = tr('tv.flagsHelp');
  dtZeile(d, '', hw);

  /* Eine mitgelieferte Vorlage wird angesehen, nicht geaendert.

     Gesperrt wird am fertigen Block, nicht an jedem der rund dreissig
     Felder einzeln: so kann keines vergessen werden, wenn spaeter eines
     dazukommt. Ohne Eingabemoeglichkeit feuert auch kein `change`, also
     entsteht gar kein Arbeitsstand — wer nur nachsieht, hat hinterher
     keine ungewollte Kopie im Bestand. */
  if (!eigen) {
    Array.prototype.forEach.call(d.querySelectorAll('input, select, textarea, button'),
      function (tpl) { tpl.disabled = true; });
    var ro = el('div', 'hint');
    ro.textContent = tr('tv.readOnlyRow');
    d.insertBefore(ro, d.firstChild);
  }
  return d;
}

function vDuplizieren(tpl, gleicheKennung) {
  var tplKopie = JSON.parse(JSON.stringify(ohneUnterstrich(tpl)));
  if (gleicheKennung) {
    /* Uebernehmen statt abwandeln: gleiche Kennung, eine Version
       weiter — damit verdeckt sie die mitgelieferte. */
    tplKopie.version = (tplKopie.version || 1) + 1;
  } else {
    tplKopie.id = freierSchluessel(tplKopie.id + '-kopie');
    tplKopie.version = 1;
    tplKopie.priority = eigenerMaxRang() + 10;
    tplKopie.name = { de: textIn(tplKopie.name, 'de') + ' (Kopie)', en: textIn(tplKopie.name, 'en') + ' (copy)' };
  }
  if (typeof tplKopie.name === 'string') { tplKopie.name = { de: tplKopie.name, en: tplKopie.name }; }
  vEinlesen = null;
  vEntwurf = tplKopie;
  vEntwurf._quelle = 'benutzer';
  vGewaehlt = tplKopie.id;
  vLoeschFrage = false;
  zeichneVorlagenListe();
  zeichneErgebnis();
}

/* Ausgeben als Datei — dasselbe Format wie admin/vorlagen/*.json, damit
   eine gut gewordene Vorlage ohne Umbau ins Paket wandern kann. */
function vAusgeben(tpl) {
  var text = JSON.stringify(ohneUnterstrich(tpl), null, 2) + '\n';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = tpl.id + '.json';
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
function vPruefeEingelesen(tpl) {
  if (!tpl || typeof tpl !== 'object' || Array.isArray(tpl)) { return tr('tv.badNotObject'); }
  /* Alte Dateien werden abgewiesen, nicht umgesetzt - Ricardos
     Entscheidung vom 21.11.2026. Erkennen muessen wir sie trotzdem:
     sonst kaeme gleich danach „keine Zeilen", weil `points` fehlt, und
     niemand wuesste, dass es am Format liegt und nicht an der Datei. */
  if (istAlteVorlage(tpl)) { return tr('tv.badOldFormat'); }
  if (!tpl.id || typeof tpl.id !== 'string') { return tr('tv.badNoId'); }
  if (!Array.isArray(tpl.points) || !tpl.points.length) { return tr('tv.badNoStates'); }
  /* Lese- ODER Schreibpfad, wie beim Speichern und Anwenden. Eine Zeile
     nur mit `schreiben` (ein Befehl ohne Rueckmeldung, frueher auch der
     STOP am Rollladen) ist gueltig; bis 19.09.2026 wies das Einlesen sie
     ab, und die Werkbank gab Dateien aus, die sie selbst nicht wieder
     annahm (I7). */
  var schlecht = tpl.points.filter(function (tplZeile) { return !tplZeile || !tplZeile.name || !(tplZeile.read || tplZeile.write); });
  if (schlecht.length) { return tr('tv.badState', schlecht.length); }

  if (tpl.name !== undefined &&
      !(typeof tpl.name === 'string' ||
        (tpl.name && typeof tpl.name === 'object' && !Array.isArray(tpl.name)))) {
    return tr('tv.badName');
  }
  if (tpl.detection !== undefined &&
      (!tpl.detection || typeof tpl.detection !== 'object' || Array.isArray(tpl.detection))) {
    return tr('tv.badRecog');
  }
  var erk = tpl.detection || {};
  var listen = ['required', 'forbidden'];
  for (var i = 0; i < listen.length; i++) {
    var w = erk[listen[i]];
    if (w === undefined) { continue; }
    if (typeof w === 'string') { erk[listen[i]] = [w]; continue; }
    if (!Array.isArray(w) || w.some(function (x) { return typeof x !== 'string'; })) {
      return tr('tv.badList', listen[i]);
    }
  }
  if (erk.content !== undefined &&
      (!erk.content || typeof erk.content !== 'object' || Array.isArray(erk.content))) {
    return tr('tv.badContent');
  }
  if (erk.nameHint !== undefined &&
      (typeof erk.nameHint !== 'string' || !hinweisTaugt(erk.nameHint))) {
    return tr('tv.badNameHint');
  }
  /* Ein Musternamen, den dieser Detector nicht kennt, wirft spaeter in
     der Musterwahl — und der Entwurf wird dann gar nicht erst
     gezeichnet. Lieber hier abweisen, wo noch jemand zusieht. */
  if (tpl.deviceType !== undefined &&
      (typeof tpl.deviceType !== 'string' || (tpl.deviceType && !musterVon(tpl.deviceType)))) {
    return tr('tv.badType', String(tpl.deviceType));
  }
  return null;
}

function vSpeichern() {
  var tplJetzt = vArbeitsstand();
  if (!tplJetzt) { return; }
  var rein = ohneUnterstrich(tplJetzt);

  /* Aendert sich der Inhalt, zaehlt die Version weiter. Sonst traegt
     jedes Geraet fuer immer „vorlageVersion: 1" und gilt als aktuell —
     ein spaeteres Nachziehen haette nie etwas zu melden. Das Duplizieren
     zaehlte schon hoch, das Speichern nicht. */
  var alt = vorlageMitId(rein.id);
  if (alt) {
    var ohneV = function (tpl) {
      var tplKopie = JSON.parse(JSON.stringify(ohneUnterstrich(tpl)));
      delete tplKopie.version;
      return JSON.stringify(tplKopie);
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
function ausgangsVorspaenne(zeilen, dlgKopf) {
  var i = (dlgKopf.instanz === null || dlgKopf.instanz === undefined) ? '' : String(dlgKopf.instanz);
  var raus = [];
  var dazu = function (vorspann) { if (vorspann && raus.indexOf(vorspann) === -1) { raus.push(vorspann); } };

  var kn = String(dlgKopf.kanalname || 'POWER%N%');
  if (kn.indexOf('%N%') !== -1) { dazu(kn.split('%N%')[0]); }

  ((dlgKopf.quelle && dlgKopf.quelle.points) || []).forEach(function (tplZeile) {
    [tplZeile.read, tplZeile.write].forEach(function (pf) {
      String(pf || '').split('.').forEach(function (t) {
        var n = t.indexOf('%N%');
        if (n > 0) { dazu(t.slice(0, n)); }
      });
    });
  });

  if (i) {
    var wie = {};
    (zeilen || []).forEach(function (dlgZeile) {
      if (dlgZeile.weg) { return; }
      [dlgZeile.lesenAbs ? '' : dlgZeile.lesenRoh, dlgZeile.schreibenAbs ? '' : dlgZeile.schreibenRoh].forEach(function (pf) {
        String(pf || '').split('.').forEach(function (t) {
          if (t.length > i.length && t.slice(-i.length) === i) {
            var vorspann = t.slice(0, -i.length);
            wie[vorspann] = (wie[vorspann] || 0) + 1;
          }
        });
      });
    });
    Object.keys(wie).forEach(function (vorspann) { if (wie[vorspann] > 1) { dazu(vorspann); } });
  }
  return raus;
}

/* Welcher Pfad steht am Ende in der Vorlage? Bei einem Mehrfachgeraet
   tritt der Platzhalter an die Stelle der Ausgangsnummer. */
function zPfad(dlgZeile, dlgKopf, schreibend, zeilen) {
  var roh = schreibend ? dlgZeile.schreibenRoh : dlgZeile.lesenRoh;
  var abs = schreibend ? dlgZeile.schreibenAbs : dlgZeile.lesenAbs;
  if (!roh) { return ''; }
  if (!dlgKopf.mehrfach || abs || !dlgKopf.instanz) { return roh; }
  return zuPlatzhalter(roh, dlgKopf.instanz,
    ausgangsVorspaenne(zeilen || (S.tplZ && S.tplZ.zeilen) || [], dlgKopf));
}

/* Endet die Nummer eines Ausgangs in den Pfaden? Haeufigste Zahl am
   Ende eines Abschnitts gewinnt — cmnd.POWER1, stat.POWER1 sagen 1. */
function rateInstanz(zeilen, geraetName, vorspann) {
  var zaehler = {}, nurVorspann = {};
  zeilen.forEach(function (dlgZeile) {
    if (dlgZeile.lesenAbs) { return; }
    String(dlgZeile.lesenRoh).split('.').forEach(function (t) {
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
  zeilen.forEach(function (dlgZeile) {
    if (dlgZeile.weg || dlgZeile.lesenAbs) { return; }
    var fremd = null;
    String(dlgZeile.lesenRoh).split('.').forEach(function (t) {
      var m = /^(.*[^0-9])([0-9]{1,2})$/.exec(t);
      /* Dieselbe Regel wie beim Platzhalter: nur was den Ausgang traegt.
         Sonst stand `tele.INFO2` an Ausgang 1 als fremder Ausgang da,
         und „Andere weglassen" warf die IP-Zeile hinaus. */
      if (m && m[2] !== String(instanz) && vs.indexOf(m[1]) !== -1) { fremd = m[2]; }
    });
    if (fremd) {
      raus.punkte.push(dlgZeile.name);
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
  S.VORLAGEN.forEach(function (tpl) {
    if (tpl._quelle === 'benutzer' && (tpl.priority || 0) > m) { m = tpl.priority || 0; }
  });
  return m;
}

function freierSchluessel(basis) {
  var da = {};
  S.VORLAGEN.forEach(function (tpl) { da[tpl.id] = 1; });
  if (!da[basis]) { return basis; }
  for (var i = 2; i < 99; i++) { if (!da[basis + '-' + i]) { return basis + '-' + i; } }
  return basis + '-neu';
}

export function vorlagenVorbereiten(e) {
  var quellTpl = null;
  S.VORLAGEN.forEach(function (tpl) { if (tpl.id === e.vorlage) { quellTpl = tpl; } });
  var maxRang = eigenerMaxRang();

  var mehrfach = !!(quellTpl && quellTpl.multiple);
  var inst = mehrfach ? e.instanz : null;

  var zeilen = [];
  e.states.forEach(function (ePunkt) {
    /* Eine Zeile braucht wenigstens ein Ziel - lesend oder schreibend.
       `STOP` am Rollladen hat nur ein Schreibziel: ein Tastendruck hat
       keinen Zustand zum Lesen. Bis 11.09.2026 stand hier `!ePunkt.srcR`,
       und solche Zeilen fielen beim Speichern lautlos weg. Dass das
       Anwenden diesen Fall kennt, steht seit dem 09.09.2026 in
       vorlagen.js - die Gegenrichtung war vergessen worden. */
    if (!ePunkt.n || (!ePunkt.srcR && !ePunkt.srcW)) { return; }
    var r = ePunkt.srcR ? relZu(ePunkt.srcR, e.kanal) : { p: '', abs: false };
    /* Das Schreibziel gehoert in die Vorlage, auch wenn es derselbe
       Punkt ist wie der gelesene. Bis 11.09.2026 stand hier zusaetzlich
       `ePunkt.srcW !== ePunkt.srcR`, und genau das trifft auf jeden Aktor zu, der
       seinen eigenen Zustand fuehrt: Rollladen, Dimmer, Thermostat
       schreiben auf denselben Punkt, den sie lesen (1.LEVEL). Beim
       Speichern verschwand ihr Schreibweg - der Alias zeigte die
       Position an und liess sich nicht mehr verstellen. Aufgefallen
       bei Tasmota nie, weil dort tele.STATE gelesen und cmnd.POWER
       geschrieben wird. */
    var w = ePunkt.srcW ? relZu(ePunkt.srcW, e.kanal) : null;
    var tplZeile = null;
    if (quellTpl && ePunkt.ausVorlage) {
      (quellTpl.points || []).forEach(function (kandidat) { if (kandidat.name === ePunkt.ausVorlage) { tplZeile = kandidat; } });
    }
    /* Steht der Punkt in der Erkennung der Vorlage, muss er da sein -
       auch wenn seine Zeile optional ist. `hm-rollladen` fuehrt STOP als
       optionale Zeile, verlangt `1.STOP` aber in der Erkennung: nur er
       trennt den Rollladen vom Dimmer. Vorgehakt wurde bis 19.09.2026 nur
       nach `optional`, und wer die Vorlage aktualisierte, ohne selbst
       nachzuhaken, speicherte eine, die schon bei LEVEL allein greift -
       im Probelauf 23 Geraete statt der Rolllaeden (I20). */
    var erfQ = (quellTpl && quellTpl.detection && quellTpl.detection.required) || [];
    var inErkennung = !!(tplZeile && ((tplZeile.read && erfQ.indexOf(tplZeile.read) > -1) ||
                                (tplZeile.write && erfQ.indexOf(tplZeile.write) > -1)));
    zeilen.push({
      s: ePunkt,
      name: ePunkt.n,
      /* Roh heisst: relativ zum Geraet, aber noch mit der konkreten
         Ausgangsnummer. Der Platzhalter wird erst gesetzt, wenn er
         gebraucht wird — sonst liesse sich der Haken „mehrere
         Ausgaenge" nicht mehr umlegen. */
      lesenRoh: r.p,
      lesenAbs: r.abs,
      schreibenRoh: w ? w.p : '',
      schreibenAbs: w ? w.abs : false,
      aus: !ePunkt.on,
      /* Vorschlag: was einen Schreibweg hat, traegt das Geraet. Was aus
         einer Vorlage kam, erbt deren Einstufung. Von Hand ergaenzte
         Punkte bleiben freiwillig — jeder Pflichtpunkt macht die
         Vorlage genauer und zugleich sproeder. */
      pflicht: r.abs ? false : (tplZeile ? (!tplZeile.optional || inErkennung) : !!w),
      /* Die Zeile bleibt, was sie in der Vorlage war: optional fuer den
         Alias, Pflicht nur fuer die Erkennung. Der Haken „muss da sein"
         legt sonst beides zusammen fest. */
      optionalBleibt: !!(tplZeile && tplZeile.optional && inErkennung)
    });
  });

  var inhalte = [];
  zeilen.forEach(function (dlgZeile) {
    var f = feldAusFormel(dlgZeile.s.f);
    if (!f || dlgZeile.lesenAbs) { return; }
    var oben = pfadAus([pfadTeile(f)[0]]);
    var da = false;
    inhalte.forEach(function (x) { if (x.punkt === dlgZeile.lesenRoh && x.feld === oben) { da = true; } });
    if (!da) { inhalte.push({ punkt: dlgZeile.lesenRoh, feld: oben, an: false }); }
  });
  if (quellTpl && quellTpl.detection && quellTpl.detection.content) {
    Object.keys(quellTpl.detection.content).forEach(function (p) {
      var da = false;
      inhalte.forEach(function (x) {
        if (x.punkt === p) { da = true; x.an = true; x.feld = quellTpl.detection.content[p]; }
      });
      if (!da) { inhalte.push({ punkt: p, feld: quellTpl.detection.content[p], an: true }); }
    });
  }

  var geraetName = (e.kanal || '').split('.').pop();
  return {
    e: e,
    zeilen: zeilen,
    inhalte: inhalte,
    kopf: {
      modus: quellTpl ? 'update' : 'neu',
      quelle: quellTpl,
      id: quellTpl ? quellTpl.id : freierSchluessel(schluesselAus(geraetName)),
      nameDe: quellTpl ? textIn(quellTpl.name, 'de') : geraetName,
      nameEn: quellTpl ? textIn(quellTpl.name, 'en') : geraetName,
      geraetetyp: e.want || (quellTpl ? quellTpl.deviceType : '') || '',
      /* Was die Vorlage schon sagt, gilt; sonst das, was am Geraet
         eingestellt ist. Wer eine Vorlage aus einem Geraet baut, hat die
         Funktion dort meist gerade gesetzt - sie noch einmal auswaehlen
         zu muessen waere Arbeit ohne Gewinn. */
      funktion: (quellTpl && quellTpl.enumFunction) || kennungZuFunktion(e.funktion) || '',
      namenshinweis: quellTpl ? ((quellTpl.detection || {}).nameHint || '') : '',
      rang: quellTpl ? (quellTpl.priority || 0) : maxRang + 10,
      maxRang: maxRang,
      mehrfach: mehrfach,
      instanz: mehrfach ? String(inst === null || inst === undefined ? '' : inst)
                        : rateInstanz(zeilen, geraetName,
                            String((quellTpl && quellTpl.channelName) || 'POWER%N%').split('%N%')[0]),
      kanalname: (quellTpl && quellTpl.channelName) ? quellTpl.channelName : 'POWER%N%',
      verboten: quellTpl ? (((quellTpl.detection || {}).forbidden) || []).join(', ') : '',
      geraetName: geraetName
    }
  };
}

/* Der Entwurf als Vorlagenobjekt — genau das, was gespeichert wird. */
export function baueVorlage(dlg) {
  var dlgKopf = dlg.kopf;
  var tpl = {
    id: dlgKopf.id,
    version: dlgKopf.modus === 'update' && dlgKopf.quelle ? (dlgKopf.quelle.version || 1) + 1 : 1,
    priority: Number(dlgKopf.rang) || 0,
    name: { de: dlgKopf.nameDe || dlgKopf.id, en: dlgKopf.nameEn || dlgKopf.nameDe || dlgKopf.id },
    deviceType: dlgKopf.geraetetyp || undefined,
    enumFunction: dlgKopf.funktion || undefined,
    detection: {}
  };

  var erf = [];
  dlg.zeilen.forEach(function (dlgZeile) {
    if (dlgZeile.weg || !dlgZeile.pflicht || dlgZeile.lesenAbs) { return; }
    var lp = zPfad(dlgZeile, dlgKopf, false, dlg.zeilen);
    var sp = zPfad(dlgZeile, dlgKopf, true, dlg.zeilen);
    if (erf.indexOf(lp) === -1) { erf.push(lp); }
    if (sp && !dlgZeile.schreibenAbs && erf.indexOf(sp) === -1) { erf.push(sp); }
  });
  tpl.detection.required = erf;

  var verb = String(dlgKopf.verboten || '').split(',').map(function (x) { return x.trim(); })
    .filter(function (x) { return !!x; });
  /* Ein Punkt kann nicht zugleich Pflicht und verboten sein — so eine
     Vorlage passt auf gar nichts. Der Widerspruch entsteht leicht: man
     traegt unten „darf es nicht geben" ein und vergisst, dass derselbe
     Punkt oben schon „muss da sein" ist. */
  tpl.widerspruch = verb.filter(function (x) { return erf.indexOf(x) !== -1; });
  if (verb.length) { tpl.detection.forbidden = verb; }

  var inh = {};
  dlg.inhalte.forEach(function (x) { if (x.an) { inh[x.punkt] = x.feld; } });
  if (Object.keys(inh).length) { tpl.detection.content = inh; }
  if (dlgKopf.namenshinweis) { tpl.detection.nameHint = dlgKopf.namenshinweis; }
  /* Was die Erkennung der Ursprungsvorlage sonst traegt - der Hinweis,
     warum ein Punkt Pflicht ist, etwa - bleibt erhalten. Der Dialog
     zeigt es nicht, also darf er es auch nicht verlieren (I20). */
  if (dlgKopf.modus === 'update' && dlgKopf.quelle && dlgKopf.quelle.detection) {
    Object.keys(dlgKopf.quelle.detection).forEach(function (feld) {
      if (['required', 'forbidden', 'content', 'nameHint'].indexOf(feld) > -1) { return; }
      tpl.detection[feld] = dlgKopf.quelle.detection[feld];
    });
  }

  if (dlgKopf.mehrfach && dlgKopf.instanz) {
    tpl.multiple = { placeholder: '%N%' };
    tpl.channelName = dlgKopf.kanalname || 'POWER%N%';
  }

  tpl.points = dlg.zeilen.filter(function (dlgZeile) { return !dlgZeile.weg; }).map(function (dlgZeile) {
    var ePunkt = dlgZeile.s;
    var f = feldAusFormel(ePunkt.f);
    var tplZeile = {
      name: dlgZeile.name,
      role: ePunkt.role || undefined,
      type: ePunkt.typ || undefined,
      unit: ePunkt.unit || undefined
    };
    /* Ohne Lesequelle kein `lesen` - sonst stuende dort ein leerer
       Pfad, und `wendeAn` suchte einen Punkt namens "". */
    if (dlgZeile.lesenRoh) { tplZeile.read = zPfad(dlgZeile, dlgKopf, false, dlg.zeilen); }
    if (dlgZeile.lesenAbs) { tplZeile.absolute = true; }
    if (dlgZeile.schreibenRoh) { tplZeile.write = zPfad(dlgZeile, dlgKopf, true, dlg.zeilen); }
    if (f) { tplZeile.jsonField = f; } else if (ePunkt.f) { tplZeile.readFormula = ePunkt.f; }
    if (ePunkt.fw && dlgZeile.schreibenRoh) { tplZeile.writeFormula = ePunkt.fw; }
    if (!dlgZeile.pflicht || dlgZeile.optionalBleibt) { tplZeile.optional = true; }
    if (dlgZeile.aus) { tplZeile.offByDefault = true; }
    if (ePunkt.caption) { tplZeile.caption = ePunkt.caption; }
    if (ePunkt.dec !== undefined && ePunkt.dec !== '') { tplZeile.decimals = Number(ePunkt.dec); }
    if (ePunkt.states) { tplZeile.valueList = ePunkt.states; }
    if (ePunkt.hinweis) { tplZeile.note = ePunkt.hinweis; }
    /* Was die Vorlage sonst noch als Lesequelle kannte. Der gerade
       genommene Weg steht schon in `lesen` und faellt hier weg. */
    if (ePunkt.wege && ePunkt.wege.length > 1) {
      var rest = ePunkt.wege.filter(function (weg) { return weg.punkt !== tplZeile.read; })
        .map(function (weg) {
          var ersatzNeu = { point: weg.punkt };
          if (weg.feld) { ersatzNeu.jsonField = weg.feld; }
          /* `leseformel`, nicht `formel`. `wendeAn` legt die Wege mit
             dem Schluessel `formel` ab, jeder Leser sucht in
             `lesenSonst` aber `leseformel` (vorlagen.js:462,
             vorlagenblatt.js:720). Die Formel jeder Ersatzquelle ging
             beim Aktualisieren still verloren: bei tasmota-steckdose
             landete der boolesche Alias an Geraeten ohne `stat.POWER`
             danach auf dem rohen JSON-Text von `tele.STATE` statt auf
             `POWER` (gemessen 09.09.2026). */
          if (weg.formel) { ersatzNeu.readFormula = weg.formel; }
          return ersatzNeu;
        });
      if (rest.length) { tplZeile.readFallback = (rest.length === 1) ? rest[0] : rest; }
    }
    return tplZeile;
  });

  /* Das Rollenwissen: alles, was am Geraet liegt und keine Zeile der
     Vorlage ist, wandert als Pfad→Rolle mit. Der Vorschlag ignoriert
     es; die Ansicht „Alle Datenpunkte des Geraets" liest daraus die
     Rollen, die hm-rpc am Geraet leer laesst. Rangfolge je Punkt: was
     die aktuelle Zeile sagt (Handarbeit im Entwurf), dann das
     gepflegte Wissen der Ursprungsvorlage, zuletzt die Geraeterolle.
     Ohne Rolle kein Eintrag - leeres Wissen hilft niemandem. */
  var zeilenQuellen = {};
  dlg.zeilen.forEach(function (dlgZeile) {
    if (dlgZeile.weg) { return; }
    if (dlgZeile.lesenRoh && !dlgZeile.lesenAbs) { zeilenQuellen[dlgZeile.lesenRoh] = true; }
    if (dlgZeile.schreibenRoh && !dlgZeile.schreibenAbs) { zeilenQuellen[dlgZeile.schreibenRoh] = true; }
  });
  var altesWissen = (dlgKopf.modus === 'update' && dlgKopf.quelle && dlgKopf.quelle.extraPoints) || {};
  var wissen = {};
  kindZustaende(dlg.e.kanal).forEach(function (id) {
    var rel = relZu(id, dlg.e.kanal);
    if (rel.abs || zeilenQuellen[rel.p]) { return; }
    var zeilenRolle = '';
    dlg.e.states.forEach(function (s0) {
      if (!zeilenRolle && s0.srcR === id && s0.role) { zeilenRolle = s0.role; }
    });
    var o0 = S.objects[id];
    var rolle = zeilenRolle || altesWissen[rel.p] ||
                ((o0 && o0.common && o0.common.role) || '');
    if (rolle) { wissen[rel.p] = rolle; }
  });
  /* Gepflegtes Wissen tplZeile Punkten, die dieses eine Geraet gerade nicht
     hat, bleibt erhalten - andere Geraete des Typs haben sie. */
  Object.keys(altesWissen).forEach(function (pf) {
    if (!zeilenQuellen[pf] && !wissen[pf]) { wissen[pf] = altesWissen[pf]; }
  });
  if (Object.keys(wissen).length) { tpl.extraPoints = wissen; }

  /* Was die Ursprungsvorlage sonst noch mitbringt — etwa
     nebenwirkungen — bleibt erhalten. Sonst fiele beim Aktualisieren
     still unter den Tisch, was der Dialog gar nicht anzeigt. */
  var bekannt = { id: 1, version: 1, priority: 1, name: 1, deviceType: 1,
                  enumFunction: 1, detection: 1, multiple: 1, channelName: 1,
                  points: 1, extraPoints: 1 };
  if (dlgKopf.modus === 'update' && dlgKopf.quelle) {
    Object.keys(dlgKopf.quelle).forEach(function (feld) {
      if (feld.charAt(0) === '_' || bekannt[feld]) { return; }
      tpl[feld] = dlgKopf.quelle[feld];
    });
  }

  return JSON.parse(JSON.stringify(tpl));      /* undefined weg */
}

/* Kandidaten fuer den Probelauf. Nicht jeder Knoten im Baum — nur die,
   unter denen der erste Pflichtpunkt ueberhaupt vorkommt. Sonst muesste
   hatPunkt fuer tausende Knoten die Kleinschreibkarte aufbauen, und das
   dauert auf einer grossen Anlage sichtbar lange. */
function kandidatenFuer(tpl) {
  var erk = tpl.detection || {};
  var erf = erk.required || [];
  if (!erf.length) { return []; }
  var ph = tpl.multiple ? (tpl.multiple.placeholder || '%N%') : null;
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
  Object.keys(erk.content || {}).forEach(sammle);

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

function probeWerteHolen(tpl, danach) {
  var erk = tpl.detection || {};
  var ph = tpl.multiple ? (tpl.multiple.placeholder || '%N%') : null;

  /* Nicht nur die Erkennungspunkte, sondern auch die, aus denen die
     ZEILEN lesen — samt ihrer Ersatzwege.

     Sonst urteilt der Probelauf ueber Felder in Werten, die er gar nicht
     hat: am `Brenner` lag `tele.STATE` im Speicher und `tele.SENSOR`
     nicht, und derselbe Probelauf meldete je nachdem, was man vorher
     angeklickt hatte, „1 statt 11" oder „1 statt 20" (Ricardo,
     14.09.2026). Eine Zahl, die von der Vorgeschichte abhaengt, ist
     keine. Hier soll dasselbe herauskommen wie beim „Alias anlegen",
     und dort sind alle Werte des Geraets geladen. */
  var pfade = Object.keys(erk.content || {});
  (tpl.points || []).forEach(function (tplZeile) {
    if (tplZeile.absolute) { return; }
    if (tplZeile.read) { pfade.push(tplZeile.read); }
    var sonst = tplZeile.readFallback;
    if (!sonst) { return; }
    (Array.isArray(sonst) ? sonst : [sonst]).forEach(function (x) {
      var pf = (typeof x === 'string') ? x : x.point;
      if (pf) { pfade.push(pf); }
    });
  });
  pfade = pfade.filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  if (!pfade.length) { return false; }

  var fehlt = [];
  kandidatenFuer(tpl).forEach(function (kanal) {
    pfade.forEach(function (p0) {
      var pfad = ph ? String(p0).split(ph).join('1') : p0;
      var id = hatPunkt(kanal, pfad);
      if (id && S.werte[id] === undefined && !probeGeholt[id]) { fehlt.push(id); }
    });
  });
  fehlt = fehlt.filter(function (x, i, a) { return a.indexOf(x) === i; });
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
       nichts, auch wenn sie den Vergleich gegen alle anderen gewinnt.

       Die Punktbeste ist nicht zwingend die Gewinnerin: greift sie am
       Geraet nicht, ruecken die naechsten nach — genau wie in
       `vorschlag`. Vorher stand hier nur DIE eine punktbeste andere, und
       griff die nicht, erklaerte sich die gepruefte Vorlage zur
       Siegerin. An `PC_Bastelzimmer` meldete deshalb „Reiner Messpunkt"
       einen Sieg, obwohl `tasmota-steckdose` dazwischenliegt und dort
       wirklich greift (Ricardo, 14.09.2026). */
    var rang = [];
    S.VORLAGEN.forEach(function (tpl) {
      var x = pruefeVorlage(tpl, p);
      if (x.passt) { rang.push(x); }
    });
    rang.sort(function (a, b) { return b.punkte - a.punkte; });
    var ersteGreifende = function (ausser) {
      for (var i = 0; i < rang.length; i++) {
        if (ausser && rang[i].vorlage.id === ausser) { continue; }
        var x = wendeAn(rang[i].vorlage, p, rang[i].gruende, rang[i].instanz, true);
        if (x && x.states.length && !x.pflichtFehlt) { return rang[i]; }
      }
      return null;
    };
    var jetzt = ersteGreifende(null);
    var andere = ersteGreifende(neu.id);
    /* Gewinnen ist nicht dasselbe wie greifen.

       `pruefeVorlage` fragt, ob die genannten Punkte da sind; `wendeAn`
       braucht bestimmte Felder darin. Eine Vorlage, deren Zeilen
       `SML.Total_Summe` lesen, gewinnt an jeder Tasmota mit
       `tele.SENSOR` — und baut dort dann keine einzige Zeile.

       Das laesst sich nicht vorhersagen, ohne zu raten. Also wird es
       gemessen: derselbe Aufruf, der beim Anlegen auch laeuft. Kostet
       nichts, weil die Kandidatenliste ohnehin schon durchgegangen
       wird (gefunden 14.09.2026, C3). */
    /* Mit `auchOhneTreffer`, damit auch der gescheiterte Fall zurueckkommt
       — sonst wuesste man nur „null", nicht warum. */
    var gebaut = wendeAn(neu, p, t.gruende, t.instanz, true);
    var greift = !!(gebaut && gebaut.states.length && !gebaut.pflichtFehlt);

    /* Gewonnen hat nur, wer hier auch greift — und `andere` ist bereits
       die beste, die das tut. */
    var vorn = greift && (!andere || t.punkte > andere.punkte);

    raus.push({
      id: p, eigen: t, gegner: andere,
      greift: greift, fehlendeZeile: gebaut ? gebaut.pflichtFehlt : null,
      zeilen: gebaut ? gebaut.states.length : 0,
      gewinnt: vorn,
      wechsel: !!(jetzt && jetzt.vorlage.id !== neu.id && vorn)
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
  var dlg = S.tplZ;
  if (!dlg) { return; }
  var dlgKopf = dlg.kopf;
  var body = $('#tpl-body');
  body.textContent = '';

  /* --- aktualisieren oder neu --- */
  if (dlgKopf.quelle) {
    var wahl = el('div', 'card');
    wahl.style.marginBottom = '11px';
    var wh = el('div', 'ch');
    wh.appendChild(el('span', 'typ', tr('tpls.whatToDo')));
    wahl.appendChild(wh);
    var wb = el('div');
    wb.style.padding = '9px 12px 11px';
    [['update', tr('tpls.updateIt', textIn(dlgKopf.quelle.name, sprache), (dlgKopf.quelle.version || 1) + 1),
      dlgKopf.quelle._quelle === 'paket' ? tr('tpls.shadowsPackage') : ''],
     ['neu', tr('tpls.saveAsNew'), tr('tpls.saveAsNewHint')]].forEach(function (w) {
      var dlgZeile = el('label');
      dlgZeile.style.display = 'block';
      dlgZeile.style.margin = '3px 0';
      dlgZeile.style.fontSize = '12.5px';
      var rb = document.createElement('input');
      rb.type = 'radio';
      rb.name = 'tplmodus';
      rb.checked = dlgKopf.modus === w[0];
      rb.addEventListener('change', function () {
        if (!rb.checked) { return; }
        dlgKopf.modus = w[0];
        if (w[0] === 'neu') {
          dlgKopf.id = freierSchluessel(schluesselAus(dlgKopf.nameDe || dlgKopf.geraetName));
          dlgKopf.rang = dlgKopf.maxRang + 10;
        } else {
          dlgKopf.id = dlgKopf.quelle.id;
          dlgKopf.rang = dlgKopf.quelle.priority || 0;
        }
        zeichneVorlagenDialog();
      });
      dlgZeile.appendChild(rb);
      dlgZeile.appendChild(document.createTextNode(' ' + w[1]));
      if (w[2]) {
        var hn = el('span', 'chip mut', w[2]);
        hn.style.marginLeft = '6px';
        dlgZeile.appendChild(hn);
      }
      wb.appendChild(dlgZeile);
    });
    wahl.appendChild(wb);
    body.appendChild(wahl);
  }

  /* --- Kopfdaten --- */
  var kk = el('div', 'card');
  kk.style.marginBottom = '11px';
  var kh = el('div', 'ch');
  kh.appendChild(el('span', 'typ', tr('tpls.head')));
  kh.appendChild(el('span', 'chip mut', dlgKopf.id));
  kk.appendChild(kh);
  var kb = el('div');
  kb.style.padding = '9px 12px 11px';
  kb.style.display = 'flex';
  kb.style.flexWrap = 'wrap';
  kb.style.gap = '9px 14px';

  kb.appendChild(tplFeld(tr('tpls.nameDe'), dlgKopf.nameDe, function (x) { dlgKopf.nameDe = x; }, '150px'));
  kb.appendChild(tplFeld(tr('tpls.nameEn'), dlgKopf.nameEn, function (x) { dlgKopf.nameEn = x; }, '150px'));
  var kf = tplFeld(tr('tpls.id'), dlgKopf.id, function (x) { dlgKopf.id = schluesselAus(x); }, '150px');
  var stoert = fremdeMitId(dlgKopf);
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
  /* Der Wert ist der Geraetetyp, nicht der Musterschluessel - drei
     Muster tragen einen anderen Namen als ihr Typ: blinds meldet
     "blind", mediaPlayer meldet "media", levelSlider meldet "slider".
     Die Vorlagen fuehren den Typ. Bis 11.09.2026 stand hier der
     Schluessel, und an jedem Rollladen zeigte der Dialog
     "- keiner -", obwohl "blind" gesetzt war. */
  (D ? Object.keys(D.patterns).sort() : []).forEach(function (m) {
    var typ = D.patterns[m].type || m;
    /* Beschriftet wird nach dem TYP, nicht nach dem Musterschluessel.

       Der Wert stand seit dem 11.09.2026 richtig da, die Beschriftung
       nicht: `musterZeile(m)` schlug den Schluessel nach, und fuer die
       drei Muster, die anders heissen als ihr Typ (`blinds`,
       `mediaPlayer`, `levelSlider`), kennt der Admin keinen Beinamen.
       Im Feld stand am Rollladen deshalb „blinds" statt „Jalousien ·
       blind" - der Musterschluessel, den der Nutzer nirgends sonst
       sieht. Die Musterwahl (musterwahl.js) geht seit jeher ueber den
       Typ. Gefunden produktiv am 15.09.2026 (I37). */
    var o = opt(typ, musterZeile(typ));
    if (typ === dlgKopf.geraetetyp) { o.selected = true; }
    st.appendChild(o);
  });
  st.addEventListener('change', function () { dlgKopf.geraetetyp = st.value; zeichneVorlagenDialog(); });
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
  funktionsAuswahl(dlgKopf.funktion).forEach(function (x) {
    var o = opt(x.wert, x.text);
    if (x.gewaehlt) { o.selected = true; }
    sf2.appendChild(o);
  });
  sf2.addEventListener('change', function () { dlgKopf.funktion = sf2.value; });
  lf2.appendChild(sf2);
  if (katalogFehlt) { lf2.appendChild(el('span', 'hint', tr('catalog.missing'))); }
  kb.appendChild(lf2);

  kb.appendChild(tplFeld(tr('tpls.rank'), dlgKopf.rang, function (x) { dlgKopf.rang = x; }, '60px'));
  var rh2 = el('div', 'hint', tr('tv.rankOwn'));
  rh2.style.flexBasis = '100%';
  kb.appendChild(rh2);
  kk.appendChild(kb);

  var nh = el('div');
  nh.style.padding = '0 12px 11px';
  var nf = tplFeld(tr('tpls.nameHint'), dlgKopf.namenshinweis, function (x) { dlgKopf.namenshinweis = x; }, '260px');
  if (!hinweisTaugt(dlgKopf.namenshinweis)) {
    var nw = el('span', 'hint');
    nw.style.color = 'var(--bad)';
    nw.style.flexBasis = '100%';
    nw.textContent = tr('tpls.nameHintBad');
    nf.appendChild(nw);
  }
  nh.appendChild(nf);
  var nt = el('div', 'hint', tr('tpls.nameHintHelp', dlgKopf.geraetName));
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
  mcb.checked = !!dlgKopf.mehrfach;
  mcb.addEventListener('change', function () {
    dlgKopf.mehrfach = mcb.checked;
    if (dlgKopf.mehrfach && !dlgKopf.instanz) {
      dlgKopf.instanz = rateInstanz(dlg.zeilen, dlgKopf.geraetName,
        String(dlgKopf.kanalname || 'POWER%N%').split('%N%')[0]);
    }
    zeichneVorlagenDialog();
  });
  ml.appendChild(mcb);
  ml.appendChild(document.createTextNode(' ' + tr('tpls.multiple')));
  mf.appendChild(ml);

  if (dlgKopf.mehrfach) {
    var mz = el('div');
    mz.style.display = 'flex';
    mz.style.flexWrap = 'wrap';
    mz.style.gap = '9px 14px';
    mz.style.marginTop = '6px';
    mz.appendChild(tplFeld(tr('tpls.whichNumber'), dlgKopf.instanz,
      function (x) { dlgKopf.instanz = String(x).trim(); }, '60px'));
    mz.appendChild(tplFeld(tr('tpls.channelName'), dlgKopf.kanalname,
      function (x) { dlgKopf.kanalname = x; }, '140px'));
    mf.appendChild(mz);
    mf.appendChild(el('div', 'hint',
      dlgKopf.instanz ? tr('tpls.multipleHelp', dlgKopf.instanz) : tr('tpls.multipleNoNumber')));
    var fremd = andereAusgaenge(dlg.zeilen, dlgKopf.instanz, ausgangsVorspaenne(dlg.zeilen, dlgKopf));
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
        dlg.zeilen.forEach(function (dlgZeile) {
          if (fremd.punkte.indexOf(dlgZeile.name) > -1) { dlgZeile.weg = true; }
        });
        zeichneVorlagenDialog();
      });
      fw2.appendChild(el('div', null, '')).appendChild(fb);
      mf.appendChild(fw2);
    }
    var weg = dlg.zeilen.filter(function (dlgZeile) { return dlgZeile.weg; });
    if (weg.length) {
      var wz = el('div', 'hint');
      wz.style.marginTop = '7px';
      wz.appendChild(document.createTextNode(tr('tpls.droppedCount', weg.length) + '  '));
      var zb = el('button', 'btn schmal', tr('tpls.undrop'));
      zb.addEventListener('click', function () {
        dlg.zeilen.forEach(function (dlgZeile) { dlgZeile.weg = false; });
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
  vf.appendChild(tplFeld(tr('tv.forbidden'), dlgKopf.verboten, function (x) { dlgKopf.verboten = x; }, '280px'));
  vf.appendChild(el('div', 'hint', tr('tv.forbiddenHelp')));
  kk.appendChild(vf);

  body.appendChild(kk);

  /* --- Zustaende --- */
  var zk = el('div', 'card');
  zk.style.marginBottom = '11px';
  var zh = el('div', 'ch');
  var drin = dlg.zeilen.filter(function (dlgZeile) { return !dlgZeile.weg; });
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

  var abgewaehlt = dlg.zeilen.filter(function (dlgZeile) { return !dlgZeile.weg && dlgZeile.aus; });
  if (abgewaehlt.length) {
    var az = el('div', 'hint');
    az.style.padding = '6px 12px 0';
    az.appendChild(document.createTextNode(tr('tpls.someOff', abgewaehlt.length) + '  '));
    var ab = el('button', 'btn schmal', tr('tpls.dropOff'));
    ab.addEventListener('click', function () {
      abgewaehlt.forEach(function (dlgZeile) { dlgZeile.weg = true; dlgZeile.pflicht = false; });
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
  dlg.zeilen.forEach(function (dlgZeile) {
    if (!dlgZeile.weg && dlgZeile.lesenAbs) { absDa = true; }
    var row = el('div', 'slot vzeile');
    if (dlgZeile.weg) { row.style.opacity = '.45'; }

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
    row.appendChild(haken(!dlgZeile.weg, false, tr('tpls.colInTemplate'), function (an) {
      dlgZeile.weg = !an;
      if (dlgZeile.weg) { dlgZeile.pflicht = false; }
      zeichneVorlagenDialog();
    }));

    /* 2. Ist er beim naechsten Geraet vorgehakt? Kommt vom Haken am
          Geraet, laesst sich hier aber noch drehen. */
    row.appendChild(haken(!dlgZeile.aus, dlgZeile.weg, tr('tpls.colDefault'), function (an) {
      dlgZeile.aus = !an;
      zeichneVorlagenDialog();
    }));

    /* 3. Muss er da sein, damit die Vorlage ueberhaupt greift? */
    row.appendChild(haken(dlgZeile.pflicht, dlgZeile.lesenAbs || dlgZeile.weg, tr('tpls.colRequired'), function (an) {
      dlgZeile.pflicht = an;
      zeichneVorlagenDialog();
    }));

    row.appendChild(el('span', 'sn', dlgZeile.name));

    var pw = el('span', 'rx pf');
    pw.style.fontFamily = 'var(--mono)';
    pw.title = zPfad(dlgZeile, dlgKopf, false, dlg.zeilen) + (dlgZeile.schreibenRoh ? '  → ' + zPfad(dlgZeile, dlgKopf, true, dlg.zeilen) : '');
    pw.appendChild(document.createTextNode(zPfad(dlgZeile, dlgKopf, false, dlg.zeilen)));
    if (dlgZeile.schreibenRoh) { pw.appendChild(el('span', 'chip mut', '→ ' + zPfad(dlgZeile, dlgKopf, true, dlg.zeilen))); }
    if (dlgZeile.lesenAbs) { pw.appendChild(el('span', 'chip warn', tr('tpls.absolute'))); }
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
  if (dlg.inhalte.length) {
    var ik = el('div', 'card');
    ik.style.marginBottom = '11px';
    var ih = el('div', 'ch');
    ih.appendChild(el('span', 'typ', tr('tpls.content')));
    ik.appendChild(ih);
    var ib = el('div');
    ib.style.padding = '9px 12px 11px';
    dlg.inhalte.forEach(function (x) {
      var dlgZeile = el('label');
      dlgZeile.style.display = 'block';
      dlgZeile.style.margin = '3px 0';
      dlgZeile.style.fontSize = '12.5px';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = x.an;
      cb.addEventListener('change', function () { x.an = cb.checked; zeichneVorlagenDialog(); });
      dlgZeile.appendChild(cb);
      var t = el('span', null, ' ' + tr('tpls.contentRow', x.punkt, x.feld));
      t.style.fontFamily = 'var(--mono)';
      dlgZeile.appendChild(t);
      ib.appendChild(dlgZeile);
    });
    ib.appendChild(el('div', 'hint', tr('tpls.contentHelp')));
    ik.appendChild(ib);
    body.appendChild(ik);
  }

  /* --- Probelauf --- */
  var neu = baueVorlage(dlg);
  var pk = el('div', 'card');
  pk.style.marginBottom = '11px';
  var ph = el('div', 'ch');
  ph.appendChild(el('span', 'typ', tr('tpls.tryout')));
  var treffer = [];
  var fehlerErk = !neu.detection.required.length;
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
      var dlgZeile = el('div', 'slot');
      dlgZeile.style.gridTemplateColumns = '1fr 150px 130px';
      var idl = el('span', 'sn', t.id);
      idl.style.fontFamily = 'var(--mono)';
      idl.style.wordBreak = 'break-all';
      if (t.id === (dlg.e.kanal || '')) { idl.style.fontWeight = '700'; }
      dlgZeile.appendChild(idl);
      dlgZeile.appendChild(el('span', 'rx', tr('tpls.evidence', t.eigen.belege)));
      var w = el('span', 'chip ' + (t.gewinnt ? 'ok' : 'bad'),
        t.gewinnt ? (t.gegner ? tr('tpls.beats', textIn(t.gegner.vorlage.name, sprache)) : tr('tpls.onlyOne'))
                  : tr('tpls.losesTo', textIn(t.gegner.vorlage.name, sprache)));
      dlgZeile.appendChild(w);
      pb.appendChild(dlgZeile);
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
    /* Fuenf Gruende sperren den Knopf - und jeder von ihnen gehoert
       hingeschrieben.

       Bisher wurde nur `disabled` gesetzt, `title` blieb leer. Bei
       fehlenden Pflichtpunkten stand die Erklaerung weiter unten in der
       Probelauf-Karte, fuer die man scrollen musste; bei den anderen
       vier stand sie nirgends. Ricardo stiess darauf, als er fuer den
       Objektdump eine eigene Vorlage anlegen wollte - grauer Knopf,
       kein Wort dazu (I32, 11.09.2026). Ein Knopf, der nicht sagt warum,
       ist derselbe Fehler wie eine Sperre ohne Begruendung (U28). */
    var gruende = sperrgruende(dlg);
    b.disabled = gruende.length > 0;
    b.title = gruende.join(' · ');
    b.textContent = dlgKopf.modus === 'update' ? tr('tpls.saveUpdate') : tr('tpls.saveNew');
    if (gruende.length) {
      var sk = el('div', 'aside w');
      sk.style.borderLeftColor = 'var(--bad)';
      sk.appendChild(el('b', null, tr('tpls.lockedWhy')));
      var sul = el('ul');
      gruende.forEach(function (x) { sul.appendChild(el('li', null, x)); });
      sk.appendChild(sul);
      body.appendChild(sk);
    }
  }
  var tt = $('#tpl-titel');
  if (tt) { tt.textContent = tr('tpls.title', dlg.e.kanal.split('.').pop()); }
}

/* Die fuenf Gruende, die das Speichern sperren - an einer Stelle.

   Gebraucht werden sie zweimal: beim Zeichnen, um Knopf und Kasten zu
   beschriften, und beim Speichern selbst. Das zweite ist keine
   Doppelung, sondern die eigentliche Sicherung: Der Knopf wird beim
   VERLASSEN eines Feldes neu bewertet, nicht beim Tippen. Wer eine
   offene Klammer in den Namenshinweis schreibt und ohne Umweg auf
   „Vorlage speichern" klickt, hat einen blauen Knopf vor sich - und die
   Vorlage wurde mit `namenshinweis: "("` gespeichert (Ricardo,
   12.09.2026, am Testsystem nachgestellt; `hinweisTrifft` faengt den
   kaputten Ausdruck zwar ab, aber gespeichert gehoert er trotzdem
   nicht). */
export function sperrgruende(dlg) {
  if (!dlg) { return []; }
  var dlgKopf = dlg.kopf;
  var neu = baueVorlage(dlg);
  var gruende = [];
  if (!neu.detection.required.length) { gruende.push(tr('tpls.lockNoRequired')); }
  if (!dlgKopf.id) { gruende.push(tr('tpls.lockNoId')); }
  var fremd = fremdeMitId(dlgKopf);
  if (fremd) { gruende.push(tr('tpls.lockIdTaken', fremd.id)); }
  if (!hinweisTaugt(dlgKopf.namenshinweis)) { gruende.push(tr('tpls.lockBadHint')); }
  if (!dlg.zeilen.filter(function (dlgZeile) { return !dlgZeile.weg; }).length) { gruende.push(tr('tpls.lockNoRows')); }
  return gruende;
}

export function speichereVorlageAusDialog() {
  if (!S.tplZ) { return; }
  var neu = baueVorlage(S.tplZ);

  /* Letzte Instanz, unabhaengig vom Zustand des Knopfes. */
  var gesperrt = sperrgruende(S.tplZ);
  if (gesperrt.length) {
    var bodyS = $('#tpl-body');
    var altS = bodyS.querySelector('.sperrgrund-kasten');
    if (altS) { altS.remove(); }
    var wS = el('div', 'aside ersatz sperrgrund-kasten');
    wS.style.borderLeftColor = 'var(--bad)';
    wS.appendChild(el('b', null, tr('tpls.lockedWhy')));
    var ulS = el('ul');
    gesperrt.forEach(function (x) { ulS.appendChild(el('li', null, x)); });
    wS.appendChild(ulS);
    bodyS.insertBefore(wS, bodyS.firstChild);
    bodyS.scrollTop = 0;
    return;
  }

  /* Widerspricht sie sich, wird nicht gespeichert — eine Vorlage, die
     auf nichts passen kann, hilft niemandem und ist spaeter schwer zu
     durchschauen. */
  if (neu.widerspruch && neu.widerspruch.length) {
    var body0 = $('#tpl-body');
    var alt0 = body0.querySelector('.widerspruch');
    if (alt0) { alt0.remove(); }
    var w0 = el('div', 'aside ersatz widerspruch');
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
      var ersatz = el('div', 'aside ersatz');
      ersatz.appendChild(el('b', null, tr('tpls.failed')));
      ersatz.appendChild(document.createTextNode(' ' + err));
      body.appendChild(ersatz);
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
