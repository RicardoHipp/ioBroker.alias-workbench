/* Der Anlauf: sobald die Verbindung steht, laedt alles in fester
   Reihenfolge - Sprache, Geraetewissen, Vorlagen, Objekte. */

import { zeichneErgebnis } from './ergebnis.js';
import { socket } from './verbindung.js';
import { $ } from './basis.js';
import { tr, ladeSprache, beschrifteHtml, beiSpaetemExperten } from './sprache.js';
import { ladeObjekte, abosErneuern } from './objekte.js';
import { zeichneBaum } from './baum.js';
import { ladeBefehlswissen } from './mqtt.js';
import { ladeVorlagen, setzeMeta } from './vorlagen.js';
import { ladeMusterNamen } from './musternamen.js';
import { S } from './zustand.js';


/* ================== Verbindung ================== */
/* Kommt die Expertenvorgabe erst nach dem Zeitablauf, muss der Baum
   noch einmal gezeichnet werden — sonst fehlen die Expertenobjekte, bis
   jemand den Reiter neu laedt. */
beiSpaetemExperten(function () { zeichneBaum(); });

socket.on('connect', function () {
  var c = $('#conn');
  c.className = 'conn on';
  /* Erst nach dem Laden beschriften — vorher gaebe tr() nur den
     Schluessel zurueck, das Woerterbuch ist noch leer. */
  ladeSprache(function () {
  c.textContent = tr('app.connected');
  beschrifteHtml();
  /* Nebenlaeufig - wer schneller ist als der Katalog, sieht kurz die
     rohen Namen, das naechste Zeichnen traegt die Beinamen nach. */
  ladeMusterNamen(function () { if (S.current) { zeichneErgebnis(); } });
  ladeBefehlswissen(function () {
    ladeVorlagen(function () {
      setzeMeta();
      ladeObjekte();
    });
  });
  });
});
/* `connect` feuert genau einmal pro Seitenleben.

   Der Reiter laedt nicht socket.io, sondern den WebSocket-Shim des
   Admin (`ioBroker WebSockets`, bluefox). Dort steht woertlich:
   `this.wasConnected ? this.reconnectHandlers.forEach(…)
   : (this.connectHandlers.forEach(…), this.wasConnected = true)`.
   Nach dem ersten Mal kommt also nur noch `reconnect` — und das hoerte
   niemand. Folge jedes Aussetzers (Admin-Neustart, Netzwerkhaenger,
   Standby): der Punkt blieb auf „getrennt" stehen, obwohl die
   Verbindung wieder stand, und weder `objectChange` noch `stateChange`
   kamen jemals wieder an (gemessen 09.09.2026 mit einem echten
   `socket.close()`).

   Neu geladen wird der ganze Bestand, nicht nur nachabonniert:
   waehrend der Trennung kann sich alles geaendert haben, und ohne Abo
   hat es niemand mitbekommen. Sprache, Geraetewissen und Vorlagen
   bleiben, wie sie sind — die aendern sich nicht im Betrieb. */
socket.on('reconnect', function () {
  var c = $('#conn');
  c.className = 'conn on';
  c.textContent = tr('app.connected');
  abosErneuern();
  ladeObjekte();
});
socket.on('disconnect', function () {
  var c = $('#conn');
  c.className = 'conn off';
  c.textContent = tr('app.disconnected');
});
