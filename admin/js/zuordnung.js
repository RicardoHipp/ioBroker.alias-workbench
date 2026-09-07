/* Raum, Funktion und Ziel am Entwurf: die Felderzeile, was sich an den
   Aufzaehlungen aendert, und was der Bestand dem Vorschlag voraus hat. */

import { S } from './zustand.js';
import { el } from './basis.js';
import { tr, txt } from './sprache.js';
import { enums } from './enums.js';
import {
  enumListe,
  enumsVon,
  neueEnum,
  raumVorschlag,
  funktionVorschlag
} from './aufzaehlungen.js';
import { enumVorlagen, katalogFehlt, ikonCache, ikonErlaubt, ikonNachtrag,
         ikonTaugt, vorlageZu, holeIkon } from './katalog.js';
import { kindZustaende, aliasQuellen, holeEinzelne } from './werte.js';
import { aliasFuer, zielId, knotenDa } from './entwurf.js';
import { zeichneErgebnis, entwurfAngefasst, angebotFrisch } from './ergebnis.js';


import { ausgangName } from './vorlagen.js';
import { musterVon } from './erkennung.js';

/* Welche Aufzaehlungen aendern sich, wenn dieser Entwurf geschrieben wird?

   Liefert je Aufzaehlung das fertige Objekt, so wie es hinterher aussehen
   soll. Damit kann der Trockenlauf es zeigen wie jedes andere Objekt auch,
   und geschrieben wird genau das, was dort stand.

   Wichtig: gelesen wird der *aktuelle* Stand und nur die eigene Kennung
   hinzugefuegt oder entfernt. Eine Aufzaehlung ist geteiltes Gut - in
   `enum.rooms.Bastelzimmer` stehen acht fremde Eintraege. Wer die Liste neu
   baut, statt sie zu ergaenzen, loescht anderer Leute Zuordnungen. */
export function enumAenderungen(e) {
  var raus = [];
  if (!e || !e.kanal) { return raus; }
  /* Im Aliasmodus gibt es kein gewaehltes Ziel — der Alias *ist* das Ziel.
     Eine frueher hier stehende Abfrage brach in genau diesem Fall ab, und
     eine im Aliasmodus geaenderte Zuordnung wurde stillschweigend nicht
     geschrieben. */
  var ziel = e.ziel || e.kanal;

  [['rooms', e.raum], ['functions', e.funktion]].forEach(function (paar) {
    var art = paar[0], gewaehlt = paar[1] || '';
    var betroffen = {};

    /* die, in denen das Ziel jetzt steht */
    enumsVon(ziel, art).forEach(function (id) { betroffen[id] = true; });
    /* und die gewaehlte */
    if (gewaehlt) { betroffen[gewaehlt] = true; }

    Object.keys(betroffen).forEach(function (id) {
      var o = enums[id];
      var mAlt = (o && o.common && o.common.members) ? o.common.members.slice() : [];
      var mNeu = mAlt.filter(function (x) {
        /* Nur die eigene Kennung anfassen: sie bleibt, wenn diese
           Aufzaehlung die gewaehlte ist, sonst faellt sie heraus. Alles
           andere ist fremdes Eigentum und wird nicht beruehrt. */
        if (x === ziel) { return id === gewaehlt; }
        return true;
      });
      if (id === gewaehlt && mNeu.indexOf(ziel) === -1) { mNeu.push(ziel); mNeu.sort(); }
      /* Sonst faellt das nachgetragene Bild durch: die Mitglieder
         aendern sich dabei ja nicht. */
      if (JSON.stringify(mAlt) === JSON.stringify(mNeu) && !ikonNachtrag(id, art, o)) { return; }

      var obj = o ? JSON.parse(JSON.stringify(o)) : neueEnum(id, art);
      obj.common = obj.common || {};
      obj.common.members = mNeu;

      /* Einer vorhandenen Aufzaehlung das fehlende Bild nachtragen.

         Neu angelegte bekommen ihres aus der Vorlage. Vorhandene nicht -
         bis hierher wurde nur die Mitgliederliste ergaenzt, und das Feld
         blieb, wie es war. Bei Ricardo heisst das: keine einzige seiner
         elf Funktionen und keiner seiner vierzehn Raeume hat je ein Bild
         bekommen, denn hm-rega spiegelt aus der CCU nur Namen und
         Mitglieder. Und die sieben Vorgaberaeume zeigen ein kaputtes
         Kaestchen, weil dort ein blosser Name steht.

         Angefasst wird nur, wo gar nichts Brauchbares steht. Ein Bild,
         das der Nutzer selbst gesetzt hat, bleibt unberuehrt. */
      var ikonDazu = false;
      if (o && ikonErlaubt(art, obj)) {
        var vv = vorlageZu(id, art, txt(obj.common.name));
        if (vv && vv.icon) {
          var ik = ikonCache[art + ':' + vv.icon];
          if (ik) { obj.common.icon = ik; ikonDazu = true; }
          /* Noch nicht da? Dann wenigstens jetzt holen, damit es beim
             naechsten Schreiben bereitsteht. */
          else { holeIkon(art, vv.icon); }
        }
      }
      delete obj.ts; delete obj.from; delete obj.user; delete obj.acl;
      raus.push({ id: id, neu: !o, obj: obj, istEnum: true, ikonDazu: ikonDazu,
                  dazu: mNeu.indexOf(ziel) > -1 && mAlt.indexOf(ziel) === -1,
                  weg: mAlt.indexOf(ziel) > -1 && mNeu.indexOf(ziel) === -1 });
    });
  });
  return raus;
}

