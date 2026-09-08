/* Die uebersetzten Namen der Muster, angezapft beim Admin.

   Der type-detector kennt nur rohe Typnamen (socket, thermostat) und
   bringt selbst KEINE Uebersetzung mit - er ist eine Bibliothek
   (`@iobroker/type-detector`), kein Adapter. Uebersetzt werden seine
   Typen nur in den Sprachdateien der Adapter, die ihn benutzen, und
   jeder schleppt seine eigene Kopie mit. Ein Block je Sprache, jeder
   gibt sich am Eintrag "type-Device type" selbst zu erkennen; wir holen
   den der Oberflaechensprache und schlagen darin nach. Eine eigene
   Liste wuerde bei jedem type-detector-Update altern (Ricardos Punkt 13,
   25.08.2026 - Weg 2, wie der Raum/Funktion-Katalog).

   Gefragt wird ausschliesslich der ADMIN. Bis zum 08.09.2026 war es der
   Geraete-Adapter; Ricardos Begruendung fuer den Wechsel: Der Admin ist
   immer installiert, `devices` nicht, und er wird besser gepflegt. Was
   er nicht uebersetzt, bleibt eben roh - gemessen am 08.09.2026:
   Admin 8.0.11 kennt alle 53 Typen, Admin 7.8.23 nur 44.

   Der Weg dorthin geht ueber zwei Verzeichnisse, weil keines allein
   reicht: `index.html` nennt bei Admin 8 das richtige Buendel, bei
   Admin 7 aber nur vier Bootstrap-Haeppchen, und die fuehren nicht
   weiter (34 Dateien durchsucht, nichts gefunden). Dort steht die Karte
   in einer Datei, die erst `mf-manifest.json` nennt - der Admin laedt
   seine Oberflaeche ueber Module Federation. Also beide Listen
   zusammen, kurze Dateien zuerst.

   Bricht die Kette - Aufbau geaendert, Datei zu gross -, bleibt die
   Karte leer und ueberall steht der rohe Name. Kein Fehler, nur weniger
   Komfort. Beide Schreibweisen werden verstanden: Werte in Backticks
   (Admin 8) und als JSON-Strings (Admin 7). */

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

/* Welche Dateien der Admin ueberhaupt ausliefert. Zwei Verzeichnisse,
   zusammengelegt und ohne Doppel - siehe Kopf: keines allein reicht
   fuer beide Admin-Fassungen. */
function adminDateien() {
  var raus = [];
  function dazu(f) {
    /* Fuehrendes `./` weg, sonst zaehlt dieselbe Datei zweimal: das
       Manifest schreibt `assets/lib-….js`, das index.html
       `./assets/lib-….js`. Ohne dieses Abschneiden stuenden 30 Eintraege
       in einer Liste, die nach 25 abgeschnitten wird - und die gesuchte
       Datei faellt genauso heraus wie damals bei der Sortierung nach
       Namenslaenge. */
    f = f.replace(/^\.\//, '');
    if (raus.indexOf(f) === -1) { raus.push(f); }
  }
  /* Gesucht werden PFADE, keine blossen Dateinamen.

     Beide Verzeichnisse schreiben den Ordner dazu, wo einer gehoert:
     `"sync":["assets/lib-DSjRYjfP.js"]` im Manifest, `assets/…js` im
     index.html. Wer nur den Dateinamen aufsammelt und stur `assets/`
     davorsetzt, erfindet zwei Pfade, die es nicht gibt: das Manifest
     nennt unter `remoteEntry` und `ssrRemoteEntry` je einen Namen mit
     ausdruecklich leerem `"path":""` - die zwei Dateien liegen unter `/`.
     Das gab beim Laden zwei 404 in der Konsole (A1, gefunden 08.09.2026
     produktiv). Geholfen haben sie ohnehin nie: hinter remoteEntry steckt
     der Einstieg von Module Federation, nicht die Sprachkarte.

     Der Schraegstrich im Muster ist zugleich die Bedingung - ein nackter
     Name kommt so gar nicht erst in die Liste, und ein Admin, der seine
     Buendel eines Tages woanders ablegt, wird trotzdem gefunden. */
  var pfade = /[A-Za-z0-9_\-.]+\/[A-Za-z0-9_\-./]+\.js/g;
  return holeText('/mf-manifest.json')['catch'](function () { return ''; })
    .then(function (mf) {
      (mf.match(pfade) || []).forEach(dazu);
      return holeText('/index.html')['catch'](function () { return ''; });
    })
    .then(function (html) {
      (html.match(pfade) || []).forEach(dazu);
      /* Reihenfolge bleibt, wie die Verzeichnisse sie nennen. Erst
         wurde nach Namenslaenge sortiert - uebernommen vom
         Aufzaehlungskatalog, wo es das Riesenbuendel nach hinten
         schiebt. Hier war es genau falsch: der Name der gesuchten Datei
         ist bei Admin 8 mit 143 Zeichen der laengste ueberhaupt, sie
         rutschte ans Ende und fiel aus der Auswahl. Ungeordnet steht
         sie an fuenfter Stelle von 21, bei Admin 7 an vierter von 19 -
         beide Verzeichnisse nennen das Wichtige zuerst (gemessen
         08.09.2026). Das Groessenlimit unten haelt die dicken Buendel
         ohnehin heraus. */
      return raus.slice(0, 25);
    });
}

export function ladeMusterNamen(nachher) {
  if (geholt) { return; }
  geholt = true;
  adminDateien().then(function (dateien) {
    if (!dateien.length) { throw new Error('kein Bundle'); }
    return dateien.reduce(function (kette, f) {
      return kette.then(function (fertig) {
        if (fertig) { return true; }
        return holeText('/' + f).then(function (src) {
          /* Die Grenze liegt hoeher als beim Aufzaehlungskatalog (3 MB):
             bei Admin 8 steckt die Karte ausgerechnet im grossen
             GUI-Buendel, gemessen 8,4 MB (08.09.2026). Mit der alten
             Grenze wurde genau diese Datei uebersprungen und produktiv
             blieb jeder Beiname roh. Teuer ist es nicht: derselbe Admin
             hat das Buendel gerade selbst geladen, der zweite Griff
             kommt aus dem Zwischenspeicher des Browsers. Alles darueber
             ist kein Buendel mehr, sondern ein Versehen. */
          if (src.length > 12000000) { return false; }
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
