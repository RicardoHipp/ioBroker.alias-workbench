/* Die sieben Pruefungen - laufen immer mit, fassen nichts an. */

import { S } from './zustand.js';
import { $, el } from './basis.js';
import { tr } from './sprache.js';
import { wertVon } from './werte.js';
import './erkennung.js';
import { sofortRueckmeldung, mqttEinstellung } from './mqtt.js';


/* Kommt die Rueckmeldung sofort oder erst mit der naechsten Telemetrie?

   Ein Punkt, der nach cmnd schreibt und aus tele liest, zeigt nach dem
   Schalten minutenlang den alten Wert. Tasmota antwortet zwar sofort
   auf stat/RESULT, aber dort steht nur der eine geaenderte Schluessel —
   als Lesequelle waere das unbrauchbar, weil der Punkt nach jedem
   anderen Befehl leer liefe. Wer stat/POWER liest, ist fein raus: das
   kommt bei jeder Schaltung.

   Am Geraet gemessen: cmnd/Scheme geschrieben, stat/RESULT war sofort
   da, tele/STATE kam erst nach der naechsten Telemetrie — bei
   TelePeriod 300 also bis zu fuenf Minuten spaeter. */
export function pruefungRueckmeldung(e) {
  var lahm = e.states.filter(function (x) {
    if (!x.on || !x.srcW || !x.srcR) { return false; }
    return /\.tele\./.test(x.srcR) && /\.cmnd\./.test(x.srcW);
  });
  if (!lahm.length) { return { s: 'ok', t: tr('check.feedback'), d: tr('check.feedbackFine') }; }
  /* Nur warnen, wenn es wirklich langsam ist. Mit SetOption59 meldet
     das Geraet jede Aenderung sofort — dann ist die Bauform zwar
     dieselbe, aber kein Problem. Gemessen: drei Sekunden. */
  var sofort = sofortRueckmeldung(e.kanal);
  var namen = lahm.map(function (x) { return x.n; }).join(', ');
  if (sofort === true) { return { s: 'ok', t: tr('check.feedback'), d: tr('check.feedbackFast') }; }
  if (sofort === null) { return { s: 'mut', t: tr('check.feedback'), d: tr('check.feedbackUnknown', namen) }; }
  return { s: 'warn', t: tr('check.feedback'), d: tr('check.feedbackSlow', namen) };
}

/* Zeigen zwei Punkte auf genau dasselbe?

   Das passiert beim Wechsel der Vorlage: die alte nannte den Schalter
   ON, die neue nennt ihn SET — hinterher stehen beide im Alias, auf
   derselben Quelle, mit derselben Formel. Das Geraet hat dann zwei
   Schalter, die sich gegenseitig nachziehen.

   SET und ACTUAL zaehlen nicht als Dopplung: sie lesen zwar denselben
   Punkt, aber nur einer schreibt. Und zwei Messwerte aus demselben
   JSON sind verschieden, solange ihre Formeln es sind. */
export function pruefungDopplung(e) {
  var nach = {};
  e.states.forEach(function (s) {
    if (!s.on || !s.n || !s.srcR) { return; }
    var k = s.srcR + '|' + (s.f || '') + ' → ' + (s.srcW || '') + '|' + (s.fw || '');
    (nach[k] = nach[k] || []).push(s.n);
  });
  var doppelt = [];
  Object.keys(nach).forEach(function (k) {
    if (nach[k].length > 1) { doppelt.push(nach[k].join(' = ')); }
  });
  if (!doppelt.length) { return { s: 'ok', t: tr('check.duplicate'), d: tr('check.duplicateNone') }; }
  return { s: 'warn', t: tr('check.duplicate'), d: tr('check.duplicateSome', doppelt.join(',  ')) };
}

/* Kann der Schreibweg ueberhaupt senden? Bei MQTT sitzt der Schalter
   am einzelnen Objekt. Steht er auf falsch, sieht der Alias tadellos
   aus und schaltet trotzdem nichts — auf der Produktivanlage betraf das
   einen von 25 Aliasen. Reine Objektlektuere, es wird nichts gesendet. */
