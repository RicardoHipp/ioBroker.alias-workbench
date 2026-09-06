/* Der Draht zum type-detector: Rollen, Muster, das Objekt-Abbild des
   Entwurfs und der Erkennungslauf darauf. */

import { S } from './zustand.js';
import { D } from './basis.js';

/* Die Rollen kommen aus dem Paket, nicht aus einer eigenen Liste —
   sonst pflegt man eine zweite Wahrheit, die auseinanderlaeuft. */
/* Manche Plaetze nennen keine Standardrolle, sondern nur einen
   Ausdruck: BRIGHTNESS im rgbSingle-Muster hat blossen Anker und Wort.
   Steht darin genau ein Rollenname, ist das die Rolle. Ohne diese
   Ableitung bekam so ein Punkt gar keine: er belegte seinen Platz nie,
   liess sich beliebig oft hinzufuegen, und die Rolle fehlte auch in der
   Auswahlliste — der Platz war auf keinem Weg zu befuellen. */
export function rolleAusAusdruck(r) {
  if (!r) { return ''; }
  var q = (r.source !== undefined) ? r.source : String(r);
  if (q.charAt(0) !== '^' || q.slice(-1) !== '$') { return ''; }
  var t = q.slice(1, -1).split(String.fromCharCode(92)).join('');
  return /^[A-Za-z0-9_]+([.][A-Za-z0-9_]+)*$/.test(t) ? t : '';
}

export function rolleVonPlatz(st) { return st.defaultRole || rolleAusAusdruck(st.role); }

/* Alle Schreibweisen, die ein Platz annimmt — nicht nur seine Vorgabe.

   Der LOWBAT-Platz nennt als Vorgabe `indicator.maintenance.lowbat`,
   sein Ausdruck erlaubt aber vier Formen:

       /^indicator(\.maintenance)?\.(lowbat|battery)$/

   Nur die Vorgabe in die Auswahlliste zu stellen hiess: Wer die Rolle
   sucht, die sein eigenes Geraet traegt, findet sie nicht. hm-rpc
   schreibt `indicator.lowbat`, alle elf Homematic-Vorlagen benutzen sie,
   und die ioBroker-Rollenliste fuehrt beide nebeneinander — nur die
   Werkbank kannte eine davon nicht (Ricardo, 06.09.2026).

   Ausmultipliziert werden genau zwei Formen, weil nur die im Detector
   vorkommen: Alternativen `(a|b)` und optionale Gruppen `(…)?`. Alles
   andere — Zeichenklassen, `.*`, Verschachtelung — gibt leer zurueck;
   dann bleibt es bei der Vorgaberolle. Lieber eine Schreibweise zu wenig
   als eine erfundene in der Liste. */
export function schreibweisenAus(r) {
  if (!r) { return []; }
  var q = (r.source !== undefined) ? r.source : String(r);
  if (q.charAt(0) !== '^' || q.slice(-1) !== '$') { return []; }
  q = q.slice(1, -1);

  var teile = [''];
  var rest = q;
  var sicher = 0;
  while (rest && sicher++ < 40) {
    var g = /^\(([^()]*)\)(\?)?/.exec(rest);
    if (g) {
      var wahl = g[1].split('|');
      if (g[2]) { wahl = wahl.concat(['']); }        /* optional: auch weglassen */
      var neu = [];
      teile.forEach(function (v) {
        wahl.forEach(function (w) { neu.push(v + w.split('\\').join('')); });
      });
      teile = neu;
      rest = rest.slice(g[0].length);
      continue;
    }
    var lit = /^(\\.|[A-Za-z0-9_.])+/.exec(rest);
    if (!lit) { return []; }                          /* etwas Unbekanntes */
    var text = lit[0].split('\\').join('');
    teile = teile.map(function (v) { return v + text; });
    rest = rest.slice(lit[0].length);
  }
  if (rest) { return []; }

  var gut = [];
  teile.forEach(function (t) {
    if (/^[A-Za-z0-9_]+([.][A-Za-z0-9_]+)*$/.test(t) && gut.indexOf(t) === -1) { gut.push(t); }
  });
  return gut;
}

/* Rollen, die der Detector aus Ruecksicht auf alte Adapter noch annimmt,
   die aber nicht mehr benutzt werden sollen. Aus der Tabelle „Deprecated
   role aliases" in ioBroker.docs (docs/en/dev/stateroles.md, gelesen am
   06.09.2026) — dort steht zu jeder auch, was stattdessen gilt.

   Sie stehen hier, weil die Zerlegung oben sonst gerade sie in die
   Auswahlliste holt: `indicator(\.maintenance)?\.(lowbat|battery)`
   erlaubt eben auch `indicator.battery`. Eine laengere Liste ist kein
   Gewinn, wenn die Haelfte davon veraltet ist.

   Vorgaberollen des Detectors werden NICHT gefiltert: was er selbst als
   Vorgabe fuehrt, gilt, auch wenn die Doku es anders saehe. Gefiltert
   wird nur, was diese Zerlegung zusaetzlich vorschlaegt. */
