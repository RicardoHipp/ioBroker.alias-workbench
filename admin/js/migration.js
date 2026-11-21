/* Die Umstellung alter Bezeichner auf englische.

   Warum es dieses Modul gibt. Bis 0.13.0 trugen die Felder, die die
   Werkbank selbst anlegt, deutsche Namen - `ikonRaeume`, `vorlage`,
   `ausZustand` und so fort. Die Pruefliste von ioBroker verlangt
   englische (PR 6634, mcm1957 am 17.11.2026): „Object Ids must use
   english names - unless they are directly supplied by external
   systems."

   Der naheliegende Weg waere gewesen, ueberall beide Schreibweisen zu
   lesen. Das haette den Adapter an Dutzenden Stellen betroffen, jede
   eine zweite Wahrheit, und keine davon waere je wieder verschwunden.

   Stattdessen: Dieses Modul ist die EINZIGE Stelle im Adapter, die die
   alten Namen noch kennt. Alles andere kennt nur die englischen. Beim
   Start laeuft die Umstellung einmal, danach ist der Bestand sauber.

   Ricardos Entscheidung vom 21.11.2026, tragfaehig weil der Adapter
   klein ist: 21 Installationen an diesem Tag (iobroker.live).

   - Zwingend. Wer abbricht, kann mit der Werkbank nicht arbeiten.
   - Aber nicht heimlich: Der Dialog nennt die Zahlen und sagt, dass es
     keinen Rueckweg gibt.
   - Wiederholbar. Ein zweiter Lauf findet nichts mehr und macht nichts
     kaputt.

   Das Modul bleibt dauerhaft. Nicht jede Installation aktualisiert
   naechste Woche; wer in einem Jahr von 0.12 kommt, braucht es genauso.
   Es kostet nichts, wenn nichts passt. */

import { socket } from './verbindung.js';
import { tr } from './sprache.js';
import { $, el } from './basis.js';

/* Alt -> neu, fuer die Einstellungen der Instanz. */
export var INSTANZ_NAMEN = {
  ikonRaeume: 'iconRooms',
  ikonFunktionen: 'iconFunctions',
  ikonErsetzen: 'iconReplace',
  vorlagenVomAdmin: 'templatesFromAdmin'
};

/* Alt -> neu, fuer die Felder an den Alias-Objekten.

   `ausZustand` heisst jetzt `templateState`, nicht `fromState`: Das
   Feld haelt den NAMEN DER VORLAGENZEILE (`SET`, `ACTUAL`), nicht die
   Kennung der Quelle - die ist `source`.

   Nicht dabei sind `telemetryPeriod` und `telemetryPeriodAt` (frueher
   `takt`, `taktZeit`). Die sitzen an Punkten des mqtt-client, also in
   einem fremden Namensraum; dort noch einmal zu schreiben waere das
   Gegenteil dessen, was die Umstellung bezweckt. Sie sind ohnehin nur
   ein Zwischenspeicher und stehen beim naechsten Nachfragen neu da.

   Ebenfalls nicht dabei: alles, was von aussen kommt. `topic` von MQTT,
   `TYPE` von hm-rpc, `autocreated` aus einem Skript des Nutzers. Das
   deckt sich mit mcm1957s Ausnahme fuer fremde Systeme. */
export var ALIAS_NAMEN = {
  quelle: 'source',
  vorlage: 'template',
  vorlageVersion: 'templateVersion',
  ausZustand: 'templateState',
  geraetetyp: 'deviceType',
  musterVonHand: 'deviceTypeManual',
  vonHand: 'manual',
  angelegtVon: 'createdBy',
  attrappeAus: 'mockedFrom'
};

/* Welche alten Namen in diesem `native` stehen. */
function alteFelder(nat, namen) {
  var raus = [];
  Object.keys(namen).forEach(function (alt) {
    if (nat && nat[alt] !== undefined) { raus.push(alt); }
  });
  return raus;
}

/* Was an diesem Instanzobjekt noch alt heisst.

   Gezaehlt wird nur, was wirklich dasteht. Ein Feld, das nie gesetzt
   wurde, ist nichts zu tun - die Vorgabe greift ohnehin. */
export function instanzBefunde(obj) {
  var nat = (obj && obj.native) || {};
  return alteFelder(nat, INSTANZ_NAMEN).map(function (alt) {
    return { alt: alt, neu: INSTANZ_NAMEN[alt], wert: nat[alt] };
  });
}

