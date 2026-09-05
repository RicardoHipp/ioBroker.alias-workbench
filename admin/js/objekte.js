/* Das Objektlager: Laden, Abo, Index, gezieltes Nachladen.

   Was hier lebt, ist die eine Wahrheit ueber die Objektdatenbank, wie der
   Reiter sie kennt: S.objects samt sortiertem Index. Alles Zeichnen und
   Entwerfen liest daraus.

   Die Rueckrufe nach oben (zeichnen, waehlen) kommen als Kreis-Import aus
   werkbank.js - beim Laden der Module ist das unkritisch, weil sie erst
   zur Laufzeit gerufen werden. */

import { S } from './zustand.js';
import { socket } from './verbindung.js';
import './basis.js';
import './sprache.js';
import { ladeEinstellungen } from './einstellungen.js';
import { zeigeObjektzahl } from './vorlagen.js';
import { enums, ladeEnums } from './enums.js';
import { ladeEnumVorlagen } from './katalog.js';
import { zeichneBaum } from './baum.js';
import { waehle , tipptGerade } from './entwurf.js';
import { zeichneErgebnis, neuZeichnenOderAufbauen } from './ergebnis.js';


/* ================== Objekte holen ================== */
export var ARTEN = ['device', 'channel', 'folder', 'state'];

/* Nach dem Neuladen soll der Bericht stimmen. Die Erkennung haengt an
   den vorhandenen Objekten — legt man einen cmnd-Punkt an, kann eine
   Vorlage greifen, die vorher nicht griff. Vorher zeichnete das Laden
   nur den Baum neu und liess rechts den alten Entwurf stehen. */
export function ladeObjekte(danach) {
  var offen = ARTEN.length;
  S.objects = {};
  ARTEN.forEach(function (art) {
    socket.emit('getObjectView', 'system', art, { startkey: '', endkey: '香' }, function (err, doc) {
      if (!err && doc && doc.rows) {
        doc.rows.forEach(function (r) {
          if (r.value && r.id) { S.objects[r.id] = r.value; }
        });
      }
      if (--offen === 0) {
        S.keysSorted = Object.keys(S.objects).sort();
        S.kleinIndex = {};
        ladeEnums();
        /* Erst die Einstellungen, dann die Vorlagen - sonst holt die
           Werkbank sie auch dann, wenn sie abgeschaltet sind. */
        ladeEinstellungen(function () {
          /* Kam der Katalog spaeter als das erste Zeichnen, fehlte dem
             Feld der Vorschlag - nachzeichnen, sobald er da ist. */
          ladeEnumVorlagen(function () {
            if (S.current) { zeichneErgebnis(); }
          });
        });
        /* Kopfzeile nachziehen - je nach Ladereihenfolge stand dort
           noch die Null von vor dem Einlesen. */
        zeigeObjektzahl();
        zeichneBaum();
        if (S.current && S.baumModus !== 'vorlagen') { waehle(S.current); }
        horcheAufObjekte();
        if (typeof danach === 'function') { danach(); }
      }
    });
  });
}

/* Objekte entstehen auch ohne Zutun der Werkbank. Der uebliche Weg ist
   genau der: cmnd.POWER anlegen, einmal schalten — und mqtt-client legt
   stat.POWER an. Ohne Abo zeigte die Werkbank danach weiter „stat.POWER
   fehlt", bis man den Reiter neu lud. Man erreichte den Zustand, in dem
   die Vorlage greift, mit dem Werkzeug allein nie.

   Nachgezogen wird immer, neu gezeichnet nur, wenn es den gerade
   gewaehlten Zweig betrifft und kein Dialog offensteht — sonst
   verschwindet einem die Zeile unter dem Finger. */
var horcht = false, nachziehTimer = null, nachziehBaum = false, enumTimer = null;

/* Wer selbst frisch nachgeladen hat, macht den Nachzieher des Abos
   ueberfluessig. */
