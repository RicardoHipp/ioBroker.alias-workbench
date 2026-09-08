/* Woerterbuch und Sprachwahl.

   `sprache` und `expertenVorgabe` sind lebende Bindungen: wer sie
   importiert, sieht den jeweils aktuellen Wert. Geschrieben werden sie
   nur hier - `ladeSprache` fragt system.config einmal ab und beantwortet
   damit beides, Sprache und Expertenmodus. */

import { socket } from './verbindung.js';
import { $ } from './basis.js';

export var expertenVorgabe = false;

/* ================== Sprachen ==================
   Woerterbuch als flache Schluessel-Text-Karte unter admin/i18n/.
   Neue Sprache = neue Datei, sonst nichts. Faellt eine Uebersetzung
   aus, greift Englisch, danach der Schluessel selbst — so bleibt die
   Oberflaeche bedienbar statt leer. */
export var SPRACHEN = ['de', 'en'];
var woerter = {};
var woerterEn = {};
export var sprache = 'en';

export function tr(schluessel) {
  var text = woerter[schluessel];
  if (text === undefined) { text = woerterEn[schluessel]; }
  if (text === undefined) { text = schluessel; }
  if (arguments.length > 1) {
    for (var i = 1; i < arguments.length; i++) {
      text = text.split('{' + (i - 1) + '}').join(String(arguments[i]));
    }
  }
  return text;
}

export function ladeSprache(fertig) {
  /* Die Systemsprache steht in system.config; bis die Antwort da ist,
     nehmen wir die des Browsers. */
  var vorgabe = (navigator.language || 'en').slice(0, 2).toLowerCase();

  function hole(code, ziel, danach) {
    fetch('./i18n/' + code + '.json')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { Object.keys(d).forEach(function (k) { ziel[k] = d[k]; }); danach(); })
      .catch(function () { danach(); });
  }

  var weiter = function (code) {
    sprache = (SPRACHEN.indexOf(code) > -1) ? code : 'en';
    hole('en', woerterEn, function () {
      if (sprache === 'en') { woerter = woerterEn; return fertig(); }
      hole(sprache, woerter, fertig);
    });
  };

  var beantwortet = false;
  socket.emit('getObject', 'system.config', function (err, obj) {
    if (beantwortet) { return; }
    beantwortet = true;
    /* Der Expertenmodus steht an derselben Stelle — einmal fragen reicht
       fuer beides. */
    expertenVorgabe = !!(!err && obj && obj.common && obj.common.expertMode);
    var l = (!err && obj && obj.common && obj.common.language) || vorgabe;
    weiter(l);
  });
  setTimeout(function () {
    if (!beantwortet) { beantwortet = true; weiter(vorgabe); }
  }, 2500);
}

/* Beschriftungen im festen HTML nachziehen. */
export function beschrifteHtml() {
  document.title = tr('app.title');
  var setz = function (wahl, text) {
    var el2 = document.querySelector(wahl);
    if (el2) { el2.textContent = text; }
  };
  setz('header.top h1', tr('app.title'));
  setz('#m-quellen', tr('tree.sources'));
  setz('#m-aliase', tr('tree.aliases'));
  setz('#m-vorlagen', tr('tree.templates'));
  setz('.pickpane .panehead .lbl', tr('app.objectsCount', '').trim());
  setz('.respane .panehead .lbl', tr('result.header'));
  var q = $('#q');
  if (q) {
    q.placeholder = tr('tree.filter');
    /* Auch die Vorlesehilfe: sie stand fest verdrahtet in tab.html und
       blieb als einziger Text neben „Einlesen …" deutsch, wenn der
       Admin auf Englisch steht (26.08.2026). */
    q.setAttribute('aria-label', tr('tree.filterAria'));
  }
  setz('#btn-einlesen', tr('tv.importFile'));
  setz('#btn-dry', tr('write.createAlias'));
  setz('#btn-dry-alle', tr('write.createAll', ''));
  var bc = $('#btn-checks');
  if (bc) { bc.childNodes[0].nodeValue = tr('check.button') + ' '; }
  setz('#dry-titel', tr('write.dryTitleCreate'));
  setz('#btn-tpl', tr('tpls.button'));
  var bA = $('#btn-auf'), bZ = $('#btn-zu');
  if (bA) { bA.title = tr('tree.expandAll'); bA.setAttribute('aria-label', tr('tree.expandAll')); }
  if (bZ) { bZ.title = tr('tree.collapseAll'); bZ.setAttribute('aria-label', tr('tree.collapseAll')); }
  setz('#btn-move', tr('move.button'));
  setz('#btn-swap', tr('swap.button'));
  setz('#swap-titel', tr('swap.title'));
  setz('#btn-swap-go', tr('swap.now'));
  setz('#move-titel', tr('move.title'));
  setz('#btn-move-go', tr('move.now'));
  setz('#btn-del', tr('del.button'));
  setz('#del-titel', tr('del.title'));
  setz('#btn-del-go', tr('del.now'));
  setz('#tpl-titel', tr('tpls.title', ''));
  setz('#btn-tpl-save', tr('tpls.saveNew'));
  setz('#mqtt-titel', tr('mq.dialogTitle'));
  /* Der Titel des Info-Dialogs traegt den Musternamen und wird beim
     Oeffnen gesetzt; hier steht nur der Rueckfall ohne Muster. */
  setz('#info-titel', tr('info.dlgTitle', ''));
  setz('#guess-titel', tr('guess.tplTitle'));
  setz('#btn-guess-go', tr('guess.tplGo'));
  setz('#tree .empty', tr('tree.loading'));
  /* Startmodus ist das Anlegen - bis das erste Zeichnen laeuft. */
  setz('#res .empty', tr('help.sources'));
  setz('#btn-dry-write', tr('write.now'));
  setz('#dlg-checks h3', tr('check.title'));
  document.querySelectorAll('dialog [data-close]').forEach(function (b) {
    b.textContent = tr('write.close');
  });
}

/* Vorlagennamen duerfen je Sprache anders lauten: entweder eine
   Zeichenkette oder ein Objekt wie { de: '...', en: '...' }. */
export function sprachtext(v) {
  if (v === undefined || v === null) { return ''; }
  if (typeof v === 'object') { return v[sprache] || v.en || v.de || Object.values(v)[0] || ''; }
  return String(v);
}

export function txt(v) {
  if (v === undefined || v === null) { return ''; }
  if (typeof v === 'object') { return v.de || v.en || ''; }
  return String(v);
}
