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
                            elements: [{ textRun: { content: 'Pat Lee \u2014 VP Sales' } }]
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
                            elements: [{ textRun: { content: 'Alex Kim \u2014 Eng Lead' } }]
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
            'ACCOUNT PROFILE: Acme\n\n### Key Players\n\n- **Pat Lee** \u2014 VP\n';
        var b = '## \u{1F465} Key Players\n\n1. Dana Ruiz \u2014 Director\n';
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
                                        elements: [{ textRun: { content: 'Tab-only Contact \u2014 Director' } }]
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
        var text = 'ACCOUNT PROFILE: Acme\n\u{1F465} Key Players\n- Jo \u2014 VP\n';
        var p = DP.parseProfilePlainTextFallback(text);
        assert.equal(p.keyPlayers.length, 1);
        assert.equal(p.keyPlayers[0].name, 'Jo');
    });

    test('removed player: re-parse yields only current players, not stale ones', () => {
        var docWith3 = DP.buildMockDocFromPlainText(
            'ACCOUNT PROFILE: Nvidia\n\n## Key Players\n' +
            '- Tony Mancill \u2014 Director of Infra \u2014 Neutral\n' +
            '- YYZ \u2014 VP Eng\n' +
            '- EWR \u2014 Engineering\n'
        );
        var out3 = DP.extractProfileFromDocument(docWith3);
        assert.equal(out3.keyPlayers.length, 3, 'before removal: 3 players');
        assert.equal(out3.keyPlayers[2].name, 'EWR');

        var docWith2 = DP.buildMockDocFromPlainText(
            'ACCOUNT PROFILE: Nvidia\n\n## Key Players\n' +
            '- Tony Mancill \u2014 Director of Infra \u2014 Neutral\n' +
            '- YYZ \u2014 VP Eng\n'
        );
        var out2 = DP.extractProfileFromDocument(docWith2);
        assert.equal(out2.keyPlayers.length, 2, 'after removal: exactly 2 players');
        assert.equal(out2.keyPlayers[0].name, 'Tony Mancill');
        assert.equal(out2.keyPlayers[1].name, 'YYZ');
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
                                            '# [Account Profile] Zeta\nACCOUNT PROFILE: Zeta\n\n## Key Players\n- Mo X \u2014 AE\n  Notes: warm intro\n'
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

describe('extractProfileFromDocument — full profile sections', () => {
    test('parses key players, initiatives, next steps, and notes table', () => {
        var doc = DP.buildMockDocFromPlainText(
            'ACCOUNT PROFILE: Acme\n' +
            '\n' +
            '## \u{1F465} Key Players & Roles\n' +
            '- Alice \u2014 VP Eng\n' +
            '- Bob \u2014 Director\n' +
            '\n' +
            '## \u{1F3AF} Top 3 Initiatives / Concerns\n' +
            '- Migrate to cloud\n' +
            '- Reduce latency\n' +
            '\n' +
            '## \u2705 Next Steps / Action Items\n' +
            '- Schedule follow-up\n' +
            '- Send proposal\n' +
            '\n' +
            '## \u{1F4DD} Notes\n' +
            '| Date | Note |\n' +
            '|------|------|\n' +
            '| 2026-04-14 | Budget approved for Q3. |\n' +
            '| 2026-04-15 | Strong exec sponsor. |\n'
        );
        var out = DP.extractProfileFromDocument(doc);
        assert.equal(out.accountName, 'Acme');
        assert.equal(out.keyPlayers.length, 2);
        assert.equal(out.keyPlayers[0].name, 'Alice');
        assert.equal(out.keyPlayers[1].name, 'Bob');
        assert.deepEqual(out.topInitiatives, ['Migrate to cloud', 'Reduce latency']);
        assert.deepEqual(out.nextSteps, ['Schedule follow-up', 'Send proposal']);
        assert.equal(out.additionalNotes.length, 2);
        assert.equal(out.additionalNotes[0].date, '2026-04-14');
        assert.equal(out.additionalNotes[0].text, 'Budget approved for Q3.');
        assert.equal(out.additionalNotes[1].date, '2026-04-15');
        assert.equal(out.additionalNotes[1].text, 'Strong exec sponsor.');
    });

    test('plain text notes (no table) are captured as dateless entries', () => {
        var doc = DP.buildMockDocFromPlainText(
            'ACCOUNT PROFILE: Acme\n\n## \u{1F4DD} Notes\nSome freeform note\n'
        );
        var out = DP.extractProfileFromDocument(doc);
        assert.equal(out.additionalNotes.length, 1);
        assert.equal(out.additionalNotes[0].date, '');
        assert.equal(out.additionalNotes[0].text, 'Some freeform note');
    });

    test('empty initiatives/steps/notes return empty arrays', () => {
        var doc = DP.buildMockDocFromPlainText(
            'ACCOUNT PROFILE: Empty\n\n## Key Players\n- Jo \u2014 AE\n'
        );
        var out = DP.extractProfileFromDocument(doc);
        assert.equal(out.accountName, 'Empty');
        assert.equal(out.keyPlayers.length, 1);
        assert.deepEqual(out.topInitiatives, []);
        assert.deepEqual(out.nextSteps, []);
        assert.deepEqual(out.additionalNotes, []);
    });
});

describe('serializeAccountToProfileText', () => {
    test('produces expected text for a full account with dated notes', () => {
        var acct = {
            name: 'Nvidia',
            keyPlayers: [
                { name: 'Tony Mancill', title: 'Director of Infra', other: 'Neutral' },
                { name: 'YYZ', title: 'VP Eng', other: '' }
            ],
            topInitiatives: ['Expand Kafka footprint', 'Cost reduction'],
            nextSteps: ['Send POC plan'],
            additionalNotes: [{ date: '2026-04-14', text: 'Budget cycle ends in Q2.' }]
        };
        var text = DP.serializeAccountToProfileText(acct);
        assert.ok(text.includes('ACCOUNT PROFILE: Nvidia'));
        assert.ok(text.includes('Key Players'));
        assert.ok(text.includes('- Tony Mancill \u2014 Director of Infra \u2014 Neutral'));
        assert.ok(text.includes('- YYZ \u2014 VP Eng'));
        assert.ok(text.includes('Expand Kafka footprint'));
        assert.ok(text.includes('Send POC plan'));
        assert.ok(text.includes('| Date | Note |'));
        assert.ok(text.includes('| 2026-04-14 | Budget cycle ends in Q2. |'));
    });

    test('handles account with no key players gracefully', () => {
        var acct = { name: 'Empty', keyPlayers: [], topInitiatives: [], nextSteps: [], additionalNotes: [] };
        var text = DP.serializeAccountToProfileText(acct);
        assert.ok(text.includes('ACCOUNT PROFILE: Empty'));
        assert.ok(text.includes('(none)'));
    });

    test('omits empty sections (initiatives, steps, notes)', () => {
        var acct = {
            name: 'Minimal',
            keyPlayers: [{ name: 'Jo', title: 'AE', other: '' }],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: []
        };
        var text = DP.serializeAccountToProfileText(acct);
        assert.ok(!text.includes('Initiatives'));
        assert.ok(!text.includes('Next Steps'));
        assert.ok(!text.includes('Notes'));
    });

    test('legacy string additionalNotes is serialized as single-row table', () => {
        var acct = {
            name: 'Legacy',
            keyPlayers: [],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: 'Old format note'
        };
        var text = DP.serializeAccountToProfileText(acct);
        assert.ok(text.includes('| Date | Note |'));
        assert.ok(text.includes('Old format note'));
    });
});

describe('serialize → parse round-trip', () => {
    test('full account with dated notes survives round-trip', () => {
        var original = {
            name: 'Nvidia',
            keyPlayers: [
                { name: 'Tony Mancill', title: 'Director of Infra', other: 'Neutral' },
                { name: 'YYZ', title: 'VP Eng', other: '' }
            ],
            topInitiatives: ['Expand Kafka footprint', 'Cost reduction'],
            nextSteps: ['Send POC plan', 'Schedule demo'],
            additionalNotes: [
                { date: '2026-04-14', text: 'Budget cycle ends in Q2.' },
                { date: '2026-04-15', text: 'Strong champion.' }
            ]
        };
        var text = DP.serializeAccountToProfileText(original);
        var mockDoc = DP.buildMockDocFromPlainText(text);
        var parsed = DP.extractProfileFromDocument(mockDoc);

        assert.equal(parsed.accountName, 'Nvidia');
        assert.equal(parsed.keyPlayers.length, 2);
        assert.equal(parsed.keyPlayers[0].name, 'Tony Mancill');
        assert.equal(parsed.keyPlayers[0].title, 'Director of Infra');
        assert.equal(parsed.keyPlayers[0].other, 'Neutral');
        assert.equal(parsed.keyPlayers[1].name, 'YYZ');
        assert.equal(parsed.keyPlayers[1].title, 'VP Eng');
        assert.deepEqual(parsed.topInitiatives, ['Expand Kafka footprint', 'Cost reduction']);
        assert.deepEqual(parsed.nextSteps, ['Send POC plan', 'Schedule demo']);
        assert.equal(parsed.additionalNotes.length, 2);
        assert.equal(parsed.additionalNotes[0].date, '2026-04-14');
        assert.equal(parsed.additionalNotes[0].text, 'Budget cycle ends in Q2.');
        assert.equal(parsed.additionalNotes[1].date, '2026-04-15');
        assert.equal(parsed.additionalNotes[1].text, 'Strong champion.');
    });

    test('round-trip with empty key players and notes', () => {
        var original = {
            name: 'Ghost',
            keyPlayers: [],
            topInitiatives: ['Do something'],
            nextSteps: [],
            additionalNotes: []
        };
        var text = DP.serializeAccountToProfileText(original);
        var mockDoc = DP.buildMockDocFromPlainText(text);
        var parsed = DP.extractProfileFromDocument(mockDoc);

        assert.equal(parsed.accountName, 'Ghost');
        assert.equal(parsed.keyPlayers.length, 0);
        assert.deepEqual(parsed.topInitiatives, ['Do something']);
        assert.deepEqual(parsed.nextSteps, []);
        assert.deepEqual(parsed.additionalNotes, []);
    });

    test('round-trip preserves special characters in names and notes', () => {
        var original = {
            name: 'Caf\u00e9 Corp',
            keyPlayers: [{ name: 'Ren\u00e9e Dupont', title: 'CTO', other: '' }],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [{ date: '2026-04-14', text: 'Met at re:Invent 2024. Good rapport.' }]
        };
        var text = DP.serializeAccountToProfileText(original);
        var mockDoc = DP.buildMockDocFromPlainText(text);
        var parsed = DP.extractProfileFromDocument(mockDoc);

        assert.equal(parsed.accountName, 'Caf\u00e9 Corp');
        assert.equal(parsed.keyPlayers[0].name, 'Ren\u00e9e Dupont');
        assert.equal(parsed.additionalNotes.length, 1);
        assert.ok(parsed.additionalNotes[0].text.includes('re:Invent 2024'));
    });

    test('adding a note then re-serializing round-trips correctly', () => {
        var v1 = {
            name: 'Cisco',
            keyPlayers: [{ name: 'Alice', title: 'VP', other: '' }],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [{ date: '2026-04-10', text: 'Initial call.' }]
        };
        var text1 = DP.serializeAccountToProfileText(v1);
        var parsed1 = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text1));
        assert.equal(parsed1.additionalNotes.length, 1);

        var v2 = {
            name: 'Cisco',
            keyPlayers: [{ name: 'Alice', title: 'VP', other: '' }],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [
                { date: '2026-04-10', text: 'Initial call.' },
                { date: '2026-04-16', text: 'Follow-up scheduled.' }
            ]
        };
        var text2 = DP.serializeAccountToProfileText(v2);
        var parsed2 = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text2));

        assert.equal(parsed2.additionalNotes.length, 2);
        assert.equal(parsed2.additionalNotes[1].date, '2026-04-16');
        assert.equal(parsed2.additionalNotes[1].text, 'Follow-up scheduled.');
    });

    test('adding a player then re-serializing round-trips correctly', () => {
        var v1 = {
            name: 'Cisco',
            keyPlayers: [{ name: 'Alice', title: 'VP', other: '' }],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: []
        };
        var text1 = DP.serializeAccountToProfileText(v1);
        var doc1 = DP.buildMockDocFromPlainText(text1);
        var parsed1 = DP.extractProfileFromDocument(doc1);
        assert.equal(parsed1.keyPlayers.length, 1);

        var v2 = {
            name: 'Cisco',
            keyPlayers: [
                { name: 'Alice', title: 'VP', other: '' },
                { name: 'Bob', title: 'Eng Lead', other: 'New hire' }
            ],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: []
        };
        var text2 = DP.serializeAccountToProfileText(v2);
        var doc2 = DP.buildMockDocFromPlainText(text2);
        var parsed2 = DP.extractProfileFromDocument(doc2);

        assert.equal(parsed2.keyPlayers.length, 2);
        assert.equal(parsed2.keyPlayers[1].name, 'Bob');
        assert.equal(parsed2.keyPlayers[1].title, 'Eng Lead');
        assert.equal(parsed2.keyPlayers[1].other, 'New hire');
    });

    test('removing a player then re-serializing round-trips correctly', () => {
        var v1 = {
            name: 'Nvidia',
            keyPlayers: [
                { name: 'Tony', title: 'Director', other: '' },
                { name: 'YYZ', title: 'VP', other: '' },
                { name: 'EWR', title: 'Eng', other: '' }
            ],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: []
        };
        var text1 = DP.serializeAccountToProfileText(v1);
        var parsed1 = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text1));
        assert.equal(parsed1.keyPlayers.length, 3);

        var v2 = {
            name: 'Nvidia',
            keyPlayers: [
                { name: 'Tony', title: 'Director', other: '' },
                { name: 'YYZ', title: 'VP', other: '' }
            ],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: []
        };
        var text2 = DP.serializeAccountToProfileText(v2);
        var parsed2 = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text2));

        assert.equal(parsed2.keyPlayers.length, 2);
        var names = parsed2.keyPlayers.map(function (p) { return p.name; });
        assert.ok(!names.includes('EWR'), 'removed player must not appear');
    });
});
