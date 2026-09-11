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
// Zwei getrennte Woerterbuecher, mit verschiedenen Aufgaben:
//   admin/sprachen/  - die Oberflaeche des Reiters, 588 Schluessel,
//                      von sprache.js selbst geladen. Deutsch und Englisch.
//   admin/i18n/      - die Einstellungsseite, die der Admin zeigt. Den
//                      Ordner liest der Admin (jsonConfig i18n: true), und
//                      der Adapterpruefer erwartet dort alle elf Sprachen.
const sprachenDir = path.join(wurzel, 'admin', 'sprachen');
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

describe('Die Uebersetzungen des Reiters', () => {
    const dateien = {};
    SPRACHEN.forEach(s => {
        const p = path.join(sprachenDir, `${s}.json`);
        if (fs.existsSync(p)) {
            dateien[s] = liesJson(p);
        }
    });

    it('haben Englisch und Deutsch', () => {
        expect(dateien.en, 'admin/sprachen/en.json fehlt').to.be.an('object');
        expect(dateien.de, 'admin/sprachen/de.json fehlt').to.be.an('object');
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

describe('Die Vorlagen und ihre Datentypen', () => {
    // Am 11.09.2026 stand in einer selbstgebauten Vorlage die Rolle
    // value.power.consumption mit Typ "mixed". Die Rolle war richtig,
    // der Platz CONSUMPTION verlangt aber "number" - der Punkt fiel
    // durch, kein Platz blieb belegt, und das Geraet wurde statt als
    // "electricity" nur noch als "info" erkannt. Am Bildschirm stand
    // dazu nichts weiter als "passt nicht".
    //
    // Hier wird dieselbe Pruefung fuer die mitgelieferten Vorlagen
    // gemacht: Wo ein Platz einen Datentyp verlangt, muss der Zustand
    // ihn tragen. Eigene Vorlagen des Nutzers kann dieser Test nicht
    // sehen - sie liegen in der Instanzkonfiguration; dort warnt seit
    // 11.09.2026 die Oberflaeche.
    const detector = require('@iobroker/type-detector');
    const muster = detector.default.getPatterns();

    // Der gemeldete Geraetetyp ist nicht immer der Musterschluessel:
    // das Muster "blinds" meldet den Typ "blind". Wer den Typ als
    // Schluessel nimmt, greift ins Leere - erkennung.js loest das mit
    // TYP_ZU_MUSTER, hier steht dieselbe Ableitung.
    const typZuMuster = {};
    Object.keys(muster).forEach(k => {
        const t = muster[k].type;
        if (t && t !== k) {
            typZuMuster[t] = k;
        }
    });
    const musterVon = typ => muster[typ] || muster[typZuMuster[typ]] || null;

    function platzFuerRolle(musterName, rolle) {
        const mu = musterVon(musterName);
        if (!mu || !rolle) {
            return null;
        }
        return (
            mu.states.find(st => {
                if (!st.role) {
                    return false;
                }
                // st.role kommt als Text mit Schraegstrichen: "/^value\.power$/".
                // Wer den unveraendert an new RegExp gibt, sucht nach
                // Schraegstrichen und trifft nie - erkennung.js schaelt sie
                // in ausdruckText() heraus, hier steht dasselbe.
                const roh = st.role.source !== undefined ? st.role.source : String(st.role);
                const m = /^\/(.*)\/[a-z]*$/.exec(roh);
                let re;
                try {
                    re = new RegExp(m ? m[1] : roh);
                } catch {
                    return false;
                }
                return re.test(rolle);
            }) || null
        );
    }

    const vorlagen = liesJson(path.join(wurzel, 'admin', 'vorlagen', 'index.json')).vorlagen.map(name =>
        // index.json fuehrt die Dateinamen samt Endung
        liesJson(path.join(wurzel, 'admin', 'vorlagen', name)),
    );

    it('findet zu jedem Geraetetyp ein Muster', () => {
        const ohne = vorlagen
            .filter(v => v.geraetetyp && !musterVon(v.geraetetyp))
            .map(v => `${v.id}: ${v.geraetetyp}`);
        expect(ohne, `Geraetetyp ohne Muster: ${ohne.join(', ')}`).to.be.empty;
    });

    // 622 Plaetze nennen genau einen Typ, 28 nennen mehrere
    // (mediaPlayer/STATE: ["boolean","number"]), 82 nennen keinen.
    // Wer die Liste als String liest, erhaelt "boolean,number" - den
    // Typ gibt es nicht.
    const typenVon = platz => {
        if (!platz || !platz.type) {
            return [];
        }
        return Array.isArray(platz.type) ? platz.type : [String(platz.type)];
    };

    // Eine begruendete Ausnahme: Homematic meldet die Fahrtrichtung als
    // Zahl (0 steht, 1 faehrt auf, 2 faehrt zu, 3 unbekannt), das Muster
    // blinds/DIRECTION laesst nur boolean zu. Vier Zustaende passen nicht
    // in einen Wahrheitswert - die Vorlage hat recht, das Muster ist zu
    // eng. Der Platz ist optional, der Punkt wird also trotzdem angelegt
    // und ist voll benutzbar; er zaehlt nur nicht zur Erkennung.
    const AUSNAHMEN = ['hm-rollladen/DIRECTION'];

    it('geben jedem Zustand einen Datentyp, den sein Platz zulaesst', () => {
        const schief = [];
        vorlagen.forEach(v => {
            if (!v.geraetetyp || !musterVon(v.geraetetyp)) {
                return;
            }
            (v.zustaende || []).forEach(z => {
                const platz = platzFuerRolle(v.geraetetyp, z.rolle);
                const erlaubt = typenVon(platz);
                if (!erlaubt.length || !z.typ) {
                    return; // kein Platz, keine Vorgabe, oder kein Typ gesetzt
                }
                if (erlaubt.indexOf(z.typ) === -1 && AUSNAHMEN.indexOf(`${v.id}/${z.name}`) === -1) {
                    schief.push(
                        `${v.id}/${z.name}: Platz ${platz.name} laesst ${erlaubt.join('/')} zu, Vorlage sagt ${z.typ}`,
                    );
                }
            });
        });
        expect(schief, schief.join(' | ')).to.be.empty;
    });

    it('lassen keinen Zustand ohne Typ, wo der Platz einen verlangt', () => {
        const ohne = [];
        vorlagen.forEach(v => {
            if (!v.geraetetyp || !musterVon(v.geraetetyp)) {
                return;
            }
            (v.zustaende || []).forEach(z => {
                const erlaubt = typenVon(platzFuerRolle(v.geraetetyp, z.rolle));
                if (erlaubt.length && !z.typ) {
                    ohne.push(`${v.id}/${z.name}: Platz laesst ${erlaubt.join('/')} zu, Vorlage nennt keinen`);
                }
            });
        });
        expect(ohne, ohne.join(' | ')).to.be.empty;
    });
});

describe('Die Entwicklerdateien', () => {
    // Beide Dateien laufen nie mit aus - sie sind Werkzeug. Trotzdem
    // stehen sie hier: der Adapterpruefer vergleicht die Schema-Adressen
    // Zeichen fuer Zeichen und meldet eine abweichende als *Fehler*
    // (E4041, E4043, E4045), nicht als Hinweis.
    const SCHEMA_IO_PACKAGE =
        'https://raw.githubusercontent.com/ioBroker/ioBroker.js-controller/master/schemas/io-package.json';
    const SCHEMA_JSONCONFIG =
        'https://raw.githubusercontent.com/ioBroker/ioBroker.admin/master/packages/jsonConfig/schemas/jsonConfig.json';

    describe('.vscode/settings.json', () => {
        // Kommentare sind hier erlaubt - der Pruefer liest die Datei mit
        // JSON5. Fuer diesen Test reicht es, die // -Zeilen zu entfernen.
        const roh = lies(path.join(wurzel, '.vscode', 'settings.json'));
        const einstellungen = JSON.parse(roh.replace(/^\s*\/\/.*$/gm, ''));
        const schemata = einstellungen['json.schemas'];

        it('fuehrt eine Liste "json.schemas"', () => {
            expect(schemata, 'json.schemas').to.be.an('array').that.is.not.empty;
        });

        it('nennt fuer io-package.json die erwartete Adresse', () => {
            const eintrag = schemata.find(s => (s.fileMatch || []).indexOf('io-package.json') > -1);
            expect(eintrag, 'kein Eintrag fuer io-package.json').to.be.an('object');
            expect(eintrag.url).to.equal(SCHEMA_IO_PACKAGE);
        });

        it('deckt beide Formen der jsonConfig ab, json und json5', () => {
            // Der Pruefer sucht zweimal: einen Eintrag, dessen fileMatch
            // alle drei .json nennt, und einen, der alle drei .json5
            // nennt. Ein Eintrag mit allen sechs erfuellt beides.
            const json = ['admin/jsonConfig.json', 'admin/jsonCustom.json', 'admin/jsonTab.json'];
            const json5 = json.map(f => `${f}5`);
            [json, json5].forEach(gruppe => {
                const eintrag = schemata.find(s => gruppe.every(f => (s.fileMatch || []).indexOf(f) > -1));
                expect(eintrag, `kein Eintrag fuer ${gruppe[0]} und Geschwister`).to.be.an('object');
                expect(eintrag.url).to.equal(SCHEMA_JSONCONFIG);
            });
        });
    });

    describe('.github/dependabot.yml', () => {
        const roh = lies(path.join(wurzel, '.github', 'dependabot.yml'));
        // Kommentarzeilen weg, sonst zaehlt die Begruendung als Fund.
        const ohneKommentar = roh.replace(/^\s*#.*$/gm, '');

        it('nimmt keinen monatlichen Takt', () => {
            // "monthly" laesst alle Adapter am Monatsersten gleichzeitig
            // anfragen (S8906), und ein "day" waere dort wirkungslos (W8909).
            expect(/interval:\s*monthly/.test(ohneKommentar), 'interval: monthly gefunden').to.be.false;
        });

        it('gibt jedem cron-Takt seinen Ausdruck mit', () => {
            // Ohne cronjob ist der Eintrag ungueltig - das Schema von
            // Dependabot verlangt ihn, sobald interval auf cron steht.
            const cronBloecke = (ohneKommentar.match(/interval:\s*cron/g) || []).length;
            const ausdruecke = (ohneKommentar.match(/cronjob:\s*\S+/g) || []).length;
            expect(ausdruecke, 'cron ohne cronjob').to.equal(cronBloecke);
        });
    });
});

describe('Die Changelog-Eintraege', () => {
    // common.news wird im Adapterkatalog angezeigt - in der Sprache des
    // Lesers. Bis 11.09.2026 stand dort fuer neun Sprachen nur eine
    // Kurzfassung: das Englische zu 0.9.7 hatte 3000 Zeichen mit fuenf
    // Ueberschriften und 22 Punkten, das Russische 480 Zeichen ohne
    // Gliederung. Der Adapterpruefer meldet das als W1145, sobald mehr
    // als zwei Sprachen unter 60 % der englischen Laenge liegen.
    //
    // Chinesisch nimmt der Pruefer aus (excludedNewsTranslationLanguages),
    // weil es dichter schreibt - hier steht es aus demselben Grund nicht
    // in der Laengenpruefung, wohl aber in der Gliederungspruefung.
    const news = liesJson(path.join(wurzel, 'io-package.json')).common.news;
    const OHNE_LAENGENPRUEFUNG = ['en', 'zh-cn'];

    function jedeUebersetzung(tuwas) {
        Object.keys(news).forEach(version => {
            const en = news[version].en;
            Object.keys(news[version]).forEach(sprache => {
                if (sprache === 'en') {
                    return;
                }
                tuwas(version, sprache, news[version][sprache], en);
            });
        });
    }

    it('haben zu jeder Fassung einen englischen Text', () => {
        const ohne = Object.keys(news).filter(v => !String(news[v].en || '').trim());
        expect(ohne, `ohne en: ${ohne.join(', ')}`).to.be.empty;
    });

    it('tragen jede Fassung in allen elf Sprachen', () => {
        const luecken = [];
        Object.keys(news).forEach(version => {
            SPRACHEN.forEach(s => {
                if (!String(news[version][s] || '').trim()) {
                    luecken.push(`${version}/${s}`);
                }
            });
        });
        expect(luecken, `fehlt: ${luecken.join(', ')}`).to.be.empty;
    });

    it('kuerzen keine Uebersetzung auf unter 60 Prozent', () => {
        const kurz = [];
        jedeUebersetzung((version, sprache, text, en) => {
            if (OHNE_LAENGENPRUEFUNG.indexOf(sprache) > -1) {
                return;
            }
            if (text.length < en.length * 0.6) {
                kurz.push(`${version}/${sprache} ${Math.round((100 * text.length) / en.length)} %`);
            }
        });
        expect(kurz, `zu kurz: ${kurz.join(', ')}`).to.be.empty;
    });

    it('behalten die Gliederung des englischen Textes', () => {
        const schief = [];
        jedeUebersetzung((version, sprache, text, en) => {
            const punkte = s => (s.match(/\n\* /g) || []).length;
            const marken = s => (s.match(/\*\*/g) || []).length;
            if (punkte(text) !== punkte(en) || marken(text) !== marken(en)) {
                schief.push(
                    `${version}/${sprache}: ${punkte(text)}/${punkte(en)} Punkte, ` +
                        `${marken(text)}/${marken(en)} Marken`,
                );
            }
        });
        expect(schief, `abweichend: ${schief.join(' | ')}`).to.be.empty;
    });

    it('lassen keine Uebersetzung beim englischen Text stehen', () => {
        // [E1144] beim Pruefer: nicht uebersetzt, nur kopiert.
        const kopiert = [];
        jedeUebersetzung((version, sprache, text, en) => {
            if (text === en) {
                kopiert.push(`${version}/${sprache}`);
            }
        });
        expect(kopiert, `unuebersetzt: ${kopiert.join(', ')}`).to.be.empty;
    });

    it('fuehren hoechstens sieben Fassungen', () => {
        // Der Repository-Builder schneidet bei sieben ab (W1032).
        expect(Object.keys(news).length, 'Eintraege in common.news').to.be.at.most(7);
    });
});

describe('Die Einstellungsseite', () => {
    const jc = liesJson(path.join(wurzel, 'admin', 'jsonConfig.json'));
    // Seit dem Umzug traegt die jsonConfig nur noch englische Texte; die
    // Uebersetzungen stehen in admin/i18n/. Diesen Ordner laedt der Admin
    // selbst (i18n: true), und Weblate kann ihn lesen. Vorher lagen elf
    // Sprachen in jedem Feld - dieselben Worte, nur an einer Stelle, die
    // ausser uns niemand kennt.
    const TEXTFELDER = ['text', 'label', 'help'];
    const woerter = {};
    SPRACHEN.forEach(s => {
        const p = path.join(i18nDir, `${s}.json`);
        if (fs.existsSync(p)) {
            woerter[s] = liesJson(p);
        }
    });

    function texte() {
        const gefunden = [];
        Object.keys(jc.items).forEach(feld => {
            TEXTFELDER.forEach(attr => {
                const w = jc.items[feld][attr];
                if (typeof w === 'string' && w.trim()) {
                    gefunden.push({ ort: `${feld}.${attr}`, text: w });
                }
            });
        });
        return gefunden;
    }

    it('schaltet die Uebersetzung ein', () => {
        // i18n: false hiesse: der Admin sieht admin/i18n gar nicht an,
        // und jeder Nutzer bekommt Englisch.
        expect(jc.i18n, 'jsonConfig i18n').to.equal(true);
    });

    it('traegt ihre Texte als Schluessel, nicht als Sprachobjekt', () => {
        const objekte = [];
        Object.keys(jc.items).forEach(feld => {
            TEXTFELDER.forEach(attr => {
                const w = jc.items[feld][attr];
                if (w && typeof w === 'object') {
                    objekte.push(`${feld}.${attr}`);
                }
            });
        });
        expect(objekte, `noch eingebaut statt im Woerterbuch: ${objekte.join(', ')}`).to.be.empty;
        expect(texte().length, 'kein einziger Text gefunden - Suchmuster kaputt?').to.be.above(5);
    });

    it('findet jeden ihrer Texte im Woerterbuch, in allen elf Sprachen', () => {
        const luecken = [];
        texte().forEach(({ ort, text }) => {
            SPRACHEN.forEach(s => {
                if (!woerter[s]) {
                    luecken.push(`admin/i18n/${s}.json fehlt ganz`);
                } else if (!woerter[s][text]) {
                    luecken.push(`${ort}/${s}`);
                }
            });
        });
        expect([...new Set(luecken)], `fehlt: ${[...new Set(luecken)].slice(0, 12).join(', ')}`).to.be
            .empty;
    });

    it('fuehrt im Woerterbuch keinen Schluessel, den die Seite nicht zeigt', () => {
        const gebraucht = new Set(texte().map(t => t.text));
        const tot = Object.keys(woerter.en || {}).filter(k => !gebraucht.has(k));
        expect(tot, `in admin/i18n/en.json, aber nirgends verwendet: ${tot.join(' | ')}`).to.be.empty;
    });

    it('laesst in keiner Sprache einen Text leer', () => {
        const leer = [];
        Object.keys(woerter).forEach(s => {
            Object.keys(woerter[s]).forEach(k => {
                if (!String(woerter[s][k]).trim()) {
                    leer.push(`${s}: ${k.slice(0, 30)}`);
                }
            });
        });
        expect(leer, `ohne Text: ${leer.join(', ')}`).to.be.empty;
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
   `ChannelDetector.getPatterns()`, genau wie `src-admin/detector-bundle.js` es
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
