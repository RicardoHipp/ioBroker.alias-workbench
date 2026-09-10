import { socket } from './verbindung.js';

/* Raum und Funktion stehen nicht am Objekt, sondern auf der anderen Seite:
   `enum.rooms.Bastelzimmer` fuehrt in `common.members` eine Liste von
   Kennungen. Der Objektbrowser dreht das beim Anzeigen um.

   Die Aufzaehlungen werden getrennt geladen und nicht in `objects`
   abgelegt - dort wuerden sie im Geraetebaum auftauchen, wo sie nichts zu
   suchen haben. */
export var enums = {};

/* Wissen wir gerade, was in den Aufzaehlungen steht?

   Das ist keine Feinheit, sondern die Bedingung dafuer, ueberhaupt eine
   schreiben zu duerfen. Frueher setzte ein Ladefehler `enums` auf `{}`
   und verschwieg es. Danach hielt die Werkbank jede Aufzaehlung fuer
   nicht vorhanden - der Katalog bot `garden` weiter an, weil der
   Dublettenfilter gegen nichts pruefte, und `enumAenderungen` baute sie
   als NEU aus der Vorlage. `setObject` ersetzt ein Objekt vollstaendig:
   Gemessen 09.09.2026 am Testsystem verlor `enum.rooms.garden` dabei
   drei Mitglieder und behielt eines, dazu die Herkunftsmarke, die ihn
   spaeter auch noch loeschbar macht. Bei Ricardo waeren das die aus der
   CCU gespiegelten Raeume.

   Solange diese Marke steht, wird keine Aufzaehlung angefasst. */
var unbekannt = false;
export function enumsUnbekannt() { return unbekannt; }

/* Ein Aussetzer soll die Werkbank nicht fuer den Rest der Sitzung
   lahmlegen. Dreimal mit wachsendem Abstand, dann ist Schluss - eine
   Schleife ohne Ende waere schlimmer als der Fehler. */
var versuch = 0;
var wiederTimer = null;

export function ladeEnums(danach) {
  if (wiederTimer) { clearTimeout(wiederTimer); wiederTimer = null; }
  socket.emit('getObjectView', 'system', 'enum',
    { startkey: 'enum.', endkey: 'enum.香' }, function (err, doc) {
      if (err || !doc || !doc.rows) {
        /* Den alten Stand behalten. Er ist vielleicht veraltet, aber
           veraltet ist naeher an der Wahrheit als leer. */
        unbekannt = true;
        console.warn('[alias-workbench] Aufzaehlungen nicht geladen: ' +
                     (err || 'keine Antwort'));
        if (versuch < 3) {
          versuch++;
          wiederTimer = setTimeout(function () {
            wiederTimer = null;
            ladeEnums();
          }, versuch * 4000);
        }
        if (typeof danach === 'function') { danach(err || 'leer'); }
        return;
      }
      /* Erst sammeln, dann tauschen: ein Fehler mittendrin liesse sonst
         einen halben Vorrat stehen. */
      var frisch = {};
      doc.rows.forEach(function (r) {
        if (r.value && r.id) { frisch[r.id] = r.value; }
      });
      enums = frisch;
      unbekannt = false;
      versuch = 0;
      if (typeof danach === 'function') { danach(null); }
    });
}
