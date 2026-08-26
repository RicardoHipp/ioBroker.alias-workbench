/* Raum und Funktion als Fachlichkeit: Listen, Zuordnung, Vorschlag.

   Die Oberflaeche dazu (Felder, Angebote) liegt beim Ergebnis - hier nur,
   was aus Bestand und Katalog folgt. */

import { S } from './zustand.js';
import { txt } from './sprache.js';
import { enums } from './enums.js';
import { enumVorlagen, ikonCache, vorlageZu } from './katalog.js';
import { zusatzName } from './baum.js';
import { aliasFuer, quelleVon } from './entwurf.js';

/* Eine Aufzaehlung, die es noch nicht gibt.

   Steht sie im Vorlagenkatalog, uebernehmen wir den mehrsprachigen Namen
   und das Icon - dann sieht sie hinterher aus wie eine im Admin
   angelegte, nicht wie ein Fremdkoerper. Sonst bleibt der eingetippte
   Name allein. */
export function neueEnum(id, art) {
  var kurz = id.slice(('enum.' + art + '.').length);
  var v = null;
  (enumVorlagen[art] || []).forEach(function (x) { if (x._id === kurz) { v = x; } });
  var c = { name: v ? JSON.parse(JSON.stringify(v.name)) : kurz };
  var ik = (v && v.icon) ? ikonCache[art + ':' + v.icon] : null;
  if (ik) { c.icon = ik; }
  /* Die Herkunftsmarke erlaubt dem Loeschweg, eine selbst angelegte
     Aufzaehlung wieder mitzunehmen, wenn ihr letztes Mitglied faellt.
     Ohne Marke blieb `enum.functions.socket` als leere Huelle stehen
     (25.08.2026 am Produktivsystem gefunden). Fremde und vorbestehende
     Aufzaehlungen tragen sie nicht und bleiben darum unangetastet. */
  return { type: 'enum', common: c, native: { angelegtVon: 'alias-workbench' } };
}

/* Alle Aufzaehlungen einer Art, benutzte zuerst.

   Die Reihenfolge ist kein Schmuck: ioBroker legt bei der Erstinstallation
   leere englische Raeume an (`bathroom`, `bedroom` …), deren deutscher Name
   genau so lautet wie der eines benutzten Raums. Ricardo hat „Badezimmer"
   zweimal - einmal mit fuenf Mitgliedern, einmal leer. Wer nur Namen zeigt,
   schickt den Nutzer ins Leere. Deshalb steht die Kennung mit dabei, und
   was schon benutzt wird, kommt zuerst. */
