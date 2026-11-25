/* Die acht Pruefungen - laufen immer mit, fassen nichts an. */

import { S } from './zustand.js';
import { $, el } from './basis.js';
import { tr } from './sprache.js';
import { wertVon, zielKann } from './werte.js';
import './erkennung.js';
import { sofortRueckmeldung, mqttEinstellung, telegesteuert } from './mqtt.js';


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
  /* Dieselbe Frage wie die MQTT-Karte, damit beide nicht auseinander
     laufen (Ricardo, 16.09.2026). */
  var lahm = telegesteuert(e);
  /* Kein Haken, sondern ein Punkt: Hier wurde nichts geprueft, weil es
     nichts zu pruefen gab. „alle in Ordnung" las sich, als haette die
     Werkbank etwas nachgesehen - an Ricardos Steckdosenleiste lesen alle
     Zeilen aus stat/..., SetOption59 ist dort folgenlos. */
  if (!lahm.length) { return { s: 'mut', t: tr('check.feedback'), d: tr('check.feedbackNone') }; }
  /* Nur warnen, wenn es wirklich langsam ist. Mit SetOption59 meldet
     das Geraet jede Aenderung sofort — dann ist die Bauform zwar
     dieselbe, aber kein Problem. Gemessen: drei Sekunden. */
  var sofort = sofortRueckmeldung(e.kanal);
  var namen = lahm.map(function (x) { return x.n; }).join(', ');
  if (sofort === true) { return { s: 'ok', t: tr('check.feedback'), d: tr('check.feedbackFast') }; }
  if (sofort === null) { return { s: 'mut', t: tr('check.feedback'), d: tr('check.feedbackUnknown', namen) }; }
  return { s: 'warn', t: tr('check.feedback'), d: tr('check.feedbackSlow', namen),
    zeilen: lahm.map(function (x) { return x.n; }) };
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
  var doppelt = [], dz = [];
  Object.keys(nach).forEach(function (k) {
    if (nach[k].length > 1) { doppelt.push(nach[k].join(' = ')); dz = dz.concat(nach[k]); }
  });
  if (!doppelt.length) { return { s: 'ok', t: tr('check.duplicate'), d: tr('check.duplicateNone') }; }
  return { s: 'warn', t: tr('check.duplicate'), d: tr('check.duplicateSome', doppelt.join(',  ')), zeilen: dz };
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
  if (fehlt.length) { return { s: 'bad', t: tr('check.publish'), d: tr('check.sendPointMissing', fehlt.join(', ')), zeilen: fehlt }; }
  if (!mqtt.length) { return { s: 'mut', t: tr('check.publish'), d: tr('check.notMqtt') }; }
  if (stumm.length) { return { s: 'bad', t: tr('check.publish'), d: tr('check.cannotSend', stumm.join(', ')), zeilen: stumm }; }
  if (unklar.length) { return { s: 'mut', t: tr('check.publish'), d: tr('check.sendUnknown', unklar.join(', ')) }; }
  return { s: 'ok', t: tr('check.publish'), d: tr('check.canSend', mqtt.length) };
}


/* Kann das Ziel, was der Punkt von ihm verlangt?

   Drei Fragen an fremde Objekte, die die Werkbank vorher nie gestellt hat:
   Nimmt das Schreibziel den Wert der Formel an? Laesst es sich ueberhaupt
   beschreiben? Meldet die Lesequelle etwas? Was dabei schiefgeht, faellt
   nirgends auf — geschrieben wird trotzdem, gelesen auch, es kommt nur
   nichts dabei heraus (Ricardo, 15.09.2026).

   Hinweis, nicht Fehler: Ob am Ende wirklich nichts passiert, entscheidet
   der Adapter hinter dem Punkt, und den kennt die Werkbank nicht. */
export function pruefungZielKann(e) {
  var treffer = [];
  e.states.forEach(function (s) {
    if (!s.on) { return; }
    zielKann(s).forEach(function (x) { treffer.push({ n: s.n, art: x.art, typ: x.typ }); });
  });
  if (!treffer.length) { return { s: 'ok', t: tr('check.targetCan'), d: tr('check.targetCanFine') }; }
  var texte = {};
  var text = treffer.map(function (x) {
    var t = (x.art === 'formelBlind') ? tr('check.targetVoidFormula', x.n, x.typ) : tr('check.targetNoWrite', x.n);
    texte[x.n] = (texte[x.n] ? texte[x.n] + ', ' : '') + t;
    return t;
  }).join(', ');
  return { s: 'warn', t: tr('check.targetCan'), d: text,
    zeilen: Object.keys(texte), texte: texte };
}

/* Die Ergebnisse allein, ohne sie zu zeichnen - die Ampel der
   Kurzansicht liest dieselben, damit beide nie Verschiedenes sagen. */
