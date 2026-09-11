/* Der Draht zum type-detector: Rollen, Muster, das Objekt-Abbild des
   Entwurfs und der Erkennungslauf darauf. */

import { S } from './zustand.js';
import { D } from './basis.js';

/* Der Ausdruck eines Platzes als blosser Text — ohne Schraegstriche.

   Der Detector liefert seine Muster ueber `ChannelDetector.getPatterns()`
   (so haengt `src/detector-bundle.js` sie an `window`), und diese Funktion
   gibt `role` nicht als RegExp weiter, sondern als `role.toString()` —
   also MIT den Schraegstrichen:

       /^indicator(\.maintenance)?\.(lowbat|battery)$/

   Das ist bei uns der Normalfall, nicht die Ausnahme: ein RegExp bekommen
   wir nur, wenn jemand die Muster direkt aus `typePatterns` liest, etwa
   ein Test. Wer bloss `.source` abfragt und sonst `String(r)` nimmt, haelt
   die Schraegstriche fuer Teil des Ausdrucks und findet danach weder den
   Anker `^` noch das Ende `$`.

   Gefunden am 08.09.2026 am Produktivsystem, und der eine Fehler zog weit:
   `ROLLEN` hatte 210 statt 232 Eintraege (E27) — `indicator.lowbat` fehlte,
   die Rolle, die hm-rpc schreibt —, `BRIGHTNESS` bekam in sechs Mustern gar
   keine Rolle (E6), `plaetzeFuerRollen` fand zu keiner einzigen Rolle einen
   Platz, und die Abweichungskarte behauptete „haette ohnehin nicht
   gezaehlt" ueber Punkte mit Platz. Die Node-Tests sahen nichts davon: sie
   fuettern die Zerlegung mit echten RegExp-Literalen.

   Deshalb geht seither jede Stelle, die einen Platzausdruck liest, hier
   durch — es sind sieben. */
export function ausdruckText(r) {
  if (!r) { return ''; }
  if (r.source !== undefined) { return r.source; }
  var q = String(r);
  var m = /^\/(.*)\/[a-z]*$/.exec(q);
  return m ? m[1] : q;
}

/* Der Ausdruck als RegExp — fuer alle, die damit pruefen wollen. Wirft
   nicht: ein unbrauchbarer Ausdruck gibt `null`, und der Aufrufer
   entscheidet, was das heisst. */
export function ausdruckRegExp(r) {
  var q = ausdruckText(r);
  if (!q) { return null; }
  try { return new RegExp(q); } catch { return null; }
}

/* Passt eine Rolle auf den Ausdruck eines Platzes? */
export function rolleTrifft(r, rolle) {
  if (!rolle) { return false; }
  var re = ausdruckRegExp(r);
  return re ? re.test(rolle) : false;
}

/* Die Rollen kommen aus dem Paket, nicht aus einer eigenen Liste —
   sonst pflegt man eine zweite Wahrheit, die auseinanderlaeuft. */
/* Manche Plaetze nennen keine Standardrolle, sondern nur einen
   Ausdruck: BRIGHTNESS im rgbSingle-Muster hat blossen Anker und Wort.
   Steht darin genau ein Rollenname, ist das die Rolle. Ohne diese
   Ableitung bekam so ein Punkt gar keine: er belegte seinen Platz nie,
   liess sich beliebig oft hinzufuegen, und die Rolle fehlte auch in der
   Auswahlliste — der Platz war auf keinem Weg zu befuellen. */
