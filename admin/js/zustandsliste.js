/* Die Zustandsliste: erst die Rechnung, welcher Punkt auf welchem
   Platz des Musters sitzt (samt Vorbelegung der Haken), dann die Karte
   mit Filterleiste, Ratleiste, den Zeilen selbst, den freien Plaetzen
   des Musters und dem Zufuegen von Hand.

   Herausgeloest aus zeichneErgebnis. `rateKnopf` und `musterBlock`
   werden oben bei der Musterwahl gebaut und hier nur eingehaengt. */

import { S } from './zustand.js';
import { el } from './basis.js';
import { tr } from './sprache.js';
import { erkenneEntwurf, musterVon, rolleVonPlatz } from './erkennung.js';
import { kindZustaende, wertVon, fmt } from './werte.js';
import { steuerKanaele, vorlagenAbweichung, bestandsAbweichung, waehle, quelleVon } from './entwurf.js';
import { musterName } from './musternamen.js';
import { detailZeile } from './detail.js';
import { rateAnzahl, rateZurueck, rateZurueckEine, rateBehalten } from './vorschlagen.js';
import { mqttEinzeln } from './mqtt.js';
import { zeichneErgebnis, entwurfAngefasst } from './ergebnis.js';

export function berechnePlaetze(e, haupt) {
  /* --- welcher Punkt sitzt auf welchem Platz --- */
  var platzVon = {};
  if (haupt) {
    haupt.states.forEach(function (x) {
      if (x.id) { platzVon[x.id.slice(S.current.length + 1)] = x.name; }
    });
  }
  /* Manche Muster haben einen Platz, der beliebig viele Punkte
     aufnimmt — im info-Muster heisst jeder Punkt ACTUAL. Diesen Namen
     an jede Zeile zu schreiben sagt nichts, es sieht nur aus wie ein
     Uebersetzungsloch. Also nur zeigen, wenn er wirklich einen
     bestimmten Punkt bezeichnet. */
  var platzAnzahl = {};
  Object.keys(platzVon).forEach(function (n) {
    platzAnzahl[platzVon[n]] = (platzAnzahl[platzVon[n]] || 0) + 1;
  });
  var infoFund = erkenneEntwurf(e, 'info');
  var imInfo = {};
  if (infoFund.length && haupt && haupt.type !== 'info') {
    infoFund[0].states.forEach(function (x) {
      if (x.id) {
        var kurz = x.id.slice(S.current.length + 1);
        if (!platzVon[kurz]) { imInfo[kurz] = true; }
      }
    });
  }

  /* Mehrere Kanaele, die fuer sich ein Geraet ergeben? Einmal rechnen,
     am Entwurf merken — der Hinweis in der Karte und die Knoepfe unten
     lesen dasselbe Ergebnis. */
  if (e.kanalGeraete === undefined) {
    e.kanalGeraete = (!(e.instanzen && e.instanzen.length > 1) && S.current.indexOf('alias.') !== 0)
      ? steuerKanaele(S.current) : [];
  }

  /* Welche Punkte aus den gemeinsamen Kanaelen haben hier, auf der
     Geraeteebene, einen Platz gefunden? Diese Liste bekommen die
     Kanal-Entwuerfe mit — dort erkennt der Detektor sie nicht. */
  if (e.kanalGeraete && e.kanalGeraete.length > 1) {
    var eigenerKanal = {};
    e.kanalGeraete.forEach(function (k) { eigenerKanal[k.id] = 1; });
    e.gemeinsamMitPlatz = {};
    e.states.forEach(function (st) {
      if (!st.srcR || !platzVon[st.n]) { return; }
      var elt = st.srcR.slice(0, st.srcR.lastIndexOf('.'));
      if (elt.indexOf(S.current + '.') === 0 && !eigenerKanal[elt]) {
        e.gemeinsamMitPlatz[st.srcR] = platzVon[st.n];
      }
    });
  }

  /* Vorbelegung eines Rohentwurfs: angehakt ist, was im erkannten Muster
     einen Platz findet.

     Vorher war alles an. Bei einer Tasmota mit acht Punkten ging das
     durch; ein Homematic-Fensterkontakt bringt 26 mit, ein Thermostat
     42, und die meisten davon sind Alarmspiegel und Wartungsinnereien,
     die in keinem Muster vorkommen. Wer die alle in einen Alias schreibt,
     hat das Geraet nicht abgebildet, sondern abgeschrieben.

     Drei Faelle bleiben ausgenommen:
     - **Ein bestehender Alias.** Dort ist jeder Haken eine Entscheidung,
       die schon getroffen wurde; abwaehlen hiesse loeschen.
     - **Eine Vorlage.** Die bestimmt selbst, was an ist (`vorgabeAus`).
     - **Kein einziger Punkt mit Platz.** Dann bliebe die Liste leer, und
       eine leere Liste hilft niemandem.

     Einmalig, gemerkt in `vorbelegt` — sonst wuerde jedes Neuzeichnen
     zurueckstellen, was der Nutzer gerade dazugewaehlt hat. Die drei
     Knoepfe darueber bleiben, „alle" ist einen Klick entfernt. */
  /* Steht der Alias schon da, ist er die Antwort - nicht der Vorschlag.

     Die Vorbelegung hakt an, was im erkannten Muster einen Platz
     findet. Das ist richtig fuer einen Alias, den es noch nicht gibt.
     Gibt es ihn, hat `uebernehmeBestand` gerade angehakt, was drinsteht
     - und die Vorbelegung machte es sofort wieder zunichte: die neun
     uebernommenen Zeilen hatten im thermostat-Muster keinen Platz und
     wurden abgewaehlt, uebrig blieben zwei. */
  var bestandDa = !!(e.ziel && kindZustaende(e.ziel).length > 0);


  if (!e.vorbelegt && !e.vorlage && S.current.indexOf('alias.') !== 0) {
    e.vorbelegt = true;
    if (bestandDa) {
      /* Angehakt ist, was im Alias steht - nicht mehr und nicht weniger.

         Die Vorbelegung ganz zu ueberspringen war zu grob: der
         Rohentwurf startet mit allem an, und dann standen bei der
         Klimaanlage 49 Zeilen angehakt statt neun. Schlimmer noch, der
         Detektor gab den ACTUAL-Platz danach an `status_outdoorTemperature`
         - die Aussentemperatur, weil sie dieselbe Rolle traegt und
         frueher in der Liste steht. Wer nur das Erwartete anhakt,
         bekommt auch nur das Erwartete erkannt. */
      e.states.forEach(function (s) { s.on = !!s.ausBestand; });
    } else if (e.states.some(function (s) { return !!platzVon[s.n]; })) {
      e.states.forEach(function (s) { s.on = !!platzVon[s.n]; });
    }
    /* „Als ein Geraet" muss halten, was es sagt: alles, was dieses Geraet
       schaltet, gehoert hinein. Das Muster hat aber nur einen Platz dafuer
       — bei einem Zweifach-Aktor bekaeme ihn Kanal 2, und Kanal 1 fiele
       stillschweigend weg. Ein Alias, dem heimlich ein Licht fehlt, ist
       schlimmer als einer mit einem Punkt zu viel. Also kommen die
       Pflichtpunkte der anderen Kanaele mit dazu; dass sie keinen Platz
       finden, steht als Hinweis darueber. */
    (e.kanalGeraete || []).forEach(function (k) {
      (k.pflicht || []).forEach(function (pid) {
        var kurz = pid.slice(S.current.length + 1).replace(/\./g, '_');
        e.states.forEach(function (st) { if (st.n === kurz) { st.on = true; } });
      });
    });
  }

  return { platzVon: platzVon, platzAnzahl: platzAnzahl, imInfo: imInfo };
}

