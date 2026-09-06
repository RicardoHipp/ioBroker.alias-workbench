/* Die Zielleiste: wohin der Alias kommt - Ordnerfeld mit eigener
   Vorschlagsliste, Namensfeld, der fertige Pfad und das Angebot, den
   getippten Ordner als Raum zu uebernehmen. An einem fertigen Alias
   bleibt davon nur die Raum/Funktion-Zeile.

   Herausgeloest aus zeichneErgebnis - der Block hing nur an `e` und an
   `host`, sonst an nichts. */

import { S } from './zustand.js';
import { el } from './basis.js';
import { tr } from './sprache.js';
import { enumListe } from './aufzaehlungen.js';
import { enumZeile, setzeZiel } from './zuordnung.js';
import { aliasFuer, ordnerUnterAlias, kennungtauglich } from './entwurf.js';
import { zeichneErgebnis, entwurfAngefasst, angebotFrisch } from './ergebnis.js';
import { zeigeVerlegen } from './schreiben.js';

export function baueZielleiste(host, e) {
  var istQuelle = S.current.indexOf('alias.') !== 0;
  if (!istQuelle && S.objects[S.current]) {
    /* Am fertigen Alias gibt es kein Ziel zu waehlen — er liegt schon da.
       Raum und Funktion lassen sich aber weiter aendern. */
    enumZeile(host, e);
  }
  if (istQuelle) {
    setzeZiel(e);

    /* Raum und Funktion stehen ueber dem Ziel, nicht darunter.

       Der Ordner entsteht aus dem Raum - eine Seite, auf der die Ursache
       unter der Wirkung steht, liest sich falsch. Und inhaltlich ist es
       die richtige Ordnung: erst wozu das Geraet gehoert, dann wo die
       Kennung liegt. Die Zeile mit dem fertigen Pfad und „wird neu
       angelegt“ bleibt unten - das Letzte vor dem Trockenlauf ist damit
       das, was tatsaechlich entsteht.

       `enumZeile` ruft `setzeEnums` selbst auf. */
    enumZeile(host, e);

    var zb = el('div', 'zielbar');
    zb.appendChild(el('span', 'zl', tr('target.folder')));

    /* Eingabefeld mit selbst gezeichneter Vorschlagsliste. Kein
       <datalist>: dessen Auswahlfenster malt das Betriebssystem, und in
       eingebetteten Ansichten landet es neben dem Fenster. */
    var wrap = el('div', 'feldwrap');
    var iO = el('input', 'tx ordnerfeld');
    iO.type = 'text';
    iO.setAttribute('autocomplete', 'off');
    iO.placeholder = tr('target.folderPlaceholder');
    iO.value = (e.zielOrdner === 'alias.0') ? '' : e.zielOrdner.slice('alias.0.'.length);
    iO.title = tr('target.folderHint');
    wrap.appendChild(iO);

    /* Kreuz zum Leeren — sonst muss man den Text markieren und loeschen. */
    var xBtn = el('button', 'feldx');
    xBtn.type = 'button';
    xBtn.title = tr('target.clearField');
    xBtn.setAttribute('aria-label', tr('target.clearField'));
    xBtn.hidden = !iO.value;
    xBtn.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      iO.value = '';
      S.fokusOrdnerfeld = true;
      e.zielOrdner = 'alias.0';
      e.ordnerVonHand = true;
      e.zuletzt = 'ordner';
      entwurfAngefasst();
      zeichneErgebnis();
    });
    wrap.appendChild(xBtn);

    var vlist = el('div', 'vorschlaege');
    vlist.hidden = true;
    wrap.appendChild(vlist);
    zb.appendChild(wrap);

    var saeubern = function (t) {
      return String(t).trim()
        .replace(/[^\w.\- äöüÄÖÜß]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/\.{2,}/g, '.')
        .replace(/^\.+|\.+$/g, '');
    };
    var uebernehmen = function () {
      var t = saeubern(iO.value);
      var neuerOrdner = t ? ('alias.0.' + t) : 'alias.0';
      if (neuerOrdner === e.zielOrdner) { return; }
      e.zielOrdner = neuerOrdner;
      /* Ab jetzt gehoert der Ordner dem Nutzer - der Raum schreibt ihn
         nicht mehr um. Angeboten wird die Uebernahme trotzdem, aber in
         der anderen Richtung: wer den Ordner aendert, will nicht, dass
         er gleich wieder zurueckspringt. */
      e.ordnerVonHand = true;
      e.zuletzt = 'ordner';
      entwurfAngefasst();
      /* Kurz warten, statt sofort neu zu zeichnen. Wer im Feld tippt und
         dann auf „anlegen" drueckt, loest mit dem Mausdruck erst das
         Verlassen des Feldes aus — zeichnet man da sofort neu, ist der
         Knopf weg, bevor der Klick bei ihm ankommt, und der erste Klick
         tut nichts. Gemessen an Kuehlschrank und Warmwasser. */
      setTimeout(zeichneErgebnis, 250);
    };

    var markiert = -1;
    var eintraege = [];
    /* Ob die Liste gerade eine Zurueck-Zeile fuehrt. Die steht im DOM
       vor den Eintraegen, zaehlt aber nicht zu ihnen - ohne diesen
       Versatz zeigten die Pfeiltasten auf die falsche Zeile. */
    var mitZurueck = false;

    var schliessen = function () { vlist.hidden = true; markiert = -1; };

    /* Nur die naechste Ebene anbieten: leer -> die obersten Ordner,
       nach „SmartHome." dessen Unterordner. Eine flache Liste aller
       Pfade wird bei vielen Ordnern unuebersichtlich. */
    function ordnerKinder(basis) {
      var alle = ordnerUnterAlias()
        .map(function (o) { return o.slice('alias.0.'.length); })
        .filter(Boolean);
      var tiefe = basis ? basis.split('.').length : 0;
      var raus = {};
      alle.forEach(function (o) {
        if (basis && o.indexOf(basis + '.') !== 0) { return; }
        var teile = o.split('.');
        if (teile.length <= tiefe) { return; }
        var pfad = teile.slice(0, tiefe + 1).join('.');
        if (!raus[pfad]) { raus[pfad] = { pfad: pfad, name: teile[tiefe], kinder: false }; }
        if (teile.length > tiefe + 1) { raus[pfad].kinder = true; }
      });
      return Object.keys(raus).sort().map(function (k) { return raus[k]; });
    }

    var malen = function (alleZeigen) {
      var t = iO.value;
      var i = t.lastIndexOf('.');
      var basis = (i > -1) ? t.slice(0, i) : '';
      var rest = alleZeigen ? '' : ((i > -1) ? t.slice(i + 1) : t).toLowerCase();

      eintraege = ordnerKinder(basis).filter(function (k) {
        return !rest || k.name.toLowerCase().indexOf(rest) > -1;
      });

      vlist.textContent = '';
      if (!eintraege.length) { schliessen(); return; }

      mitZurueck = !!basis;
      if (basis) {
        var zurueck = el('div', 'vz zurueck');
        zurueck.appendChild(el('span', null, '‹ ' + basis));
        zurueck.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          var j = basis.lastIndexOf('.');
          iO.value = (j > -1) ? basis.slice(0, j) + '.' : '';
          markiert = -1;
          malen(true);
        });
        vlist.appendChild(zurueck);
      }

      eintraege.forEach(function (k, n) {
        var z = el('div', 'vz' + (n === markiert ? ' an' : ''));
        z.appendChild(el('span', null, k.name));

        /* Der Klick waehlt, der Pfeil steigt hinein.

           Vorher tat ein Klick auf einen Ordner mit Unterordnern nur
           das Zweite: aus „Bastelzimmer" wurde „Bastelzimmer." und die
           Liste sprang eine Ebene tiefer. Bastelzimmer *selbst* liess
           sich damit gar nicht anklicken - man musste den Punkt von
           Hand wegloeschen. Und wer die Liste dann verliess, behielt
           ihn im Feld stehen.

           Jetzt trennen sich die beiden Dinge: die Zeile waehlt den
           Ordner, das Winkelzeichen daneben oeffnet ihn. */
        if (k.kinder) {
          var tiefer = el('span', 'tiefer', '›');
          tiefer.title = tr('target.openFolder', k.name);
          tiefer.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            iO.value = k.pfad + '.';
            markiert = -1;
            malen(true);
            iO.focus();
          });
          z.appendChild(tiefer);
        }

        /* mousedown statt click: sonst greift der Fokusverlust zuerst
           und die Liste ist weg, bevor der Klick ankommt. */
        z.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          iO.value = k.pfad;
          schliessen();
          uebernehmen();
        });
        vlist.appendChild(z);
      });
      vlist.hidden = false;
    };

    /* Beim Hineinklicken alles zeigen — sonst muesste man erst loeschen,
       um in einen anderen Ordner zu wechseln. */
    iO.addEventListener('focus', function () { malen(true); });
    iO.addEventListener('input', function () {
      markiert = -1;
      xBtn.hidden = !iO.value;
      malen();
    });
    iO.addEventListener('blur', function () {
      /* Wer beim Hineinsteigen abbricht, laesst einen Punkt am Ende
         stehen. `saeubern` wirft ihn beim Uebernehmen ohnehin weg - im
         Feld soll er dann auch nicht mehr stehen. */
      if (/\.$/.test(iO.value)) { iO.value = iO.value.replace(/\.+$/, ''); }
      /* Und was dann noch dasteht, gilt auch. `change` feuert nur nach
         einer Tastatureingabe - das Hineinsteigen setzt `iO.value` von
         Hand und loest keins aus. Wer also in „Bastelzimmer" hineinstieg
         und das Feld verliess, sah dort „Bastelzimmer" stehen, waehrend
         das Ziel darunter weiter auf „alias.0.Badezimmer.…" zeigte -
         geschrieben worden waere der alte Ordner (26.08.2026).
         `uebernehmen` steigt selbst aus, wenn sich nichts geaendert hat. */
      uebernehmen();
      setTimeout(schliessen, 120);
    });
    iO.addEventListener('change', uebernehmen);
    iO.addEventListener('keydown', function (ev) {
      /* Escape heisst „doch nicht" — die Liste zu machen reicht dafuer
         nicht, der getippte Text muss auch weg. Sonst steht er weiter im
         Feld und wird beim Verlassen uebernommen: Wer Escape drueckt und
         danebenklickt, legt den Alias unter einem Ordner an, den er
         gerade verworfen zu haben glaubte.

         Musterfeld (`musterwahl.js`, ruft mBeschriften) und
         Aufzaehlungsfeld (`zuordnung.js`, setzt ei.value zurueck) machen
         das laengst; hier und im Namensfeld daneben fehlte es
         (Ricardo, 06.09.2026). */
      if (ev.key === 'Escape') {
        iO.value = (e.zielOrdner === 'alias.0') ? '' : e.zielOrdner.slice('alias.0.'.length);
        xBtn.hidden = !iO.value;
        schliessen();
        iO.blur();
        return;
      }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (vlist.hidden) { malen(true); return; }
        ev.preventDefault();
        markiert += (ev.key === 'ArrowDown' ? 1 : -1);
        if (markiert < 0) { markiert = eintraege.length - 1; }
        if (markiert >= eintraege.length) { markiert = 0; }
        malen();
        var akt = vlist.children[markiert + (mitZurueck ? 1 : 0)];
        if (akt && akt.scrollIntoView) { akt.scrollIntoView({ block: 'nearest' }); }
        return;
      }
      /* Pfeil nach rechts steigt in den markierten Ordner - das
         Gegenstueck zum Winkelzeichen fuer die Maus. */
      if (ev.key === 'ArrowRight' && !vlist.hidden && markiert >= 0
          && eintraege[markiert] && eintraege[markiert].kinder) {
        ev.preventDefault();
        iO.value = eintraege[markiert].pfad + '.';
        markiert = -1;
        malen(true);
        return;
      }
      if (ev.key === 'Enter') {
        if (!vlist.hidden && markiert >= 0) {
          ev.preventDefault();
          /* `eintraege` fuehrt Objekte, keine Zeichenketten. Hier stand
             `iO.value = eintraege[markiert]` - im Feld landete
             „[object Object]". */
          iO.value = eintraege[markiert].pfad;
        }
        schliessen();
        uebernehmen();
      }
    });

    zb.appendChild(el('span', 'zl', tr('target.name')));
    var iN2 = el('input', 'tx');
    iN2.type = 'text';
    iN2.value = e.zielName;
    /* Dasselbe fuer den Namen. Hier gab es bisher gar keinen
       Tastenhandler — Escape tat nichts, der getippte Name blieb stehen
       und wurde beim Verlassen uebernommen (Ricardo, 06.09.2026). */
    iN2.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') { return; }
      iN2.value = e.zielName;
      iN2.blur();
    });
    iN2.addEventListener('change', function () {
      /* Dieselbe Regel wie im Vorschlag und im Verlege-Dialog. Die eigene
         Fassung hier liess Punkte und doppelte Unterstriche stehen - ein
         von Hand getippter Name wurde damit anders behandelt als ein
         vorgeschlagener (26.08.2026). */
      e.zielName = kennungtauglich(iN2.value) || S.current.split('.').pop();
      entwurfAngefasst();
      zeichneErgebnis();
    });
    zb.appendChild(iN2);

    var ergebnis = el('span', 'zid', e.zielOrdner + '.' + e.zielName);
    /* Beide Faelle, an einer Stelle. Vorher stand „wird neu angelegt"
       oben im Kopf und „gibt es schon" hier — zwei Formulierungen fuer
       dieselbe Auskunft, an zwei Orten. */
    var gibtsZiel = !!S.objects[e.ziel];
    var ch2 = el('span', 'chip ' + (gibtsZiel ? 'warn' : 'ok'),
      gibtsZiel ? tr('target.exists') : tr('result.newlyCreated'));
    ch2.style.marginLeft = '7px';
    ergebnis.appendChild(ch2);
    /* Das Angebot steht dort, wo gerade getippt wurde.

       Zuerst hing es unter der Zielzeile und bot immer dieselbe Richtung
       an - wer den Ordner geaendert hatte, bekam angeboten, ihn wieder
       zurueckzudrehen. Beides war falsch: die Richtung muss der letzten
       Aenderung folgen, und der Blick ist beim angefassten Feld, nicht
       beim anderen. Der Text nennt deshalb die Wirkung woanders. */
    var angebot = null;
    /* Frueher hing hier zusaetzlich `!aliasFuer(e.kanal)` - an einem
       Geraet, das schon einen Alias hat, kam die Frage also nie. Gedacht
       war das als „am fertigen Alias wird nicht mehr geraten"; in
       Wahrheit ist gerade das der Fall, in dem sie gebraucht wird: wer
       den Ordner eines vorhandenen Alias umschreibt, zieht um, und der
       Raum soll mit (Ricardo, 06.09.2026). */
    if (e.zuletzt === 'ordner') {
      var otx = String(e.zielOrdner || '').slice('alias.0.'.length);
      if (otx && otx.indexOf('.') === -1) {
        var vorhandenerRaum = enumListe('rooms', true).filter(function (r) {
          return r.name.toLowerCase() === otx.toLowerCase() ||
                 r.kurz.toLowerCase() === otx.toLowerCase();
        })[0];
        var raumId = vorhandenerRaum ? vorhandenerRaum.id : ('enum.rooms.' + otx);
        if (raumId !== e.raum) {
          var az = el('div', 'uebernahme' +
            (angebotFrisch('ordner:' + raumId) ? ' frisch' : ''));
          az.appendChild(el('span', 'zq', vorhandenerRaum
            ? tr('target.alsoRoom', otx)
            : tr('target.alsoRoomNew', otx)));
          var ab = el('button', 'btn mini wichtig', tr('target.yes'));
          ab.addEventListener('click', function () {
            e.raum = raumId;
            e.raumHer = 'hand';
            entwurfAngefasst();
            zeichneErgebnis();
          });
          az.appendChild(ab);
          angebot = az;
        }
      }
    }
    if (S.fokusOrdnerfeld) {
      S.fokusOrdnerfeld = false;
      setTimeout(function () { iO.focus(); }, 0);
    }

    /* Der Zwilling: es gibt schon einen Alias auf diese Quelle, und das
       Ziel zeigt woandershin.

       Die Werkbank weiss das in diesem Moment - `aliasFuer` liefert den
       alten Pfad -, sagte es aber nirgends. Am Chip stand nur „wird neu
       angelegt", was stimmt und die Haelfte verschweigt: der alte bleibt
       stehen, und aus einem Umbenennen des Ordners wird lautlos ein
       zweiter Alias auf dieselbe Quelle (Ricardo, 06.09.2026, am
       Bastelzimmer_Decklenlicht_RGB).

       Verboten wird nichts. Zwei Aliase auf eine Quelle sind ein
       ordentlicher Fall - einer fuers Licht, einer fuer den Verbrauch;
       „alle anlegen" tut bei mehreren Ausgaengen nichts anderes. Es
       fehlte die Auskunft, nicht die Sperre. Wer wirklich einen zweiten
       will, drueckt denselben Knopf wie bisher und weiss jetzt, was er
       tut; wer umziehen wollte, hat den Weg dafuer daneben.

       Ohne Rueckprobe ueber `quelleVon`: an einem Homematic-Kanal
       (…B8AF.0) zeigt die Quelle des Alias auf das Geraet (…B8AF), die
       Probe schluege fehl und der Hinweis bliebe genau dort aus, wo er
       gebraucht wird. `aliasFuer` ist dieselbe Funktion, mit der die
       Werkbank auch „zum Alias →" und ihre Zielvorschlaege bestimmt -
       irrt sie hier, irrt sie dort ebenso. Und der Hinweis haelt
       niemanden auf. */
    var zwilling = null;
    var vorhAlias = aliasFuer(e.kanal);
    if (vorhAlias && S.objects[vorhAlias] && vorhAlias !== e.ziel) {
      var zw = el('div', 'uebernahme zwilling');
      zw.appendChild(el('span', 'zq', tr('target.twinExists', vorhAlias)));
      var vb = el('button', 'btn mini', tr('target.moveInstead'));
      vb.title = tr('target.moveInsteadHint');
      vb.addEventListener('click', function () { zeigeVerlegen(vorhAlias, e.ziel); });
      zw.appendChild(vb);
      zwilling = zw;
    }

    /* Das Angebot ganz ans Ende der Leiste.

       Zuerst hing es direkt hinter dem Ordnerfeld - und weil es eine
       eigene Zeile beansprucht, rutschte alles Nachfolgende mit: das
       Namensfeld stand ploetzlich darunter statt daneben. Eine Zeile,
       die umbricht, gehoert hinter das, was in der Zeile bleiben soll. */
    if (angebot) { zb.appendChild(angebot); }
    if (zwilling) { zb.appendChild(zwilling); }

    zb.appendChild(ergebnis);

    host.appendChild(zb);
  }

  return istQuelle;
}
