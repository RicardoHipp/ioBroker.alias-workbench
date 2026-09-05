/* Prettier laeuft in diesem Adapter nicht: die Regeln sind in
   eslint.config.mjs abgeschaltet (95 % der Meldungen waren reine
   Formatfragen an 29 gewachsenen Modulen). Die Datei steht hier, weil
   @iobroker/eslint-config sie erwartet und ihr Fehlen sonst als Warnung
   gemeldet wird — sie uebernimmt schlicht die Vorgaben. */
export { default } from '@iobroker/eslint-config/prettier.config.mjs';
