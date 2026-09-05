/* Der Anlauf: sobald die Verbindung steht, laedt alles in fester
   Reihenfolge - Sprache, Geraetewissen, Vorlagen, Objekte. */

import { zeichneErgebnis } from './ergebnis.js';
import { socket } from './verbindung.js';
import { $ } from './basis.js';
import { tr, ladeSprache, beschrifteHtml } from './sprache.js';
import { ladeObjekte } from './objekte.js';
import { ladeBefehlswissen } from './mqtt.js';
import { ladeVorlagen, setzeMeta } from './vorlagen.js';
import { ladeMusterNamen } from './musternamen.js';
import { S } from './zustand.js';


/* ================== Verbindung ================== */
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
socket.on('disconnect', function () {
  var c = $('#conn');
  c.className = 'conn off';
  c.textContent = tr('app.disconnected');
});