export function enumListe(art, nurBestand) {
  var pre = 'enum.' + art + '.';
  /* `autocreate` haelt der ping-Adapter als Sammelbecken mit hunderten
     Mitgliedern - als Ablageort taugt es nie und stand durch die
     Benutzt-zuerst-Sortierung ganz oben. Es faellt aus der Liste;
     wer es wirklich am Geraet hat, sieht es weiter im Feld stehen. */
  var raus = Object.keys(enums).filter(function (k) {
    return k.indexOf(pre) === 0 && k.slice(pre.length) !== 'autocreate';
  })
    .map(function (k) {
      var c = enums[k].common || {};
      return { id: k, kurz: k.slice(pre.length), name: txt(c.name) || k.slice(pre.length),
               anzahl: (c.members || []).length };
    })
    .sort(function (a, b) {
      return (b.anzahl > 0) - (a.anzahl > 0) || a.name.localeCompare(b.name);
    });

  /* Fuer den Vorschlag ist hier Schluss.

     Ein Vorschlag darf nur auf Vorhandenes zeigen. Sonst legt die
     Werkbank ungefragt Aufzaehlungen an: `Weihnachten_aussen` liegt im
     Pfad unter „Garten", es gibt eine Vorlage dieses Namens - und schon
     stand `enum.rooms.garden` als Vorschlag im Feld, obwohl Ricardo
     keinen Raum „Garten" fuehrt. Wer dann nur noch auf Anlegen drueckt,
     bekommt einen Raum, den er nie gewaehlt hat. Gefunden im Test zu
     0.0.78, nachdem der Vorschlag dieselbe Liste benutzte wie die
     Auswahl. */
  if (nurBestand) { return raus; }

  /* Hinter dem Bestand steht, was der Admin anbietet und es hier noch
     nicht gibt: Rollladen, Steckdose, Waschmaschine. Sie stehen hinten,
     weil das Vorhandene naeher liegt - wer eine Vorlage sucht, tippt.

     Gleicher Name, andere Kennung ist die Falle: der Admin legt beim
     Klick auf HEIZUNG ein `enum.functions.heating` an, waehrend die
     Geraete in `enum.functions.Heizung` haengen. Solche Doppelgaenger
     kommen gar nicht erst in die Liste - wer sie anlegte, bekam zwei
     gleichnamige Aufzaehlungen und sah nie, warum die eine leer bleibt.
     (Vorher stand nur ein Warnvermerk dran; Ricardos Befund 25.08.2026:
     „gibt es schon und neu anlegen wird angezeigt".) */
  var da = {}, nachName = {};
  raus.forEach(function (x) {
    da[x.id] = true;
    nachName[x.name.toLowerCase()] = x.id;
  });
  (enumVorlagen[art] || []).forEach(function (v) {
    var id = pre + v._id;
    if (da[id]) { return; }
    var name = txt(v.name) || v._id;
    /* Auch der Katalog selbst fuehrt Namensvettern (zweimal
       „Stromverbrauch" unter verschiedenen Kennungen) - einer reicht. */
    if (nachName[name.toLowerCase()]) { return; }
    nachName[name.toLowerCase()] = id;
    raus.push({ id: id, kurz: v._id, name: name, anzahl: 0, vorlage: v });
  });
  return raus;
}

/* In welchen Aufzaehlungen dieser Art steckt die Kennung? */
export function enumsVon(id, art) {
  var pre = 'enum.' + art + '.';
  return Object.keys(enums).filter(function (k) {
    if (k.indexOf(pre) !== 0) { return false; }
    var m = (enums[k].common || {}).members || [];
    return m.indexOf(id) > -1;
  });
}

/* Der Raum einer Quelle - auch wenn er an einem ihrer Kanaele haengt.

   Gemessen: die Raeume stehen bei Homematic fast immer am Kanal
   (`hm-rpc.0.000A9D89900001.0`), nicht am Geraet. Wer nur die Geraete-ID
   sucht, findet bei 61 zugeordneten Quellen fast keine. */
export function enumVonQuelle(quelle, art) {
  var direkt = enumsVon(quelle, art);
  if (direkt.length) { return direkt[0]; }
  var pre = 'enum.' + art + '.';
  var treffer = null;
  Object.keys(enums).forEach(function (k) {
    if (treffer || k.indexOf(pre) !== 0) { return; }
    var m = (enums[k].common || {}).members || [];
    if (m.some(function (x) { return String(x).indexOf(quelle + '.') === 0; })) { treffer = k; }
  });
  return treffer;
}


/* Welche Funktion passt zu welchem Geraetetyp.

   Bewusst eine Zuordnung ueber den *Namen* der Aufzaehlung, nicht ueber
   ihre Kennung: Ricardos Funktionen heissen „Licht", „Heizung",
   „Verschluss" - auf einer englischen Anlage heissen sie anders. Deshalb
   wird nur vorgeschlagen, was es auch gibt. */
/* Welche Funktion zu einem Geraetetyp gehoert.

   Hier stand eine Tabelle, die Gewerke auf Typen abbildete - „Verschluss“
   auf blind, window, door, lock, gate. Sie hatte zwei Fehler: Sie war zu
   grob (ein Fensterkontakt ist ein Fenster, kein „Verschluss“), und sie
   zeigte auf Namen aus Ricardos CCU. Auf einer Anlage ohne Homematic
   traf sie nichts.

   Jetzt wird abgeleitet, in dieser Reihenfolge:

     1. was in der Vorlage steht        `"funktion": "window"`
     2. Typkennung = Vorlagenkennung    window, door, socket, light, …
     3. diese Ausnahmeliste             was im Admin anders heisst
     4. nichts

   Gemessen: 9 der 53 Detector-Typen heissen genauso wie eine
   Admin-Vorlage und brauchen keinen Eintrag - door, fan, gate, humidity,
   light, lock, pump, socket, window. Fuer den Rest steht hier, was
   gemeint ist, und zwar als Vorlagenkennung, nicht als Anzeigename:
   daraus loest die Werkbank beides auf, den vorhandenen Eintrag und die
   Vorlage samt Uebersetzung und Bild. */
