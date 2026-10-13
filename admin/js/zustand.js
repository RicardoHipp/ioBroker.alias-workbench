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
  /* Je Knoten die Punkte des Geraets samt relativem Namen — bei
     zerlegten MQTT-Geraeten aus mehreren Zweigen zusammengetragen.
     Verfaellt zusammen mit `kleinIndex`. */
  geraeteIndex: {},
  /* Zaehlt jede Aenderung an S.objects. Wer sich etwas aus den Objekten
     merkt (die Karte Quelle -> Alias in entwurf.js), vergleicht hiermit
     statt mit der Zahl der Schluessel — beim Verlegen verschwinden genau
     so viele, wie dazukommen (T22). */
  objektStand: 0,
  /* Alias-Kanal -> Zahl der Punkte, deren Quelle es nicht (mehr) gibt.
     Einmal beim Laden gerechnet; der Baum schlaegt nur nach. */
  aliasKaputt: {},
  werte: {},
  current: null,
  /* Mehrere Zweige als EIN Geraet.

     Manche Adapter verteilen ein Geraet auf Geschwisterzweige: Matter
     legt eine Steckdose als Ordner mit zwei `device` darunter ab - der
     Schalter in `OnOffPlugInUnit-1`, die Messwerte in
     `ElectricalSensor-2` (gemessen am Produktivsystem 13.10.2026). Der
     Ordner selbst traegt keine Datenpunkte und ist damit nicht
     waehlbar, und jeder Endpoint einzeln ergibt ein halbes Geraet.

     `S.current` bleibt EIN Knoten - hier der gemeinsame Elternknoten -,
     und `S.zweige` sagt, welche seiner Zweige dazugehoeren. `null`
     heisst „alle", also genau das bisherige Verhalten. Eine Liste
     daraus zu machen haette `S.current` an 91 Stellen beruehrt, ohne
     dass irgendeine davon besser geworden waere.

     Die Auswahl ist fluechtig: sie ueberlebt keinen Seitenneustart. */
  zweige: null,
  /* Einmalige Rueckmeldung aus dem Baum an die rechte Seite. */
  zweigMeldung: '',
  openRow: null,
  entwurf: null,
  baum: null,
  baumModus: 'quellen',
  baumModusVorher: 'quellen',
  aufgeklappt: {},
  alleKlapp: null,
  /* Die laufenden Wertabos, als Liste von Mustern. War einmal ein
     einzelnes Muster - seit im Aliasmodus auch die Quellen abonniert
     werden, sind es mehrere (08.09.2026). */
  abo: [],
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
  /* Einmal registrierter Schliesser fuer die Quellenauswahl am
     Sprungknopf - siehe ergebnis.js. */
  sprungZuhoerer: false,
  VORLAGEN: [],
  vorlagenUnvollstaendig: false,
  fokusOrdnerfeld: false,
  fokusMusterfeld: false,
  tplZ: null
};
