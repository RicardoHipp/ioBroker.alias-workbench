/* Die Vorpruefung, die bisher von Hand lief - jetzt als Test.

   Der Reiter ist eine Sammlung von ES-Modulen ohne Bauschritt: was in
   der Datei steht, laeuft im Browser. Ein falsch geschriebener Export
   oder ein tr() ohne Uebersetzung faellt deshalb erst auf, wenn jemand
   genau diese Stelle anklickt. Diese Pruefungen brauchen keinen Browser
   und keine ioBroker-Installation. */

const fs = require('node:fs');
const path = require('node:path');
const { expect } = require('chai');

const wurzel = path.join(__dirname, '..');
const jsDir = path.join(wurzel, 'admin', 'js');
const i18nDir = path.join(wurzel, 'admin', 'i18n');

const SPRACHEN = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

function lies(p) {
    return fs.readFileSync(p, 'utf8');
}
function liesJson(p) {
    return JSON.parse(lies(p));
}

describe('Die Module', () => {
    it('buendeln sich - jeder Import findet seinen Export', function () {
        this.timeout(30000);
        const esbuild = require('esbuild');
        // write:false heisst: nur uebersetzen, nichts ablegen. Ein
        // fehlender Export ist hier ein Fehler, kein Warnhinweis.
        const ergebnis = esbuild.buildSync({
            entryPoints: [path.join(jsDir, 'start.js')],
            bundle: true,
            write: false,
            format: 'esm',
            logLevel: 'silent',
        });
        expect(ergebnis.errors, JSON.stringify(ergebnis.errors)).to.be.empty;
    });
});

