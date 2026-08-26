/* Der geteilte Zustand der Werkbank.

   Ein Objekt statt loser Variablen, weil ES-Module importierte Bindungen
   schreibschuetzen: `S.current = ...` geht ueberall, `current = ...`
   ginge nur im eigenen Modul. Hier liegt nur, was wirklich mehreren
   Modulen gehoert - was ein einzelnes Modul fuer sich behaelt, bleibt
   dort als gewoehnliche Variable.

   VORLAGEN sind die eigenen und mitgelieferten Geraetevorlagen; der
   Katalog des Admin (Raum-/Funktionsnamen samt Bildern) liegt getrennt
   in katalog.js. */

export var S = {
  objects: {},
  keysSorted: [],
  kleinIndex: {},
  werte: {},
  current: null,
  openRow: null,
  entwurf: null,
  baum: null,
  baumModus: 'quellen',
  baumModusVorher: 'quellen',
  aufgeklappt: {},
  alleKlapp: null,
  abo: null,
  trockenAlle: null,
  /* Vergleich im Trockenlauf: Felder geordnet (Vorgabe) oder in der
     Reihenfolge, in der sie wirklich im Speicher stehen. */
  trockenRoh: false,
  /* Quellentausch: welcher Alias, welche neue Quelle, die Zuordnung
     und die Punkte, die dabei entfallen sollen. */
  tauschZiel: null,
  tauschNeu: '',
  tauschPlan: null,
  tauschWeg: {},
  tauschFilter: '',
  loeschListe: [],
  loeschZiel: null,
  loeschAlleAusgaenge: false,
  verlegeZiel: null,
  VORLAGEN: [],
  vorlagenUnvollstaendig: false,
  fokusOrdnerfeld: false,
  fokusMusterfeld: false,
  tplZ: null
};
