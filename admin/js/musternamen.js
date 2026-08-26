/* Die uebersetzten Namen der Muster, angezapft beim Geraete-Adapter.

   Der type-detector kennt nur rohe Typnamen (socket, thermostat). Der
   Geraete-Adapter fuehrt fuer genau diese Typen fertige Uebersetzungen
   in elf Sprachen - in seinem Bundle, ein Block je Sprache, und jeder
   Block gibt sich am Eintrag "type-Device type" selbst zu erkennen.
   Wir holen den Block der Oberflaechensprache und schlagen darin nach;
   eine eigene Liste wuerde bei jedem type-detector-Update altern
   (Ricardos Punkt 13, 25.08.2026 - Weg 2, wie der Raum/Funktion-Katalog).

   Bricht die Kette - Adapter fehlt, Bundle umgebaut - bleibt die Karte
   leer und ueberall steht der rohe Name. Kein Fehler, nur weniger
   Komfort. Beide Bundle-Fassungen werden verstanden: die neue (4.x)
   schreibt Werte in Backticks, die alte (1.x, produktiv) als
   JSON-Strings. */

import { sprache } from './sprache.js';
import { holeText } from './basis.js';

var musterNamen = {};
var geholt = false;

/* Woran sich der gesuchte Sprachblock zu erkennen gibt. Mehr Sprachen
   kennt die Werkbank nicht (SPRACHEN in sprache.js). */
var ANKER = { de: 'Ger\u00e4tetyp', en: 'Device type' };

function ziehe(src) {
  var anker = ANKER[sprache] || ANKER.en;
  var re = /"type-Device type":(?:`([^`]*)`|"((?:[^"\\]|\\.)*)")/g;
  var m, start = -1;
  while ((m = re.exec(src))) {
    if ((m[1] !== undefined ? m[1] : m[2]) === anker) { start = m.index; break; }
  }
  if (start < 0) { return null; }
  /* Der Block enthaelt nur type-Schluessel - das naechste } beendet ihn. */
  var teil = src.slice(start, src.indexOf('}', start));
  var raus = {};
  var re2 = /"type-([^"]+)":(?:`([^`]*)`|"((?:[^"\\]|\\.)*)")/g;
  var m2;
  while ((m2 = re2.exec(teil))) {
    var wert = m2[2] !== undefined ? m2[2] : m2[3].replace(/\\(.)/g, '$1');
    if (m2[1] !== 'Device type') { raus[m2[1]] = wert; }
  }
  return Object.keys(raus).length ? raus : null;
}

export function ladeMusterNamen(nachher) {
  if (geholt) { return; }
  geholt = true;
  holeText('/adapter/devices/tab.html').then(function (html) {
    /* Die tab.html nennt mehrere Bausteine (Bootstrap-Haeppchen,
       Vendor, Hauptbundle). Die Karte steckt im Hauptbundle - das
       heisst in beiden bekannten Fassungen index-<hash>.js, also
       dieses zuerst, die uebrigen als Rueckfall der Reihe nach. */
    var dateien = (html.match(/assets\/[A-Za-z0-9_\-.]+\.js/g) || [])
      .filter(function (x, i, a) { return a.indexOf(x) === i; })
      .sort(function (a, b) {
        return (b.indexOf('assets/index-') === 0 ? 1 : 0)
             - (a.indexOf('assets/index-') === 0 ? 1 : 0);
      })
      .slice(0, 8);
    if (!dateien.length) { throw new Error('kein Bundle'); }
    return dateien.reduce(function (kette, f) {
      return kette.then(function (fertig) {
        if (fertig) { return true; }
        return holeText('/adapter/devices/' + f).then(function (src) {
          var karte = ziehe(src);
          if (karte) { musterNamen = karte; return true; }
          return false;
        })['catch'](function () { return false; });
      });
    }, Promise.resolve(false));
  })['catch'](function () { /* still bleiben: rohe Namen genuegen */ })
    .then(function () { if (typeof nachher === 'function') { nachher(); } });
}

/* Der Beiname eines Musters - leer nur, wenn der Katalog nichts weiss.
   Auch die blosse Grossschreibung („Dimmer“ zu dimmer) zaehlt: sonst
   standen in der Liste grosse Beinamen und kleine rohe Namen gemischt
   (Ricardo, 25.08.2026). Ob der rohe Name dazugehoert, entscheidet die
   Anzeige - sagt der Beiname nur die Schreibung, waere „Dimmer ·
   dimmer“ doppelt gemoppelt. */
export function musterName(typ) {
  return musterNamen[typ] || '';
}

/* Beiname und roher Name fuer Listen, immer als Paar: „Fenstersensor
   · window“ und auch „Dimmer · dimmer“ - einheitlich lesbar, selbst
   wenn Deutsch und roher Name fast gleich sind (Ricardo, 25.08.2026).
   Nur ohne Katalogeintrag steht der rohe Name allein. */
export function musterZeile(typ) {
  var n = musterNamen[typ];
  return n ? (n + '  ·  ' + typ) : typ;
}