export var TYP_ZU_VORLAGE = {
  blind:       'shutters',
  windowTilt:  'window',
  thermostat:  'heating',
  temperature: 'temperature_sensor',
  dimmer:      'light',
  rgb:         'light',
  rgbSingle:   'light',
  rgbwSingle:  'light',
  ct:          'light',
  hue:         'light',
  cie:         'light',
  fireAlarm:   'smoke_detector',
  floodAlarm:  'water',
  vacuumCleaner: 'vacuum_cleaner',
  weatherCurrent:  'weather',
  weatherForecast: 'weather',
  airCondition: 'climate',
  volume:      'speaker',
  volumeGroup: 'speaker',
  media:       'music'
};

/* Der vorgeschlagene Raum. Vier Wege, der erste Treffer gewinnt.

   Der erste ist der wichtigste: was die Quelle schon weiss, muss man nicht
   erraten. Die drei danach lesen den Namen - erst den Zielordner, dann den
   Pfad der Quelle (bei Tasmota steht der Raum im Topic), zuletzt den
   Geraetenamen selbst (`HK_Bastelzimmer` trifft bei Homematic fast immer). */
export function raumVorschlag(e) {
  if (!e || !e.kanal) { return ''; }

  /* 1. Von der Quelle erben */
  var quelle = (e.kanal.indexOf('alias.') === 0) ? quelleVon(e.kanal) : e.kanal;
  if (quelle) {
    var geerbt = enumVonQuelle(quelle, 'rooms');
    if (geerbt) { return geerbt; }
  }

  var liste = enumListe('rooms', true);
  var suche = function (wort) {
    if (!wort) { return ''; }
    var w = String(wort).toLowerCase();
    var t = liste.filter(function (r) {
      return r.name.toLowerCase() === w || r.kurz.toLowerCase() === w;
    });
    return t.length ? t[0].id : '';
  };

  /* 2. Aus dem Zielordner.

     Nur wenn der Ordner von Hand gesetzt wurde oder der Alias schon
     liegt. Sonst dreht es sich im Kreis: der Ordner kommt aus dem Raum,
     und der Raum kaeme aus dem Ordner. Abgeleitet wird immer nur aus
     dem, was jemand entschieden hat. */
  var ziel = (e.ordnerVonHand || aliasFuer(e.kanal)) ? (e.ziel || '') : '';
  if (ziel.indexOf('alias.0.') === 0) {
    var teile = ziel.slice('alias.0.'.length).split('.');
    teile.pop();
    for (var i = teile.length - 1; i >= 0; i--) {
      var tr = suche(teile[i]);
      if (tr) { return tr; }
    }
  }

  /* 3. Aus dem Pfad der Quelle */
  if (quelle) {
    var qt = quelle.split('.');
    for (var j = qt.length - 2; j >= 2; j--) {
      var qr = suche(qt[j]);
      if (qr) { return qr; }
    }
  }

  /* 4. Aus dem Geraetenamen: „HK_Bastelzimmer" -> Bastelzimmer.
     Von hinten, weil der Raum am Ende steht, und stueckweise, weil
     „Max_Spielzimmer" aus zwei Teilen besteht. */
  var name = zusatzName(e.kanal) || (quelle ? zusatzName(quelle) : '') || '';
  if (name) {
    var nt = String(name).split(/[_ .]+/);
    for (var k = 0; k < nt.length; k++) {
      var rest = nt.slice(k).join('_');
      var nr = suche(rest);
      if (nr) { return nr; }
    }
  }
  return '';
}