export function nachziehenErledigt() {
  if (nachziehTimer) { clearTimeout(nachziehTimer); nachziehTimer = null; }
  nachziehBaum = false;
}

export function horcheAufObjekte() {
  if (horcht) { return; }
  horcht = true;
  socket.emit('subscribeObjects', '*');
  socket.on('objectChange', function (id, obj) {
    if (!id) { return; }
    /* Nur was zaehlt, nicht jeder Schreibvorgang: ts und from aendern
       sich bei jedem setObject, auch wenn inhaltlich alles gleich
       bleibt. Ohne diesen Vergleich zeichnete die Werkbank ein zweites
       Mal neu, nachdem sie selbst geschrieben und schon nachgezogen
       hatte — der Baum sprang sichtbar zweimal. */
    var kern = function (o) {
      return o ? JSON.stringify([o.type, o.common, o.native]) : null;
    };
    var vorher = kern(S.objects[id]);
    var nachher = kern(obj);
    if (vorher === nachher) { return; }

    /* Aufzaehlungen gehen einen eigenen Weg.

       Sie gehoeren nicht in `objects` - dort stuenden sie im Geraetebaum,
       wo sie nichts zu suchen haben. Nachziehen muss man sie aber, und
       das war der Fehler: Die Werkbank las sie einmal beim Start und nie
       wieder. Nach dem ersten Schreiben arbeitete sie mit einem
       veralteten Stand weiter, kannte die eben gesetzte Zuordnung nicht
       und trug sie beim naechsten Mal nicht aus. Die neue Funktion kam
       hinzu, statt die alte abzuloesen - ein Geraet stand am Ende in
       zweien. Gemessen an `alias.0.FK_Badezimmer`, das in „Licht“ und
       „Verschluss“ gleichzeitig hing. */
    if (id.indexOf('enum.') === 0) {
      if (kern(enums[id]) === nachher) { return; }
      if (obj) { enums[id] = obj; } else { delete enums[id]; }
      if (enumTimer) { clearTimeout(enumTimer); }
      var enumNachziehen = function () {
        enumTimer = null;
        /* Wer gerade im Trockenlauf steht oder tippt, wird nicht
           unterbrochen - gleich nochmal. */
        if (document.querySelector('dialog[open]') || tipptGerade()) {
          enumTimer = setTimeout(enumNachziehen, 400);
          return;
        }
        if (S.current) { zeichneErgebnis(); }
      };
      enumTimer = setTimeout(enumNachziehen, 300);
      return;
    }

    var gabEs = S.objects[id] !== undefined;
    if (obj) { S.objects[id] = obj; } else { delete S.objects[id]; }
    if (gabEs !== (S.objects[id] !== undefined)) { nachziehBaum = true; }

    var betrifft = S.current && (id === S.current || id.indexOf(S.current + '.') === 0);
    if (!betrifft && !nachziehBaum) { return; }
    if (nachziehTimer) { clearTimeout(nachziehTimer); }
    var nachziehen = function () {
      nachziehTimer = null;
      /* Offener Dialog: spaeter nochmal, nicht ersatzlos fallenlassen.

         Vorher stand hier ein blankes `return`. Wer einen Alias ueber den
         Loeschdialog entfernte, bekam waehrend der offenen Meldung die
         `objectChange`-Meldungen: `objects` verlor die Eintraege,
         `keysSorted` behielt sie, und der Nachzieher, der beides wieder
         in Deckung gebracht haette, wurde verworfen. Der naechste
         Baumaufbau griff dann auf ein Objekt zu, das es nicht mehr gab -
         `Cannot read properties of undefined (reading 'type')`. */
      if (document.querySelector('dialog[open]')) {
        nachziehTimer = setTimeout(nachziehen, 400);
        return;
      }
      /* Wer gerade tippt, behaelt seine Eingabe — spaeter nochmal. */
      if (tipptGerade()) { nachziehTimer = setTimeout(nachziehen, 400); return; }
      if (nachziehBaum || indexStimmtNicht()) {
        indexNeu();
        nachziehBaum = false;
        zeichneBaum();
      }
      neuZeichnenOderAufbauen();
    };
    nachziehTimer = setTimeout(nachziehen, 600);
  });
}