/* Die Zeile mit Raum und Funktion.

   Steht sowohl an der Quelle als auch am fertigen Alias. An der Quelle
   gehoert sie unter das Ziel — dort entscheidet sich, wohin der Alias
   kommt und wozu er zaehlt. Am Alias ist sie der einzige Weg, die
   Zuordnung spaeter noch zu aendern; ohne sie waere die Sache eine
   Einbahnstrasse. */
export function enumZeile(host, e) {
  setzeEnums(e);

  /* Die Bilder der beiden gewaehlten Aufzaehlungen schon jetzt holen.

     Beim Klick auf eine Vorlagenzeile geschieht das ohnehin. Eine
     vorhandene Aufzaehlung stoesst aber niemand an - und genau die
     braucht das Bild, wenn ihr eines fehlt. Ohne diesen Anstoss traegt
     der erste Schreibvorgang nichts nach und erst der zweite tut es, was
     von aussen wie Zufall aussieht.

     `holeIkon` haelt sich selbst zurueck, wenn es laeuft oder das Bild
     vorliegt - hier entsteht kein wiederholtes Laden. */
  [['rooms', e.raum], ['functions', e.funktion]].forEach(function (paar) {
    var art = paar[0], id = paar[1];
    if (!id) { return; }
    var o = enums[id];
    if (o && !ikonErlaubt(art, o)) { return; }
    var v = vorlageZu(id, art, o ? txt(o.common && o.common.name) : '');
    if (v && v.icon) { holeIkon(art, v.icon, zeichneErgebnis); }
  });

  /* --- Raum und Funktion ---

     Eigene Zeile unter dem Ziel, weil beides zum Alias gehoert, aber
     woanders abgelegt wird: nicht am Objekt, sondern in einer
     Aufzaehlung. Aufbau wie das Ordnerfeld daneben - Eingabefeld mit
     eigener Liste, kein <select>, damit man tippen und suchen kann. */
  var ebar = el('div', 'zielbar enumbar');
  /* Das Angebot wird in der Schleife gebaut, aber erst danach angehaengt -
     sonst stuende es zwischen Raum und Funktion und schoebe das zweite
     Feld in die naechste Zeile. */
  var enumAngebot = null;
  [{ art: 'rooms', feld: 'raum', her: 'raumHer',
     label: tr('enums.room'), hint: tr('enums.roomHint') },
   { art: 'functions', feld: 'funktion', her: 'funktionHer',
     label: tr('enums.function'), hint: tr('enums.functionHint') }
  ].forEach(function (spec) {
    ebar.appendChild(el('span', 'zl', spec.label));
    var ew = el('div', 'feldwrap');
    var ei = el('input', 'tx enumfeld');
    ei.type = 'text';
    ei.setAttribute('autocomplete', 'off');
    ei.placeholder = tr('enums.placeholder');
    ei.title = spec.hint;

    var gew = e[spec.feld] || '';
    var nameVon = function (id) {
      if (!id) { return ''; }
      if (enums[id]) { return txt((enums[id].common || {}).name) || id.split('.').pop(); }
      /* Noch nicht angelegt: dann steht der Name in der Vorlage. Ohne
         das zeigte das Feld nach der Wahl von „Stehlampe“ die nackte
         Kennung „floor_lamp“ - der Nutzer sieht etwas anderes, als er
         angeklickt hat. */
      var kurz = id.split('.').pop(), gefunden = '';
      (enumVorlagen[spec.art] || []).forEach(function (v) {
        if (v._id === kurz) { gefunden = txt(v.name) || kurz; }
      });
      /* Und dass es sie noch nicht gibt, steht dahinter - im Feld, nicht
         als Marke am Zeilenende. Dort hing sie zuerst und rutschte durch
         den Umbruch unter das Raumfeld, wo sie aussah, als gehoere sie
         zum Raum. Was ueber ein Feld etwas aussagt, gehoert in das Feld.

         Zurueckgelesen wird der Feldinhalt nie: beim Hineinklicken leert
         er sich zum Tippen, beim Verlassen wird er neu aufgebaut. */
      return (gefunden || kurz) + '  (' + tr('enums.newSuffix') + ')';
    };
    ei.value = nameVon(gew);
    ew.appendChild(ei);

    /* Das Bild der gewaehlten Aufzaehlung - rechts NEBEN dem Feld, nicht
       darin. Dort steht es frei: zwischen Feldende und der naechsten
       Beschriftung liegen 54 px, hinter dem Funktionsfeld 91 px
       (gemessen 26.08.2026). Im Feld haette es Text verdraengt, und der
       ist knapper als der Platz daneben (Ricardo, 26.08.2026).

       Absolut zum Feldrahmen, damit das Raster unangetastet bleibt -
       sonst stuende die Zielzeile darunter nicht mehr buendig.

       Drei Lagen, und man sieht sie am Feld statt erst im Trockenlauf:

       - die Aufzaehlung hat schon ein taugliches Bild  -> es steht da
       - sie hat keins, die Werkbank wuerde eins nachtragen -> blass,
         und weil das eine Aussage ueber diese eine Aufzaehlung ist,
         mit einem kleinen „neu" daneben
       - sonst nichts: kein Bild im Katalog, oder der Schalter ist aus.
         Dann sieht das Feld aus wie frueher, und das ist die Wahrheit.

       Eine Aufzaehlung, die es noch gar nicht gibt, bekommt ihr Bild
       ohnehin aus der Vorlage (`neueEnum`) - dort steht das „neu" schon
       im Feldtext, also hier nur blass und ohne Wort. */
    var bild = '', blass = false, marke = false;
    if (gew) {
      var oIk = enums[gew];
      var daIk = oIk && oIk.common && oIk.common.icon;
      if (ikonTaugt(daIk)) {
        bild = daIk;
      } else if (oIk ? ikonErlaubt(spec.art, oIk) : true) {
        var vIk = vorlageZu(gew, spec.art,
          oIk ? txt(oIk.common && oIk.common.name) : '');
        var bIk = (vIk && vIk.icon) ? ikonCache[spec.art + ':' + vIk.icon] : null;
        if (bIk) { bild = bIk; blass = true; marke = !!oIk; }
      }
    }
    if (bild) {
      var iw = el('div', 'feldikon' + (blass ? ' blass' : ''));
      var img = document.createElement('img');
      img.src = bild;
      img.alt = '';
      iw.appendChild(img);
      if (marke) { iw.appendChild(el('span', 'ikneu', tr('enums.iconNewMark'))); }
      iw.title = blass ? tr('enums.iconNew') : tr('enums.iconThere');
      ew.appendChild(iw);
    }

    var ex = el('button', 'feldx');
    ex.type = 'button';
    ex.title = tr('enums.clear');
    ex.setAttribute('aria-label', tr('enums.clear'));
    ex.hidden = !ei.value;
    ex.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      e[spec.feld] = '';
      e[spec.her] = 'hand';
      entwurfAngefasst();
      zeichneErgebnis();
    });
    ew.appendChild(ex);

    var el2 = el('div', 'vorschlaege');
    el2.hidden = true;
    ew.appendChild(el2);
    ebar.appendChild(ew);

    /* Ist das ein Vorschlag oder steht es schon so im Bestand? Ohne
       diesen Unterschied sieht ein Vorschlag aus wie eine Tatsache.
       Die Marke bekommt im Raster die Spalte ihres Feldes zugewiesen -
       frei fliessend landete sie unter dem falschen Feld, und in den
       Feldrahmen gehaengt schob sie Kreuz und Aufklappliste aus der
       Position. */
    if (gew && e[spec.her] === 'vorschlag') {
      ebar.appendChild(el('span', 'chip mut vorschlagsmarke '
        + (spec.art === 'rooms' ? 'raum' : 'funktion'), tr('enums.suggested')));
    }


    /* Die Gegenrichtung, nach derselben Regel: wer den Raum geaendert
       hat, bekommt hier angeboten, den Ablageort nachzuziehen. Nur im
       Quellenmodus - am fertigen Alias gibt es kein Ziel zu waehlen. */
    if (spec.art === 'rooms' && e.zuletzt === 'raum' && e.ziel && !aliasFuer(e.kanal)) {
      var ro2 = enumAlsOrdner(e.raum);
      if (ro2 && e.zielOrdner !== 'alias.0.' + ro2) {
        var oz = el('div', 'uebernahme' +
          (angebotFrisch('raum:' + ro2) ? ' frisch' : ''));
        oz.appendChild(el('span', 'zq', tr('enums.alsoFolder', ro2)));
        var ob = el('button', 'btn mini wichtig', tr('target.yes'));
        ob.addEventListener('click', function () {
          e.zielOrdner = 'alias.0.' + ro2;
          e.ordnerVonHand = true;
          entwurfAngefasst();
          zeichneErgebnis();
        });
        oz.appendChild(ob);
        enumAngebot = oz;
      }
    }

    var mListe = [];
    var mMark = -1;
    var zu = function () { el2.hidden = true; mMark = -1; };

    var malen = function () {
      var such = String(ei.value || '').trim().toLowerCase();
      var alle = enumListe(spec.art);
      mListe = such
        ? alle.filter(function (x) {
            return x.name.toLowerCase().indexOf(such) > -1 ||
                   x.kurz.toLowerCase().indexOf(such) > -1; })
        : alle;
      el2.textContent = '';

      if (!mListe.length) {
        /* Was es nicht gibt, laesst sich anlegen - aber nur hier, im Feld
           selbst. Wer im Raumfeld steht und einen Namen tippt, will einen
           Raum; das ist eine Entscheidung, kein Nebeneffekt. Aus einem
           Ordnernamen entsteht dagegen nie von allein eine Aufzaehlung -
           sonst faenden sich bald „test“, „alt“ und „neu“ unter den
           Raeumen wieder.

           Der Name wird nur gesaeubert, wo er als Kennung nicht taugt:
           Punkte machten eine weitere Ebene auf. */
        var frei = String(ei.value || '').trim().replace(/\./g, '_');
        if (frei) {
          var nz = el('div', 'vz');
          nz.appendChild(el('span', null, frei));
          nz.appendChild(el('span', 'tiefer', tr('enums.willCreate')));
          nz.addEventListener('mousedown', function (ev) {
            ev.preventDefault();
            e[spec.feld] = 'enum.' + spec.art + '.' + frei;
            e[spec.her] = 'hand';
            if (spec.art === 'rooms') { e.zuletzt = 'raum'; }
            entwurfAngefasst();
            zu();
            zeichneErgebnis();
          });
          el2.appendChild(nz);
        } else {
          var neu2 = el('div', 'vz zurueck');
          neu2.appendChild(el('span', null, tr('enums.noMatch', ei.value)));
          el2.appendChild(neu2);
        }
        el2.hidden = false;
        return;
      }

      mListe.forEach(function (x, n) {
        var z = el('div', 'vz' + (n === mMark ? ' an' : '') + (x.id === e[spec.feld] ? ' gewaehlt' : ''));
        z.appendChild(el('span', null, x.name));
        z.appendChild(el('span', 'tiefer',
          x.vorlage ? tr('enums.willCreate')
                    : (x.anzahl ? tr('enums.members', x.anzahl) : tr('enums.unused'))));
        z.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          e[spec.feld] = x.id;
          e[spec.her] = 'hand';
          if (spec.art === 'rooms') { e.zuletzt = 'raum'; }
          /* Das Icon jetzt holen, nicht erst beim Schreiben: dort ist
             kein Warten mehr moeglich, der Objektbau laeuft synchron. */
          if (x.vorlage && x.vorlage.icon) { holeIkon(spec.art, x.vorlage.icon); }
          entwurfAngefasst();
          zu();
          zeichneErgebnis();
        });
        el2.appendChild(z);
      });
      if (katalogFehlt) {
        var kf = el('div', 'vz zurueck');
        kf.appendChild(el('span', null, tr('catalog.missing')));
        el2.appendChild(kf);
      }
      el2.hidden = false;
    };

    ei.addEventListener('focus', function () { ei.value = ''; mMark = -1; malen(); });
    ei.addEventListener('input', function () { mMark = -1; malen(); });
    ei.addEventListener('blur', function () {
      setTimeout(function () { zu(); ei.value = nameVon(e[spec.feld] || ''); }, 140);
    });
    ei.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { zu(); ei.value = nameVon(e[spec.feld] || ''); ei.blur(); return; }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        if (el2.hidden) { malen(); return; }
        ev.preventDefault();
        if (!mListe.length) { return; }
        mMark += (ev.key === 'ArrowDown' ? 1 : -1);
        if (mMark < 0) { mMark = mListe.length - 1; }
        if (mMark >= mListe.length) { mMark = 0; }
        malen();
        var akt = el2.children[mMark];
        if (akt && akt.scrollIntoView) { akt.scrollIntoView({ block: 'nearest' }); }
        return;
      }
      if (ev.key === 'Enter' && !el2.hidden && mListe.length) {
        ev.preventDefault();
        e[spec.feld] = mListe[mMark >= 0 ? mMark : 0].id;
        e[spec.her] = 'hand';
        entwurfAngefasst();
        zu();
        zeichneErgebnis();
      }
    });
  });
  if (enumAngebot) { ebar.appendChild(enumAngebot); }
  host.appendChild(ebar);
}