export function pruefErgebnisse(e, haupt, pflichtFehlt) {
  var an = e.states.filter(function (s) { return s.on; });
  var ohneQuelle = an.filter(function (s) { return s.srcR && !S.objects[s.srcR]; });
  /* Eine Taste (`button…`) meldet erst, wenn sie gedrueckt wird - ohne
     Wert ist sie kein Fehler, sondern nur noch nie benutzt. Am
     BILRESA-Taster stand rot „Quelle hat einen Wert: PRESS, PRESS_LONG"
     (Ricardo, 26.11.2026). Eine Formel, die auf nichts trifft, ist dort
     aus demselben Grund kein Fehler; eine, die WIRFT, schon. */
  var taste = function (s) { return /^button/.test(s.role || ''); };
  var ohneWert = an.filter(function (s) { return s.srcR && S.objects[s.srcR] && !S.werte[s.srcR] && !taste(s); });
  var tastenOhneWert = an.filter(function (s) { return s.srcR && S.objects[s.srcR] && !S.werte[s.srcR] && taste(s); });
  var formelKaputt = an.filter(function (s) {
    var a = wertVon(s);
    return s.srcR && !a.ok && (a.fehler || (a.leer && !taste(s)));
  });

  /* `tf`: wie die Pruefung heisst, wenn sie scheitert. Der Titel ist als
     Aussage formuliert („Quelle hat einen Wert"); im Dialog steht ein ✕
     davor, in der Ampel und am Zeichen der Zeile aber nicht - dort las
     sich „Quelle hat einen Wert: PRESS" wie das Gegenteil dessen, was
     gemeint ist (Ricardo, 26.11.2026). */
  var items = [
    { s: ohneQuelle.length ? 'bad' : 'ok', t: tr('check.sourceExists'), tf: tr('check.sourceExistsFails'),
      d: ohneQuelle.length ? ohneQuelle.map(function (x) { return x.n; }).join(', ') : tr('check.checked', an.length),
      zeilen: ohneQuelle.map(function (x) { return x.n; }) },
    ohneWert.length
      ? { s: 'bad', t: tr('check.sourceHasValue'), tf: tr('check.sourceHasValueFails'),
          d: ohneWert.map(function (x) { return x.n; }).join(', '),
          zeilen: ohneWert.map(function (x) { return x.n; }) }
      /* Tasten ohne Wert: ein Hinweis, kein Fehler - gesagt werden soll
         es trotzdem (Ricardo, 26.11.2026: „der Hinweis sollte schon
         bleiben"). */
      : (tastenOhneWert.length
        ? { s: 'warn', t: tr('check.sourceHasValue'), tf: tr('check.buttonNoValue'),
            d: tr('check.buttonNoValueWhy', tastenOhneWert.map(function (x) { return x.n; }).join(', ')),
            zeilen: tastenOhneWert.map(function (x) { return x.n; }) }
        : { s: 'ok', t: tr('check.sourceHasValue'), d: tr('check.allDeliver'), zeilen: [] }),
    { s: formelKaputt.length ? 'bad' : 'ok', t: tr('check.formulaYields'), tf: tr('check.formulaYieldsFails'),
      d: formelKaputt.length ? formelKaputt.map(function (x) { return x.n; }).join(', ') : tr('check.allFine'),
      zeilen: formelKaputt.map(function (x) { return x.n; }) },
    { s: haupt && !pflichtFehlt.length ? 'ok' : 'bad', t: tr('check.rolesMakeDevice'), tf: tr('check.rolesMakeDeviceFails'),
      d: haupt ? (pflichtFehlt.length
            ? tr('pattern.missing', pflichtFehlt.map(function (x) { return x.name; }).join(', '))
            : haupt.type) : tr('check.noPatternFits') },
    pruefungSenden(e),
    pruefungRueckmeldung(e),
    pruefungZielKann(e),
    pruefungDopplung(e)
  ];
  var nachTitel = {};
  nachTitel[tr('check.publish')] = tr('check.publishFails');
  nachTitel[tr('check.feedback')] = tr('check.feedbackFails');
  nachTitel[tr('check.targetCan')] = tr('check.targetCanFails');
  nachTitel[tr('check.duplicate')] = tr('check.duplicateFails');
  items.forEach(function (c) { if (!c.tf && nachTitel[c.t]) { c.tf = nachTitel[c.t]; } });
  return items;
}

/* Welche Zeile ist von welcher Pruefung betroffen?

   Die Pruefungen nannten die Zeilen nur im Text des Dialogs - an der
   Zeile selbst sah man nichts, man musste sie suchen (Ricardo,
   25.11.2026). Jetzt traegt jede Pruefung, die einzelne Zeilen meint,
   deren Namen in `zeilen`; die Zustandsliste setzt daraus ein Zeichen
   vor den Namen. Nur `bad` und `warn` - ein „unbekannt" ist kein
   Befund. → { ZEILENNAME: [ { s, text } ] } */
export function zeilenBefunde(items) {
  var raus = {};
  (items || []).forEach(function (c) {
    if ((c.s !== 'bad' && c.s !== 'warn') || !c.zeilen) { return; }
    c.zeilen.forEach(function (n) {
      var text = (c.tf || c.t) + ': ' + ((c.texte && c.texte[n]) || c.d);
      (raus[n] = raus[n] || []).push({ s: c.s, text: text });
    });
  });
  return raus;
}

export function baueChecks(e, haupt, pflichtFehlt) {
  var items = pruefErgebnisse(e, haupt, pflichtFehlt);

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
