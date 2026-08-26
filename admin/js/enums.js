import { socket } from './verbindung.js';

/* Raum und Funktion stehen nicht am Objekt, sondern auf der anderen Seite:
   `enum.rooms.Bastelzimmer` fuehrt in `common.members` eine Liste von
   Kennungen. Der Objektbrowser dreht das beim Anzeigen um.

   Die Aufzaehlungen werden getrennt geladen und nicht in `objects`
   abgelegt - dort wuerden sie im Geraetebaum auftauchen, wo sie nichts zu
   suchen haben. */
export var enums = {};

export function ladeEnums(danach) {
  socket.emit('getObjectView', 'system', 'enum',
    { startkey: 'enum.', endkey: 'enum.\u9999' }, function (err, doc) {
      enums = {};
      if (!err && doc && doc.rows) {
        doc.rows.forEach(function (r) {
          if (r.value && r.id) { enums[r.id] = r.value; }
        });
      }
      if (typeof danach === 'function') { danach(); }
    });
}