var VERALTET = {};
('action.close action.close.blind action.close.tilt action.home action.next ' +
 'action.open action.open.blind action.open.tilt action.pause action.play ' +
 'action.prev action.stop action.stop.blind action.stop.tilt ' +
 'indicator.battery indicator.fire indicator.flood ' +
 'indicator.maintenance.battery indicator.unreach ' +
 'level.thermostat sensor.co sensor.fire sensor.flood ' +
 'state.active state.alarm.co state.alarm.fire state.alarm.flood state.co ' +
 'state.door state.fire state.flood state.light state.motion state.window ' +
 'switch.active switch.autofocus switch.autowhitebalance switch.boost ' +
 'switch.brightness switch.nightmode switch.party ' +
 'value.accuracy value.brush value.brush.side value.elevation ' +
 'value.latitude value.longitude value.radius value.sensors'
).split(' ').forEach(function (r) { VERALTET[r] = 1; });

export var ROLLEN = (function () {
  if (!D) { return []; }
  var m = {};
  Object.keys(D.patterns).forEach(function (t) {
    D.patterns[t].states.forEach(function (st) {
      var r = rolleVonPlatz(st);
      if (r) { m[r] = 1; }
      /* Dazu, was der Platz sonst noch annimmt — ohne das Veraltete. */
      schreibweisenAus(st.role).forEach(function (x) {
        if (!VERALTET[x]) { m[x] = 1; }
      });
    });
  });
  ['state', 'text', 'json', 'value'].forEach(function (r) { m[r] = 1; });
  return Object.keys(m).sort();
})();

/* Der Detektor meldet einen Typ, sein Musterverzeichnis ist aber nach
   Schluesseln geordnet — und bei dreien von 51 sind das zwei
   verschiedene Woerter:

       blinds      -> type blind
       mediaPlayer -> type media
       levelSlider -> type slider

   Wer den gemeldeten Typ als Schluessel nimmt, greift ins Leere. Beim
   Terassenrollladen fiel dadurch „blind" aus der Musterliste, das
   Auswahlfeld stand auf „socket", und ein Wechsel des Musters passte die
   Rollen nicht mehr an — gerechnet wurde die ganze Zeit richtig, nur
   angezeigt und angeboten wurde etwas anderes. */
export var TYP_ZU_MUSTER = (function () {
  var m = {};
  if (D) {
    Object.keys(D.patterns).forEach(function (k) {
      var t = D.patterns[k].type;
      if (t && t !== k) { m[t] = k; }
    });
  }
  return m;
})();

/* Das Muster zu einem Typ — oder zu einem Schluessel, beides geht. */
export function musterVon(typ) {
  if (!D || !typ) { return null; }
  return D.patterns[typ] || (TYP_ZU_MUSTER[typ] ? D.patterns[TYP_ZU_MUSTER[typ]] : null) || null;
}

/* Welche Rolle faende im gewaehlten Muster einen Platz? */
export function plaetzeFuerRollen(musterName) {
  var raus = {};
  var mu = musterName && musterVon(musterName);
  if (!mu) { return raus; }
  ROLLEN.forEach(function (r) {
    mu.states.forEach(function (st) {
      if (raus[r] || !st.role) { return; }
      try { if (new RegExp(st.role.source || st.role).test(r)) { raus[r] = st.name; } } catch { /* unbrauchbarer Ausdruck in der Vorlage: zaehlt nicht */ }
    });
  });
  return raus;
}

/* Typen, keine Musterschluessel — `e.want` und das Auswahlfeld fuehren
   ueberall den Typ. Bei „blind" sind die beiden verschieden. */
export var VORSCHAU = ['socket', 'light', 'dimmer', 'blind', 'thermostat', 'temperature', 'humidity', 'info'];


/* Objekt-Abbild des Entwurfs — genau das, was der Detektor sehen wuerde. */
export function abbild(e) {
  var m = {};
  var k = S.objects[e.kanal];
  m[e.kanal] = k
    ? { _id: e.kanal, type: (k.type === 'device' ? 'device' : 'channel'), common: k.common || {}, native: {} }
    : { _id: e.kanal, type: 'channel', common: { name: e.kanal.split('.').pop() }, native: {} };
  e.states.forEach(function (s) {
    if (!s.on || !s.n) { return; }
    var id = e.kanal + '.' + s.n;
    m[id] = { _id: id, type: 'state', native: {}, common: {
      name: s.caption || s.n,
      role: s.role,
      type: s.typ || undefined,
      unit: s.unit || undefined,
      read: true,
      write: !!(s.wr || s.srcW),
      /* Manche Plaetze verlangen eine Werteliste — light.EFFECT etwa
         wird ohne common.states gar nicht erkannt (statesDefined). */
      states: s.states || undefined
    } };
  });
  return m;
}

export function erkenneEntwurf(e, nurTyp) {
  if (!D) { return []; }
  var m = abbild(e);
  var keys = Object.keys(m).sort();
  var opt2 = { id: e.kanal, objects: m, _keysOptional: keys, _keysOptionalSorted: true,
               _usedIdsOptional: [], ignoreCache: true };
  if (nurTyp) { opt2.allowedTypes = [nurTyp]; }
  try { return new D.ChannelDetector().detect(opt2) || []; } catch { return []; }
}



/* ================== Vorlagen ==================
   Eine Datei je Vorlage unter admin/vorlagen/. Die Verarbeitung kennt
   kein einziges Geraet — alles Geraetewissen steckt in den Dateien. */