/* Welche Alias-Objekte noch alte Felder tragen.

   Nur `alias.*` und nur Objekte mit mindestens einem unserer Felder.
   Ein von Hand im Admin gebauter Alias kennt sie nicht und bleibt
   unberuehrt - am Produktivsystem am 21.11.2026 waren das 650 von 754. */
export function aliasBefunde(objects) {
  var raus = [];
  Object.keys(objects || {}).forEach(function (id) {
    if (id.indexOf('alias.') !== 0) { return; }
    var o = objects[id];
    var felder = alteFelder(o && o.native, ALIAS_NAMEN);
    if (felder.length) { raus.push({ id: id, felder: felder }); }
  });
  return raus;
}

/* Das umgestellte `native` bauen - ohne das Objekt anzufassen.

   Getrennt von Schreiben, damit der Test es ohne Verbindung pruefen
   kann. Reihenfolge der uebrigen Schluessel bleibt, nur die betroffenen
   wechseln den Namen.

   Stehen BEIDE Schreibweisen da, gewinnt die ALTE. Das ist nicht
   willkuerlich, sondern am Produktivsystem gemessen (21.11.2026):
   `iobroker upload` traegt die Vorgaben aus `io-package.json` in
   bestehende Instanzen nach. Nach dem Einspielen stehen die vier
   englischen Schluessel also schon da - mit ihrer Vorgabe `true`, nicht
   mit dem Wert des Nutzers. Wuerde der neue gewinnen, haette eine
   abgeschaltete Einstellung genau den stillen Sprung auf `true`
   gemacht, den diese Migration verhindern soll.

   Umgekehrt kann der Fall „Migration lief schon, jemand hat seither
   gespeichert" hier gar nicht auftreten: Danach ist der alte Schluessel
   weg, und `io-package.json` kennt ihn nicht mehr - er kommt also auch
   durch kein Einspielen zurueck. Beide da heisst somit immer: alt ist
   der echte Wert, neu ist die nachgetragene Vorgabe. */
export function nativeUmgestellt(nat, namen) {
  var quelle = nat || {};
  var tabelle = namen || INSTANZ_NAMEN;

  /* Welche Zielnamen schon dastehen, obwohl der alte Schluessel auch
     noch da ist - das sind die nachgetragenen Vorgaben. Sie werden
     uebersprungen, nicht ueberschrieben: Wer sie bloss ueberschreibt,
     macht das Ergebnis von der Reihenfolge der Schluessel abhaengig,
     und die ist nirgends zugesichert. */
  var verdraengt = {};
  Object.keys(tabelle).forEach(function (a) {
    if (quelle[a] !== undefined) { verdraengt[tabelle[a]] = true; }
  });

  var raus = {};
  Object.keys(quelle).forEach(function (k) {
    var neu = tabelle[k];
    if (neu) { raus[neu] = quelle[k]; return; }   /* der alte Wert gewinnt */
    if (verdraengt[k]) { return; }                /* nachgetragene Vorgabe */
    raus[k] = quelle[k];
  });
  return raus;
}

/* Schreiben. Das ganze Objekt zurueck, nicht nur `native` - dabei faellt
   der alte Schluessel weg, ohne dass man ihn loeschen muss. Geaendert
   wird ausschliesslich `native`: kein `common.alias`, keine Rolle, keine
   Formel. Es bewegt sich also kein Wert und es schaltet nichts. */
function schreibeObjekt(kennung, obj, namen, fertig) {
  var neu = JSON.parse(JSON.stringify(obj));
  neu.native = nativeUmgestellt(obj.native || {}, namen);
  socket.emit('setObject', kennung, neu, function (err) { fertig(err || null); });
}

/* Nacheinander, nicht alle auf einmal.

   Bei 104 Objekten im Haus wecken 104 gleichzeitige Schreibvorgaenge
   jeden Leser gleichzeitig - Geraetemanager und matter erkennen dann
   alles auf einmal neu. Einzeln ist langsamer und dafuer ruhig. Was
   nicht geschrieben werden konnte, wird gesammelt statt den Lauf
   abzubrechen: Ein einzelnes verweigertes Objekt darf die anderen 103
   nicht aufhalten. */
function reihum(aufgaben, schritt, fertig) {
  var fehler = [];
  var i = 0;
  function weiter() {
    if (i >= aufgaben.length) { return fertig(fehler); }
    var a = aufgaben[i++];
    schritt(a, function (err) {
      if (err) { fehler.push({ id: a.kennung, grund: String(err) }); }
      weiter();
    });
  }
  weiter();
}

/* ================== Der Dialog ================== */

var gesperrt = false;

function dlg() { return $('#dlg-migr'); }

