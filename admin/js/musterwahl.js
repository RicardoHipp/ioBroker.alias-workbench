/* Die Musterwahl: das Suchfeld mit eigener Liste, die Bewertung je
   Muster (passt / n von m belegt) und der Knopf, der freie Plaetze
   vorschlaegt. Gebaut wird beides hier, eingehaengt woanders: der Block
   je nach Ansicht im Vorlagenkasten oder in der Leiste ueber der Liste,
   der Knopf immer in der Leiste.

   Herausgeloest aus zeichneErgebnis - der Abschnitt hing an `e`, dem
   Erkennungsergebnis und sonst an nichts. */

import { S } from './zustand.js';
import { D, el, $ } from './basis.js';
import { tr, sprachtext } from './sprache.js';
import { VORSCHAU, musterVon, erkenneEntwurf, platzFuerRolle, typenFuerRolle, typKonflikte } from './erkennung.js';
import { anMusterAnpassen } from './vorlagen.js';
import { ratePlaetze, rateAnzahl } from './vorschlagen.js';
import { zeichneErgebnis, entwurfAngefasst, knopfFrisch } from './ergebnis.js';
import { musterName, musterZeile } from './musternamen.js';

export function baueMusterwahl(e, haupt, pflichtFehlt) {
  var vw = el('div', 'verdictwrap' + (haupt && !pflichtFehlt.length ? '' : ' bad'));
  var vlbl = el('span', 'feldlabel', tr('pattern.label'));
  vw.appendChild(vlbl);
  /* Musterwahl als Eingabefeld mit eigener Liste statt als <select>.
     Ein <select> laesst sich nicht durchsuchen, und die 51 Muster
     brauchten deshalb einen Knopf daneben, der die Liste umschaltet.
     Jetzt ist beides im Feld: tippen sucht ueber alle Muster, und die
     letzte Zeile schaltet zwischen den ueblichen und allen um. Kein
     <datalist> - dessen Fenster malt das Betriebssystem, und in
     eingebetteten Ansichten landet es neben dem Fenster. */
  var mwrap = el('div', 'feldwrap');
  var sel = el('input', 'tx musterwahl');
  sel.type = 'text';
  sel.setAttribute('autocomplete', 'off');
  sel.placeholder = tr('pattern.search');
  mwrap.appendChild(sel);
  /* Kein eigenes Pfeilzeichen mehr: das Feld traegt denselben
     SVG-Pfeil wie jedes Auswahlfeld (werkbank.css). Das Zeichen ▾
     ist in der Schrift ein bewusst kleines Dreieck und fiel neben den
     Selects sichtbar ab. */
  var mlist = el('div', 'vorschlaege musterliste');
  mlist.hidden = true;
  mwrap.appendChild(mlist);
  vw.appendChild(mwrap);

  /* Der Knopf, der die freien Plaetze belegt.

     Ein Knopf und nicht der Musterwechsel als Ausloeser: sonst haette
     ausgerechnet ein erkanntes Geraet keinen. Ricardos Klimaanlage wird
     als `thermostat` erkannt, man wechselt also gar nichts, und ohne
     Knopf bliebe es dabei.

     Er wird hier gebaut, weil er zum Muster gehoert - haengt aber unten
     in der Leiste ueber der Zustandsliste. Neben dem Musterfeld stand er
     am Rand; die Liste, die er veraendert, faengt darunter an. */
  /* Der Trockenlauf, der beides beantwortet: ob der Knopf etwas
     anzubieten haette, und - wenn nicht - warum nicht. Frueher lief er
     zweimal (einmal fuer `rateMoeglich`, einmal fuer den Klick); einmal
     reicht, das Ergebnis traegt den Grund gleich mit. */
  var probe = ratePlaetze(e, true);

  /* Was frueher ein Sammelsatz war („entweder alle Plaetze besetzt, oder
     kein Datenpunkt passt"), steht jetzt als der Fall da, der wirklich
     vorliegt - mit den Namen der Plaetze, die frei bleiben. Ohne die
     Namen war die Meldung nicht nachpruefbar.

     Gezeigt wird sie, solange keine Vermutung offen ist: dann fuehrt die
     blaue Leiste das Wort, und zwei Meldungen uebereinander widersprechen
     sich nur. */
  function plaetzeText(frei) {
    var kurz = frei.slice(0, 6).join(', ');
    return frei.length > 6 ? tr('guess.slotsMore', kurz, frei.length - 6) : kurz;
  }
  function meldungZu(p) {
    if (p.anzahl > 0) { return null; }
    var satz = p.grund === 'voll' ? tr('guess.noneFull')
      : p.grund === 'vergeben' ? tr('guess.noneUsed', plaetzeText(p.frei))
      : p.grund === 'keinTreffer' ? tr('guess.noneFit', plaetzeText(p.frei))
      : null;
    /* Der Zusatz zur Handentscheidung (U15): Steht ein Platz nur deshalb
       leer, weil die Zeile dazu von Hand entschieden ist, muss genau das
       dastehen - sonst sieht es aus wie ein Fehler des Ratens. */
    if (satz && p.handWeg) { satz += '  ' + tr('guess.noneHand', p.handWeg); }
    return satz;
  }
  /* Ungefragt gezeigt wird sie nur, wo sie etwas erklaert: dass kein
     Knopf dasteht, obwohl Plaetze frei sind. Der Fall „alle Plaetze
     besetzt" bleibt stumm - er sagt „alles gut, nichts zu tun", und das
     stuende dann an fast jedem Geraet (dieselbe Ueberlegung wie C27).
     Ueber den Klick ist er weiter erreichbar. */
  e.rateMeldung = (rateAnzahl(e) || probe.grund === 'voll')
    ? null : meldungZu(probe);

  /* Und nur, wenn er etwas anzubieten haette: ohne freie Plaetze oder
     freie Zeilen ist der Knopf ein leeres Versprechen — dann faellt er
     weg, statt beim Klick „nichts gefunden" zu melden. Das Zuruecknehmen
     steht seit dem 15.09.2026 nicht mehr auch hier: derselbe Knopf hiess
     je nach Lage „Freie Plaetze vorschlagen" oder „Vorschlaege
     verwerfen", und daneben stand in der blauen Leiste ein zweiter mit
     demselben Wort. Verworfen wird dort - bei dem, was es betrifft. */
  /* Der Rueckfrage-Dialog, wenn eine Vorlage greift (U27). Er sitzt hier
     als eigene Funktion, weil ihn zwei Knoepfe brauchen: der in der
     Leiste und der kleine neben dem Hinweis, der Muster wechselt und
     gleich vorschlaegt. */
  function mitVorlagenfrage(dann) {
    var vq = null;
    S.VORLAGEN.forEach(function (v) { if (v.id === e.vorlage) { vq = v; } });
    var body = $('#guess-body');
    body.textContent = '';
    body.appendChild(el('div', 'aside w',
      tr('guess.tplAsk', vq ? sprachtext(vq.name) : e.vorlage)));
    /* onclick statt addEventListener: der Dialog ist einer fuer alle
       Geraete, der Griff muss beim Oeffnen den alten ersetzen. */
    $('#btn-guess-go').onclick = function () {
      $('#dlg-guess').close();
      dann();
    };
    $('#dlg-guess').showModal();
  }

  var rateKnopf = null;
  if (probe.anzahl > 0) {
    /* Mit passender Vorlage ist Raten nicht der normale Weg - die
       Zuordnung steht ja schon. Der Knopf bleibt, tritt aber leise auf
       und fragt vor dem Lauf nach (Ricardo, 25.08.2026). */
    var beilaeufig = !!e.vorlage && !rateAnzahl(e);
    rateKnopf = el('button', 'btn mini'
      + (beilaeufig ? ' leise' : '')
      /* Ein leiser Knopf pocht nicht - das Pochen wuerde genau die
         Aufmerksamkeit holen, die er nicht verdient. */
      + (!beilaeufig && knopfFrisch('raten:' + S.current + ':vor') ? ' frisch' : ''),
      tr('guess.button'));
    rateKnopf.title = beilaeufig ? tr('guess.tplHint') : tr('guess.hint');
    var rateLos = function () {
      e.rateMeldung = meldungZu(ratePlaetze(e));
      entwurfAngefasst();
      S.openRow = null;
      zeichneErgebnis();
    };
    rateKnopf.addEventListener('click', function () {
      if (!beilaeufig) { rateLos(); return; }
      mitVorlagenfrage(rateLos);
    });
  }

  /* Typen, nicht Schluessel: wer „blinds" waehlte, bekam einen
     Entwurf fuer einen Typ, den der Detektor nicht kennt. */
  var alleTypen = Object.keys(D.patterns)
    .map(function (k) { return D.patterns[k].type || k; })
    .filter(function (t, n, arr) { return arr.indexOf(t) === n; }).sort();

  /* Die Belegung je Muster auszurechnen kostet einen Erkennungslauf.
     Beim Tippen wird die Liste bei jedem Anschlag neu gemalt, deshalb
     einmal gemerkt statt jedes Mal neu gerechnet. */
  var markeCache = {};
  function bewerte(m) {
    if (markeCache[m] !== undefined) { return markeCache[m]; }
    /* Die angebotene Liste ist gefiltert — der gewaehlte Typ nicht:
       `mBeschriften` ruft `markeFuer(e.want)` direkt, und `e.want` kommt
       ungeprueft aus `v.geraetetyp`. Eine eingelesene Vorlage mit dem
       Musternamen eines neueren type-detector liess `musterVon(m).states`
       werfen, und der Entwurf wurde gar nicht erst gezeichnet — die
       rechte Seite blieb leer (gemessen 09.09.2026). */
    if (!musterVon(m)) {
      markeCache[m] = { mark: tr('pattern.doesNotFit'), passt: false, belegt: 0 };
      return markeCache[m];
    }
    /* Die Vorschau muss vorhersagen, was das Auswaehlen wirklich tut.
       Beim Vorschlag werden Lampe und Steckdose samt Rollen neu gebaut -
       also auch hier gegen den umgebauten Entwurf pruefen. Sonst stuende
       hier „SET fehlt", und nach dem Klick passte trotzdem alles. */
    var pruefE = e;
    if (e.vorschlag && !e.roh && m !== e.want && musterVon(m)) {
      var kopie = JSON.parse(JSON.stringify({ kanal: e.kanal, states: e.states, want: e.want }));
      anMusterAnpassen(kopie, m);
      if (kopie.states.some(function (x, n) { return x.role !== e.states[n].role; })) {
        pruefE = kopie;
      }
    }
    var r = erkenneEntwurf(pruefE, m), mark;
    if (!r.length) {
      var fehlend = musterVon(m).states.filter(function (x) { return x.required; })
        .map(function (x) { return x.name; });
      /* Ein Pflichtplatz kann auch deshalb leer sein, weil die Zeile
         dafuer im falschen Datentyp steht - die Rolle stimmt, der Typ
         nicht, und der Punkt faellt aus dem Muster. „SET fehlt" ist dann
         die falsche Auskunft: SET ist da. Der Typ-Grund geht vor, wo es
         einen gibt (Ricardo, 12.09.2026, am Bastelzimmer_Licht). */
      var konflikt = typKonflikte(pruefE.states, m)
        .filter(function (x) { return fehlend.indexOf(x.platz) > -1; })[0];
      if (konflikt) {
        mark = tr('pattern.fitsNotType', konflikt.platz, konflikt.typ,
          konflikt.erwartet.join(tr('pattern.typeOr')));
      } else if (fehlend.length) {
        mark = '✕ ' + tr('pattern.missing', fehlend.join(', '));
      } else {
        /* Kein Pflichtplatz fehlt und trotzdem passt nichts - dann liegt
           es an einer Zeile, die ihren Platz trifft, aber im falschen
           Datentyp steht. Bis 11.09.2026 stand hier nur „passt nicht",
           und genau dieser Fall (electricity hat keinen einzigen
           Pflichtplatz) kostete Ricardo eine Stunde Suche: Rolle
           value.power.consumption richtig, Typ mixed statt number, der
           Punkt fiel lautlos aus dem Muster. */
        mark = tr('pattern.doesNotFit');
        (pruefE.states || []).some(function (st) {
          var moegliche = typenFuerRolle(m, st.role);
          if (!st.typ || !moegliche.length || moegliche.indexOf(st.typ) > -1) { return false; }
          var pl = platzFuerRolle(m, st.role);
          mark = tr('pattern.fitsNotType', pl.name, st.typ, moegliche.join(tr('pattern.typeOr')));
          return true;
        });
      }
    } else {
      var g = r[0].states.filter(function (x) { return x.id; }).length;
      mark = tr('pattern.slotsTaken', g, r[0].states.length);
      /* Hier stand frueher „(Rollen werden angepasst)" hinter der
         Belegung. Der Vermerk erschien an jeder Zeile ausser der gerade
         gewaehlten — an einem Fensterkontakt also an sieben von acht.
         Was fast ueberall steht, unterscheidet nichts; es verdraengte
         nur Name und Belegung, also genau das, wonach man in der Liste
         sucht. Dass beim Wechsel die Rollen passend gesetzt werden, ist
         ohnehin das gewollte Verhalten und keine Abwaegung, die man vor
         der Auswahl treffen muesste. */
    }
    markeCache[m] = { mark: mark, passt: !!r.length, belegt: r.length ? r[0].states.filter(function (x) { return x.id; }).length : 0 };
    return markeCache[m];
  }
  function markeFuer(m) { return bewerte(m).mark; }

  /* ---- Was nach dem Raten passen wuerde ----------------------------

     Ricardos Klimaanlage ist der Fall: `thermostat` greift und belegt 3
     von 24 Plaetzen, `airCondition` faellt durch, weil sein einziger
     Pflichtplatz MODE die Rolle nicht traegt. Nach dem Raten stuenden
     dort 9 von 29 statt 8 von 24 - nur sieht man das nirgends, weil
     „passt nicht" das letzte Wort behaelt. Wer nicht weiss, dass es den
     Knopf gibt, waehlt `airCondition` nie aus.

     Also wird einmal durchgerechnet, was jedes Muster nach dem Raten
     ergaebe. Gerechnet wird auf einer Kopie - am Entwurf aendert das
     nichts. Das Raten liest nur Namen, Werteliste, Einheit und Typ,
     keine Messwerte; das Ergebnis haengt also allein an den Zeilen und
     wird beim blossen Neuzeichnen nicht ungueltig. Gemerkt wird es
     deshalb an `e` und faellt erst, wenn eine Zeile sich aendert
     (`entwurfAngefasst`) oder ein anderes Muster gewaehlt ist.

     Gemessen am `midea.AC` (43 Punkte): ein Trockenlauf 1,2 ms, alle 51
     Muster 35 ms - einmal je Geraeteauswahl, gegen rund 200 ms fuers
     Auswaehlen selbst. */
  function probeMuster(m) {
    if (!musterVon(m)) { return null; }
    var kopie = JSON.parse(JSON.stringify({ kanal: e.kanal, states: e.states, want: m }));
    /* Dieselbe Vorbereitung wie in `bewerte`: beim Vorschlag entscheidet
       nicht das Muster, sondern die Rollen, die das Auswaehlen setzen
       wuerde. */
    if (e.vorschlag && !e.roh && m !== e.want) { anMusterAnpassen(kopie, m); }
    ratePlaetze(kopie);
    var r = erkenneEntwurf(kopie, m);
    if (!r.length) { return { passt: false }; }
    return { passt: true, gesamt: r[0].states.length,
             belegt: r[0].states.filter(function (x) { return x.id; }).length };
  }

  function aussicht() {
    if (e.rateAussicht && e.rateAussicht.want === e.want) { return e.rateAussicht; }
    var proM = {}, neuPassend = [];
    if (e.states && e.states.length) {
      alleTypen.forEach(function (m) {
        var p = probeMuster(m);
        if (!p) { return; }
        proM[m] = p;
        /* „Neu" heisst: passt jetzt nicht, nach dem Raten schon. Das
           gewaehlte Muster gehoert nicht dazu - es ist kein anderes. */
        if (p.passt && m !== e.want && !bewerte(m).passt) { neuPassend.push(m); }
      });
    }
    e.rateAussicht = { want: e.want, proM: proM, neu: neuPassend,
                       selbst: proM[e.want] || null };
    return e.rateAussicht;
  }

  /* Welche Muster ohne Suchtext angeboten werden. Das erkannte und das
     gerade gewaehlte gehoeren immer dazu - sonst fiel rgbSingle heraus,
     sobald man einmal auf light gewechselt hatte, und der Weg zurueck
     fuehrte nur ueber die ganze Liste. */
  function grundListe() {
    var l = e.alleMuster ? alleTypen.slice() : VORSCHAU.slice();
    [e.wantAuto, e.want].forEach(function (m0) {
      if (m0 && musterVon(m0) && l.indexOf(m0) === -1) { l.unshift(m0); }
    });
    return l.filter(function (m) { return !!musterVon(m); });
  }

  /* Gesucht wird ueber den Namen des Musters und ueber die Rollen seiner
     Plaetze. „state" findet so auch light und window, deren Plaetze
     state.light und state.window annehmen - der Name allein haette dazu
     nichts gemeldet. */
  function rollenVon(m) {
    var mu = musterVon(m);
    if (!mu) { return []; }
    return mu.states.map(function (x) { return x.defaultRole || ''; })
      .filter(Boolean).filter(function (r0, n, arr) { return arr.indexOf(r0) === n; });
  }

  var mMarkiert = -1;
  var mEintraege = [];
  var mSchliessen = function () { mlist.hidden = true; mMarkiert = -1; };

  var mWaehlen = function (neuTyp) {
    if (!musterVon(neuTyp)) { return; }
    mSchliessen();
    /* Beim Vorschlag reicht es nicht, das Muster umzustellen - die Rollen
       entscheiden. switch.light passt auf kein socket-SET. Also den
       Vorschlag mit den passenden Rollen neu bauen. */
    if (e.vorschlag && !e.roh) {
      anMusterAnpassen(e, neuTyp);
    } else {
      e.want = neuTyp;
    }
    S.openRow = null;
    /* Kein Fokus zurueck ins Feld: der Fokus oeffnete die Liste sofort
       wieder, und nach der Wahl stand sie erneut offen — man musste
       eigens daneben klicken. Die Wahl ist getroffen; wer ein anderes
       Muster will, klickt neu ins Feld. */
    zeichneErgebnis();
  };

  var mMalen = function () {
    var such = String(sel.value || '').trim().toLowerCase();
    var treffer = [];
    if (!such) {
      treffer = grundListe().map(function (m) { return { m: m, via: null }; });
    } else {
      /* Mit Suchtext wird immer der ganze Bestand durchsucht, nicht nur
         die uebliche Auswahl - sonst muesste man erst umschalten, um
         ueberhaupt finden zu koennen. */
      alleTypen.forEach(function (m) {
        if (!musterVon(m)) { return; }
        /* Wer „Steckdose“ tippt, will socket finden - die Suche geht
           ueber rohen Namen UND Beinamen. */
        if (m.toLowerCase().indexOf(such) > -1
            || musterName(m).toLowerCase().indexOf(such) > -1) { treffer.push({ m: m, via: null }); return; }
        var r0 = rollenVon(m).filter(function (x) { return x.toLowerCase().indexOf(such) > -1; });
        if (r0.length) { treffer.push({ m: m, via: r0[0] }); }
      });
    }
    /* Was passt, steht oben. Ein Muster, dem eine Pflichtangabe fehlt,
       ist keine Wahl, die man gerade trifft — es soll die Liste nicht
       anfuehren, nur weil es alphabetisch vorn steht. Unter den
       passenden gewinnt, wer mehr Plaetze belegt; darunter bleibt die
       Reihenfolge, in der die Liste zusammengestellt wurde. */
    treffer.forEach(function (t0, n) { t0.rang = n; });
    treffer.sort(function (a, b) {
      var pa = bewerte(a.m), pb = bewerte(b.m);
      if (pa.passt !== pb.passt) { return pa.passt ? -1 : 1; }
      if (pa.passt && pb.belegt !== pa.belegt) { return pb.belegt - pa.belegt; }
      return a.rang - b.rang;
    });
    mEintraege = treffer;
    var auL = aussicht();

    mlist.textContent = '';
    if (!treffer.length) {
      var leer = el('div', 'vz zurueck');
      leer.appendChild(el('span', null, tr('pattern.noMatch', sel.value)));
      mlist.appendChild(leer);
    }
    treffer.forEach(function (t0, n) {
      var z = el('div', 'vz' + (n === mMarkiert ? ' an' : '')
        + (t0.m === e.want ? ' gewaehlt' : ''));
      z.appendChild(el('span', null, musterZeile(t0.m)));
      /* Hinter „✕ MODE fehlt" steht, ob das Muster nach dem Raten doch
         greift - sonst liest man nur, dass es nicht passt, und haelt es
         fuer erledigt. */
      var nachRaten = (!bewerte(t0.m).passt && auL.proM[t0.m] && auL.proM[t0.m].passt)
        ? '   ' + tr('guess.alsoRow') : '';
      z.appendChild(el('span', 'tiefer',
        (t0.via ? tr('pattern.viaRole', t0.via) + '   ' : '') + markeFuer(t0.m) + nachRaten));
      /* mousedown statt click: sonst greift der Fokusverlust zuerst und
         die Liste ist weg, bevor der Klick ankommt. */
      z.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        mWaehlen(t0.m);
      });
      mlist.appendChild(z);
    });

    /* Der Umschalter, der frueher als Knopf daneben stand. Beim Suchen
       ist er ueberfluessig - dann laeuft die Suche ohnehin ueber alles. */
    if (!such && alleTypen.length > VORSCHAU.length) {
      var um = el('div', 'vz mehr');
      um.appendChild(el('span', null, (e.alleMuster ? '▴  ' : '▾  ')
        + (e.alleMuster ? tr('pattern.usualOnly')
                        : tr('pattern.allPatterns', alleTypen.length))));
      um.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        e.alleMuster = !e.alleMuster;
        mMarkiert = -1;
        mMalen();
        sel.focus();
      });
      mlist.appendChild(um);
    }
    mlist.hidden = false;
  };

  /* Solange nichts getippt ist, steht im Feld das gewaehlte Muster mit
     seiner Belegung - dieselbe Auskunft wie frueher im zugeklappten
     Auswahlfeld. */
  var mBeschriften = function () {
    /* Im Feld der Beiname, der rohe Name im Tooltip - fuer beides
       nebeneinander ist das Feld zu schmal.

       Die Marke nennt seit 11.09.2026 auch den Grund, wenn ein Muster
       an einem falschen Datentyp scheitert („✕ CONSUMPTION: Typ mixed
       statt number"). Das ist laenger als „passt nicht" und wird im
       schmalen Feld abgeschnitten - deshalb steht sie zusaetzlich im
       Tooltip, wo sie ganz lesbar ist. */
    var marke = e.want ? markeFuer(e.want) : '';
    sel.value = e.want ? ((musterName(e.want) || e.want) + '   ' + marke) : '';
    sel.title = e.want ? (e.want + (marke ? '   ' + marke : '')) : '';
  };
  mBeschriften();

  /* Der Hinweis neben dem Feld: genannt wird EIN Muster - das beste -
     und nur, wenn es wirklich besser ist als das gewaehlte.

     Der erste Anlauf zaehlte bloss, wie viele Muster nach dem Vorschlag
     dazukaemen, und schrieb bei mehreren „12 weitere Muster" hin. Am
     `midea.AC` sind das tatsaechlich zwoelf - aber elf davon sind
     Beifang: `blind` 4/19, `illuminance` 3/7, `windowTilt` 3/7 an einer
     Klimaanlage. Eine Zahl, die Beifang mitzaehlt, verdeckt genau die
     eine Auskunft, um die es geht (Ricardo, 15.09.2026): `airCondition`
     9/29 gegen `thermostat` 8/24.

     Gemessen wird an den belegten Plaetzen, nicht am Anteil. 9 von 29
     ist besser als 8 von 24, weil neun Punkte des Geraets einen Platz
     bekommen statt acht - der Anteil waere hier sogar knapp kleiner.
     Beide Zahlen stehen NACH dem Vorschlag; „3/24" ist der Stand jetzt
     und gehoert nicht daneben.

     Ist nichts besser, steht hier nichts - der haeufigste Fall bleibt
     damit stumm. */
  var auF = aussicht();
  var bestes = null;
  auF.neu.forEach(function (m) {
    if (!bestes || auF.proM[m].belegt > auF.proM[bestes].belegt) { bestes = m; }
  });
  /* Der Vergleichswert ist der Stand des gewaehlten Musters NACH dem
     Vorschlag. Passt es auch dann nicht, ist jedes andere besser. */
  var jetzt = (auF.selbst && auF.selbst.passt) ? auF.selbst.belegt : -1;
  if (bestes && auF.proM[bestes].belegt > jetzt) {
    var pB = auF.proM[bestes], nB = musterName(bestes) || bestes;
    var hw = el('span', 'ratAussicht');
    var htx = el('span', null, '· ' + tr('guess.better', nB));
    htx.title = jetzt >= 0
      ? tr('guess.betterHint', nB, pB.belegt + '/' + pB.gesamt,
           musterName(e.want) || e.want, auF.selbst.belegt + '/' + auF.selbst.gesamt)
      : tr('guess.betterHintNone', nB, pB.belegt + '/' + pB.gesamt,
           musterName(e.want) || e.want);
    hw.appendChild(htx);

    /* Der Weg dorthin in einem Griff: wechseln UND vorschlagen.
       Sonst waere der Hinweis eine Ansage ohne Handlung - man muesste
       das Muster in der Liste suchen und danach noch den Knopf in der
       Leiste finden (Ricardo, 16.09.2026).

       Ein Zeichen statt eines Wortes: neben dem Satz bleiben rund 55 px,
       „wechseln" braucht 58. Dieselbe Bauart wie die Uebernahmeknoepfe
       im Detail (`←`, `⟲`) - kleines Zeichen, ausfuehrlicher Tooltip. */
    var hgo = el('button', 'btn winzig rtgo', '→');
    hgo.title = tr('guess.betterGoHint', nB, tr('guess.button'));
    hgo.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var los = function () {
        /* Beim Vorschlag entscheidet nicht das Muster, sondern die
           Rollen, die das Auswaehlen setzt - genau wie in `mWaehlen`. */
        if (e.vorschlag && !e.roh) { anMusterAnpassen(e, bestes); } else { e.want = bestes; }
        e.rateMeldung = meldungZu(ratePlaetze(e));
        entwurfAngefasst();
        S.openRow = null;
        zeichneErgebnis();
      };
      /* Greift eine Vorlage, fragt auch dieser Weg nach (U27) - er raet
         ja genauso ueber eine fertige Zuordnung hinweg. */
      if (e.vorlage && !rateAnzahl(e)) { mitVorlagenfrage(los); } else { los(); }
    });
    hw.appendChild(hgo);
    vw.appendChild(hw);
  }

  sel.addEventListener('focus', function () {
    sel.value = '';
    mMarkiert = -1;
    mMalen();
  });
  sel.addEventListener('input', function () { mMarkiert = -1; mMalen(); });
  sel.addEventListener('blur', function () {
    setTimeout(function () { mSchliessen(); mBeschriften(); }, 120);
  });
  sel.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { mSchliessen(); mBeschriften(); sel.blur(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (mlist.hidden) { mMalen(); return; }
      ev.preventDefault();
      if (!mEintraege.length) { return; }
      mMarkiert += (ev.key === 'ArrowDown' ? 1 : -1);
      if (mMarkiert < 0) { mMarkiert = mEintraege.length - 1; }
      if (mMarkiert >= mEintraege.length) { mMarkiert = 0; }
      mMalen();
      var akt = mlist.children[mMarkiert];
      if (akt && akt.scrollIntoView) { akt.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (!mlist.hidden && mEintraege.length) {
        mWaehlen(mEintraege[mMarkiert >= 0 ? mMarkiert : 0].m);
      }
    }
  });
  if (S.fokusMusterfeld) {
    S.fokusMusterfeld = false;
    setTimeout(function () { sel.focus(); }, 0);
  }

  /* Kein Fliesstext unter dem Auswahlfeld: die Belegung steht schon in
     jeder Zeile des Auswahlfelds, und eine zweite Zeile verschoebe die
     Felder daneben gegeneinander. Nur Meldungen bleiben. */
  var meta = el('div', 'vmeta');
  if (!haupt) {
    meta.appendChild(el('span', 'chip bad', tr('pattern.notDetected')));
  } else if (pflichtFehlt.length) {
    meta.appendChild(el('span', 'chip bad',
      tr('pattern.missing', pflichtFehlt.map(function (x) { return x.name; }).join(', '))));
  }
  if (e.want && e.wantAuto && e.want !== e.wantAuto) {
    meta.appendChild(el('span', 'chip warn', tr('pattern.manualInstead', e.wantAuto)));
  }
  if (meta.childNodes.length) { vw.appendChild(meta); }
  /* Der Knopf „alle 51 Muster" stand frueher neben dem Auswahlfeld und
     schaltete die Liste um. Er sitzt jetzt als letzte Zeile in der Liste
     selbst - dort, wo man ihn braucht, statt daneben. */

  return { block: vw, rateKnopf: rateKnopf };
}
