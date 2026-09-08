import { S } from './zustand.js';
import './start.js';
import { socket } from './verbindung.js';
import { D, $, el, klappZeichen } from './basis.js';
import { tr, sprachtext } from './sprache.js';
import './einstellungen.js';
import './enums.js';
import { ausgangName, pruefeVorlage, vorschlag } from './vorlagen.js';
import { rateAnzahl } from './vorschlagen.js';

import {
  vEinlesenDatei,
  zeichneVorlagenBlatt,
  tplKnopf,
  zeigeVorlagenDialog,
  speichereVorlageAusDialog
} from './vorlagenblatt.js';
import { baueZielleiste } from './zielleiste.js';
import { baueMusterwahl } from './musterwahl.js';
import { berechnePlaetze, baueListe } from './zustandsliste.js';
import {
  alleUndVorlage,
  knotenDa,
  quelleVon,
  springeZu,
  waehle,
  mitNachfrage,
  geraeteDarunter,
  aliasFuer,
  quellenVerteilung,
  quelleHier,
  tipptGerade,
  opt,
  vorlagenAbweichung,
  vorlageAnwenden,
  bestandVorrang
} from './entwurf.js';
import { setzeEnums, setzeZiel, unterschiede } from './zuordnung.js';
import './detail.js';
import { zeigeTausch, tauscheAus } from './quellentausch.js';

import { baueChecks } from './pruefungen.js';
import {
  zeigeTrockenlauf,
  zeigeLoeschen,
  loescheAlias,
  zeigeVerlegen,
  delKnopf,
  schreibeObjekte
} from './schreiben.js';

import { mqttKarte, mqttSchreiben } from './mqtt.js';
import { kindZustaende, direkteZustaende } from './werte.js';
import './aufzaehlungen.js';
import { erkenneEntwurf } from './erkennung.js';
import { zusatzName } from './baum.js';
import './objekte.js';
import './katalog.js';

/* Das Aufklapp-Flag von „Warum diese Vorlage“ - lag versehentlich im
   MQTT-Block und wanderte beim Schnitt mit; es gehoert hierher. */
var warumAuf = false;

