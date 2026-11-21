import { migrationNoetig } from './migration.js';
import { socket } from './verbindung.js';

/* Die Einstellungen der Instanz.

   Sie stehen in `system.adapter.alias-workbench.0.native` und damit im
   Objektspeicher - nicht im Browser. Eine Einstellung, die bestimmt,
   *wie* geschrieben wird, gehoert nicht in den localStorage eines
   einzelnen Rechners; sie gilt fuer jeden, der die Werkbank oeffnet.
   Der Klappzustand des Baums und der Expertenmodus liegen weiterhin
   dort, wo sie hingehoeren: das sind Ansichtssachen.

   Die Namen sind dieselben wie in `admin/jsonConfig.json`, damit die
   Einstellungsseite sie ohne Zwischenschicht bedient. Fehlt ein Wert -
   etwa weil die Instanz aelter ist als die Einstellung - gilt die
   Vorgabe hier. */
var EINST_VORGABE = {
  iconRooms: true,
  iconFunctions: true,
  iconReplace: true,
  templatesFromAdmin: true
};
var einstellungen = {};

export function einst(name) {
  var v = einstellungen[name];
  return v === undefined ? !!EINST_VORGABE[name] : !!v;
}

/* Die eigene Instanz - `%instance%` steht in der URL, sonst 0. */
export function instanzId() {
  var m = String(location.search || '').match(/(?:^\?|&)(\d+)(?:&|$)/);
  return 'system.adapter.alias-workbench.' + (m ? m[1] : '0');
}

export function ladeEinstellungen(danach) {
  socket.emit('getObject', instanzId(), function (err, obj) {
    if (!err && obj && obj.native) { einstellungen = obj.native; }
    /* Traegt die Instanz noch alte, deutsche Namen, uebernimmt die
       Migration - sie oeffnet einen modalen Dialog, und bis der
       durch ist, arbeitet die Werkbank nicht weiter. Der Rest des
       Adapters kennt nur die englischen Namen; `migration.js` ist die
       einzige Stelle, die die alten ueberhaupt noch kennt. */
    if (!err && obj && migrationNoetig(obj, instanzId())) { return; }
    if (typeof danach === 'function') { danach(); }
  });
}
