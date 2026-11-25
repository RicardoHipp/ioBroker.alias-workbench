import { migrationNoetig } from './migration.js';
import { socket } from './verbindung.js';
import { S } from './zustand.js';

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
  templatesFromAdmin: true,
  /* Ab Werk aus: Datenpunkte im Bereich des MQTT-Adapters anlegen und
     aendern. Ein Adapter schreibt eigentlich nur in seinen eigenen
     Namensraum (bei der Werkbank `alias.*` und `enum.*`); die
     Tasmota-Helfer brauchen aber `cmnd`-Punkte unter `mqtt-client.0.…`.
     Im Aufnahmeantrag ins ioBroker-Repository als Ausnahme vermerkt und
     angenommen - hier wird sie zur bewussten Entscheidung dessen, der
     die Werkbank betreibt (22.11.2026). */
  mqttObjects: false,
  /* Welche Ansicht rechts beim Waehlen eines Geraets: `short` (Vorgabe),
     `detail` oder `remember` - die zuletzt gewaehlte (25.11.2026). */
  startView: 'short'
};
var einstellungen = {};

export function einst(name) {
  var v = einstellungen[name];
  return v === undefined ? !!EINST_VORGABE[name] : !!v;
}

/* Wie `einst`, aber der Wert selbst statt wahr/falsch - fuer Auswahlen. */
export function einstWert(name) {
  var v = einstellungen[name];
  return (v === undefined || v === null || v === '') ? EINST_VORGABE[name] : v;
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
    if (!err && obj && migrationNoetig(obj, instanzId(), S.objects)) { return; }
    if (typeof danach === 'function') { danach(); }
  });
}

/* Dasselbe, aber ohne Migration und ohne Rueckhalt: unmittelbar vor
   einem Schreibvorgang, der an einer Einstellung haengt. Wer sie eben
   in einem anderen Reiter umgestellt hat, soll nicht erst die Werkbank
   neu laden muessen. Scheitert das Lesen, bleibt der alte Stand. */
export function frischeEinstellungen(danach) {
  socket.emit('getObject', instanzId(), function (err, obj) {
    if (!err && obj && obj.native) { einstellungen = obj.native; }
    danach();
  });
}

/* Die Einstellungsseite der eigenen Instanz im Admin. Der Reiter laeuft
   als iframe im Admin, vom selben Ursprung - also kann er die
   Admin-Seite selbst umlenken. Steht er allein im Fenster, gilt
   dasselbe fuer dieses. */
export function einstellungsAdresse() {
  return location.origin + '/#tab-instances/config/' + instanzId();
}

export function oeffneEinstellungen() {
  var ziel = einstellungsAdresse();
  try { (window.top || window).location.href = ziel; } catch { window.open(ziel, '_blank'); }
}