/* Nach einer eigenen Aktion nur nachziehen, was sich geaendert hat.
   Vorher rief jede angelegte cmnd-Zeile ladeObjekte() und las die ganze
   Datenbank neu — auf einer gewachsenen Anlage sind das 24 500 Objekte
   fuer einen einzigen Datenpunkt, und der Baum sprang zweimal. */
/* Sobald jemand am Entwurf etwas eingestellt hat, darf ihn kein
   Nachladen mehr wegwerfen. Vorher genuegte ein angelegter Datenpunkt,
   und Zielordner, Haken und von Hand angelegte Punkte waren weg. */

export function uebernimmObjekt(id, o) {
  var gabEs = S.objects[id] !== undefined;
  if (o) { S.objects[id] = o; } else { delete S.objects[id]; }
  return gabEs !== (S.objects[id] !== undefined);
}

/* Der Baum liest aus S.keysSorted, nicht aus S.objects. Wer einen Punkt
   hinzufuegt oder entfernt, muss den Index neu bauen — sonst kennt der
   Baum ihn nicht, egal wie oft man zeichnet. */
export function indexNeu() {
  S.keysSorted = Object.keys(S.objects).sort();
  S.kleinIndex = {};
  zeigeObjektzahl();
}

/* Stimmt die Zahl der Schluessel nicht mit dem Index ueberein, hat
   jemand anders an S.objects gearbeitet — das Abo etwa, das eintraegt und
   das Aufraeumen seinem Zeitgeber ueberlaesst. Ohne diese Probe fiel
   genau der uebliche Fall durch: Abo traegt ein, das gezielte Nachladen
   sieht keine Aenderung mehr, bricht den Zeitgeber ab, und der Baum
   bleibt auf altem Stand. */
export function indexStimmtNicht() {
  return S.keysSorted.length !== Object.keys(S.objects).length;
}

export function holeObjekt(id, danach) {
  socket.emit('getObject', id, function (err, o) {
    var anders = uebernimmObjekt(id, err ? null : o);
    if (anders || nachziehBaum || indexStimmtNicht()) {
      indexNeu();
      zeichneBaum();
    }
    /* Das Abo hat auf dieselbe Aenderung schon einen Nachzieher
       angesetzt — der ist jetzt erledigt. Sonst zeichnet die Werkbank
       ein zweites Mal, eine halbe Sekunde spaeter, und alles springt. */
    nachziehenErledigt();
    neuZeichnenOderAufbauen(danach);
  });
}

/* Nach einer Abfrage am Geraet weiss man nicht, welche Punkte dabei
   entstanden sind — dann eben der ganze Zweig, aber nicht mehr. */
export function holeZweig(praefix, danach) {
  /* `baumNeu` ist ein lokales Flag - nicht der Baum in S. Beim Umzug in
     das Zustandsmodul geriet es einmal faelschlich unter die Raeder,
     weil es in einer Komma-Deklaration versteckt war. */
  var offen = ARTEN.length, baumNeu = false;
  ARTEN.forEach(function (art) {
    socket.emit('getObjectView', 'system', art,
      { startkey: praefix, endkey: praefix + '香' }, function (err, doc) {
        if (!err && doc && doc.rows) {
          doc.rows.forEach(function (r) {
            if (r.value && r.id && uebernimmObjekt(r.id, r.value)) { baumNeu = true; }
          });
        }
        if (--offen === 0) {
          if (baumNeu || nachziehBaum || indexStimmtNicht()) {
            indexNeu();
            zeichneBaum();
          }
          nachziehenErledigt();
          neuZeichnenOderAufbauen(danach);
        }
      });
  });
}

/* ================== Baum ================== */
/* Aus den flachen IDs einen Baum bauen. Nur Zweige, die irgendwo
   Zustaende enthalten — der Rest ist fuer uns Laerm. */