export function rolleAusAusdruck(r) {
  var q = ausdruckText(r);
  if (!q) { return ''; }
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
  var q = ausdruckText(r);
  if (!q) { return []; }
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

/* Welchen Platz trifft eine Rolle im gewaehlten Muster?

   Gibt den ganzen Platz zurueck, nicht nur seinen Namen - denn er
   traegt mehr als die Rolle: `type` sagt, welchen Datentyp der
   type-detector dort erwartet. Am 11.09.2026 stand in einer eigenen
   Vorlage `value.power.consumption` mit Typ `mixed`. Die Rolle war
   richtig, der Platz CONSUMPTION verlangt aber `number` - der Punkt
   fiel durch, kein Platz blieb belegt, und das ganze Geraet wurde
   statt als `electricity` nur noch als `info` erkannt. Am Bildschirm
   stand dazu nichts weiter als „passt nicht".

   Dieselbe Suche stand vorher zweimal im Code (detail.js und
   vorlagenblatt.js), beide Male ohne den Typ anzusehen. */
export function plaetzeFuerRolle(musterName, rolle) {
  if (!rolle) { return []; }
  var mu = musterName && musterVon(musterName);
  if (!mu) { return []; }
  return mu.states.filter(function (st) {
    return st.role && rolleTrifft(st.role, rolle);
  });
}

/* Der Platz, den eine Rolle trifft - und zwar der, dessen Datentyp
   auch passt.

   Dieselbe Rolle kann mehrere Plaetze treffen: das blinds-Muster hat
   DIRECTION (boolean, /^indicator\.direction$/) und daneben
   DIRECTION_ENUM (number, /^(indicator|value)\.direction$/). Homematic
   meldet die Fahrtrichtung als Zahl (0 steht, 1 faehrt auf, 2 faehrt
   zu, 3 unbekannt), und der Detector legt sie richtig auf
   DIRECTION_ENUM. Wer nur die Rolle vergleicht und den ersten Treffer
   nimmt, landet auf DIRECTION und meldet einen Konflikt, den es nicht
   gibt - genau das tat diese Funktion am 11.09.2026 einen halben Tag
   lang, samt einer "begruendeten Ausnahme" im Test, die keine war. */
export function platzFuerRolle(musterName, rolle, typ) {
  var alle = plaetzeFuerRolle(musterName, rolle);
  if (!alle.length) { return null; }
  if (typ) {
    for (var i = 0; i < alle.length; i++) {
      if (typPasstZuPlatz(alle[i], typ)) { return alle[i]; }
    }
  }
  return alle[0];
}

/* Alle Datentypen, die eine Rolle in diesem Muster annehmen darf -
   ueber alle Plaetze, die sie trifft. Bei der Fahrtrichtung sind das
   boolean und number: beide Formen sind richtig, nur auf verschiedenen
   Plaetzen. */
export function typenFuerRolle(musterName, rolle) {
  var raus = [];
  plaetzeFuerRolle(musterName, rolle).forEach(function (st) {
    typenVomPlatz(st).forEach(function (t) {
      if (raus.indexOf(t) === -1) { raus.push(t); }
    });
  });
  return raus;
}

/* Die Datentypen, die ein Platz zulaesst - als Liste.

   Drei Faelle, gemessen am type-detector 6.0.1: 622 Plaetze nennen
   genau einen Typ, 28 nennen mehrere (mediaPlayer/STATE etwa
   ["boolean","number"]), 82 nennen gar keinen - WORKING und ERROR
   zum Beispiel. Wer `String(platz.type)` nimmt, macht aus den 28 den
   Typ "boolean,number", und den gibt es nicht. */
export function typenVomPlatz(platz) {
  if (!platz || !platz.type) { return []; }
  return Array.isArray(platz.type) ? platz.type.slice() : [String(platz.type)];
}

/* Der Typ, den ein Platz *vorgibt* - nur wenn er eindeutig ist. Wo ein
   Platz mehrere zulaesst, gibt es nichts vorzugeben: dann ist jede der
   erlaubten Formen richtig, und die Wahl bleibt beim Nutzer. */
export function typVomPlatz(platz) {
  var t = typenVomPlatz(platz);
  return t.length === 1 ? t[0] : '';
}

/* Passt ein eingestellter Typ zu dem, was der Platz zulaesst? Ohne
   Vorgabe passt jeder; ohne eingestellten Typ wird nicht geurteilt. */
export function typPasstZuPlatz(platz, typ) {
  var t = typenVomPlatz(platz);
  if (!t.length || !typ) { return true; }
  return t.indexOf(String(typ)) > -1;
}

/* Welche Rolle faende im gewaehlten Muster einen Platz? */
export function plaetzeFuerRollen(musterName) {
  var raus = {};
  var mu = musterName && musterVon(musterName);
  if (!mu) { return raus; }
  ROLLEN.forEach(function (r) {
    mu.states.forEach(function (st) {
      if (raus[r] || !st.role) { return; }
      if (rolleTrifft(st.role, r)) { raus[r] = st.name; }
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