/* Welcher Raum, welche Funktion - und woher.

   Gibt es den Alias schon, gilt, was dort steht: seine Zuordnung ist eine
   Tatsache, kein Vorschlag. Gibt es ihn noch nicht, wird vorgeschlagen.
   `raumHer`/`funktionHer` haelt fest, welcher Fall es war - die Zeile sagt
   das dazu, damit ein Vorschlag nicht wie eine bestehende Zuordnung
   aussieht. */
export function setzeEnums(e) {
  if (e.raum !== undefined && e.funktion !== undefined) { return; }
  var ziel = e.ziel || e.kanal;
  /* Gibt es den Alias, gelten SEINE Aufzaehlungen - auch wenn sein Kanal
     kein eigenes Objekt hat. Sonst wurden Raum und Funktion geraten und
     als „vorgeschlagen" angezeigt, obwohl beide laengst zugeordnet
     waren (Ricardo, 08.09.2026). */
  var da = knotenDa(ziel);

  if (e.raum === undefined) {
    var r = da ? (enumsVon(ziel, 'rooms')[0] || '') : '';
    e.raumHer = r ? 'bestand' : '';
    if (!r) { r = raumVorschlag(e); if (r) { e.raumHer = 'vorschlag'; } }
    e.raum = r || '';
  }
  if (e.funktion === undefined) {
    var f = da ? (enumsVon(ziel, 'functions')[0] || '') : '';
    e.funktionHer = f ? 'bestand' : '';
    if (!f) { f = funktionVorschlag(e); if (f) { e.funktionHer = 'vorschlag'; } }
    e.funktion = f || '';
  }
}

