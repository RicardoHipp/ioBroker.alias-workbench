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
