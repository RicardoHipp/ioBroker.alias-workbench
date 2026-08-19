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

window.AWDetector = {
    ChannelDetector: ChannelDetector,
    patterns: ChannelDetector.getPatterns(),
    Types: Types,
    StateType: StateType,
    version: pkg.version,
};