/* Der Name einer Aufzaehlung, so wie er als Ordner taugen wuerde.

   Ein Ordner unter `alias.0` darf keine Punkte enthalten - sie wuerden
   eine weitere Ebene aufmachen. Alles andere bleibt, wie der Nutzer es
   kennt: „Wohnkueche“ heisst auch im Pfad „Wohnkueche“. */
export function enumAlsOrdner(id) {
  if (!id) { return ''; }
  var o = enums[id];
  var n = o ? (txt((o.common || {}).name) || '') : '';
  if (!n) {
    /* Noch nicht angelegt? Dann steht der Name in der Vorlage. */
    var art = id.indexOf('enum.rooms.') === 0 ? 'rooms' : 'functions';
    var v = vorlageZu(id, art, '');
    n = v ? (txt(v.name) || '') : '';
  }
  if (!n) { n = id.split('.').pop(); }
  return String(n).replace(/\./g, '_').trim();
}

export function setzeZiel(e) {
  if (S.current.indexOf('alias.') === 0) { return; }
  if (e.zielOrdner === undefined) {
    var zt0 = (e.ziel || zielId(S.current)).split('.');
    var geraet = zt0.pop();

    /* Gibt es fuer diese Quelle schon einen Alias, ist der das Ziel —
       auch wenn er woanders liegt als der Vorschlag. Sonst zeigt die
       Werkbank auf einen freien Platz, meldet „wird neu angelegt" und
       legt beim Klick ein zweites Geraet an, waehrend das erste
       verwaist stehenbleibt. Beim Karbonator lag der Alias unter
       alias.0.Strom, vorgeschlagen wurde alias.0.SmartHome. */
    var vorhanden = aliasFuer(S.current);
    /* Hier stand einmal ein `e.altesZiel = vorhanden`, damit beim
       Verschieben die alte Kennung aus den Aufzaehlungen fliegt. Gemessen
       hat sich das als falsch erwiesen: die Werkbank verschiebt nicht,
       sie legt am neuen Ort an - der alte Alias bleibt stehen. Ihm dabei
       den Raum wegzunehmen, waere ein stiller Schaden an einem Objekt,
       das es weiterhin gibt.

       Wer wirklich verschwindet, wird geloescht, und dabei traegt der
       js-controller selbst aus allen Aufzaehlungen aus. Es gibt also
       nichts zu tun. */

    if (e.instanzen && e.instanzen.length > 1) {
      /* Mehrere Ausgaenge: das Geraet wird zum Ordner, jeder Ausgang
         ein Kanal darin. Ein folder darueber, kein device — sonst
         rutscht die Erkennung hoch und macht aus dreien wieder eins. */
      if (vorhanden) {
        /* Der gefundene Kanal ist einer der Ausgaenge; der Ordner liegt
           darueber. Wie der einzelne Ausgang heisst, kann die Werkbank
           nicht wissen — wer sie umbenannt hat, sieht den Vorschlag in
           der Zielzeile und kann ihn anpassen. */
        var tm = vorhanden.split('.');
        tm.pop();
        e.zielOrdner = tm.join('.');
      } else {
        e.zielOrdner = zt0.join('.') + '.' + geraet;
      }
      e.zielName = ausgangName(e, e.instanz);
    } else if (vorhanden) {
      var te = vorhanden.split('.');
      e.zielName = te.pop();
      e.zielOrdner = te.join('.');
    } else {
      e.zielOrdner = zt0.join('.');
      e.zielName = geraet;

      /* Steht ein Raum fest, gehoert der Alias dorthin.

         Das ist der haeufigste Fall bei Homematic: der Kanal haengt in
         „Bastelzimmer“, und dann soll der Alias nicht unter dem
         Adapterpfad landen, sondern unter `alias.0.Bastelzimmer`. Nur
         beim Vorschlag - wer den Ordner selbst tippt, behaelt ihn
         (`e.ordnerVonHand`), und wer schon einen Alias hat, wird nicht
         umgezogen (der Zweig hier greift nur, wenn es keinen gibt). */
      if (!e.ordnerVonHand) {
        setzeEnums(e);
        var ro = enumAlsOrdner(e.raum);
        if (ro) { e.zielOrdner = 'alias.0.' + ro; }
      }
    }
  }
  e.ziel = e.zielOrdner + '.' + e.zielName;
  uebernehmeBestand(e);
}

