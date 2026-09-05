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

export var ROLLEN = (function () {
  if (!D) { return []; }
  var m = {};
  Object.keys(D.patterns).forEach(function (t) {
    D.patterns[t].states.forEach(function (st) {
      var r = rolleVonPlatz(st);
      if (r) { m[r] = 1; }
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