describe('Die Uebersetzungen', () => {
    const dateien = {};
    SPRACHEN.forEach(s => {
        const p = path.join(i18nDir, `${s}.json`);
        if (fs.existsSync(p)) {
            dateien[s] = liesJson(p);
        }
    });

    it('haben Englisch und Deutsch', () => {
        expect(dateien.en, 'admin/i18n/en.json fehlt').to.be.an('object');
        expect(dateien.de, 'admin/i18n/de.json fehlt').to.be.an('object');
    });

    it('tragen in jeder vorhandenen Sprache dieselben Schluessel', () => {
        const leitend = Object.keys(dateien.en).sort();
        Object.keys(dateien).forEach(s => {
            if (s === 'en') {
                return;
            }
            const hier = Object.keys(dateien[s]).sort();
            const fehlt = leitend.filter(k => hier.indexOf(k) === -1);
            const zuviel = hier.filter(k => leitend.indexOf(k) === -1);
            expect(fehlt, `${s}.json fehlen: ${fehlt.slice(0, 10).join(', ')}`).to.be.empty;
            expect(zuviel, `${s}.json kennt zusaetzlich: ${zuviel.slice(0, 10).join(', ')}`).to.be.empty;
        });
    });

    it('lassen keinen Text leer', () => {
        Object.keys(dateien).forEach(s => {
            const leer = Object.keys(dateien[s]).filter(k => !String(dateien[s][k]).trim());
            expect(leer, `${s}.json ohne Text: ${leer.join(', ')}`).to.be.empty;
        });
    });

    it('decken jedes tr() im Code ab', () => {
        const gesucht = new Set();
        fs.readdirSync(jsDir)
            .filter(f => f.endsWith('.js'))
            .forEach(f => {
                const quelle = lies(path.join(jsDir, f));
                // tr('schluessel') und tr("schluessel"), auch mit
                // weiteren Argumenten dahinter. Das Komma oder die
                // Klammer am Ende ist wesentlich: tr('help.' + modus)
                // setzt den Schluessel erst zur Laufzeit zusammen, den
                // kann hier niemand nachschlagen.
                const treffer = quelle.match(/\btr\(\s*(['"])(?:(?!\1)[^\\])+\1\s*[,)]/g) || [];
                treffer.forEach(t => gesucht.add(t.replace(/^\btr\(\s*['"]/, '').replace(/['"]\s*[,)]$/, '')));
            });
        expect(gesucht.size, 'kein einziges tr() gefunden - Suchmuster kaputt?').to.be.above(100);
        const ohne = [...gesucht].filter(k => dateien.en[k] === undefined);
        expect(ohne, `tr() ohne Eintrag in en.json: ${ohne.join(', ')}`).to.be.empty;
    });

    // Die Gegenrichtung. Bis 09.09.2026 wurde nur Code -> JSON geprueft,
    // und vier Schluessel standen ein Jahr lang in beiden Sprachdateien,
    // ohne dass sie jemand rief - einer davon mit einem Kommentar im
    // Code, der ausdruecklich das Gegenteil behauptete.
    //
    // Zusammengesetzte Schluessel (tr('help.' + modus)) kann dieser Test
    // nicht sehen. Deshalb zaehlt ein Praefix als Verwendung, sobald der
    // Code irgendwo mit ihm rechnet - lieber einen toten Schluessel
    // durchlassen als einen lebenden zu Unrecht anklagen.
    it('fuehren keinen Schluessel, den niemand ruft', () => {
        let quelltext = '';
        fs.readdirSync(jsDir)
            .filter(f => f.endsWith('.js'))
            .forEach(f => { quelltext += lies(path.join(jsDir, f)); });

        const tot = Object.keys(dateien.en).filter(k => {
            if (quelltext.indexOf(`'${k}'`) !== -1 || quelltext.indexOf(`"${k}"`) !== -1) {
                return false;
            }
            // tr('help.' + x): steht der Praefix mit Punkt im Code, gilt
            // die ganze Familie als in Gebrauch.
            const teile = k.split('.');
            for (let i = 1; i < teile.length; i++) {
                const pre = teile.slice(0, i).join('.') + '.';
                if (quelltext.indexOf(`'${pre}'`) !== -1 || quelltext.indexOf(`"${pre}"`) !== -1) {
                    return false;
                }
            }
            return true;
        });
        expect(tot, `in en.json, aber nirgends gerufen: ${tot.join(', ')}`).to.be.empty;
    });
});

describe('Die Einstellungsseite', () => {
    const jc = liesJson(path.join(wurzel, 'admin', 'jsonConfig.json'));

    it('fuehrt jeden Text in allen elf Sprachen', () => {
        const luecken = [];
        Object.keys(jc.items).forEach(feld => {
            ['text', 'label', 'help'].forEach(attr => {
                const w = jc.items[feld][attr];
                if (!w || typeof w !== 'object') {
                    return;
                }
                SPRACHEN.forEach(s => {
                    if (!w[s]) {
                        luecken.push(`${feld}.${attr}/${s}`);
                    }
                });
            });
        });
        expect(luecken, `fehlt: ${luecken.slice(0, 12).join(', ')}`).to.be.empty;
    });

    it('nennt fuer jedes Bedienfeld einen Vorgabewert', () => {
        const ohne = Object.keys(jc.items).filter(
            f => jc.items[f].type === 'checkbox' && jc.items[f].default === undefined,
        );
        expect(ohne, `ohne default: ${ohne.join(', ')}`).to.be.empty;
    });
});

describe('Die Vorlagen', () => {
    const dir = path.join(wurzel, 'admin', 'vorlagen');
    // index.json ist die Liste, keine Vorlage.
    const dateien = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'index.json');
    const index = liesJson(path.join(dir, 'index.json'));

    it('sind vorhanden', () => {
        expect(dateien.length).to.be.above(0);
    });

    it('stehen vollzaehlig in index.json und umgekehrt', () => {
        const gelistet = index.vorlagen || [];
        const fehltInListe = dateien.filter(f => gelistet.indexOf(f) === -1);
        const fehltAlsDatei = gelistet.filter(f => dateien.indexOf(f) === -1);
        expect(fehltInListe, `liegt da, wird aber nie geladen: ${fehltInListe.join(', ')}`).to.be.empty;
        expect(fehltAlsDatei, `steht in index.json, fehlt aber: ${fehltAlsDatei.join(', ')}`).to.be.empty;
    });

    dateien.forEach(f => {
        it(`${f} ist gueltiges JSON mit id und name`, () => {
            const v = liesJson(path.join(dir, f));
            expect(v.id, 'id fehlt').to.be.a('string').and.not.empty;
            expect(v.name, 'name fehlt').to.exist;
        });
    });

    it('vergeben jede id nur einmal', () => {
        const gesehen = {};
        const doppelt = [];
        dateien.forEach(f => {
            const id = liesJson(path.join(dir, f)).id;
            if (gesehen[id]) {
                doppelt.push(`${id} (${gesehen[id]} und ${f})`);
            }
            gesehen[id] = f;
        });
        expect(doppelt, doppelt.join(', ')).to.be.empty;
    });
});

/* Die Ausdrucks-Zerlegung laeuft ohne Browser und ohne den Detector —
   sie bekommt einen regulaeren Ausdruck und gibt Rollennamen zurueck.
   Genau deshalb laesst sie sich hier pruefen, waehrend der Rest von
   erkennung.js eine Detector-Instanz braucht.

   Geprueft wird beides: dass die vier Formen des LOWBAT-Platzes
   herauskommen — und dass nichts herauskommt, wo der Ausdruck mehr kann,
   als diese Zerlegung versteht. Eine erfundene Rolle in der Auswahlliste
   waere schlimmer als eine fehlende. */
describe('Die Rollen-Schreibweisen', () => {
    /* Ausgeschnitten wird ab `ausdruckText`, nicht erst ab
       `schreibweisenAus`: seit dem 08.09.2026 gehen alle Zerlegungen durch
       diese eine Stelle, und ohne sie liefe der Ausschnitt in ein
       ReferenceError. */
    const quelle = fs.readFileSync(path.join(jsDir, 'erkennung.js'), 'utf8');
    const anfang = quelle.indexOf('export function ausdruckText');
    const ende = quelle.indexOf('export var ROLLEN');
    const code = quelle.slice(anfang, ende).split('export function').join('function');
    const teile = new Function(
        code + '; return { schreibweisenAus, rolleAusAusdruck, rolleTrifft, ausdruckText };')();
    const { schreibweisenAus, rolleAusAusdruck, rolleTrifft, ausdruckText } = teile;

    it('multiplizieren Alternativen und optionale Gruppen aus', () => {
        const r = schreibweisenAus(/^indicator(\.maintenance)?\.(lowbat|battery)$/);
        expect(r).to.have.members([
            'indicator.maintenance.lowbat', 'indicator.maintenance.battery',
            'indicator.lowbat', 'indicator.battery',
        ]);
    });

    it('geben einen schlichten Ausdruck unveraendert zurueck', () => {
        expect(schreibweisenAus(/^value\.power$/)).to.deep.equal(['value.power']);
    });

    it('schweigen, wo der Ausdruck mehr kann als diese Zerlegung', () => {
        expect(schreibweisenAus(/^value\..*$/)).to.be.empty;
        expect(schreibweisenAus(/^level\.[a-z]+$/)).to.be.empty;
        expect(schreibweisenAus(/value\.power/)).to.be.empty;   // ohne Anker
        expect(schreibweisenAus(null)).to.be.empty;
    });

    /* Der Fall, an dem der Test bis zum 08.09.2026 vorbeigesehen hat.

       Die Werkbank bekommt die Muster ueber `getPatterns()`, und das gibt
       jeden Ausdruck als `String(regexp)` — also MIT Schraegstrichen. Wer
       nur mit RegExp-Literalen prueft, sieht gruen, waehrend in der
       Oberflaeche 22 Rollen fehlen. Deshalb hier beide Formen. */
    it('verstehen den Ausdruck auch als Text mit Schraegstrichen', () => {
        const alsText = '/^indicator(\\.maintenance)?\\.(lowbat|battery)$/';
        expect(schreibweisenAus(alsText)).to.have.members([
            'indicator.maintenance.lowbat', 'indicator.maintenance.battery',
            'indicator.lowbat', 'indicator.battery',
        ]);
        expect(rolleAusAusdruck('/^level\\.brightness$/')).to.equal('level.brightness');
        expect(rolleTrifft('/^value\\.power$/', 'value.power')).to.equal(true);
        expect(rolleTrifft('/^value\\.power$/', 'value.current')).to.equal(false);
    });

    it('geben beide Formen denselben Quelltext', () => {
        expect(ausdruckText(/^value\.power$/)).to.equal('^value\\.power$');
        expect(ausdruckText('/^value\\.power$/')).to.equal('^value\\.power$');
        expect(ausdruckText('/^value\\.power$/i')).to.equal('^value\\.power$');
        expect(ausdruckText('^value\\.power$')).to.equal('^value\\.power$');
        expect(ausdruckText(null)).to.equal('');
    });
});

/* Und die Gegenprobe an dem, was wirklich ankommt.

   Die drei Tests darueber pruefen die Zerlegung fuer sich. Dieser hier
   nimmt die Muster so, wie die Werkbank sie bekommt — ueber
   `ChannelDetector.getPatterns()`, genau wie `src/detector-bundle.js` es
   tut — und rechnet damit dieselbe Rollenliste aus wie `erkennung.js`.
   Waere die Schraegstrich-Frage wieder offen, faellt hier die Zahl auf
   ihre Haelfte und `indicator.lowbat` verschwindet.

   Zahlen absichtlich als Untergrenze: eine neue Detector-Fassung darf
   Rollen hinzufuegen, ohne den Test rot zu machen. Was nicht passieren
   darf, ist der Absturz von 232 auf 210. */
describe('Die Rollenliste aus dem echten Detector', () => {
    const anfang2 = fs.readFileSync(path.join(jsDir, 'erkennung.js'), 'utf8');
    const von = anfang2.indexOf('export function ausdruckText');
    const bis = anfang2.indexOf('export var ROLLEN');
    const code2 = anfang2.slice(von, bis).split('export function').join('function');
    const t2 = new Function(
        code2 + '; return { schreibweisenAus, rolleVonPlatz, rolleTrifft };')();

    let patterns = null;
    before(() => {
        const detector = require('@iobroker/type-detector');
        const ChannelDetector = detector.default || detector.ChannelDetector || detector;
        patterns = ChannelDetector.getPatterns();
    });

    it('kennt indicator.lowbat, nicht nur die Vorgabeform', () => {
        const rollen = {};
        Object.keys(patterns).forEach(typ => {
            patterns[typ].states.forEach(st => {
                const r = t2.rolleVonPlatz(st);
                if (r) { rollen[r] = 1; }
                t2.schreibweisenAus(st.role).forEach(x => { rollen[x] = 1; });
            });
        });
        expect(Object.keys(rollen), 'indicator.lowbat fehlt — liest jemand den Ausdruck wieder mit Schraegstrichen?')
            .to.include('indicator.lowbat');
        expect(Object.keys(rollen).length,
            'zu wenige Rollen — die Ausmultiplikation greift nicht mehr')
            .to.be.at.least(225);
    });

    it('gibt jedem Platz mit Ausdruck eine Rolle', () => {
        const ohne = [];
        Object.keys(patterns).forEach(typ => {
            patterns[typ].states.forEach(st => {
                if (st.role && !t2.rolleVonPlatz(st)) { ohne.push(typ + '.' + st.name); }
            });
        });
        /* Uebrig bleiben duerfen nur Plaetze, deren Ausdruck mehr kann als
           ein Rollenname — Platzhalter wie `weatherForecast.ICON%d`. Was
           NICHT uebrig bleiben darf, ist BRIGHTNESS: dessen Ausdruck ist
           ein blosser Anker samt Wort. */
        expect(ohne.filter(x => /BRIGHTNESS/.test(x)),
            'BRIGHTNESS ohne Rolle — der Platz waere auf keinem Weg zu befuellen')
            .to.be.empty;
    });

    it('findet zu jeder Rolle des Musters auch dessen Platz', () => {
        const th = patterns.thermostat;
        const treffer = th.states.filter(st => st.defaultRole &&
            t2.rolleTrifft(st.role, st.defaultRole));
        const mitRolle = th.states.filter(st => st.defaultRole && st.role);
        expect(treffer.length, 'plaetzeFuerRollen faende zu keiner Rolle einen Platz')
            .to.equal(mitRolle.length);
    });
});

/* Der eingebackene Detektor.

   `admin/detector.js` ist keine Datei, die jemand schreibt - esbuild
   packt die Bibliothek `@iobroker/type-detector` aus `node_modules`
   hinein (`npm run build`). Beides laeuft NICHT automatisch: `npm
   update` holt eine neue Bibliothek, aendert die eingebackene Fassung
   aber nicht. Genau das ist am 06.09.2026 passiert - installiert war
   6.0.1, ausgeliefert weiter 6.0.0, und aufgefallen ist es niemandem,
   obwohl die Kopfzeile der Werkbank die Version anzeigt.

   Der Test vergleicht die beiden Zahlen. Er verlangt NICHT, dass die
   eingecheckte Datei Byte fuer Byte einem Bau von heute gleicht - die
   ausgelieferte Fassung ist bewusst die gepruefte, siehe den Vermerk in
   der GitHub-Action. Nur die Version muss stimmen. */
describe('Der eingebackene Detektor', () => {
    it('traegt dieselbe Version wie die installierte Bibliothek', () => {
        const paket = liesJson(path.join(
            wurzel, 'node_modules', '@iobroker', 'type-detector', 'package.json'));
        const bundle = lies(path.join(wurzel, 'admin', 'detector.js'));

        const treffer = bundle.match(/version\s*:\s*["']([0-9]+\.[0-9]+\.[0-9]+)["']/);
        expect(treffer, 'in admin/detector.js steht keine Version - Bauschritt geaendert?')
            .to.not.equal(null);

        expect(treffer[1], 'admin/detector.js ist alt: neu bauen mit "npm run build"')
            .to.equal(paket.version);
    });
});