export function uebernehmeBestand(e) {
  if (!e.ziel || e.bestandGeprueft === e.ziel) { return; }
  e.bestandGeprueft = e.ziel;
  /* Gefragt ist, ob es unter dem Ziel schon einen Alias gibt - nicht, ob
     das Ziel selbst ein Objekt ist. Das ist nicht dasselbe: wer seine
     Punkte von Hand im Admin anlegt, bekommt `alias.0.X.Y.PUNKT`, ohne
     dass `alias.0.X.Y` als Kanal entsteht. Der Baum zeigt so einen
     Knoten trotzdem, weil er sich aus den Kennungen aufbaut - `knotenDa`
     ist genau dafuer da.

     Mit der alten Frage stieg der ganze Bestandsabgleich dort aus:
     `alias.0.Bastelzimmer.Klima` und `alias.0.Solar.Einstellungen.Bilanz`
     haben kein Kanalobjekt, und ein Aktualisieren haette ihre Namen
     durch die blossen Punktnamen ersetzt - „Strompreis fuer die
     Ersparnisrechnung" waere zu „Strompreis_ct_kWh" geworden. Rollen,
     Formeln und Schreibrichtung waeren ebenso durchgefallen
     (Ricardo, 08.09.2026). */
  if (!knotenDa(e.ziel)) { return; }
  /* Im Aliasmodus ist der Entwurf schon der Bestand. */
  if (e.kanal === e.ziel) { return; }

  var kennt = {};
  var kenntQuelle = {};
  e.states.forEach(function (s) {
    if (s.n) { kennt[s.n] = s; }
    if (s.srcR) { kenntQuelle[s.srcR] = s; }
  });

  /* Was im Alias steht, gilt - nicht nur, wie er heisst.

     Uebernommen wurde bisher allein der Name. Rolle, Typ, Einheit,
     Werteliste, Formeln und vor allem die Schreibquelle blieben die der
     Quelle. Solange jeder Alias entweder aus einer Vorlage entstand oder
     die Rollen der Quelle uebernahm, fiel das nicht auf - beide waren
     gleich. Beim ersten Alias, dessen Rollen sich von denen der Quelle
     unterscheiden (geratene Plaetze), fiel es sofort auf: der Sprung zur
     Quelle zeigte `thermostat` statt `airCondition`, die Schreibquelle
     war weg, und von neun Punkten blieben zwei angehakt.

     Nur ohne Vorlage. Hat eine gegriffen, ist ihr Vorschlag gemeint -
     sonst uebertoente der Bestand sie stillschweigend, und „aendert
     sich" haette nichts mehr zu melden. */
  function vomAliasUebernehmen(z, o) {
    if (e.vorlage) { return; }
    var c = o.common || {}, a = c.alias || {}, q2 = aliasQuellen(o);
    if (c.role) { z.role = c.role; }
    if (c.type) { z.typ = c.type; }
    z.unit = c.unit || '';
    z.states = c.states || undefined;
    z.f = (typeof a.read === 'string') ? a.read : '';
    z.fw = (typeof a.write === 'string') ? a.write : '';
    /* Die Beschriftung steht im Alias und gehoert dem Nutzer.

       Sie fehlte hier als einzige - `bestandVorrang` holt sie laengst
       (`s.caption = txt(c.name)`), diese Zwillingsfunktion nicht. Also
       blieb `caption` leer, im aufgeklappten Feld stand nichts, und ein
       „Alias aktualisieren" haette den Namen durch den blossen
       Zeilennamen ersetzt: aus „Netzbezug (+) / Einspeisung (-)" waere
       „Bezug" geworden (Ricardo, 07.09.2026, an alias.0.Solar.Netz).
       Gleicht die Beschriftung dem Zeilennamen, bleibt sie leer - so
       haelt es der Zweig darunter, der neue Zeilen anlegt, auch. */
    var nm2 = txt(c.name);
    z.caption = (nm2 && nm2 !== z.n) ? nm2 : '';
    if (q2.read) { z.srcR = q2.read; }
    /* Und dieselbe Schreibregel wie im Bestandsvorrang.

       Hier stand die Schreibquelle nur fuer das getrennte Paar; sonst
       blieb stehen, was der Vorschlag aus der Quelle abgeleitet hatte.
       Bei einem Nur-Lese-Alias auf einen beschreibbaren Punkt hiess das:
       die Quelle sagt `write: true`, der Alias sagt `write: false` - und
       die Werkbank meldete eine Abweichung, die sie selbst erzeugt hatte,
       und haette den Alias beim Aktualisieren schreibbar gemacht.

       Belegt ist das Schreiben durch `common.write` oder durch eine
       hinterlegte Schreibformel; bei getrennten Quellen zaehlt, was in
       `alias.id.write` steht. */
    z.srcW = q2.einfach
      ? ((c.write === true || typeof a.write === 'string') ? (q2.write || '') : '')
      : (q2.write || '');
    if (q2.write && !q2.einfach && q2.write !== q2.read) {
      /* Die Gegenzeile eines Paars ist keine eigene mehr - ihre Quelle
         steckt jetzt als Schreibquelle in dieser Zeile. */
      e.states.forEach(function (x) {
        if (x !== z && x.srcR === q2.write) { x.on = false; }
      });
    }
    e.bestandZog = true;
  }

  /* Erstens: was der Vorschlag kennt und im Alias steht, wird angehakt. */
  Object.keys(kennt).forEach(function (n) {
    var s = kennt[n];
    var o0 = S.objects[e.ziel + '.' + n];
    if (!o0) { return; }
    if (!s.on) { s.on = true; }
    s.ausBestand = true;
    vomAliasUebernehmen(s, o0);
  });

  /* Zweitens — und das ist das Wichtigere: was NUR im Alias steht, kommt
     als eigene Zeile dazu. Vorher war es unsichtbar. Man sah seine selbst
     angelegten Punkte nie wieder, konnte sie weder aendern noch
     entfernen, die Aenderungs-Karte war blind fuer sie, und beim
     Aktualisieren standen sie stumm unter „Entfernen". */
  kindZustaende(e.ziel).forEach(function (id) {
    var n = id.slice(e.ziel.length + 1);
    if (n.indexOf('.') !== -1 || kennt[n]) { return; }
    var o = S.objects[id], c = o.common || {}, a = c.alias || {}, q = aliasQuellen(o);

    /* Derselbe Punkt unter anderem Namen? Dann ist es kein zweiter,
       sondern derselbe — und der Name, der schon im Alias steht, gilt.

       Sonst entstuenden Dubletten, sobald die Werkbank ihre Namensgebung
       aendert: der Entwurf nennt einen Punkt heute `Licht_Bar_STATE`, im
       Alias steht er als `1_STATE`, und beide kaemen in die Liste. Und
       schlimmer: ein Aktualisieren wuerde `1_STATE` loeschen und
       `Licht_Bar_STATE` anlegen — jedes Widget und jedes Skript, das auf
       den alten Namen zeigt, liefe ins Leere. Was einmal steht, bleibt
       stehen; neue Punkte bekommen den neuen Namen. */
    if (q.read && kenntQuelle[q.read] && !S.objects[e.ziel + '.' + kenntQuelle[q.read].n]) {
      var vorhanden = kenntQuelle[q.read];
      /* Die Zeile bekommt den Namen aus dem Alias — und damit einen
         anderen, als die Erkennung eben gesehen hat. `platzVon` kennt
         noch den Vorlagennamen, die Zeile heisst jetzt anders, und die
         Platzpruefung findet nichts: Am `Bastelzimmer_Licht` stand nach
         einem Wechsel auf die Steckdosen-Vorlage „kein Platz im
         Steckdose-Muster" an ON_ACTUAL, obwohl der Platz ACTUAL frei
         besetzt war. Nach jedem beliebigen Neuzeichnen war es weg
         (Ricardo, 06.09.2026).

         `bestandZog` loest genau dafuer das einmalige Nachzeichnen aus.
         Gesetzt wurde es bisher nur in `vomAliasUebernehmen` — und das
         steigt bei gesetzter Vorlage sofort aus, damit der Vorlagenstand
         gilt. Die Umbenennung findet aber trotzdem statt, also gehoert
         die Fahne hierher. */
      if (vorhanden.n !== n) { e.bestandZog = true; }
      vorhanden.n = n;
      vorhanden.on = true;
      vorhanden.ausBestand = true;
      vomAliasUebernehmen(vorhanden, o);
      kennt[n] = vorhanden;
      return;
    }
    var nm = txt(c.name);
    e.states.push({
      n: n, on: true, ausBestand: true, nurImAlias: true,
      role: c.role || '', typ: c.type || '', unit: c.unit || '',
      states: c.states || undefined,
      wr: !!c.write,
      srcR: q.read || '',
      /* Dieselbe Schreibregel wie oben und im Bestandsvorrang.

         Hier stand `q.einfach ? '' : (q.write || '')` - bei schlichtem
         `alias.id` also immer leer, ohne `common.write` ueberhaupt
         anzusehen. Es trifft jeden Alias, bei dem MEHRERE Punkte auf
         denselben Quellpunkt zeigen: die eine Vorschlagszeile bekommt
         der erste von ihnen, alle weiteren landen hier. Am
         `alias.0.Badezimmer.Rollladen` zeigen OPEN, CLOSE, SET und pct
         alle auf `…Bad.level`; CLOSE lief oben durch und behielt seine
         Schreibquelle, OPEN, SET und pct verloren sie - ein
         Aktualisieren haette den Rollladen ueber den Alias unfahrbar
         gemacht (Ricardo, 08.09.2026). */
      srcW: q.einfach
        ? ((c.write === true || typeof a.write === 'string') ? (q.write || '') : '')
        : (q.write || ''),
      f: (typeof a.read === 'string') ? a.read : '',
      fw: (typeof a.write === 'string') ? a.write : '',
      caption: (nm && nm !== n) ? nm : '',
      manuell: false
    });
  });

  /* Einmal nachzeichnen.

     Die Uebernahme aendert Rollen, auf denen die Erkennung dieses
     Durchgangs schon aufgesetzt hatte. `wantAuto` und `want` zieht der
     Aufrufer sofort nach, die Platzhinweise der einzelnen Zeilen und das
     Infogeraet aber stammen aus dem Lauf davor - beim ersten Aufbau
     stand deshalb an der ACTUAL-Zeile „kein Platz im airCondition-Muster",
     obwohl das Feld darueber 9/29 meldete. Nach einem beliebigen
     Neuzeichnen war es weg. Einmal von selbst neu zeichnen, statt den
     Nutzer darauf zu stossen. */
  if (e.bestandZog && !e.bestandNachgezeichnet) {
    e.bestandNachgezeichnet = true;
    setTimeout(function () { if (S.entwurf === e) { zeichneErgebnis(); } }, 0);
  }

  /* Und die Werte zu den eben ergaenzten Zeilen nachholen.

     `waehle` holt die Werte, bevor es diese Zeilen ueberhaupt gibt: es
     fragt den angeklickten Kanal ab und die Quellen, die der Entwurf zu
     dem Zeitpunkt kennt. Was hier dazukommt, steht nur im Alias - und
     seine Quelle kann irgendwo liegen. Solange sie unter demselben
     Knoten liegt, faellt nichts auf, weil `getForeignStates` sie
     mitgenommen hat. Liegt sie woanders, blieb die Zeile ohne Wert und
     behauptete „Quelle liefert nichts", obwohl der Alias einwandfrei
     arbeitet.

     Gefunden am 07.09.2026 (Ricardo) an `alias.0.Solar.Netz`: drei
     Punkte aus `0_userdata`, zwei aus `mqtt-client`. Nach einem
     Reiterwechsel und dem ersten Klick auf den Knoten standen genau die
     beiden mqtt-Zeilen leer; ein zweiter Klick heilte es, weil der Wert
     dann schon im Vorrat lag. Der Mitschnitt zeigte, dass nach der
     mqtt-Kennung nie gefragt wurde.

     Einmal je Entwurf, und nur, wenn wirklich etwas fehlt. */
  if (!e.bestandWerte) {
    var fehlen = [];
    e.states.forEach(function (s) {
      if (s.srcR && !S.werte[s.srcR] && fehlen.indexOf(s.srcR) === -1) { fehlen.push(s.srcR); }
    });
    if (fehlen.length) {
      e.bestandWerte = true;
      holeEinzelne(fehlen, function (etwas) {
        if (etwas && S.entwurf === e) { zeichneErgebnis(); }
      });
    }
  }
}