export function baueListe(host, e, pl, rateKnopf, musterBlock) {
  /* Woher liest dieser Alias ueberwiegend?

     Nur dazu, um die Ausreisser zu erkennen: Zeilen, die aus einem
     anderen Zweig lesen als der Rest. An `alias.0.Solar.Netz` sind das
     die zwei mqtt-Zeilen unter drei aus `0_userdata` - bisher sah man
     das erst beim Aufklappen (Ricardo, 08.09.2026).

     Bezugspunkt ist immer die HAUPTQUELLE DES ALIAS, nicht der Knoten,
     an dem man gerade steht. Sonst saehe dieselbe Zeile je nach
     Blickwinkel anders aus: an `…Stromzaehler.stat` waeren die drei
     userdata-Zeilen markiert, am Alias die zwei mqtt-Zeilen. Und an
     einer Sparte (`…Licht.stat`) haetten alle Zeilen aus `…Licht.tele`
     eine Marke bekommen, obwohl es dasselbe Geraet ist.

     Verglichen wird ueber den Praefix, nicht auf Gleichheit: bei
     Homematic liegen die Punkte in Kanaelen unter dem Geraet, bei
     Tasmota in Sparten. */
  var aliasFuerMarke = (S.current.indexOf('alias.') === 0)
    ? S.current
    : (e.ziel && kindZustaende(e.ziel).length ? e.ziel : '');
  var hauptQuelle = aliasFuerMarke ? (quelleVon(aliasFuerMarke) || '') : (e.kanal || '');

  var platzVon = pl.platzVon, platzAnzahl = pl.platzAnzahl;

  /* --- Gerätekarte ---

     Hier stand ein Streifen mit Schaltbild, Geraetenamen und bis zu drei
     Messwerten. Er sagte nichts, was nicht schon dastand: der Name steht
     als Ueberschrift darueber, die Messwerte stehen in der Liste
     darunter mit Rolle und Einheit. Zwei Zeilen Hoehe fuer eine
     Wiederholung - weg damit, in beiden Ansichten. */
  var card = el('div', 'card');

  /* Ein Satz dazu, warum unten zwei Knoepfe stehen. Ohne ihn klickt man
     auf eine Zahl und weiss nicht, was sie bedeutet. */
  if (e.kanalGeraete && e.kanalGeraete.length > 1) {
    var hk = el('div', 'aside');
    hk.style.margin = '0 0 9px';
    hk.textContent = tr('result.channelsHint', e.kanalGeraete.length);
    card.appendChild(hk);

    /* Wie viele angehakte Punkte sind Schalter, fuer die das Muster
       keinen Platz hat? Genau die, die eben dazugekommen sind. */
    var ohnePlatz = 0;
    e.kanalGeraete.forEach(function (k) {
      (k.pflicht || []).forEach(function (pid) {
        var kurz = pid.slice(S.current.length + 1).replace(/\./g, '_');
        e.states.forEach(function (st) {
          if (st.n === kurz && st.on && !platzVon[st.n]) { ohnePlatz++; }
        });
      });
    });
    if (ohnePlatz) {
      var hw = el('div', 'aside w');
      hw.style.margin = '0 0 9px';
      hw.textContent = tr('result.extraSwitches', ohnePlatz, e.want || '?');
      card.appendChild(hw);
    }
  }

  /* --- Werkzeugleiste ---

     Hier sitzt auch die Musterwahl. Sie stand vorher oben rechts im
     Kopf, weit weg von der Liste, deren Inhalt sie bestimmt: welches
     Muster gilt, entscheidet, welcher Punkt einen Platz hat und welcher
     ins info-Geraet wandert. Jetzt steht sie direkt ueber dieser Liste,
     in derselben Zeile wie die Filter. */
  /* Angehaktes nach oben - einmal, beim ersten Aufbau.

     Wer links einen Knoten anklickt, will sehen, was daraus entsteht.
     Bei einem Fensterkontakt sind das vier Punkte von 26, bei der
     Klimaanlage neun von 55 - und die standen bisher ueber die ganze
     Liste verstreut, weil sortiert wird, wie das Geraet seine Punkte
     fuehrt.

     Einmal und nicht bei jedem Haken: eine Liste, die unter der Hand
     umspringt, sobald man etwas abwaehlt, ist schlimmer als eine
     unsortierte. Die Marke sitzt am Entwurf, und der Entwurf wird bei
     jeder neuen Auswahl neu gebaut - beim naechsten Anklicken steht
     also wieder das Angehakte oben.

     Stabil innerhalb der beiden Gruppen: die Reihenfolge der
     angehakten Punkte bleibt, wie sie war. Das ist nicht nur
     Ordnungsliebe - `abbild` nimmt nur angehakte Zeilen, und welcher
     von zwei gleich passenden Punkten einen Platz bekommt, entscheidet
     der Detektor nach der Reihenfolge. Wuerde die sich verschieben,
     verschoebe sich auch die Erkennung. */
  if (!e.sortiert) {
    e.sortiert = true;
    var an0 = [], aus0 = [];
    e.states.forEach(function (s) { (s.on ? an0 : aus0).push(s); });
    e.states = an0.concat(aus0);
  }

  var bar = el('div', 'listbar');
  /* Wird beim Zeichnen der Zeilen weiter unten hochgezaehlt; die Legende
     dazu haengt sich erst danach in die Leiste, weil vorher niemand
     weiss, ob es ueberhaupt eine braucht. */
  var ohnePlatzZahl = 0;
  var an = e.states.filter(function (s) { return s.on; }).length;
  bar.appendChild(document.createTextNode(tr('list.willBeCreated')));
  bar.appendChild(el('span', 'cnt', tr('list.countOf', an, e.states.length)));
  bar.appendChild(document.createTextNode(tr('list.ofDatapoints')));
  bar.appendChild(el('span', 'sp2'));
  /* Mittig zwischen der Zahl und den drei Filtern - zwischen zwei
     Dehnfugen steht er von selbst in der Mitte. */
  if (rateKnopf) { bar.appendChild(rateKnopf); rateKnopf = null; }
  bar.appendChild(el('span', 'sp2'));
  /* Die vier Auswahlknoepfe nur an einer Quelle. Am fertigen Alias sind
     sie keine Auswahl, sondern ein Loeschwerkzeug: ein Haken weg heisst
     dort, dass der Punkt beim Aktualisieren verschwindet - „nur was ins
     Muster passt" wuerde einen Punkt ohne Platz sofort abwaehlen
     (Ricardo, 25.08.2026). Und „Standard"/„alle" haben am Alias nichts,
     worauf sie sich beziehen koennten. */
  var amAlias = S.current && S.current.indexOf('alias.') === 0;
  /* Die Auswahlknoepfe stehen in einer eigenen zweiten Zeile. In derselben
     Zeile wie Zaehler und Musterwahl brachen sie je nach Fensterbreite
     unterschiedlich um, und die Leiste sprang bei jedem Neuzeichnen anders
     (Ricardo, 26.08.2026). „Freie Plaetze vorschlagen" bleibt oben - er
     gehoert zur Erkennung, nicht zur Auswahl. */
  var chipzeile = el('div', 'chipzeile');
  (amAlias ? [] :
  [[tr('list.tpl'), function () {
      /* Die Haken, die die Vorlage vorgibt. Gibt es keinen Vorlagenwert
         (kein bestehender Alias), ist der Oeffnungszustand die Vorgabe -
         der stammt dann ja aus der Vorlage. */
      e.states.forEach(function (s) {
        s.on = s.vorlagenWert ? !!s.vorlagenWert.on : !!s.onVorgabe;
      });
   }, tr('list.tplHint')],
   [tr('list.all'), function () { e.states.forEach(function (s) { s.on = true; }); }],
   [tr('list.onlyWithValue'), function () { e.states.forEach(function (s) { s.on = wertVon(s).ok; }); }],
   [tr('list.onlyPattern'), function () {
      /* Frueher hiess der Chip „nur was ins Geraet gehoert“ und behielt
         bloss die aktuellen Platzhalter — als einziger der Reihe hatte
         er damit ein Gedaechtnis: nach „alle“ lieferte er mehr als
         direkt nach dem Oeffnen (Ricardo, 25.08.2026). Jetzt treten
         alle Zeilen zur Platzvergabe an, unabhaengig vom Haken, und
         angehakt wird genau, wer einen Platz bekommt. */
      var kopie = JSON.parse(JSON.stringify({ kanal: e.kanal, states: e.states }));
      kopie.states.forEach(function (s) { s.on = true; });
      var f = erkenneEntwurf(kopie, e.want);
      var drin = {};
      if (f.length) {
        f[0].states.forEach(function (x) {
          if (x.id) { drin[x.id.slice(e.kanal.length + 1)] = true; }
        });
      }
      e.states.forEach(function (s) { s.on = !!drin[s.n]; });
   }, tr('list.onlyPatternHint')]]).forEach(function (pr) {
    var b = el('button', null, pr[0]);
    if (pr[2]) { b.title = pr[2]; }
    b.addEventListener('click', function () {
      pr[1](); entwurfAngefasst(); S.openRow = null; zeichneErgebnis();
    });
    chipzeile.appendChild(b);
  });

  /* Alles verwerfen und den Stand aus dem System neu holen. Steht nur da,
     wenn es etwas zu verwerfen gibt - ein Knopf, der nichts tut, gehoert
     nicht in die Leiste (Ricardo, 26.08.2026). Abgesetzt, weil er als
     einziger nicht nur Haken setzt. */
  if (e.angefasst) {
    var bZurueck = el('button', 'weit', tr('list.reset'));
    bZurueck.title = tr('list.resetHint');
    bZurueck.addEventListener('click', function () {
      var id = S.current;
      S.entwurf = null;
      S.openRow = null;
      waehle(id);
    });
    chipzeile.appendChild(bZurueck);
  }
  if (chipzeile.childNodes.length) { bar.appendChild(chipzeile); }
  if (musterBlock) {
    var mspacer = el('span', 'sp2');
    bar.appendChild(mspacer);
    musterBlock.classList.add('inbar');
    bar.appendChild(musterBlock);
    musterBlock = null;
  }
  card.appendChild(bar);

  /* Was geraten wurde, sagt es selbst - mit dem Schnellweg daneben, falls
     alles stimmt. Sonst muesste man bei acht Plaetzen achtmal haken. */
  if (rateAnzahl(e)) {
    var rl = el('div', 'ratleiste');
    rl.appendChild(el('span', 'zq', tr('guess.bar', rateAnzahl(e))));
    var bAlle = el('button', 'btn mini wichtig', tr('guess.keepAll'));
    bAlle.addEventListener('click', function () {
      e.states.forEach(rateBehalten);
      entwurfAngefasst(); zeichneErgebnis();
    });
    rl.appendChild(bAlle);
    var bWeg = el('button', 'btn mini', tr('guess.undo'));
    bWeg.addEventListener('click', function () {
      rateZurueck(e); entwurfAngefasst(); S.openRow = null; zeichneErgebnis();
    });
    rl.appendChild(bWeg);
    card.appendChild(rl);
  }
  if (e.rateMeldung) {
    var rm = el('div', 'aside');
    rm.style.margin = '8px 15px';
    rm.textContent = e.rateMeldung;
    card.appendChild(rm);
  }

  var cap = el('div', 'lhead');
  [tr('list.colOn'), '', tr('list.colState'), tr('list.colRole'), tr('list.colValue'), ''].forEach(function (t, i) {
    cap.appendChild(el('span', i === 4 ? 'r' : null, t));
  });
  card.appendChild(cap);

  /* --- Zustandsliste --- */
  e.states.forEach(function (s, i) {
    var pl = platzVon[s.n];
    var unfertig = (!s.n || !s.srcR);
    /* Angehakt, vollstaendig, aber ohne Platz im Muster. Frueher stand
       dazu in JEDER betroffenen Zeile derselbe Satz — bei einem
       Thermostat mit 42 Punkten zwanzigmal dasselbe, und die Spalte
       wurde so breit, dass Rolle und Wert wegrutschten (Ricardo,
       06.09.2026). Jetzt traegt die Zeile eine Marke, der Satz steht
       einmal als Legende ueber der Liste, und der lange Text haengt als
       Hinweis an der Zeile. */
    var ohnePlatz = (s.on && !unfertig && !pl);
    if (ohnePlatz) { ohnePlatzZahl++; }
    var row = el('div', 'erow' + (s.on ? '' : ' skip') + (S.openRow === i ? ' open' : '') +
                 (ohnePlatz ? ' ohneplatz' : ''));
    row.tabIndex = 0;
    if (ohnePlatz) { row.title = tr('pattern.noPlaceLong', musterName(e.want) || e.want || '?'); }

    var cbw = el('span');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = s.on;
    cb.setAttribute('aria-label', s.n + ' anlegen');
    cb.addEventListener('click', function (ev) { ev.stopPropagation(); });
    cb.addEventListener('change', function () {
      s.on = cb.checked; entwurfAngefasst(); zeichneErgebnis();
    });
    cbw.appendChild(cb);
    row.appendChild(cbw);

    /* Nur noch bei einem Problem ein Zeichen. Vorher stand hier ein
       Haken, sobald der Punkt angehakt war und einen Platz im Muster
       hatte — das las sich wie eine Wiederholung des Kaestchens
       daneben, und den Platz nennt die Zeile ohnehin im Klartext
       („ACTUAL" hinter dem Namen). Uebrig bleibt, was man beim
       Ueberfliegen wirklich sucht: wo klemmt es. */
    var mk = el('span', 'mk2 bad');
    mk.textContent = (s.on && unfertig) ? '!' : '';
    if (mk.textContent) { mk.title = !s.n ? tr('list.nameMissing') : tr('list.sourceMissing'); }
    row.appendChild(mk);

    var n3 = el('span', 'nm3', s.n || tr('list.newPoint'));
    /* Die Beschriftung (kuenftiger Anzeigename) steht gedaempft hinter
       der Kennung - wie die Namen im Baum. Vorher tippte man sie im
       Detail und sah nirgends eine Wirkung. */
    if (s.caption && s.caption !== s.n) { n3.appendChild(el('span', 'nam', s.caption)); }
    if (s.manuell) { n3.appendChild(el('span', 'hand', tr('list.byHand'))); }
    if (s.geaendert) { n3.appendChild(el('span', 'geae', tr('list.changed'))); }
    /* Was die Vorlage anders will, steht an der Zeile - sonst sieht man
       es erst im Trockenlauf (Ricardo, 25.08.2026).

       Nicht mehr an `!s.geaendert` gebunden: Seit man ein einzelnes Feld
       aus der Vorlage uebernehmen kann, ist die Zeile danach „geaendert"
       — und haette die Marke daran gehangen, waeren die uebrigen
       Abweichungen in dem Moment unsichtbar geworden. Massgeblich ist,
       ob wirklich noch etwas abweicht. Eine Zeile kann beides tragen:
       „geaendert" und „weicht von der Vorlage ab" (06.09.2026). */
    if (s.on) {
      var abw = vorlagenAbweichung(s);
      if (abw.length) {
        /* Nur, DASS etwas abweicht — nicht was.

           Die Marke nannte frueher den Wert der ersten Abweichung
           („Vorlage: indicator.lowbat"). Bei mehreren Feldern log sie
           damit: sie zeigte eines und verschwieg die anderen, und lang
           war sie obendrein. Welches Feld es betrifft, sieht man
           aufgeklappt an der Markierung; der Tooltip hier zaehlt alle
           auf (Ricardo, 06.09.2026). */
        var av = el('span', 'geae tplabw', tr('list.tplDiffers'));
        av.title = abw.map(function (x) {
          return x.feld + ': ' + (x.jetzt || '—') + '  →  ' + (x.vorlage || '—');
        }).join(String.fromCharCode(10));
        n3.appendChild(av);
      }
      /* Und dieselbe Auskunft gegen den gespeicherten Alias.

         Wer das Muster oder die Vorlage wechselt, bekommt die Rollen
         angepasst — das ist gewollt (`switch.light` passt auf kein
         socket-SET). Nur sah man an der Zeile nicht, dass damit etwas
         anderes geschrieben wuerde als bisher dasteht; sichtbar war es
         allein an den Chips oben und im Trockenlauf. Drei Aussagen, drei
         Marken, jede mit eigener Bedeutung: „geaendert" heisst, der
         Nutzer war es; „weicht von der Vorlage ab" vergleicht mit der
         Vorlage; diese hier mit der Datenbank (Ricardo, 06.09.2026). */
      var bAbw = bestandsAbweichung(s, e.ziel);
      if (bAbw.length) {
        var bv = el('span', 'geae bstabw', tr('list.aliasDiffers'));
        bv.title = bAbw.map(function (x) {
          return x.feld + ': ' + (x.bestand || '—') + '  →  ' + (x.jetzt || '—');
        }).join(String.fromCharCode(10));
        n3.appendChild(bv);
      }
    }
    /* Die Marke ist zugleich der Griff: solange sie steht, ist die Zeile
       unbestaetigt und faellt beim Zuruecknehmen. Ein Haken laesst sie
       verschwinden, ein Kreuz nimmt genau diese eine zurueck. */
    /* Der Punkt liest woanders her als der Rest.

       Bewusst eine Marke und keine Flaechentoenung: die Flaeche ist
       schon vergeben („kein Platz im Muster"), und beides gilt
       unabhaengig voneinander - eine Zeile kann getoent und fremd sein.
       Die Marke traegt nur den Adapter, nicht die ganze Kennung; die
       volle steht im Hinweis. Und sie ist ruhig gehalten: sie meldet
       keinen Fehler, sie sagt, woher der Wert kommt. */
    if (hauptQuelle && s.on && s.srcR &&
        s.srcR.indexOf(hauptQuelle + '.') !== 0 && s.srcR !== hauptQuelle) {
      var kurzQ = s.srcR.split('.').slice(0, 2).join('.');
      var fq = el('span', 'geae fremdquelle', tr('list.otherSource', kurzQ));
      fq.title = tr('list.otherSourceHint', hauptQuelle, s.srcR);
      n3.appendChild(fq);
    }
    if (s.geraten) {
      n3.appendChild(el('span', 'rat', tr('guess.mark')));
      var jaK = el('span', 'ratknopf', '\u2713');
      jaK.title = tr('guess.keep');
      jaK.addEventListener('click', function (ev) {
        ev.stopPropagation(); rateBehalten(s);
        entwurfAngefasst(); zeichneErgebnis();
      });
      n3.appendChild(jaK);
      var neinK = el('span', 'ratknopf', '\u2715');
      neinK.title = tr('guess.drop');
      neinK.addEventListener('click', function (ev) {
        ev.stopPropagation(); rateZurueckEine(e, s);
        entwurfAngefasst(); S.openRow = null; zeichneErgebnis();
      });
      n3.appendChild(neinK);
    }
    /* Das Geraet kann den Befehl, der Punkt fehlt noch. Die Handlung
       gehoert dorthin, wo das Problem sichtbar wird — nicht nur in die
       MQTT-Karte weiter oben. */
    /* Frisch nachgeschaut statt gemerkt — siehe wendeAn. */
    if (s.on && s.srcW && !S.objects[s.srcW]) {
      var fw = el('span', 'fehltnoch', tr('list.sendPointMissing'));
      fw.title = s.srcW;
      n3.appendChild(fw);
      var fb2 = el('button', 'btn schmal');
      fb2.textContent = tr('mq.rowCreate');
      fb2.style.marginLeft = '7px';
      fb2.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var teile = s.srcW.split('.cmnd.');
        if (teile.length === 2) { mqttEinzeln(teile[0], teile[1], 'neu', fb2); }
      });
      n3.appendChild(fb2);
    }
    if (s.on) {
      if (unfertig) { n3.appendChild(el('em', null, !s.n ? tr('list.nameMissing') : tr('list.sourceMissing'))); }
      else if (pl && pl !== s.n && platzAnzahl[pl] === 1) {
        var pe = el('em', null, pl);
        pe.title = tr('pattern.slotName', pl, musterName(e.want) || e.want || '?');
        n3.appendChild(pe);
      }
      /* Kein Vermerk mehr je Zeile: die Marke an der Zeile und die
         Legende ueber der Liste sagen dasselbe, einmal statt zwanzigmal.
         Dass es ueberhaupt gesagt wird, bleibt wichtig — frueher blieben
         solche Zeilen stumm, und oben stand „3/7 belegt“ bei vier Haken
         ohne jede Erklaerung (Ricardo, 25.08.2026). */
    }
    row.appendChild(n3);

    var warn = (s.n === 'ACTUAL' && s.on && !pl);
    row.appendChild(el('span', 'ro2' + (warn ? ' warnrole' : ''), s.role || tr('list.noRole')));
    row.appendChild(el('span', 'vl2', fmt(s)));
    row.appendChild(el('span', 'ca2', S.openRow === i ? '▾' : '▸'));

    var um = function () { S.openRow = (S.openRow === i ? null : i); zeichneErgebnis(); };
    row.addEventListener('click', um);
    row.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); um(); }
    });
    card.appendChild(row);

    if (S.openRow === i) { card.appendChild(detailZeile(e, s, i)); }
  });

  /* --- Freie Plaetze des gewaehlten Musters --- */
  var belegteSlots = {};
  Object.keys(platzVon).forEach(function (n) { belegteSlots[platzVon[n]] = 1; });
  var muster = e.want && musterVon(e.want);
  var freie = muster ? muster.states.filter(function (st) {
    return !belegteSlots[st.name] && !st.multiple;
  }) : [];

  if (freie.length) {
    var fk = el('div', 'freikopf');
    fk.appendChild(el('span', null, tr('pattern.freeSlots', musterName(e.want) || e.want)));
    fk.appendChild(el('span', 'cnt2', tr('list.countOf', freie.length, muster.states.length)));
    card.appendChild(fk);

    freie.forEach(function (st) {
      var fr = el('div', 'freirow' + (st.required ? ' pflicht' : ''));
      fr.tabIndex = 0;
      fr.setAttribute('role', 'button');
      fr.appendChild(el('span', 'mk3', st.required ? '✕' : '+'));
      fr.appendChild(el('span', 'sn2', st.name));
      fr.appendChild(el('span', 'rl2', rolleVonPlatz(st) || String(st.role || '')));
      fr.appendChild(el('span', 'rx2', st.required ? tr('pattern.required') : String(st.role || '')));

      var nimm = function () {
        e.states.push({
          n: st.name,
          on: true,
          role: rolleVonPlatz(st),
          /* Manche Plaetze lassen mehrere Typen zu und nennen sie als
             Liste — light.EFFECT etwa [number, string]. Ungefiltert
             landete die Liste in common.type, der Detektor lehnte den
             Punkt ab, der Platz blieb frei und liess sich endlos
             nochmal hinzufuegen. Der erste Eintrag ist der gemeinte. */
          typ: (Array.isArray(st.type) ? st.type[0] : st.type) || '',
          unit: st.defaultUnit || '',
          /* statesDefined heisst: ohne Werteliste bleibt der Platz leer,
             egal wie gut Rolle und Typ passen. Also die Vorgabe aus dem
             Muster mitnehmen, sonst legt man den Punkt an und der Platz
             gilt weiter als frei — beliebig oft. */
          states: st.statesDefined ? (st.defaultStates || { 0: 'None' }) : undefined,
          wr: !!st.write,
          srcR: '', srcW: '', f: '', fw: '',
          caption: '', manuell: true, ausPlatz: st.name
        });
        S.openRow = e.states.length - 1;
        entwurfAngefasst();
        zeichneErgebnis();
      };
      fr.addEventListener('click', nimm);
      fr.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); nimm(); }
      });
      card.appendChild(fr);
    });
  }

  var add = el('button', 'addrow');
  add.appendChild(el('span', null, '+'));
  add.appendChild(el('span', null, tr('list.addByHand')));
  add.addEventListener('click', function () {
    e.states.push({ n: '', on: true, role: 'value', typ: 'number', unit: '', wr: false,
                    srcR: '', srcW: '', f: '', fw: '', caption: '', manuell: true, geaendert: true });
    S.openRow = e.states.length - 1;
    entwurfAngefasst();
    zeichneErgebnis();
  });
  card.appendChild(add);

  /* Die Legende zum Streifen — einmal, und nur wenn es etwas zu erklaeren
     gibt. Sie steht in der Leiste ueber der Liste, gleich neben der Zahl:
     dort sucht man die Erklaerung fuer „11 von 42", nicht am Fuss. */
  if (ohnePlatzZahl) {
    var lg = el('span', 'legende');
    lg.appendChild(el('span', 'lgmarke'));
    lg.appendChild(document.createTextNode(
      tr('pattern.noPlaceIn', musterName(e.want) || e.want || '?')));
    lg.title = tr('pattern.noPlaceLong', musterName(e.want) || e.want || '?');
    bar.insertBefore(lg, bar.querySelector('.sp2'));
  }

  host.appendChild(card);
}
