/*
 * Einstiegspunkt fuer das Browser-Buendel.
 *
 * Der echte @iobroker/type-detector wird hier hineingezogen und an window
 * gehaengt. Damit gibt es genau eine Wahrheit: die npm-Abhaengigkeit.
 * Nichts wird von Hand nachgepflegt — das war der Fehler des alten
 * alias-manager, der eine eingefrorene Kopie mitschleppte.
 *
 * detect() liefert den Bericht, getPatterns() die Plaetze samt Ausdruecken.
 * Beides ist oeffentliche Schnittstelle, kein Griff in Innereien.
 */
import ChannelDetector, { Types, StateType } from '@iobroker/type-detector';
import pkg from '@iobroker/type-detector/package.json';

/* Die eine Ausnahme: welche Rolle der Verbrauchsplatz VORSCHLAEGT.

   Seit 6.0.3 nimmt das Muster `consumption` beide Rollen an —
   `/^value\.(energy\.consumed|power\.consumption)$/`, unser eigener
   Befund aus Issue 334, von Bluefox am 14.10.2026 gemerged (PR 339) —
   und seine `defaultRole` ist dabei von `value.power.consumption` auf
   `value.energy.consumed` gewechselt.

   Fuers ERKENNEN ist das reiner Gewinn, und so steht es auch im
   Buendel: der Ausdruck bleibt, wie die Bibliothek ihn liefert.

   Fuers SCHREIBEN gilt das noch nicht. Einen Alias liest nicht nur die
   Werkbank, sondern jeder Adapter mit eigener Detektor-Fassung, und die
   aelteren kennen nur die alte Rolle. Gemessen am Produktivsystem
   (14.10.2026):

       4.6.4   /opt/iobroker/node_modules/@iobroker/type-detector   (Admin, vis, Geraetemanager)
       5.0.15  iobroker.matter
       6.0.1   @iobroker/mcp-server

   Alle drei tragen `role: /^value\.power\.consumption$/` — bei
   `value.energy.consumed` faellt der Punkt dort lautlos aus dem Geraet,
   und der Verbrauch verschwindet aus vis, Alexa und dem
   Geraetemanager. Gemessen gegen beide Fassungen:

       6.0.1   value.power.consumption -> socket  SET,ELECTRIC_POWER,CONSUMPTION
       6.0.1   value.energy.consumed   -> socket  SET,ELECTRIC_POWER
       6.0.3   beide                   -> socket  SET,ELECTRIC_POWER,CONSUMPTION

   Die alte Rolle versteht also JEDE Fassung, die neue nur die neueste.
   Darum schlaegt die Werkbank weiter die alte vor — ein Wort, an einer
   Stelle, mit Datum. Wenn die Leser nachgezogen sind, faellt dieser
   Block weg und die vier Vorlagen (`messpunkt`, `tasmota-lampe`,
   `tasmota-mehrfach`, `tasmota-steckdose`) wechseln mit ihm.

   `getPatterns()` gibt eine Tiefenkopie (ChannelDetector.js: JSON hin
   und zurueck), die Aenderung hier beruehrt das Erkennen also nicht —
   `detect()` rechnet mit der Tabelle der Bibliothek weiter. */
const VERBRAUCH_ALT = 'value.power.consumption';
const VERBRAUCH_NEU = 'value.energy.consumed';

const patterns = ChannelDetector.getPatterns();
Object.keys(patterns).forEach(typ => {
    (patterns[typ].states || []).forEach(st => {
        if (st.name === 'CONSUMPTION' && st.defaultRole === VERBRAUCH_NEU) {
            st.defaultRole = VERBRAUCH_ALT;
        }
    });
});

window.AWDetector = {
    ChannelDetector: ChannelDetector,
    patterns: patterns,
    Types: Types,
    StateType: StateType,
    version: pkg.version,
};
