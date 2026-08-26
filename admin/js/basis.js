/* Zustandsfreie Helfer, die jedes Modul brauchen darf.

   Hier liegt nichts, was sich aendert - nur Werkzeug. */

export var D = window.AWDetector;
export var $ = function (s) { return document.querySelector(s); };

/* Plus und Minus in der Form, die auch der Admin verwendet. Fuer
   Abschnitte, die man auf- und zuklappt — im Gegensatz zum Baum, wo ein
   Dreieck die gewohnte Form ist. „Mehr davon" und „hier geht es weiter"
   sind zwei verschiedene Aussagen. */
var WEG_PLUS  = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z';
var WEG_MINUS = 'M19 13H5v-2h14z';

export function klappZeichen(offen) {
  var sp = document.createElement('span');
  sp.className = 'klappz';
  sp.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' +
                 (offen ? WEG_MINUS : WEG_PLUS) + '"/></svg>';
  return sp;
}
export function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) { e.className = cls; }
  if (txt !== undefined) { e.textContent = txt; }
  return e;
}

export function holeText(pfad) {
  return fetch(pfad).then(function (r) {
    if (!r.ok) { throw new Error(String(r.status)); }
    return r.text();
  });
}

export function kurz(id, kanal) { return id.slice(kanal.length + 1); }