function knopf(id, sichtbar) {
  var k = $(id);
  if (k) { k.style.display = sichtbar ? '' : 'none'; }
  return k;
}

function zeigeFrage(lage) {
  var koerper = $('#migr-body');
  koerper.innerHTML = '';

  koerper.appendChild(el('p', null, tr('migr.lead',
    String(lage.instanz.length), String(lage.aliase.length))));

  /* Die Namenspaare einmal auflisten - wer wissen will, was da
     umbenannt wird, soll es sehen und nicht glauben muessen. */
  var paare = {};
  lage.instanz.forEach(function (b) { paare[b.alt] = b.neu; });
  lage.aliase.forEach(function (b) {
    b.felder.forEach(function (f) { paare[f] = ALIAS_NAMEN[f]; });
  });
  var liste = el('ul', 'migr-liste');
  Object.keys(paare).sort().forEach(function (alt) {
    liste.appendChild(el('li', null, alt + '  →  ' + paare[alt]));
  });
  koerper.appendChild(liste);

  koerper.appendChild(el('p', 'warn', tr('migr.noWayBack')));

  knopf('#migr-go', true).onclick = function () { fuehreAus(lage); };
  knopf('#migr-later', true).onclick = function () { zeigeSperre(lage); };

  var d = dlg();
  if (!d.open) { d.showModal(); }
}

/* Abgebrochen: Der Dialog bleibt stehen und bleibt modal. Das ist die
   Sperre - hinter einem `showModal` ist die Oberflaeche ohnehin nicht
   bedienbar, es braucht keine zweite Mechanik dafuer. */
function zeigeSperre(lage) {
  gesperrt = true;
  var koerper = $('#migr-body');
  koerper.innerHTML = '';
  koerper.appendChild(el('p', null, tr('migr.locked')));
  knopf('#migr-later', false);
  knopf('#migr-go', true).onclick = function () { fuehreAus(lage); };
}

function zeigeErgebnis(fehler, lage) {
  var koerper = $('#migr-body');
  koerper.innerHTML = '';
  var zahl = lage.instanz.length + lage.aliase.length;

  if (fehler.length) {
    koerper.appendChild(el('p', 'warn',
      tr('migr.partly', String(zahl - fehler.length), String(fehler.length))));
    var ul = el('ul', 'migr-liste');
    fehler.slice(0, 10).forEach(function (f) {
      ul.appendChild(el('li', null, f.id + ' — ' + f.grund));
    });
    koerper.appendChild(ul);
    knopf('#migr-go', true).textContent = tr('migr.retry');
    knopf('#migr-later', false);
    return;
  }

  koerper.appendChild(el('p', null, tr('migr.done', String(zahl))));
  knopf('#migr-go', false);
  var k = knopf('#migr-later', true);
  k.textContent = tr('migr.reload');
  k.onclick = function () { location.reload(); };
}

function fuehreAus(lage) {
  var go = $('#migr-go');
  go.disabled = true;
  go.textContent = tr('migr.running');

  var aufgaben = [];
  if (lage.instanz.length) {
    aufgaben.push({ kennung: lage.kennung, obj: lage.instanzObj, namen: INSTANZ_NAMEN });
  }
  lage.aliase.forEach(function (b) {
    aufgaben.push({ kennung: b.id, obj: lage.objects[b.id], namen: ALIAS_NAMEN });
  });

  reihum(aufgaben, function (a, fertig) {
    schreibeObjekt(a.kennung, a.obj, a.namen, fertig);
  }, function (fehler) {
    go.disabled = false;
    go.textContent = tr('migr.go');
    zeigeErgebnis(fehler, lage);
  });
}

/* ================== Einstieg ================== */

/* Beim Start gerufen, mit dem Instanzobjekt und dem Objektvorrat.

   Gibt `true` zurueck, wenn etwas umzustellen ist - dann hat der
   Aufrufer nichts weiter zu tun, der Dialog uebernimmt. */
export function migrationNoetig(obj, kennung, objects) {
  var lage = {
    kennung: kennung,
    instanzObj: obj,
    objects: objects || {},
    instanz: instanzBefunde(obj),
    aliase: aliasBefunde(objects)
  };
  if (!lage.instanz.length && !lage.aliase.length) { return false; }
  zeigeFrage(lage);
  return true;
}

/* Escape darf den Dialog nicht wegnehmen, solange etwas offen ist. */
export function migrationVerdrahten() {
  var d = dlg();
  if (!d) { return; }
  d.addEventListener('cancel', function (e) {
    e.preventDefault();
    if (!gesperrt) { return; }
  });
}
