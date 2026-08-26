/* Die Rollenwahl: ein durchsuchbares Feld mit eigener Liste, gebaut wie
   Musterwahl und Ordnerfeld. Ein <select> mit 51 Rollen liess sich nicht
   durchsuchen, und die Zeilenform „rolle → PLATZ" an jeder Zeile erklaerte
   niemandem, was der Pfeil bedeutet (Ricardos Befundliste, 25.08.2026).

   Ohne Suchtext stehen nur die Rollen, die im gewaehlten Muster einen
   Platz finden - gruppiert nach Platz, mit dem Vermerk, ob der Platz
   schon belegt ist und von wem. Die letzte Zeile schaltet auf alle
   Rollen um (nach Familien geordnet). Tippen sucht immer ueber alles. */

import { el } from './basis.js';
import { tr } from './sprache.js';
import { ROLLEN, musterVon, plaetzeFuerRollen } from './erkennung.js';
import { musterName } from './musternamen.js';

/* einst: { wert, muster, belegtVon: {platz: zeilenname}, breite,
            leerErlaubt, beiWahl(rolle) } — liefert den fertigen
   Feld-Umschlag. `leerErlaubt` bietet „keine Rolle" als erste Zeile an
   (Vorlagenblatt); `belegtVon` fehlt dort, dann traegt der Gruppenkopf
   auch keinen frei/belegt-Vermerk. */
