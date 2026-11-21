/* Die Umstellung alter Bezeichner auf englische.

   Warum es dieses Modul gibt. Bis 0.13.0 trugen die Felder, die die
   Werkbank selbst anlegt, deutsche Namen - `ikonRaeume`, `vorlage`,
   `ausZustand` und so fort. Die Pruefliste von ioBroker verlangt
   englische (PR 6634, mcm1957 am 17.11.2026): „Object Ids must use
   english names - unless they are directly supplied by external
   systems."

   Der naheliegende Weg waere gewesen, ueberall beide Schreibweisen zu
   lesen. Das haette 92 Stellen im Adapter betroffen, jede eine zweite
   Wahrheit, und keine davon waere je wieder verschwunden.

   Stattdessen: Dieses Modul ist die EINZIGE Stelle im Adapter, die die
   alten Namen noch kennt. Alles andere kennt nur die englischen. Beim
   Start laeuft die Umstellung einmal, danach ist der Bestand sauber.

   Ricardos Entscheidung vom 21.11.2026, tragfaehig weil der Adapter
   klein ist: 21 Installationen an diesem Tag (iobroker.live).

   - Zwingend. Wer abbricht, kann mit der Werkbank nicht arbeiten.
   - Aber nicht heimlich: Der Dialog nennt die Zahl und sagt, dass es
     keinen Rueckweg gibt.
   - Wiederholbar. Ein zweiter Lauf findet nichts mehr und macht nichts
     kaputt.

   Das Modul bleibt dauerhaft. Nicht jede Installation aktualisiert
   naechste Woche; wer in einem Jahr von 0.12 kommt, braucht es genauso.
   Es kostet nichts, wenn nichts passt. */

import { socket } from './verbindung.js';
import { tr } from './sprache.js';
import { $, el } from './basis.js';

/* Alt -> neu, fuer die Instanzkonfiguration.

   Die Felder an den Alias-Objekten (`vorlage`, `ausZustand`, …) und das
   Vorlagenformat kommen in einem spaeteren Schritt dazu; der Plan dafuer
   steht in `plan_englisch.md`. Diese Tabelle ist dann der Ort, an dem
   sie eingetragen werden. */
export var INSTANZ_NAMEN = {
  ikonRaeume: 'iconRooms',
  ikonFunktionen: 'iconFunctions',
  ikonErsetzen: 'iconReplace',
  vorlagenVomAdmin: 'templatesFromAdmin'
};

/* Was an diesem Instanzobjekt noch alt heisst.

   Gezaehlt wird nur, was wirklich dasteht. Ein Feld, das nie gesetzt
   wurde, ist nichts zu tun - die Vorgabe greift ohnehin. */
export function instanzBefunde(obj) {
  var nat = (obj && obj.native) || {};
  var raus = [];
  Object.keys(INSTANZ_NAMEN).forEach(function (alt) {
    if (nat[alt] === undefined) { return; }
    raus.push({ alt: alt, neu: INSTANZ_NAMEN[alt], wert: nat[alt] });
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
export function nativeUmgestellt(nat) {
  var quelle = nat || {};

  /* Welche Zielnamen schon dastehen, obwohl der alte Schluessel auch
     noch da ist - das sind die nachgetragenen Vorgaben. Sie werden
     uebersprungen, nicht ueberschrieben: Wer sie bloss ueberschreibt,
     macht das Ergebnis von der Reihenfolge der Schluessel abhaengig,
     und die ist nirgends zugesichert. */
  var verdraengt = {};
  Object.keys(INSTANZ_NAMEN).forEach(function (a) {
    if (quelle[a] !== undefined) { verdraengt[INSTANZ_NAMEN[a]] = true; }
  });

  var raus = {};
  Object.keys(quelle).forEach(function (k) {
    var neu = INSTANZ_NAMEN[k];
    if (neu) { raus[neu] = quelle[k]; return; }   /* der alte Wert gewinnt */
    if (verdraengt[k]) { return; }                /* nachgetragene Vorgabe */
    raus[k] = quelle[k];
  });
  return raus;
}

/* Schreiben. Das ganze Objekt zurueck, nicht nur `native` - dabei faellt
   der alte Schluessel weg, ohne dass man ihn loeschen muss. */
function schreibeInstanz(obj, kennung, fertig) {
  var neu = JSON.parse(JSON.stringify(obj));
  neu.native = nativeUmgestellt(obj.native || {});
  socket.emit('setObject', kennung, neu, function (err) {
    fertig(err || null, neu);
  });
}

/* ================== Der Dialog ================== */

var gesperrt = false;

function dlg() { return $('#dlg-migr'); }

function zeigeFrage(befunde, obj, kennung) {
  var d = dlg();
  var koerper = $('#migr-body');
  koerper.innerHTML = '';

  koerper.appendChild(el('p', null, tr('migr.lead', String(befunde.length))));

  var liste = el('ul', 'migr-liste');
  befunde.forEach(function (b) {
    liste.appendChild(el('li', null, b.alt + '  →  ' + b.neu));
  });
  koerper.appendChild(liste);

  koerper.appendChild(el('p', 'warn', tr('migr.noWayBack')));

  $('#migr-go').style.display = '';
  $('#migr-later').style.display = '';
  $('#migr-go').onclick = function () { fuehreAus(befunde, obj, kennung); };
  $('#migr-later').onclick = function () { zeigeSperre(befunde, obj, kennung); };

  if (!d.open) { d.showModal(); }
}

/* Abgebrochen: Der Dialog bleibt stehen und bleibt modal. Das ist die
   Sperre - hinter einem `showModal` ist die Oberflaeche ohnehin nicht
   bedienbar, es braucht keine zweite Mechanik dafuer. */
function zeigeSperre(befunde, obj, kennung) {
  gesperrt = true;
  var koerper = $('#migr-body');
  koerper.innerHTML = '';
  koerper.appendChild(el('p', null, tr('migr.locked')));
  $('#migr-later').style.display = 'none';
  $('#migr-go').style.display = '';
  $('#migr-go').onclick = function () { fuehreAus(befunde, obj, kennung); };
}

function zeigeErgebnis(fehler, befunde) {
  var koerper = $('#migr-body');
  koerper.innerHTML = '';
  if (fehler) {
    koerper.appendChild(el('p', 'warn', tr('migr.failed', String(fehler))));
    $('#migr-go').style.display = '';
    $('#migr-go').textContent = tr('migr.retry');
    $('#migr-later').style.display = 'none';
    return;
  }
  koerper.appendChild(el('p', null, tr('migr.done', String(befunde.length))));
  $('#migr-go').style.display = 'none';
  $('#migr-later').style.display = '';
  $('#migr-later').textContent = tr('migr.reload');
  $('#migr-later').onclick = function () { location.reload(); };
}

function fuehreAus(befunde, obj, kennung) {
  $('#migr-go').disabled = true;
  schreibeInstanz(obj, kennung, function (err) {
    $('#migr-go').disabled = false;
    zeigeErgebnis(err, befunde);
  });
}

/* ================== Einstieg ================== */

/* Beim Start gerufen, mit dem schon geladenen Instanzobjekt.

   Gibt `true` zurueck, wenn etwas umzustellen ist - dann hat der
   Aufrufer nichts weiter zu tun, der Dialog uebernimmt. */
export function migrationNoetig(obj, kennung) {
  var befunde = instanzBefunde(obj);
  if (!befunde.length) { return false; }
  zeigeFrage(befunde, obj, kennung);
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