export function pruefungSenden(e) {
  var ziele = e.states.filter(function (x) { return x.on && x.srcW; });
  if (!ziele.length) { return { s: 'mut', t: tr('check.publish'), d: tr('check.noWritePath') }; }
  var mqtt = [], stumm = [], fehlt = [], unklar = [];
  ziele.forEach(function (x) {
    /* Drei Faelle, nicht zwei: den Punkt gibt es gar nicht, es gibt ihn
       und er ist stumm, oder er sendet. Der erste kam dazu, seit die
       Erkennung sich auf Befehle stuetzen darf, die das Geraet kennt. */
    if (!S.objects[x.srcW]) { fehlt.push(x.n); return; }
    var m = mqttEinstellung(x.srcW);
    if (!m) { return; }
    mqtt.push(x);
    /* Nur ein ausdrueckliches Nein ist ein Nein. `null` heisst
       unbekannt: Objekte von ioBroker.mqtt und sonoff tragen das Thema
       nur in `native`, ohne `custom`-Block — ueber ihre Sendefaehigkeit
       sagt das nichts. Vorher stand dort fest `false`, und die Pruefung
       meldete rot „kann nicht senden", ohne dass sich etwas daran
       aendern liess (gemessen 09.09.2026). */
    if (m.publish === false) { stumm.push(x.n); }
    else if (m.publish === null) { unklar.push(x.n); }
  });
  if (fehlt.length) { return { s: 'bad', t: tr('check.publish'), d: tr('check.sendPointMissing', fehlt.join(', ')) }; }
  if (!mqtt.length) { return { s: 'mut', t: tr('check.publish'), d: tr('check.notMqtt') }; }
  if (stumm.length) { return { s: 'bad', t: tr('check.publish'), d: tr('check.cannotSend', stumm.join(', ')) }; }
  if (unklar.length) { return { s: 'mut', t: tr('check.publish'), d: tr('check.sendUnknown', unklar.join(', ')) }; }
  return { s: 'ok', t: tr('check.publish'), d: tr('check.canSend', mqtt.length) };
}


export function baueChecks(e, haupt, pflichtFehlt) {
  var an = e.states.filter(function (s) { return s.on; });
  var ohneQuelle = an.filter(function (s) { return s.srcR && !S.objects[s.srcR]; });
  var ohneWert = an.filter(function (s) { return s.srcR && S.objects[s.srcR] && !S.werte[s.srcR]; });
  var formelKaputt = an.filter(function (s) { var a = wertVon(s); return s.srcR && !a.ok && (a.fehler || a.leer); });

  var items = [
    { s: ohneQuelle.length ? 'bad' : 'ok', t: tr('check.sourceExists'),
      d: ohneQuelle.length ? ohneQuelle.map(function (x) { return x.n; }).join(', ') : tr('check.checked', an.length) },
    { s: ohneWert.length ? 'bad' : 'ok', t: tr('check.sourceHasValue'),
      d: ohneWert.length ? ohneWert.map(function (x) { return x.n; }).join(', ') : tr('check.allDeliver') },
    { s: formelKaputt.length ? 'bad' : 'ok', t: tr('check.formulaYields'),
      d: formelKaputt.length ? formelKaputt.map(function (x) { return x.n; }).join(', ') : tr('check.allFine') },
    { s: haupt && !pflichtFehlt.length ? 'ok' : 'bad', t: tr('check.rolesMakeDevice'),
      d: haupt ? (pflichtFehlt.length
            ? tr('pattern.missing', pflichtFehlt.map(function (x) { return x.name; }).join(', '))
            : haupt.type) : tr('check.noPatternFits') },
    pruefungSenden(e),
    pruefungRueckmeldung(e),
    pruefungDopplung(e)
  ];

  var ul = $('#checklist');
  ul.textContent = '';
  var schlecht = 0;
  items.forEach(function (c) {
    if (c.s === 'bad') { schlecht++; }
    var li = el('li');
    li.appendChild(el('span', 'm ' + c.s,
      c.s === 'ok' ? '✓' : (c.s === 'mut' ? '·' : (c.s === 'warn' ? '!' : '✕'))));
    li.appendChild(el('span', null, c.t));
    li.appendChild(el('span', 'det', c.d));
    ul.appendChild(li);
  });
  /* Der Zaehler stand fest auf vier, obwohl es inzwischen sechs
     Pruefungen sind — und die Warnstufe kannte er gar nicht. */
  var warnungen = items.filter(function (c) { return c.s === 'warn'; }).length;
  var chip = $('#checkchip');
  chip.className = 'chip ' + (schlecht ? 'bad' : (warnungen ? 'warn' : 'ok'));
  chip.textContent = schlecht ? tr('check.openCount', schlecht)
    : (warnungen ? tr('check.hintCount', warnungen) : tr('check.allOk', items.length));
}
