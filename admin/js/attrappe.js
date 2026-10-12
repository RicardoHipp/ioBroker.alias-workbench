/* Einen Teilbaum als Attrappe ausgeben.

   Zweck ist nicht das Sichern, sondern das Nachbauen: aus der Datei
   entsteht anderswo ein Geraet, das sich wie das Original verhaelt — ohne
   dass das Original da ist. Damit laesst sich eine Vorlage fuer ein
   Geraet bauen, das man nicht besitzt. Wer im Forum schreibt „fuer mein
   Geraet gibt es keine Vorlage", gibt seinen Teilbaum aus und schickt die
   Datei.

   Was mitgeht, steht in einer POSITIVLISTE, nicht in einer Sperrliste.
   Eine Sperrliste („password", „token", …) laesst immer ein Feld durch,
   an das niemand gedacht hat. `native` faellt deshalb vollstaendig weg —
   dort stehen IP-Adressen, Seriennummern und bei manchen Adaptern
   Zugangsdaten, und fuer den Zweck ist davon nichts noetig.

   Siehe plan_export_attrappe.md. */

import { S } from './zustand.js';
import { el } from './basis.js';
import { tr } from './sprache.js';
import { holeWerte } from './werte.js';

/* Die Nummer steigt, sobald sich das Format aendert — sonst liesse sich
   eine alte Datei nicht von einer neuen unterscheiden. */
export var FORMAT = 1;

/* Nur diese Felder aus `common` gehen mit.

   `states` MUSS dabei sein: ohne die Werteliste erkennt der
   type-detector die Plaetze mit `statesDefined` nicht, und genau die
   Erkennung will man an der Attrappe pruefen. */
var COMMON_FELDER = ['name', 'role', 'type', 'unit', 'read', 'write', 'min', 'max', 'def', 'states'];

/* Alles unterhalb der Wurzel, die Wurzel eingeschlossen. */
function unterhalb(wurzel) {
  var pre = wurzel + '.';
  return Object.keys(S.objects).filter(function (id) {
    return id === wurzel || id.indexOf(pre) === 0;
  }).sort();
}

/* Die Ebenen zwischen Wurzel und einem Objekt, die selbst kein Objekt
   haben. ioBroker nennt so eine Stufe `virtual`; der Baum zeigt sie als
   „VIR". Sie gehoeren in die Datei, sonst beschriebe sie den Baum
   unvollstaendig — aber sie tragen kein `common`, und beim Einlesen soll
   erkennbar bleiben, dass dort nie ein Objekt stand. */
function virtuelleEbenen(wurzel, ids) {
  var da = {};
  ids.forEach(function (id) { da[id] = 1; });
  var raus = {};
  var tiefe = wurzel.split('.').length;
  ids.forEach(function (id) {
    var teile = id.split('.');
    for (var i = tiefe; i < teile.length; i++) {
      var pfad = teile.slice(0, i).join('.');
      if (!da[pfad] && !raus[pfad]) { raus[pfad] = 1; }
    }
  });
  return Object.keys(raus).sort();
}

function gesiebtesCommon(c) {
  var raus = {};
  COMMON_FELDER.forEach(function (f) {
    if (c && c[f] !== undefined) { raus[f] = JSON.parse(JSON.stringify(c[f])); }
  });
  return raus;
}

/* Der Pfad RELATIV zur Wurzel — der Grund, warum die Attrappe an einem
   anderen Ort dieselben Vorlagen trifft. Die Wurzel selbst bekommt den
   leeren Pfad. */
function relativ(wurzel, id) {
  return id === wurzel ? '' : id.slice(wurzel.length + 1);
}

/* Aus dem, was geladen ist, die Datei bauen. Liest nichts nach — die
   Werte muessen vorher in S.werte stehen (siehe `ausgeben`). */
export function sammle(wurzel) {
  var ids = unterhalb(wurzel);
  var objekte = [];

  virtuelleEbenen(wurzel, ids).forEach(function (id) {
    objekte.push({ pfad: relativ(wurzel, id), virtuell: true });
  });

  ids.forEach(function (id) {
    var o = S.objects[id] || {};
    objekte.push({
      pfad: relativ(wurzel, id),
      type: o.type,
      common: gesiebtesCommon(o.common),
    });
  });
  objekte.sort(function (a, b) { return a.pfad.localeCompare(b.pfad); });

  /* Ein Punkt ohne Wert faellt aus `werte` heraus, nicht aus `objekte`:
     es gibt ihn, er traegt nur gerade nichts. */
  var werte = {};
  ids.forEach(function (id) {
    var st = S.werte[id];
    if (st && st.val !== undefined && st.val !== null) { werte[relativ(wurzel, id)] = st.val; }
  });

  return {
    format: FORMAT,
    wurzel: wurzel,
    erzeugt: new Date().toISOString(),
    nativeEnthalten: false,
    objekte: objekte,
    werte: werte,
  };
}

/* Gleiche Bauweise wie `vAusgeben` im Vorlagenblatt. */
function dateiGeben(daten) {
  var name = String(daten.wurzel).split('.').pop() || 'attrappe';
  var text = JSON.stringify(daten, null, 2) + '\n';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name + '.attrappe.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

/* Werte holen, dann ausgeben. `holeWerte` fragt `getForeignStates` fuer
   alles unterhalb ab; die Wurzel selbst kommt als Einzelabfrage dazu,
   weil das Muster `<wurzel>.*` sie nicht einschliesst. */
export function ausgeben(wurzel, fertig) {
  holeWerte(wurzel, [wurzel], function () {
    var daten = sammle(wurzel);
    dateiGeben(daten);
    if (typeof fertig === 'function') { fertig(daten); }
  });
}

/* ================== Das Menue am Baum ==================

   Der Baum hatte bisher nur `click`. Ein eigenes Menue statt des
   Browsermenues, weil dort nichts steht, was hier hilft. */

var offenesMenue = null;

export function menueZu() {
  if (offenesMenue) { offenesMenue.remove(); offenesMenue = null; }
}

function beiKlickDaneben(ev) {
  if (offenesMenue && !offenesMenue.contains(ev.target)) { menueZu(); }
}
document.addEventListener('mousedown', beiKlickDaneben);
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { menueZu(); } });
window.addEventListener('scroll', menueZu, true);
window.addEventListener('resize', menueZu);

export function zeigeMenue(ev, knotenId) {
  ev.preventDefault();
  menueZu();

  var m = el('div', 'baummenue');
  var z = el('div', 'bm-zeile', tr('tree.exportMock'));
  z.title = tr('tree.exportMockHint', knotenId);
  z.addEventListener('click', function () {
    menueZu();
    ausgeben(knotenId);
  });
  m.appendChild(z);

  /* Erst anhaengen, dann messen: vorher hat das Menue keine Groesse und
     liesse sich nicht am Fensterrand ausrichten. */
  m.style.left = '0px';
  m.style.top = '0px';
  document.body.appendChild(m);
  var r = m.getBoundingClientRect();
  var x = Math.min(ev.clientX, window.innerWidth - r.width - 6);
  var y = Math.min(ev.clientY, window.innerHeight - r.height - 6);
  m.style.left = Math.max(6, x) + 'px';
  m.style.top = Math.max(6, y) + 'px';

  offenesMenue = m;
}