/* Das Ergebnis rechts: Entwurf aufbauen, waehlen, zeichnen - Kopf,
   Zustandsliste, Raum/Funktion-Zeile, Ordneruebersicht, Sprungknoepfe,
   Dialog-Verkabelung.

   Frueher ein IIFE - als Modul ist der eigene Gueltigkeitsbereich
   ohnehin da, und nur ohne Huelle lassen sich Funktionen exportieren. */

  /* Der Klappzustand ist eine Ansichtssache, keine Konfiguration - er
     gehoert in den Browser, nicht in die Objektdatenbank. Sonst schriebe
     jeder Klick auf ein Dreieck in die Instanz. */
  /* Nicht bei jedem einzelnen Wert die ganze rechte Seite neu bauen. Ein
     Solarzaehler sendet im Sekundentakt — und mit jedem Takt verschwand,
     was gerade offen war: die Ordnerliste beim Hineinklicken, ein
     aufgeklapptes Detail, der Fokus im Eingabefeld. Gesammelt zeichnen,
     und nur, wenn niemand tippt. */
  var werteTimer = null;
  function werteGezeichnet() {
    werteTimer = null;
    if (document.querySelector('dialog[open]')) { return; }
    if (tipptGerade()) { werteTimer = setTimeout(werteGezeichnet, 700); return; }
    if (S.current) { zeichneErgebnis(); }
  }
  socket.on('stateChange', function (id, state) {
    if (!state) { return; }
    S.werte[id] = state;
    if (!S.current || werteTimer) { return; }
    werteTimer = setTimeout(werteGezeichnet, 700);
  });

  /* Kopfzeile: die Vorlagenzahl kommt erst, wenn sie geladen sind —
     hier steht S.VORLAGEN noch auf undefined. */
  $('#meta').textContent = 'type-detector ' + (D ? D.version : '?');


  /* Welches Angebot zuletzt zu sehen war und seit wann.

     An ein einzelnes Zeichnen laesst sich das Pochen nicht haengen: nach
     der Auswahl zeichnet die Werkbank ein zweites Mal, sobald die Werte
     nachkommen, und beim zweiten Mal waere das Angebot schon „bekannt“ und
     bliebe stumm. Also gilt ein Zeitfenster - drei Sekunden ab dem ersten
     Erscheinen. Danach steht es ruhig da, solange es dasselbe bleibt. */
  var letztesAngebot = '';
  var angebotSeit = 0;

  /* Dasselbe Zeitfenster fuer den Vorschlagsknopf.

     Eine eigene Marke und nicht `angebotFrisch`: die fuehrt genau einen
     Schluessel, und zwei Dinge, die sich einen merken, loeschen sich
     gegenseitig aus - der Knopf wuerde das Pochen des Uebernahme-Angebots
     abwuergen und umgekehrt. */
  var letzterKnopf = '';
  var knopfSeit = 0;

  export function knopfFrisch(schluessel) {
    if (schluessel !== letzterKnopf) {
      letzterKnopf = schluessel;
      knopfSeit = Date.now();
      return true;
    }
    return (Date.now() - knopfSeit) < 3200;
  }

  export function angebotFrisch(schluessel) {
    if (schluessel !== letztesAngebot) {
      letztesAngebot = schluessel;
      angebotSeit = Date.now();
      return true;
    }
    return (Date.now() - angebotSeit) < 3200;
  }

  export function entwurfAngefasst() {
    if (S.entwurf) { S.entwurf.angefasst = true; }
  }

  export function neuZeichnenOderAufbauen(danach) {
    if (!S.current || S.baumModus === 'vorlagen') {
      if (typeof danach === 'function') { danach(); }
      return;
    }
    if (S.entwurf && S.entwurf.angefasst) {
      zeichneErgebnis();
      if (typeof danach === 'function') { danach(); }
      return;
    }
    waehle(S.current, danach);
  }

  (function () {
    var b = $('#btn-move');
    /* Nicht direkt anhaengen: `zeigeVerlegen` nimmt seit dem Knopf
       „stattdessen verlegen" zwei Vorgaben entgegen, und der Zuhoerer
       wuerde ihm das Klickereignis als erste durchreichen. */
    if (b) { b.addEventListener('click', function () { zeigeVerlegen(); }); }
    var bt = $('#btn-swap');
    if (bt) { bt.addEventListener('click', zeigeTausch); }
    var btg = $('#btn-swap-go');
    if (btg) { btg.addEventListener('click', tauscheAus); }
  })();

  $('#btn-einlesen').addEventListener('click', function () { $('#datei-einlesen').click(); });
  $('#datei-einlesen').addEventListener('change', function () {
    var f = this.files && this.files[0];
    this.value = '';                 /* dieselbe Datei soll erneut gehen */
    if (f) { vEinlesenDatei(f); }
  });

  /* ================== Entwurf ==================
     Alles, was du aenderst, lebt hier im Speicher. Geschrieben wird nichts.
     Der echte Detektor laeuft gegen ein Objekt-Abbild dieses Entwurfs —
     deshalb reagiert der Bericht sofort auf jede Aenderung. */

  /* ================== Ergebnis ================== */

  /* Nichts gewaehlt: Hinweis statt Entwurf, und alle Knoepfe aus. */
  function zeichneLeer(host) {
      /* Was man in diesem Modus tun kann, steht dort, wo man es beim
         ersten Oeffnen sucht: auf der leeren rechten Seite. Die Reiter
         benennen die Absicht, hier steht der Weg (Ricardo, 25.08.2026). */
      var k = el('div', 'empty leerhilfe');
      var modus = S.baumModus === 'aliase' ? 'aliases'
                : (S.baumModus === 'vorlagen' ? 'templates' : 'sources');
      k.appendChild(el('div', 'lh1', tr('help.' + modus)));
      if (modus === 'aliases') { k.appendChild(el('div', 'lh2', tr('help.aliasesAdd'))); }
      host.appendChild(k);
      /* Nichts gewaehlt heisst: keine Knoepfe fuer ein Geraet, das es
         gerade nicht gibt. Nach dem Loeschen eines Alias und nach der
         Rueckkehr aus dem Vorlagen-Tab stand hier weiter „Alias
         aktualisieren", „Alle 4 erzeugen", „Pruefungen 7 ✓" und unten
         die Objektzahl von vorhin samt Geraetetyp. Die Knoepfe waren
         wirkungslos, gelesen hat man sie trotzdem. */
      var bd0 = $('#btn-dry');
      bd0.disabled = true;
      /* Auch die Beschriftung zuruecksetzen: „Alias aktualisieren" stand
         sonst noch da, obwohl es den Alias nicht mehr gibt. */
      bd0.textContent = tr('write.createAlias');
      var dAlle = $('#btn-dry-alle'); if (dAlle) { dAlle.hidden = true; }
      tplKnopf(false);
      delKnopf(false);
      var bc0 = $('#btn-checks');
      if (bc0) { bc0.disabled = true; }
      var chip0 = $('#checkchip');
      if (chip0) { chip0.textContent = ''; chip0.className = ''; }
  }

  /* Sehr viele Punkte ohne Vorlage: Uebersicht oder Warnung statt
     ungefragt hunderter Zeilen. */
  function zeichneZuViel(host, e) {
      /* Sind darunter mehrere eigenstaendige Geraete, ist eine Uebersicht
         nuetzlicher als die blosse Warnung: sie zeigt je Geraet, welche
         Vorlage greift und ob es schon einen Alias gibt. Die Funktion gab
         es laengst, sie wurde nur nie aufgerufen. */
      var drunter = geraeteDarunter(S.current);
      if (drunter.length > 1) {
        zeichneOrdner(host, S.current);
        var bt2 = el('div');
        bt2.style.margin = '11px 0 0';
        var btn2 = el('button', 'btn', tr('result.allAnyway') + e.states.length);
        btn2.addEventListener('click', function () { e.trotzdem = true; zeichneErgebnis(); });
        bt2.appendChild(btn2);
        host.appendChild(bt2);
        return;
      }
      var zweige = {};
      e.states.forEach(function (st) {
        zweige[(st.n.split('_')[0] || st.n)] = 1;
      });
      var wr = el('div', 'aside w');
      wr.appendChild(el('b', null, tr('result.pointsFromBranches',
        e.states.length, Object.keys(zweige).length)));
      wr.appendChild(document.createTextNode(tr('result.tooManyStates', e.states.length)));
      var bt = el('div');
      bt.style.marginTop = '9px';
      var btn = el('button', 'btn', tr('result.allAnyway') + e.states.length);
      btn.addEventListener('click', function () { e.trotzdem = true; zeichneErgebnis(); });
      bt.appendChild(btn);
      wr.appendChild(bt);
      host.appendChild(wr);
      var bd0 = $('#btn-dry');
      if (bd0) { bd0.disabled = true; }
      tplKnopf(false);
      var ba0 = $('#btn-dry-alle');
      if (ba0) { ba0.hidden = true; }
      delKnopf(false);
  }

  /* Erkennung samt Ziel und Aufzaehlungen - und dem zweiten Lauf,
     wenn der Bestand den Entwurf gerade umgebaut hat. */
  function ermittleErkennung(e) {
    var frei = erkenneEntwurf(e, null);
    if (!e.wantAuto) {
      e.wantAuto = frei.length ? frei[0].type : null;
      if (!e.want) { e.want = e.wantAuto; }
    }
    var funde = e.want ? erkenneEntwurf(e, e.want) : frei;
    var haupt = funde.length ? funde[0] : null;

    /* --- Kopf --- */
    setzeZiel(e);

    /* Hat `uebernehmeBestand` den Entwurf auf den Bestand gezogen, lief die
       Erkennung von eben noch auf den Rollen der Quelle - und `wantAuto`
       stuende danach fest. Also noch einmal.

       Das kann nur beim ersten Zeichnen nach der Auswahl passieren
       (`bestandGeprueft` laesst es genau einmal zu), und da hat noch
       niemand ein Muster von Hand gewaehlt - `want` zurueckzusetzen nimmt
       also keine Entscheidung weg. */
    if (e.bestandZog) {
      e.bestandZog = false;
      e.wantAuto = null;
      e.want = null;
      frei = erkenneEntwurf(e, null);
      e.wantAuto = frei.length ? frei[0].type : null;
      e.want = e.wantAuto;
      funde = e.want ? erkenneEntwurf(e, e.want) : frei;
      haupt = funde.length ? funde[0] : null;
    }

    setzeEnums(e);
      return haupt;
  }

  /* Der Kopf: was links angeklickt wurde - Name, Kennung, Bestand
     und der Sprungknopf zum Gegenstueck. Nicht, was daraus werden
     soll: das sagt die Zielzeile darunter. */
  function baueKopf() {
    var obj = S.objects[S.current] || {};
    var alleZust = kindZustaende(S.current);
    var direkt = direkteZustaende(S.current);
    var head = el('div', 'rhead');
    var links = el('div');
    /* Oben steht, was links angeklickt wurde — und das ist jetzt der Name,
       wo es einen gibt. Die Kennung steht unverkuerzt in der Zeile
       darunter; doppelt braucht sie in der Unterzeile nicht zu stehen. */
    var kopfName = zusatzName(S.current);
    /* Name und Sprungknopf in einer Zeile: der Knopf gehoert zu dem, was
       oben steht, nicht unter den Bestandszaehler. */
    var namensZeile = el('div', 'namzeile');
    namensZeile.appendChild(el('div', 'id', kopfName || S.current.split('.').pop()));
    links.appendChild(namensZeile);
    links.appendChild(el('div', 'pfad', S.current));

    var sub = el('div', 'sub');
    sub.appendChild(document.createTextNode((S.objects[S.current] ? obj.type : tr('result.noObjectShort')) + '  ·  ' +
      (direkt.length !== alleZust.length
        ? tr('result.statesDirect', alleZust.length, direkt.length)
        : tr('result.states', alleZust.length))));
    /* Ein Weg zurueck zum Geraet. Im Aliasmodus laesst sich ein Alias
       pflegen, aber nicht neu aus einer Vorlage aufbauen - Vorlagen
       greifen nur an der Quelle. Wer von einem Alias aus weiterarbeiten
       will, musste ihn bisher im Quellenbaum von Hand wiederfinden.
       Umgekehrt gilt dasselbe: steht man am Geraet und will nachsehen,
       was daraus geworden ist, fuehrt der zweite Knopf hin. */
    var sprung = null, sprungZiel = null, sprungModus = null;
    if (S.current.indexOf('alias.') === 0) {
      sprungZiel = quelleVon(S.current);
      sprungModus = 'quellen';
      if (!sprungZiel) {
        var vermerkt = S.objects[S.current] && S.objects[S.current].native && S.objects[S.current].native.quelle;
        if (vermerkt) { sub.appendChild(el('span', 'chip warn', tr('result.sourceGone', vermerkt))); }
      }
    } else {
      sprungZiel = aliasFuer(S.current);
      /* Rueckprobe: fuehrt der Weg von diesem Alias wieder hierher?

         `aliasFuer` sucht grosszuegig - es findet auch einen Alias, dessen
         Punkte irgendwo *unterhalb* des Knotens lesen. Fuer die
         Ordneruebersicht ist das richtig, fuer diesen Knopf zu weit: er
         erschien dadurch an jeder Sparte und jedem Unterkanal, also an
         `…RGB.stat` und `…RGB.tele` ebenso wie am Geraet. Der Knopf
         gehoert nur dorthin, wo der Alias auch wirklich herkommt. */
      /* Rueckprobe, aber nicht zu streng.

         Frueher galt nur: `quelleVon(alias) === S.current`. Bei einem
         Alias aus zwei Zweigen fiel der Rueckweg damit weg - wer ueber
         die neue Quellenauswahl auf `…Stromzaehler.stat` sprang, stand
         dort ohne Knopf zurueck (Ricardo, 08.09.2026).

         Jetzt gilt der Knopf auch an einer Nebenquelle - aber nur, wenn
         sie GENAU in der Verteilung steht und einen eigenen Zweig
         bildet. Sparten unterhalb der Hauptquelle bleiben damit weiter
         aussen vor: `…Licht.stat` und `…Licht.tele` liegen beide unter
         `…Bastelzimmer_Licht`, und der Knopf gehoert ans Geraet, nicht
         an jede Sparte. Knoten weiter oben (`…Strom`) stehen gar nicht
         erst in der Verteilung. */
      /* Der Rueckweg gehoert an jede Quelle des Alias - an die groesste
         wie an jede andere, und auch an das Geraet ueber einer Sparte.
         `quelleHier` sagt, ob dieser Knoten zu einer von ihnen gehoert;
         steht er zu weit oben oder gar nicht dabei, bleibt der Knopf
         weg (Ricardo, 08.09.2026). */
      if (sprungZiel && !quelleHier(sprungZiel, S.current)) { sprungZiel = null; }
      sprungModus = 'aliase';
    }
    /* Liest der Alias aus mehr als einem Knoten, gehoert das in den Kopf.

       `quelleVon` entscheidet nach Mehrheit und wirft den Rest weg. Das
       ist als Sprungziel richtig, als Auskunft aber die halbe Wahrheit:
       an `alias.0.Solar.Netz` - drei Punkte aus `0_userdata`, zwei aus
       `mqtt-client` - stand nirgends, dass es zwei Quellen sind. Man
       musste jede Zeile aufklappen, um es zu sehen (Ricardo,
       08.09.2026). */
    /* Der Chip gilt fuer den Alias, gleich von welcher Seite man ihn
       ansieht: am Alias selbst und an jeder seiner Quellen. Wer an einer
       Nebenquelle steht, soll sehen, dass er nur einen Teil vor sich
       hat. */
    var quellAlias = (S.current.indexOf('alias.') === 0) ? S.current
      : (sprungZiel && sprungModus === 'aliase' ? sprungZiel : null);
    var verteilung = quellAlias ? quellenVerteilung(quellAlias) : [];
    var mehrQuellen = verteilung.length > 1;
    if (knotenDa(sprungZiel)) {
      var zumAlias = (sprungModus === 'aliase');
      sprung = el('button', 'btn schmal sprungknopf',
        (zumAlias ? tr('result.toAlias') : tr('result.toSource')) + '  \u2192');
      sprung.title = (zumAlias ? tr('result.toAliasHint') : tr('result.toSourceHint'))
        + String.fromCharCode(10) + sprungZiel;
      var ziel0 = sprungZiel, modus0 = sprungModus;
      /* Die Auswahl gehoert nur an „zur Quelle" - dort gibt es mehrere
         Ziele. „zum Alias" hat genau eines; eine Liste von QUELLEN unter
         diesem Knopf ist sinnlos (Ricardo, 08.09.2026). Der Chip bleibt
         an beiden Stellen: er sagt etwas ueber den Alias, nicht ueber
         den Sprung. */
      if (mehrQuellen && sprungModus === 'quellen') {
        /* Die Auswahl haengt am Body, nicht am Kopf.

           Erst stand sie neben dem Knopf - und war sofort wieder weg:
           bei `alias.0.Solar.Netz` laeuft im Sekundentakt ein neuer
           Messwert ein, jeder zeichnet die rechte Seite neu, und mit ihr
           verschwand die eben geoeffnete Liste. Am Body ueberlebt sie
           das; ihre Stelle bekommt sie aus der Lage des Knopfes.

           `mousedown` statt `click`, wie bei den Vorschlagslisten der
           Zielleiste: der Mausdruck kommt vor dem Neuzeichnen. */
        var listeQ = null;
        var zuQ = function () {
          if (listeQ && listeQ.parentNode) { listeQ.parentNode.removeChild(listeQ); }
          listeQ = null;
        };
        sprung.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (listeQ) { zuQ(); return; }
          listeQ = el('div', 'vorschlaege sprungliste');
          listeQ.appendChild(el('div', 'vzkopf', tr('result.pickSource')));
          verteilung.forEach(function (q) {
            var z = el('div', 'vz' + (q.id === ziel0 ? ' gewaehlt' : ''));
            z.appendChild(el('span', null, q.id));
            z.appendChild(el('span', 'zq', '  \u00b7  ' + q.n));
            z.addEventListener('mousedown', function (ev2) {
              ev2.preventDefault();
              ev2.stopPropagation();
              zuQ();
              springeZu(q.id, modus0);
            });
            listeQ.appendChild(z);
          });
          var r = sprung.getBoundingClientRect();
          listeQ.style.position = 'fixed';
          listeQ.style.left = Math.round(r.left) + 'px';
          listeQ.style.top = Math.round(r.bottom + 2) + 'px';
          listeQ.hidden = false;
          document.body.appendChild(listeQ);
        });
        /* Woanders hin gedrueckt heisst: doch nicht. Einmal registriert,
           nicht bei jedem Neuzeichnen - sonst haeuft sich der Zuhoerer. */
        if (!S.sprungZuhoerer) {
          S.sprungZuhoerer = true;
          document.addEventListener('mousedown', function () {
            var offen = document.querySelector('.sprungliste');
            if (offen && offen.parentNode) { offen.parentNode.removeChild(offen); }
          });
        }
        namensZeile.appendChild(sprung);
      } else {
        sprung.addEventListener('click', function () { springeZu(ziel0, modus0); });
        namensZeile.appendChild(sprung);
      }
    }
    if (mehrQuellen) {
      var chQ = el('span', 'chip mut quellenzahl', tr('result.sourceCount', verteilung.length));
      chQ.title = tr('result.sourceCountHint') + String.fromCharCode(10, 10) +
        verteilung.map(function (q) { return q.id + '  \u00b7  ' + q.n; })
          .join(String.fromCharCode(10));
      namensZeile.appendChild(chQ);
    }
    links.appendChild(sub);
    head.appendChild(links);
      return head;
  }

  /* Der Vorlagenkasten: welche Vorlage gegriffen hat, warum, ihre
     Wahl und Knoepfe. Nimmt die Musterwahl bei sich auf; ohne Kasten
     bleibt sie im Kopf - bis die Leiste sie sich holt. */
  function baueVorlagenkasten(host, head, e, istQuelle, musterBlock) {
    if (e.vorschlag || istQuelle) {
      var sg = el('div', 'suggestbox');
      if (!e.vorschlag) {
        sg.style.borderColor = 'var(--line-strong)';
        sg.style.background = 'var(--surface-2)';
      }
      var hd = el('div', 'hd', e.vorschlag
        ? tr('tpl.identifiedAs', e.tplName)
        : tr('tpl.noneDetected'));
      if (e.vorlageVersion) {
        var vv2 = el('span', null, '  ·  ' + e.vorlage + ' v' + e.vorlageVersion);
        vv2.style.fontFamily = 'var(--mono)';
        vv2.style.fontSize = '10.5px';
        vv2.style.fontWeight = '400';
        vv2.style.color = 'var(--ink-3)';
        hd.appendChild(vv2);
      }
      if (e.vonHandGewaehlt) {
        var vh = el('span', 'chip warn', tr('tpl.manuallyChosen'));
        vh.style.marginLeft = '7px';
        hd.appendChild(vh);
      }
      if (e.ausBestand) {
        var ab = el('span', 'chip mut', tr('tpl.remembered'));
        ab.style.marginLeft = '7px';
        ab.title = tr('tpl.rememberedHint');
        hd.appendChild(ab);
      }
      /* Woher die Vorlage kommt — mitgeliefert oder selbst gebaut. */
      var vq = null;
      S.VORLAGEN.forEach(function (v) { if (v.id === e.vorlage) { vq = v; } });
      if (vq && vq._quelle === 'benutzer') {
        var qc = el('span', 'chip ok', tr('tpl.own'));
        qc.style.marginLeft = '7px';
        hd.appendChild(qc);
      }
      sg.appendChild(hd);

      /* Warum diese Vorlage, und was sie weggelassen hat — beides an einer
         Stelle und zugeklappt. Vorher stand die Begruendung im Tooltip
         eines kleinen i, wo sie niemand findet, und die Liste der
         weggelassenen Punkte offen darunter, wo sie den halben Bildschirm
         fuellte. Zugeklappt bleibt die Zahl sichtbar; wer es genau wissen
         will, klappt auf. */
      var gruende = [];
      if (e.vorschlag) {
        gruende = e.grund.slice();
      } else {
        S.VORLAGEN.forEach(function (v) {
          var t = pruefeVorlage(v, S.current);
          gruende.push(sprachtext(v.name) + ': ' + (t.passt ? tr('tpl.fits') : t.fehler.join(', ')));
        });
      }
      var weggelassen = (e.uebersprungen || []).slice();

      /* Der Aufklapper sitzt in der Kopfzeile, rechts aussen.

         Zugeklappt braucht er dann keine eigene Zeile mehr - er teilt
         sie sich mit „Identifiziert als …“, wo ohnehin Platz frei ist.
         Das Zeichen steht rechts vom Text, weil es dort am Rand des
         Kastens liegt und der Blick beim Lesen dorthin laeuft. Der Leib
         klappt weiterhin unter der Kopfzeile auf; dort hat er die volle
         Breite, die eine Liste braucht. */
      var warumKopf = null, warumLeib = null;
      if (gruende.length || weggelassen.length) {
        warumKopf = el('div', 'wkopf');
        /* Ohne Vorlage waere „Warum diese Vorlage" die falsche Frage —
           dann steht hier, warum keine greift. */
        warumKopf.appendChild(el('span', null, weggelassen.length
          ? tr('tpl.skippedHead', weggelassen.length)
          : tr(e.vorschlag ? 'tpl.whyThis' : 'tpl.whyNone')));
        warumKopf.appendChild(klappZeichen(warumAuf));
        warumKopf.tabIndex = 0;
        var um2 = function () { warumAuf = !warumAuf; zeichneErgebnis(); };
        warumKopf.addEventListener('click', um2);
        warumKopf.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); um2(); }
        });

        if (warumAuf) {
          warumLeib = el('div', 'wleib');
          if (weggelassen.length) {
            var ul2 = el('ul');
            weggelassen.forEach(function (u) { ul2.appendChild(el('li', null, u)); });
            warumLeib.appendChild(ul2);
          }
          if (gruende.length) {
            if (weggelassen.length) { warumLeib.appendChild(el('div', 'wtrenn', tr(e.vorschlag ? 'tpl.whyThis' : 'tpl.whyNone'))); }
            var ul3 = el('ul');
            gruende.forEach(function (g2) { if (g2) { ul3.appendChild(el('li', null, g2)); } });
            warumLeib.appendChild(ul3);
          }
        }
      }
      if (e.erzwungen) {
        var ezc = el('span', 'chip warn', tr('tpl.forced'));
        ezc.style.marginLeft = '7px';
        ezc.title = tr('tpl.forcedHint');
        hd.appendChild(ezc);
      }
      /* Zuletzt, damit die Marken davor stehen und das Zeichen ganz
         rechts landet. */
      if (warumKopf) { hd.appendChild(warumKopf); }
      if (warumLeib) {
        var wk = el('div', 'warum auf');
        wk.appendChild(warumLeib);
        sg.appendChild(wk);
      }
      var acts = el('div', 'acts');

      /* Mehrere Ausgaenge: je Ausgang ein eigenes Geraet, weil ein socket
         genau ein SET hat. Hier wird gewaehlt, welcher gerade bearbeitet wird. */
      var ausgangFeld = null;
      if (e.instanzen && e.instanzen.length > 1) {
        var la = el('label', 'feld');
        la.appendChild(el('span', 'feldlabel', tr('tpl.output')));
        var selA = el('select', 'tx');
        e.instanzen.forEach(function (n) {
          var o = opt(n, ausgangName(e, n));
          if (String(n) === String(e.instanz)) { o.selected = true; }
          selA.appendChild(o);
        });
        selA.addEventListener('change', function () {
          var v2 = vorschlag(S.current, e.vorlage, selA.value);
          if (v2) {
            v2.zielOrdner = e.zielOrdner;
            v2.zielName = ausgangName(v2, selA.value);
            v2.ziel = v2.zielOrdner + '.' + v2.zielName;
            S.entwurf = v2; S.openRow = null; zeichneErgebnis();
          }
        });
        la.appendChild(selA);
        ausgangFeld = la;
      }

      /* Vorlagenwahl: alle geladenen, mit Vermerk ob sie passen. */
      var lv = el('label', 'feld');
      lv.appendChild(el('span', 'feldlabel', tr('tpl.label')));

      /* Aussehen kommt aus werkbank.css (.suggestbox .acts select.tx) -
         die Inline-Stile hier machten das Vorlagenfeld zum Einzelgaenger:
         das Ausgangsfeld daneben blieb ungestylt in der Browserschrift. */
      var selV = el('select', 'tx');

      selV.appendChild(opt('', e.vorschlag ? tr('tpl.switch') : tr('tpl.choose')));
      S.VORLAGEN.forEach(function (v) {
        var t = pruefeVorlage(v, S.current);
        /* Auch nicht passende bleiben waehlbar — mit Grund daneben. Sonst
           steht man bei einem Geraet, das noch nichts gesendet hat, ohne
           jede Moeglichkeit da. */
        var o = opt(v.id, (v._quelle === 'benutzer' ? '★ ' : '') +
          sprachtext(v.name) + '  v' + v.version + '   ' +
          (t.passt ? tr('tpl.fits') : tr('tpl.fitsNot', t.fehler.join(', '))));
        if (v.id === e.vorlage) { o.selected = true; }
        selV.appendChild(o);
      });
      selV.addEventListener('change', function () {
        if (!selV.value) { return; }
        var v = vorschlag(S.current, selV.value);
        if (v) {
          v.ziel = e.ziel;
          S.entwurf = v;
          S.openRow = null;
          zeichneErgebnis();
          return;
        }
        /* Kommt kein Entwurf zurueck, bleibt die alte Vorlage in Kraft — das
           Feld darf dann nicht die neue anzeigen. Bis 06.09.2026 fehlte
           dieser Zweig: Der Wechsel scheiterte still, und wer das Feld las,
           glaubte, die Vorlage sei gewechselt (Ricardo). Seit derselben
           Aenderung entsteht ein Entwurf auch ohne jeden Treffer, der Fall
           ist also selten geworden — aber nicht unmoeglich. */
        selV.value = e.vorlage || '';
        zeichneErgebnis();
      });
      lv.appendChild(selV);
      acts.appendChild(lv);

      var bRoh = el('button', 'btn schmal',
        e.roh ? tr('tpl.showProposal') : tr('tpl.showAllPoints'));
      /* Der Knopf verlaesst den Vorschlag der Vorlage und zeigt den ganzen
         Bestand des Geraets — nicht zu verwechseln mit dem Filter darunter,
         der nur die vorgeschlagenen Zeilen ein- und ausblendet. Deshalb
         steht das Geraet im Namen und der Rest im Hinweis. */
      bRoh.title = e.roh ? tr('tpl.showProposalHelp') : tr('tpl.showAllPointsHelp');
      if (!e.vorschlag) { bRoh.disabled = true; }
      bRoh.addEventListener('click', function () {
        var rohJetzt = !e.roh;
        /* Dieselben zwei Schritte wie in `waehle`: die Vorlage, aus der der
           Alias entstanden ist, bleibt festgenagelt, und was im Alias steht,
           gilt. Ohne sie sprang die Liste beim Umschalten auf die
           Vorlagenwerte zurueck - ACTUAL von `sensor.door` (so steht es im
           Alias) auf `sensor.window` (so will es die Vorlage) -, der
           Vermerk „Vorlage: …" verschwand, und der naechste Trockenlauf
           meldete „3 aendern sich" und haette es geschrieben, ohne dass
           jemand „Werte der Vorlage uebernehmen" gedrueckt hatte. Genau die
           stille Aenderung, die der Bestandsvorrang abschaffen sollte
           (26.08.2026). */
        var fest = null;
        var vorh = aliasFuer(S.current);
        if (vorh && S.objects[vorh] && S.objects[vorh].native &&
            S.objects[vorh].native.vorlage) {
          var gid = S.objects[vorh].native.vorlage;
          if (S.VORLAGEN.some(function (x) { return x.id === gid; })) { fest = gid; }
        }
        var neuE = rohJetzt ? alleUndVorlage(S.current, fest)
                            : vorschlag(S.current, fest);
        if (!neuE) { return; }
        neuE.roh = rohJetzt;
        neuE.vorschlag = true;
        neuE.tplName = e.tplName; neuE.grund = e.grund; neuE.ziel = e.ziel;
        if (fest) { neuE.vonHandGewaehlt = false; neuE.ausBestand = true; }
        if (vorh && S.objects[vorh]) { bestandVorrang(neuE, vorh); }
        S.entwurf = neuE; S.openRow = null; zeichneErgebnis();
      });
      /* An der Quelle bleibt die Musterwahl im Vorlagenkasten, wo sie
         hingehoert: dort steht daneben, welche Vorlage gegriffen hat, und
         beides zusammen ist die Erkennung. Nur im Aliasmodus gibt es
         diesen Kasten nicht - dann wandert sie weiter unten in die Leiste
         ueber der Liste. */
      acts.appendChild(musterBlock);
      musterBlock = null;
      if (ausgangFeld) { acts.appendChild(ausgangFeld); }
      acts.appendChild(el('span', 'luecke'));
      var knoepfe = el('div', 'knoepfe');
      /* Gilt der Bestand (weil es den Alias schon gibt) und will die
         Vorlage etwas anderes, steht hier der Weg dorthin - als bewusster
         Klick, nicht als stille Aenderung (Ricardo, 25.08.2026). */
      if (e.bestandGilt) {
        var anders = e.states.filter(function (s0) {
          return s0.on && vorlagenAbweichung(s0).length;
        }).length;
        if (anders) {
          var bTpl = el('button', 'btn mini wichtig', tr('tpl.applyTemplate', anders));
          bTpl.title = tr('tpl.applyTemplateHint');
          bTpl.addEventListener('click', function () {
            vorlageAnwenden(e);
            S.openRow = null;
            zeichneErgebnis();
          });
          knoepfe.appendChild(bTpl);
        }
      }
      knoepfe.appendChild(bRoh);
      acts.appendChild(knoepfe);
      sg.appendChild(acts);
      host.appendChild(sg);
    }
    /* Ohne Vorlagenkasten — etwa bei einem fertigen Alias — bleibt die
       Musterwahl oben im Kopf stehen. */
    if (musterBlock) {
      head.appendChild(musterBlock);
    }
    return musterBlock;
  }

  /* Punkte, die im gewaehlten Muster keinen Platz haben, aber als
     Messwerte durchgehen. */
  function baueInfoKarte(host, e, infoNamen) {
    if (infoNamen.length) {
      var ic = el('div', 'card infod');
      var ich = el('div', 'ch');
      /* Hier stand „info" und „zaehlt der Detektor separat". Beides sind
         unsere Woerter: „info" ist der interne Name des Sammeltyps, und
         wer den Detektor nicht kennt, weiss nach dem Satz weniger als
         vorher. Jetzt steht da, worum es geht - und der Zusatz sagt
         gleich, ob man handeln muss. */
      ich.appendChild(el('span', 'typ', tr('info.notPartOf', e.want || '')));
      ich.appendChild(el('span', 'chip mut', tr('info.countedSeparately')));
      ic.appendChild(ich);
      var ie = el('div', 'infoerkl');
      ie.style.padding = '10px 15px 12px';
      ie.style.fontSize = '11.5px';
      ie.style.color = 'var(--ink-3)';
      ie.style.lineHeight = '1.6';
      ie.appendChild(el('b', null, tr('info.sameDatapoints', infoNamen.join(', '))));
      ie.appendChild(document.createTextNode(tr('info.explain', e.want || '')));
      ic.appendChild(ie);
      host.appendChild(ic);
    }
  }

  /* Was sich gegenueber dem gespeicherten Stand aendern wuerde. */
  function baueDiffKarte(host, e) {
    var diff = unterschiede(e);
    if (diff.length) {
      var dc = el('div', 'card');
      var dch = el('div', 'ch');
      var gibtsSchon = !!S.objects[e.ziel || e.kanal];
      dch.appendChild(el('span', 'typ', gibtsSchon ? tr('diff.changes') : tr('diff.deviations')));
      dch.appendChild(el('span', 'chip warn', gibtsSchon ? tr('diff.open', diff.length) : tr('diff.points', diff.length)));
      dch.appendChild(el('span', 'chip mut', gibtsSchon ? tr('diff.againstStored') : tr('diff.nothingExists')));
      dc.appendChild(dch);
      diff.forEach(function (z) {
        var r = el('div', 'slot');
        /* Der Name bekommt so viel Platz, wie er braucht, und der Text
           steht danach immer an derselben Stelle. Vorher waren es feste
           150 px: ein langer Name wie 1_VALVE_STATE_ERROR_POSITION lief
           darueber und schob sich in den Text daneben. */
        r.style.gridTemplateColumns = '15px minmax(0, max-content) 1fr';
        r.style.columnGap = '14px';
        r.appendChild(el('span', 'mk', '•'));
        r.appendChild(el('span', 'sn', z.n));
        r.appendChild(el('span', 'who', z.was));
        dc.appendChild(r);
      });
      host.appendChild(dc);
    }
  }

  /* Pruefungen, Fusszeile und die Knopfleiste unten - beschriftet
     nach dem, was der Klick tatsaechlich tut. */
  function setzeKnoepfe(e, haupt, pflichtFehlt, _infoNamen) {
    baueChecks(e, haupt, pflichtFehlt);

    /* Der Knopf soll sagen, was er tut — nicht, wie er es tut. */
    var zielId2 = e.ziel || e.kanal;
    var bd = $('#btn-dry');
    var ba = $('#btn-dry-alle');
    var mehr = e.instanzen && e.instanzen.length > 1;
    var mehrK = !mehr && (e.kanalGeraete || []).length > 1;
    /* Die Knoepfe gehoeren zum Modus, nicht nur zum Objekt: Im Modus
       „Alias anlegen" wird angelegt, nicht verwaltet — Verlegen, Quelle
       tauschen und Entfernen haben dort nichts zu suchen. Im Modus
       „Alias bearbeiten" wird bearbeitet, keine Vorlage gebaut
       (Ricardo, 05.09.2026). */
    var imAliasmodus = S.baumModus === 'aliase';
    var bTpl = $('#btn-tpl');
    if (bTpl) { bTpl.hidden = imAliasmodus; }
    tplKnopf(true);
    /* Siehe zielleiste: der Alias kann ohne eigenes Kanalobjekt bestehen. */
    var zielDa = knotenDa(zielId2);
    delKnopf(imAliasmodus && zielDa && zielId2.indexOf('alias.') === 0);
    if (bd) {
      bd.disabled = false;
      /* Bei mehreren Ausgaengen den Ausgang beim Namen nennen — „für den
         ausgewählten Ausgang" waere lang und sagt weniger. */
      bd.textContent = mehr
        ? (zielDa ? tr('write.updateNamed', e.zielName) : tr('write.createNamed', e.zielName))
        : mehrK
          ? (zielDa ? tr('write.updateAsOne') : tr('write.createAsOne'))
          : (zielDa ? tr('write.updateAlias') : tr('write.createAlias'));
      bd.title = zielId2;
    }
    if (ba) {
      ba.hidden = !mehr && !mehrK;
      if (mehr) {
        ba.textContent = tr('write.createAll', e.instanzen.length);
        ba.title = e.instanzen.map(function (n) {
          return (e.zielOrdner || '') + '.' + ausgangName(e, n);
        }).join(String.fromCharCode(10));
      } else if (mehrK) {
        ba.textContent = tr('write.createPerChannel', e.kanalGeraete.length);
        /* Im Hinweis stehen die Namen, die entstehen wuerden — sonst
           klickt man auf eine Zahl und weiss nicht, was danach dasteht. */
        ba.title = e.kanalGeraete.map(function (k) {
          return (e.zielOrdner || '') + '.' + k.name + '   (' + k.typ + ')';
        }).join(String.fromCharCode(10));
      }
      ba.disabled = false;
    }

    /* Offene Vermutungen sperren Erzeugen und Vorlage-Speichern:
       „bitte pruefen" soll eine echte Entscheidung sein, kein stilles
       Ja beim Anlegen (Ricardo, 25.08.2026). Der Grund steht daneben,
       sonst raetselt man, warum der Knopf grau ist. */
    var offen = rateAnzahl(e);
    var sg = $('#sperrgrund');
    if (offen) {
      var grund = tr('guess.locked', offen);
      if (bd) { bd.disabled = true; bd.title = grund; }
      if (ba && !ba.hidden) { ba.disabled = true; ba.title = grund; }
      var bt = $('#btn-tpl');
      if (bt) { bt.disabled = true; bt.title = grund; }
      if (sg) { sg.hidden = false; sg.textContent = grund; }
    } else if (sg) {
      sg.hidden = true;
      sg.textContent = '';
    }
  }

  export function zeichneErgebnis() {
    /* Wandert weiter unten in die Leiste ueber der Zustandsliste. */
    var rateKnopf = null;
    var host = $('#res');
    host.textContent = '';
    /* Der Sperrgrund gehoert zum Entwurf — beim Wechsel auf Leer- oder
       Vorlagenansicht wuerde er sonst stehen bleiben. */
    var sg0 = $('#sperrgrund');
    if (sg0) { sg0.hidden = true; sg0.textContent = ''; }
    if (S.baumModus === 'vorlagen') { return zeichneVorlagenBlatt(host); }
    var bck = $('#btn-checks');
    if (bck) { bck.disabled = false; }
    if (!S.current || !S.entwurf) { return zeichneLeer(host); }

    var e = S.entwurf;

    /* Ist das ueberhaupt ein Geraet? Ein Ordner mit vielen Geraeten darunter
       ergibt keinen Entwurf, sondern eine Uebersicht. Vorher landeten beim
       Klick auf mqtt-client.0 alle Messpunkte in einem einzigen Entwurf. */
    /* Sehr viele Punkte heisst fast immer: falscher Knoten gewaehlt.
       Nicht sperren, aber auch nicht ungefragt 1000 Zeilen zeichnen. */
    var VIEL = 40;
    /* Ein `device` ist die Ebene, auf der das Geraet gemeint ist — auch
       wenn viele Punkte darunter haengen. Ohne diese Ausnahme landete
       jedes Homematic-Geraet in der Uebersicht „2 Geraete darunter" und
       liess sich nur kanalweise bearbeiten. */
    var istGeraetObjekt = !!(S.objects[S.current] && S.objects[S.current].type === 'device');
    if (!e.vorschlag && !istGeraetObjekt && e.states.length > VIEL && !e.trotzdem) {
      return zeichneZuViel(host, e);
    }

    /* --- erkannt (frei) und erzwungen --- */
    var haupt = ermittleErkennung(e);

    var head = baueKopf();

    /* --- Musterwahl --- */
    var pflichtFehlt = haupt ? haupt.states.filter(function (s) { return s.required && !s.id; }) : [];
    var mw = baueMusterwahl(e, haupt, pflichtFehlt);
    rateKnopf = mw.rateKnopf;
    var musterBlock = mw.block;   /* wandert unten in den Vorlagenkasten */
    host.appendChild(head);

    var istQuelle = baueZielleiste(host, e);

    musterBlock = baueVorlagenkasten(host, head, e, istQuelle, musterBlock);

    /* Gleich unter die Erkennung: was hier fehlt, entscheidet mit
       darueber, ob eine Vorlage ueberhaupt greift. */
    mqttKarte(host, S.current);

    if (!S.objects[S.current]) {
      /* Hier stand eine Erklaerung, dass MQTT fuer Zwischenebenen keine
         Objekte anlegt. Sie ist richtig, half aber niemandem: kein
         Risiko, keine Handlung, nichts anders zu machen. Und sie
         widersprach dem Erkennungskasten drei Zeilen darueber, der
         gleichzeitig „Identifiziert als: Tasmota-Steckdose" meldete.
         Wer nichts damit anfangen kann, soll es auch nicht lesen
         muessen — das Wissen steht im README, nicht in der Oberflaeche. */
    }

    var pl = berechnePlaetze(e, haupt);
    var imInfo = pl.imInfo;

    baueListe(host, e, pl, rateKnopf, musterBlock);
    rateKnopf = null;
    musterBlock = null;

    /* --- info-Karte --- */
    var infoNamen = Object.keys(imInfo);
    baueInfoKarte(host, e, infoNamen);

    /* --- Änderungen gegenüber dem, was gespeichert ist --- */
    baueDiffKarte(host, e);

    /* --- Prüfungen, Fusszeile, Knopfleiste --- */
    setzeKnoepfe(e, haupt, pflichtFehlt, infoNamen);
  }

  /* Uebersicht ueber alle Geraete unterhalb eines Ordners. */
  function zeichneOrdner(host, wurzel) {
    var geraete = geraeteDarunter(wurzel);

    var head = el('div', 'rhead');
    var links = el('div');
    var ordnerName = zusatzName(wurzel);
    links.appendChild(el('div', 'id', ordnerName || wurzel.split('.').pop()));
    links.appendChild(el('div', 'pfad', wurzel));
    links.appendChild(el('div', 'sub',
      tr('folder.devicesBelow', geraete.length, kindZustaende(wurzel).length)));
    head.appendChild(links);
    host.appendChild(head);

    if (!geraete.length) {
      host.appendChild(el('div', 'empty', tr('folder.nothingHere')));
      $('#btn-dry').disabled = true;
      tplKnopf(false);
      return;
    }

    var mitAlias = 0, ohneVorlage = 0;
    var card = el('div', 'card');
    var ch = el('div', 'ch');
    ch.appendChild(el('span', 'typ', tr('folder.devices')));
    var zaehler = el('span', 'chip mut', tr('folder.found', geraete.length));
    ch.appendChild(zaehler);
    card.appendChild(ch);

    var cap = el('div', 'lhead');
    cap.style.gridTemplateColumns = '1fr 190px 130px 12px';
    [tr('folder.colSource'), tr('folder.colDetected'), tr('folder.colAlias'), ''].forEach(function (t) { cap.appendChild(el('span', null, t)); });
    card.appendChild(cap);

    geraete.forEach(function (g) {
      var vorhanden = aliasFuer(g.id);
      if (vorhanden) { mitAlias++; }
      if (!g.vorlage) { ohneVorlage++; }

      var row = el('div', 'erow');
      row.style.gridTemplateColumns = '1fr 190px 130px 12px';
      row.tabIndex = 0;

      /* Ohne den Namen heissen die Kanaele eines Homematic-Geraets hier
         schlicht „0" und „1". */
      var gName = zusatzName(g.id);
      var nm = el('span', 'nm3', g.id.slice(wurzel.length + 1));
      if (gName) {
        nm.appendChild(el('span', 'nam', gName));
        nm.title = g.id + '  ·  ' + gName;
      }
      row.appendChild(nm);

      var vl = el('span', 'ro2');
      if (g.vorlage) { vl.textContent = sprachtext(g.vorlage.name); }
      else { vl.textContent = tr('tpl.none'); vl.style.color = 'var(--warn)'; }
      row.appendChild(vl);

      var al = el('span');
      al.style.textAlign = 'right';
      al.appendChild(el('span', 'chip ' + (vorhanden ? 'ok' : 'mut'), vorhanden ? tr('folder.aliasThere') : tr('folder.aliasMissing')));
      row.appendChild(al);
      row.appendChild(el('span', 'ca2', '›'));

      var geh = function () { mitNachfrage(g.id); };
      row.addEventListener('click', geh);
      row.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); geh(); }
      });
      card.appendChild(row);
    });

    ch.appendChild(el('span', 'chip ' + (mitAlias === geraete.length ? 'ok' : 'warn'),
      tr('folder.withAlias', mitAlias)));
    if (ohneVorlage) { ch.appendChild(el('span', 'chip warn', tr('folder.withoutTemplate', ohneVorlage))); }
    host.appendChild(card);

    var hin = el('div', 'aside');
    hin.appendChild(el('b', null, tr('folder.clickHint')));
    hin.appendChild(document.createTextNode(tr('folder.clickHintText')));
    host.appendChild(hin);

    var bd = $('#btn-dry');
    if (bd) { bd.disabled = true; bd.textContent = tr('write.createAlias'); bd.title = tr('write.pickDeviceFirst'); }
    tplKnopf(false);
    var chip = $('#checkchip');
    if (chip) { chip.className = 'chip mut'; chip.textContent = ''; }
  }

  /* Gibt es den Alias schon, sollen seine Punkte angehakt sein.

     Vorher kamen die Haken allein aus der Vorlage. Wer ein fertiges
     Geraet aufmachte, sah den Vorschlag fuer ein neues — und ein Punkt,
     den er sich damals von Hand dazugeholt hatte, stand ungehakt da.
     Ein Klick auf „Alias aktualisieren" haette ihn entfernt. Der
     Trockenlauf haette es gezeigt, aber darauf darf man sich nicht
     verlassen.

     Vereinigung statt Ersetzung: angehakt wird, was im Alias steht
     ODER was die Vorlage vorschlaegt. In die gefaehrliche Richtung —
     etwas verlieren — kann damit nichts mehr passieren, und ein
     Vorschlag aus einer neueren Vorlage geht trotzdem nicht verloren.
     Was dadurch dazukommt, meldet die Aenderungs-Karte. */
  /* Wohin der Alias gehoert. Muss feststehen, bevor die Kopfzeile
     gezeichnet wird — sonst meldet die „wird neu angelegt", waehrend die
     Zielzeile darunter schon „gibt es schon" sagt. */
  /* ================== Dialoge ================== */
  /* Die <dialog>-Blöcke stehen im HTML hinter diesem Skript. Zur Laufzeit
     des Skripts gibt es sie noch nicht — erst nach DOMContentLoaded
     verkabeln, sonst wirft der erste Zugriff und alles danach fällt aus. */
  function verkabeleDialoge() {
    var bc = $('#btn-checks'), bd = $('#btn-dry'), bw = $('#btn-dry-write');
    if (bc) { bc.addEventListener('click', function () { $('#dlg-checks').showModal(); }); }
    if (bd) { bd.addEventListener('click', function () { zeigeTrockenlauf(false); }); }
    var ba2 = $('#btn-dry-alle');
    if (ba2) { ba2.addEventListener('click', function () { zeigeTrockenlauf(true); }); }
    if (bw) { bw.addEventListener('click', schreibeObjekte); }
    var bdel = $('#btn-del'), bdg = $('#btn-del-go');
    if (bdel) { bdel.addEventListener('click', zeigeLoeschen); }
    if (bdg) { bdg.addEventListener('click', loescheAlias); }
    var bmq = $('#btn-mqtt-write');
    if (bmq) { bmq.addEventListener('click', mqttSchreiben); }
    var bt = $('#btn-tpl'), bts = $('#btn-tpl-save');
    if (bt) { bt.addEventListener('click', zeigeVorlagenDialog); }
    if (bts) { bts.addEventListener('click', speichereVorlageAusDialog); }
    document.querySelectorAll('dialog [data-close]').forEach(function (b) {
      b.addEventListener('click', function () { b.closest('dialog').close(); });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', verkabeleDialoge);
  } else {
    verkabeleDialoge();
  }
