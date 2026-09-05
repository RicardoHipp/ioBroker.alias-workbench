import config, { esmConfig } from '@iobroker/eslint-config';

/* Die ioBroker-Vorlage bringt Prettier mit. Auf diesen 12.315 Zeilen
   waeren das 12.331 Formatierungsbeanstandungen plus 2.778 zur Stellung
   der geschweiften Klammern - zusammen 95 % aller Meldungen, und keine
   davon findet einen Fehler. Eine Neuformatierung des ganzen Bestandes
   macht jede kuenftige Aenderung in der Historie unlesbar, ohne dass
   irgendetwas besser liefe. Also aus.

   Was bleibt, sind die Regeln, die Substanz finden: tote Importe,
   doppelte Deklarationen, ueberfluessige Maskierungen. */

export default [
    {
        // admin/detector.js ist das gebuendelte Ergebnis von src/, nicht
        // von Hand geschrieben.
        ignores: ['admin/detector.js', 'node_modules/**', 'admin/vorlagen/**'],
    },
    ...config,
    ...esmConfig,
    {
        rules: {
            'prettier/prettier': 'off',
            'brace-style': 'off',
            'prefer-template': 'off',
            'jsdoc/require-jsdoc': 'off',
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-returns-description': 'off',
        },
    },
    {
        // Die 29 Module unter admin/js laufen im Browser, geladen als
        // ES-Module vom Admin. Kein Node, keine Bauzeit.
        files: ['admin/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                fetch: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                console: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                prompt: 'readonly',
                Blob: 'readonly',
                URL: 'readonly',
                FileReader: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                MutationObserver: 'readonly',
                Event: 'readonly',
                CustomEvent: 'readonly',
                getComputedStyle: 'readonly',
                io: 'readonly',
                AWDetector: 'readonly',
            },
        },
    },
    {
        // src/ wird von esbuild verarbeitet und schreibt am Ende ans
        // window des Admin - deshalb dieselben Browser-Namen.
        files: ['src/**/*.js'],
        languageOptions: {
            sourceType: 'module',
            globals: { window: 'readonly' },
        },
    },
];