export function unterschiede(e) {
  var raus = [];
  var mu = e.want && musterVon(e.want);
  function hatPlatz(rolle) {
    if (!mu || !rolle) { return false; }
    return mu.states.some(function (st) {
      if (!st.role) { return false; }
      try { return new RegExp(st.role.source || st.role).test(rolle); } catch { return false; }
    });
  }
  /* Was die Vorlage von sich aus vorgeschlagen hat. Ein Punkt, der
     dort schon auf „Vorgabe aus" steht, ist nicht abgewaehlt worden —
     er war nie an. Vorher landeten bei einer Tasmota alle zwoelf
     Diagnosepunkte in dieser Liste, obwohl niemand etwas geaendert
     hatte. */
  var vorlage = null;
  S.VORLAGEN.forEach(function (v) { if (v.id === e.vorlage) { vorlage = v; } });
  function warVorgabeAn(s) {
    /* Ein Punkt, der nur zu sehen ist, weil „alle Datenpunkte des
       Geraets" eingeschaltet wurde, war nie Teil des Vorschlags. Ihn
       abgewaehlt zu lassen ist keine Abweichung, sondern der Zustand
       von vorher - vorher stand er ueberhaupt nicht in der Liste.
       Gemeldet wird er erst, wenn jemand ihn anhakt. */
    if (s.ausAnsicht) { return false; }
    if (!vorlage) { return true; }          /* ohne Vorlage zaehlt jedes Abwaehlen */
    var z = null;
    (vorlage.zustaende || []).forEach(function (x) {
      if (x.name === (s.ausVorlage || s.n)) { z = x; }
    });
    if (!z) { return true; }
    return !z.vorgabeAus;
  }
  var zielBasis = e.ziel || e.kanal;

  /* Womit wird verglichen? Gibt es den Alias schon, ist er die
     Grundlinie — dann zaehlt, was sich gegenueber dem Gespeicherten
     aendert. Gibt es ihn noch nicht, ist es der Vorschlag der
     Vorlage. */
  var aliasDa = knotenDa(zielBasis);

  e.states.forEach(function (s) {
    if (s.manuell) { raus.push({ n: s.n || '(ohne Namen)', was: tr('diff.newByHand') }); return; }

    var imAlias = !!S.objects[zielBasis + '.' + s.n];
    var grundlinieAn = aliasDa ? imAlias : warVorgabeAn(s);

    /* Beide Richtungen melden. Vorher wurde nur das Abwaehlen
       betrachtet — wer einen Punkt zusaetzlich anhakte, sah davon
       nichts, obwohl das genauso eine Abweichung ist. */
    if (!s.on && grundlinieAn) {
      raus.push({ n: s.n, was: imAlias ? tr('diff.wouldBeRemoved')
        : (hatPlatz(s.role) ? tr('diff.deselectedWithPlace', e.want)
                            : tr('diff.deselectedNoPlace', e.want)) });
      return;
    }
    if (s.on && !grundlinieAn) {
      raus.push({ n: s.n, was: aliasDa ? tr('diff.wouldBeAdded')
        : (hatPlatz(s.role) ? tr('diff.addedWithPlace', e.want)
                            : tr('diff.addedNoPlace', e.want)) });
      return;
    }
    if (!s.on) { return; }

    /* Der Vergleich der Einzelheiten lief bisher ueber s.urId, das
       nur bei einem Entwurf aus einem fertigen Alias gesetzt ist. Bei
       einem Entwurf aus der Quelle blieb er stumm, obwohl es den
       Alias gibt — Rollenwechsel fielen dort durch. */
    var o = S.objects[s.urId] || S.objects[zielBasis + '.' + s.n];
    if (!o) { return; }
    var c = o.common || {}, a = c.alias || {}, q = aliasQuellen(o);
    if ((c.role || '') !== s.role) { raus.push({ n: s.n, was: tr('diff.roleChange', c.role || '—', s.role) }); }
    if ((c.unit || '') !== s.unit) { raus.push({ n: s.n, was: tr('diff.unitChange', c.unit || '—', s.unit || '—') }); }
    var altF = (typeof a.read === 'string') ? a.read : '';
    if (altF !== s.f) { raus.push({ n: s.n, was: tr('diff.formulaChange', altF || '—', s.f || '—') }); }
    var altR = q.read || '';
    if (altR !== s.srcR) { raus.push({ n: s.n, was: tr('diff.sourceChange', altR || '—', s.srcR || '—') }); }
  });
  return raus;
}