export function rollenFeld(einst) {
  var wrap = el('div', 'feldwrap');
  var feld = el('input', 'tx rollenwahl');
  feld.type = 'text';
  feld.setAttribute('autocomplete', 'off');
  feld.placeholder = tr('roles.search');
  if (einst.breite) { feld.style.width = einst.breite; }
  var liste = el('div', 'vorschlaege rollenliste');
  liste.hidden = true;
  wrap.appendChild(feld);
  wrap.appendChild(liste);
  /* Klicks im Feld duerfen die Detailzeile nicht zuklappen. */
  wrap.addEventListener('click', function (ev) { ev.stopPropagation(); });

  var alle = ROLLEN.slice();
  if (einst.wert && alle.indexOf(einst.wert) === -1) { alle.unshift(einst.wert); }
  var passend = einst.muster ? plaetzeFuerRollen(einst.muster) : {};
  var mu = einst.muster ? musterVon(einst.muster) : null;

  var alleZeigen = false;
  var markiert = -1;
  var eintraege = [];

  var beschrifte = function () { feld.value = einst.wert || ''; };
  beschrifte();

  var zu = function () { liste.hidden = true; markiert = -1; };
  var waehle = function (rolle) {
    zu();
    einst.wert = rolle;
    beschrifte();
    einst.beiWahl(rolle);
  };

  /* Was gerade in der Liste steht: Koepfe, Rollen, der Umschalter. */
  function baueZeilen() {
    var such = String(feld.value || '').trim().toLowerCase();
    var zeilen = [];
    if (!such && einst.leerErlaubt) { zeilen.push({ typ: 'rolle', rolle: '' }); }
    if (such) {
      /* Mit Suchtext immer der ganze Bestand — sonst muesste man erst
         umschalten, um ueberhaupt finden zu koennen. */
      alle.forEach(function (r) {
        if (r.toLowerCase().indexOf(such) > -1) {
          zeilen.push({ typ: 'rolle', rolle: r, platz: passend[r] });
        }
      });
      if (!zeilen.length) { zeilen.push({ typ: 'leer' }); }
      return zeilen;
    }
    if (mu && !alleZeigen) {
      /* Die Muster-Rollen, je Platz eine Gruppe, in Musterreihenfolge.
         Der Kopf sagt, ob der Platz schon vergeben ist — damit ist der
         fruehere Pfeil erklaert, ohne dass er an jeder Zeile klebt. */
      var proPlatz = {};
      alle.forEach(function (r) {
        var p = passend[r];
        if (p) { (proPlatz[p] = proPlatz[p] || []).push(r); }
      });
      var gesehen = {};
      mu.states.forEach(function (pl) {
        if (!pl.name || gesehen[pl.name] || !proPlatz[pl.name]) { return; }
        gesehen[pl.name] = true;
        zeilen.push({ typ: 'kopf', platz: pl.name,
                      belegt: einst.belegtVon ? einst.belegtVon[pl.name] : null });
        proPlatz[pl.name].forEach(function (r) { zeilen.push({ typ: 'rolle', rolle: r }); });
      });
      zeilen.push({ typ: 'schalter' });
      return zeilen;
    }
    /* Alle Rollen, nach Familie geordnet. */
    var fam = {};
    alle.forEach(function (r) {
      var f = r.split('.')[0];
      (fam[f] = fam[f] || []).push(r);
    });
    Object.keys(fam).sort().forEach(function (f) {
      zeilen.push({ typ: 'kopf', familie: f, anzahl: fam[f].length });
      fam[f].forEach(function (r) {
        zeilen.push({ typ: 'rolle', rolle: r, platz: passend[r] });
      });
    });
    if (mu) { zeilen.push({ typ: 'schalter' }); }
    return zeilen;
  }

  function malen() {
    var zeilen = baueZeilen();
    eintraege = [];
    liste.textContent = '';
    zeilen.forEach(function (z) {
      if (z.typ === 'kopf') {
        var k = el('div', 'vz gruppe');
        if (z.platz) {
          k.appendChild(el('span', null, tr('roles.slot', z.platz, musterName(einst.muster) || einst.muster)));
          /* Belegt rot, frei gruen - der Zustand soll ins Auge fallen
             (Ricardo, 25.08.2026). */
          if (einst.belegtVon) {
            k.appendChild(el('span', 'tiefer ' + (z.belegt ? 'rbelegt' : 'rfrei'),
              z.belegt ? tr('roles.slotTaken', z.belegt) : tr('roles.slotFree')));
          }
        } else {
          k.appendChild(el('span', null, z.familie));
          k.appendChild(el('span', 'tiefer', String(z.anzahl)));
        }
        liste.appendChild(k);
        return;
      }
      if (z.typ === 'schalter') {
        /* Als Aufklapper kenntlich - Akzentfarbe und Pfeil, sonst las
           sich die Zeile wie ein weiterer Eintrag (Ricardo, 25.08.). */
        var um = el('div', 'vz mehr');
        um.appendChild(el('span', null, (alleZeigen ? '▴  ' : '▾  ')
          + (alleZeigen ? tr('roles.patternOnly') : tr('roles.showAll', alle.length))));
        um.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          alleZeigen = !alleZeigen;
          markiert = -1;
          malen();
          feld.focus();
        });
        liste.appendChild(um);
        return;
      }
      if (z.typ === 'leer') {
        var lz = el('div', 'vz zurueck');
        lz.appendChild(el('span', null, tr('roles.noMatch', feld.value)));
        liste.appendChild(lz);
        return;
      }
      var n = eintraege.length;
      var r = el('div', 'vz' + (n === markiert ? ' an' : '')
        + (z.rolle === (einst.wert || '') ? ' gewaehlt' : ''));
      r.appendChild(el('span', null, z.rolle || tr('list.noRole')));
      /* Nur ausserhalb der Platzgruppen: dort steht der Platz im Kopf. */
      if (z.platz) { r.appendChild(el('span', 'tiefer', tr('roles.leadsTo', z.platz))); }
      r.addEventListener('mousedown', function (ev) {
        ev.preventDefault();
        waehle(z.rolle);
      });
      eintraege.push({ rolle: z.rolle, el: r });
      liste.appendChild(r);
    });
    liste.hidden = false;
  }

  feld.addEventListener('focus', function () {
    feld.value = '';
    markiert = -1;
    malen();
  });
  feld.addEventListener('input', function () { markiert = -1; malen(); });
  feld.addEventListener('blur', function () {
    setTimeout(function () { zu(); beschrifte(); }, 120);
  });
  feld.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { zu(); beschrifte(); feld.blur(); return; }
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      if (liste.hidden) { malen(); return; }
      ev.preventDefault();
      if (!eintraege.length) { return; }
      markiert += (ev.key === 'ArrowDown' ? 1 : -1);
      if (markiert < 0) { markiert = eintraege.length - 1; }
      if (markiert >= eintraege.length) { markiert = 0; }
      malen();
      var akt = eintraege[markiert] && eintraege[markiert].el;
      if (akt && akt.scrollIntoView) { akt.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (!liste.hidden && eintraege.length) {
        waehle(eintraege[markiert >= 0 ? markiert : 0].rolle);
      }
    }
  });

  return wrap;
}
