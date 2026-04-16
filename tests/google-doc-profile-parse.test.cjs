'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DP = require('../google-doc-profile-parse.js');

function readFixture(name) {
    return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('google-doc-profile-parse (Account Brain)', () => {
    test('fixture: fenced inner profile preserves account + key players + notes', () => {
        const docText = readFixture('account-brain-full-doc.txt');
        const fenced = DP.extractBestFencedMarkdown(docText);
        assert.ok(fenced.includes('Tony Mancill'), 'fenced block should include Tony');
        const parsed = DP.parseProfilePlainTextFallback(fenced);
        assert.equal(parsed.accountName, 'Nvidia');
        assert.equal(parsed.keyPlayers.length, 2, 'Tony + Mrs YYZ');
        assert.equal(parsed.keyPlayers[0].name, 'Tony Mancill');
        assert.equal(parsed.keyPlayers[0].title, 'Director of Infra');
        assert.equal(parsed.keyPlayers[0].other, 'Neutral');
        assert.equal(parsed.keyPlayers[1].name, 'Mrs YYZ');
        assert.equal(parsed.keyPlayers[1].title, 'VP Eng');
        const outer = DP.parseProfilePlainTextFallback(docText);
        assert.equal(outer.accountName, 'Nvidia', '# [Account Profile] title outside fence');
    });

    test('extractProfileFromDocument: one-paragraph-per-line mock matches fixture expectations', () => {
        const docText = readFixture('account-brain-full-doc.txt');
        const mock = DP.buildMockDocFromPlainText(docText);
        const out = DP.extractProfileFromDocument(mock);
        assert.equal(out.accountName, 'Nvidia');
        assert.equal(out.keyPlayers.length, 2);
        assert.equal(out.keyPlayers[0].name, 'Tony Mancill');
        assert.equal(out.keyPlayers[0].title, 'Director of Infra');
        assert.equal(out.keyPlayers[0].other, 'Neutral');
        assert.equal(out.keyPlayers[1].name, 'Mrs YYZ');
        assert.equal(out.keyPlayers[1].title, 'VP Eng');
    });

    test('native list bullets (no hyphen in paragraph text) still yield key players', () => {
        var doc = {
            body: {
                content: [
                    {
                        paragraph: {
                            elements: [{ textRun: { content: 'ACCOUNT PROFILE: WidgetCo' } }]
                        }
                    },
                    {
                        paragraph: {
                            elements: [{ textRun: { content: '## Key Players' } }]
                        }
                    },
                    {
                        paragraph: {
                            bullet: true,
                            elements: [{ textRun: { content: 'Pat Lee — VP Sales' } }]
                        }
                    },
                    {
                        paragraph: {
                            elements: [{ textRun: { content: '  Notes: prefers email' } }]
                        }
                    },
                    {
                        paragraph: {
                            bullet: true,
                            elements: [{ textRun: { content: 'Alex Kim — Eng Lead' } }]
                        }
                    }
                ]
            }
        };
        var out = DP.extractProfileFromDocument(doc);
        assert.equal(out.accountName, 'WidgetCo');
        assert.equal(out.keyPlayers.length, 2);
        assert.equal(out.keyPlayers[0].name, 'Pat Lee');
        assert.equal(out.keyPlayers[0].title, 'VP Sales');
        assert.equal(out.keyPlayers[0].other, 'prefers email');
        assert.equal(out.keyPlayers[1].name, 'Alex Kim');
        assert.equal(out.keyPlayers[1].title, 'Eng Lead');
    });

    test('heading variants: ### Key Players and emoji after ##', () => {
        var a =
            'ACCOUNT PROFILE: Acme\n\n### Key Players\n\n- **Pat Lee** — VP\n';
        var b = '## 👥 Key Players\n\n1. Dana Ruiz — Director\n';
        var pa = DP.parseProfilePlainTextFallback(a);
        assert.equal(pa.accountName, 'Acme');
        assert.equal(pa.keyPlayers.length, 1);
        assert.equal(pa.keyPlayers[0].name, 'Pat Lee');
        assert.equal(pa.keyPlayers[0].title, 'VP');
        var pb = DP.parseProfilePlainTextFallback(b);
        assert.equal(pb.keyPlayers.length, 1);
        assert.equal(pb.keyPlayers[0].name, 'Dana Ruiz');
        assert.equal(pb.keyPlayers[0].title, 'Director');
    });

    test('Google Docs tabs: profile text lives under document.tabs[].documentTab.body', () => {
        var doc = {
            body: {
                content: [
                    {
                        paragraph: {
                            elements: [{ textRun: { content: '# [Account Profile] Zeta' } }]
                        }
                    }
                ]
            },
            tabs: [
                {
                    documentTab: {
                        body: {
                            content: [
                                {
                                    paragraph: {
                                        elements: [{ textRun: { content: 'ACCOUNT PROFILE: Zeta' } }]
                                    }
                                },
                                {
                                    paragraph: {
                                        elements: [{ textRun: { content: '## Key Players' } }]
                                    }
                                },
                                {
                                    paragraph: {
                                        bullet: true,
                                        elements: [{ textRun: { content: 'Tab-only Contact — Director' } }]
                                    }
                                }
                            ]
                        }
                    }
                }
            ]
        };
        var out = DP.extractProfileFromDocument(doc);
        assert.equal(out.accountName, 'Zeta');
        assert.equal(out.keyPlayers.length, 1);
        assert.equal(out.keyPlayers[0].name, 'Tab-only Contact');
        assert.equal(out.keyPlayers[0].title, 'Director');
    });

    test('emoji-prefixed Key Players heading (styled title without #)', () => {
        var text = 'ACCOUNT PROFILE: Acme\n👥 Key Players\n- Jo — VP\n';
        var p = DP.parseProfilePlainTextFallback(text);
        assert.equal(p.keyPlayers.length, 1);
        assert.equal(p.keyPlayers[0].name, 'Jo');
    });

    test('removed player: re-parse yields only current players, not stale ones', () => {
        // Scenario: doc originally had Tony, YYZ, and EWR.
        // User deleted EWR from the doc. Re-parsing must return exactly 2, not 3.
        var docWith3 = DP.buildMockDocFromPlainText(
            'ACCOUNT PROFILE: Nvidia\n\n## Key Players\n' +
            '- Tony Mancill — Director of Infra — Neutral\n' +
            '- YYZ — VP Eng\n' +
            '- EWR — Engineering\n'
        );
        var out3 = DP.extractProfileFromDocument(docWith3);
        assert.equal(out3.keyPlayers.length, 3, 'before removal: 3 players');
        assert.equal(out3.keyPlayers[2].name, 'EWR');

        // After removing EWR from the doc:
        var docWith2 = DP.buildMockDocFromPlainText(
            'ACCOUNT PROFILE: Nvidia\n\n## Key Players\n' +
            '- Tony Mancill — Director of Infra — Neutral\n' +
            '- YYZ — VP Eng\n'
        );
        var out2 = DP.extractProfileFromDocument(docWith2);
        assert.equal(out2.keyPlayers.length, 2, 'after removal: exactly 2 players');
        assert.equal(out2.keyPlayers[0].name, 'Tony Mancill');
        assert.equal(out2.keyPlayers[1].name, 'YYZ');
        // EWR must NOT appear
        var names = out2.keyPlayers.map(function (p) { return p.name; });
        assert.ok(!names.includes('EWR'), 'EWR must not appear after removal');
    });

    test('multiline text in a single Docs paragraph (pasted block)', () => {
        var doc = {
            body: {
                content: [
                    {
                        paragraph: {
                            elements: [
                                {
                                    textRun: {
                                        content:
                                            '# [Account Profile] Zeta\nACCOUNT PROFILE: Zeta\n\n## Key Players\n- Mo X — AE\n  Notes: warm intro\n'
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };
        var out = DP.extractProfileFromDocument(doc);
        assert.equal(out.accountName, 'Zeta');
        assert.equal(out.keyPlayers.length, 1);
        assert.equal(out.keyPlayers[0].name, 'Mo X');
        assert.equal(out.keyPlayers[0].title, 'AE');
        assert.equal(out.keyPlayers[0].other, 'warm intro');
    });
});