/* Die vorgeschlagene Funktion, aus dem erkannten Geraetetyp. */
/* Zu einer Vorlagenkennung die Aufzaehlung, die gemeint ist.

   Der Bestand hat Vorrang: heisst eine vorhandene Funktion so oder
   traegt sie den Namen der Vorlage, wird die genommen. Sonst die
   Vorlage selbst - sie entsteht dann beim Schreiben, sichtbar als NEU
   im Trockenlauf. */
export function funktionZuKennung(kennung) {
  if (!kennung) { return ''; }
  var vorlage = null;
  (enumVorlagen.functions || []).forEach(function (v) {
    if (v._id === kennung) { vorlage = v; }
  });
  var name = vorlage ? String(txt(vorlage.name) || '').toLowerCase() : '';
  var da = '';
  enumListe('functions', true).forEach(function (f) {
    if (da) { return; }
    if (f.kurz === kennung) { da = f.id; return; }
    if (name && f.name.toLowerCase() === name) { da = f.id; }
  });
  if (da) { return da; }
  return vorlage ? ('enum.functions.' + kennung) : '';
}

/* Die Auswahlliste der Funktionen - einmal gebaut, zweimal gebraucht:
   im Vorlagenblatt und im Dialog „Als Vorlage speichern".

   Gespeichert wird die Kennung aus dem Katalog des Admin, nicht der
   Anzeigename; daraus loest die Werkbank beides auf, den vorhandenen
   Eintrag und die Vorlage samt Uebersetzung und Bild. */
export function funktionsAuswahl(gewaehlt) {
  var raus = [], da = false;
  (enumVorlagen.functions || []).slice()
    .sort(function (a, b) {
      return String(txt(a.name) || a._id).localeCompare(String(txt(b.name) || b._id));
    })
    .forEach(function (fv) {
      if (fv._id === gewaehlt) { da = true; }
      raus.push({ wert: fv._id,
                  text: (txt(fv.name) || fv._id) + '  ·  ' + fv._id,
                  gewaehlt: fv._id === gewaehlt });
    });
  /* Steht in der Vorlage etwas, das der Katalog nicht kennt, geht es
     nicht verloren - sonst waere es beim ersten Speichern weg. */
  if (gewaehlt && !da) { raus.push({ wert: gewaehlt, text: gewaehlt, gewaehlt: true }); }
  return raus;
}

/* Der Rueckweg: aus `enum.functions.Klima` wird `climate`.

   `funktionZuKennung` geht die eine Richtung, hier die andere. Gebraucht
   wird sie beim Speichern einer Vorlage: was am Geraet als Funktion
   steht, soll im Dialog schon vorgeschlagen sein.

   Gespeichert wird die Kennung des Katalogs, nicht die der Anlage - eine
   Vorlage, die `Klima` sagt, passt nur auf eine Anlage mit genau diesem
   deutschen Namen. Findet sich im Katalog nichts, bleibt die kurze
   Kennung der Aufzaehlung; `funktionZuKennung` findet auch die wieder. */
export function kennungZuFunktion(enumId) {
  if (!enumId) { return ''; }
  var kurz = enumId.slice('enum.functions.'.length);
  var o = enums[enumId];
  var v = vorlageZu(enumId, 'functions', txt(o && o.common && o.common.name));
  return v ? v._id : kurz;
}

export function funktionVorschlag(e) {
  if (!e) { return ''; }

  /* 1. Was die Vorlage sagt. Sie weiss mehr als der Typ: `socket` kann
        eine Steckdose sein, eine Waschmaschine oder eine Druckerleiste -
        der Detector sieht keinen Unterschied, die Vorlage schon. */
  if (e.vorlage) {
    var vq = null;
    S.VORLAGEN.forEach(function (v) { if (v.id === e.vorlage) { vq = v; } });
    if (vq && vq.funktion) {
      var ausVorlage = funktionZuKennung(vq.funktion);
      if (ausVorlage) { return ausVorlage; }
    }
  }

  if (!e.want) { return ''; }

  /* 2. Der Typ heisst wie eine Vorlage.  3. Sonst die Ausnahmeliste. */
  return funktionZuKennung(e.want) ||
         funktionZuKennung(TYP_ZU_VORLAGE[e.want]);
}
