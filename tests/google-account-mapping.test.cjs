'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const DP = require('../google-doc-profile-parse.js');
globalThis.AccountBrainDocParse = DP;
const AM = require('../google-account-mapping.js');

// ─── Helper: realistic Docs API response with includeTabsContent=true ───

function makeRealisticTabDoc(paragraphs) {
    return {
        documentId: 'test-doc-id',
        title: 'account-mapping.doc',
        body: {},
        headers: {},
        footers: {},
        documentStyle: {},
        namedStyles: {},
        revisionId: 'test-rev',
        suggestionsViewMode: 'SUGGESTIONS_INLINE',
        tabs: [{
            tabProperties: { tabId: 't.0', title: '', index: 0 },
            documentTab: {
                body: {
                    content: [
                        { endIndex: 1, sectionBreak: { sectionStyle: { columnSeparatorStyle: 'NONE', contentDirection: 'LEFT_TO_RIGHT', sectionType: 'CONTINUOUS' } } },
                        ...paragraphs
                    ]
                },
                documentStyle: {},
                namedStyles: {}
            }
        }]
    };
}

function makePlainTextParagraph(text, startIndex) {
    return {
        startIndex: startIndex || 1,
        endIndex: (startIndex || 1) + text.length,
        paragraph: {
            elements: [{
                startIndex: startIndex || 1,
                endIndex: (startIndex || 1) + text.length,
                textRun: { content: text, textStyle: {} }
            }],
            paragraphStyle: { namedStyleType: 'NORMAL_TEXT', direction: 'LEFT_TO_RIGHT' }
        }
    };
}

function makeHyperlinkParagraph(labelText, linkUrl, linkDisplayText, startIndex) {
    return {
        startIndex: startIndex || 1,
        endIndex: (startIndex || 1) + labelText.length + linkDisplayText.length + 1,
        paragraph: {
            elements: [
                {
                    startIndex: startIndex || 1,
                    endIndex: (startIndex || 1) + labelText.length,
                    textRun: { content: labelText, textStyle: {} }
                },
                {
                    startIndex: (startIndex || 1) + labelText.length,
                    endIndex: (startIndex || 1) + labelText.length + linkDisplayText.length,
                    textRun: {
                        content: linkDisplayText,
                        textStyle: {
                            foregroundColor: { color: { rgbColor: { blue: 0.8, green: 0.33 } } },
                            link: { url: linkUrl },
                            underline: true
                        }
                    }
                },
                {
                    startIndex: (startIndex || 1) + labelText.length + linkDisplayText.length,
                    endIndex: (startIndex || 1) + labelText.length + linkDisplayText.length + 1,
                    textRun: { content: '\n', textStyle: {} }
                }
            ],
            paragraphStyle: { namedStyleType: 'NORMAL_TEXT', direction: 'LEFT_TO_RIGHT' }
        }
    };
}

// ─── Tests ───

describe('google-account-mapping', () => {

    // ── 1. Plain text in body.content (old-style API, no tabs) ──

    test('plain text lines in body.content (no tabs key)', () => {
        var doc = {
            documentId: '123',
            title: 'account-mapping',
            body: {
                content: [
                    makePlainTextParagraph('Nvidia: https://docs.google.com/document/d/NV_DOC_ID_111/edit?usp=drive_link\n', 1),
                    makePlainTextParagraph('Cisco: https://docs.google.com/document/d/CISCO_DOC_222/edit?usp=drive_link\n', 80),
                    makePlainTextParagraph('Qualcomm: [https://docs.google.com/document/d/QCOM_DOC_333/edit\n', 160)
                ]
            }
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(Object.keys(out.byAccount).length, 3);
        assert.equal(out.byAccount.nvidia.docId, 'NV_DOC_ID_111');
        assert.equal(out.byAccount.cisco.docId, 'CISCO_DOC_222');
        assert.equal(out.byAccount.qualcomm.docId, 'QCOM_DOC_333');
    });

    // ── 2. Realistic includeTabsContent=true: body is empty, content in tabs ──

    test('realistic includeTabsContent=true response (body empty, content in tab)', () => {
        var doc = makeRealisticTabDoc([
            makePlainTextParagraph('Nvidia: https://docs.google.com/document/d/NV_ID_AAA/edit?usp=drive_link\n', 2),
            makePlainTextParagraph('Cisco: https://docs.google.com/document/d/CISCO_ID_BBB/edit?usp=drive_link\n', 80)
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(Object.keys(out.byAccount).length, 2);
        assert.equal(out.byAccount.nvidia.docId, 'NV_ID_AAA');
        assert.equal(out.byAccount.cisco.docId, 'CISCO_ID_BBB');
    });

    // ── 3. Hyperlinks: URL displayed as link text ──

    test('hyperlinks where displayed text IS the URL', () => {
        var doc = makeRealisticTabDoc([
            makeHyperlinkParagraph(
                'Nvidia: ',
                'https://docs.google.com/document/d/NV_LINK_ID/edit?usp=drive_link',
                'https://docs.google.com/document/d/NV_LINK_ID/edit?usp=drive_link',
                2
            )
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_LINK_ID');
    });

    // ── 4. Hyperlinks: displayed text is NOT the URL (e.g., "Open profile") ──

    test('hyperlinks where displayed text is label (not URL)', () => {
        var doc = makeRealisticTabDoc([
            makeHyperlinkParagraph(
                'Nvidia: ',
                'https://docs.google.com/document/d/NV_HIDDEN_URL/edit',
                'Open Nvidia profile',
                2
            )
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_HIDDEN_URL');
    });

    // ── 5. Entire line is a single hyperlink (label + URL as one link) ──

    test('entire paragraph is one hyperlink (label baked into link text)', () => {
        var doc = makeRealisticTabDoc([{
            startIndex: 2,
            endIndex: 80,
            paragraph: {
                elements: [{
                    startIndex: 2,
                    endIndex: 80,
                    textRun: {
                        content: 'Nvidia: https://docs.google.com/document/d/NV_FULL_LINK/edit\n',
                        textStyle: {
                            link: { url: 'https://docs.google.com/document/d/NV_FULL_LINK/edit' },
                            underline: true
                        }
                    }
                }],
                paragraphStyle: { namedStyleType: 'NORMAL_TEXT' }
            }
        }]);
        var out = AM.parseAccountMappingFromDocument(doc);
        // flattenParagraphForMapping replaces text with URL; but plainTextFallback should also catch it
        assert.ok(out.byAccount.nvidia, 'nvidia should be found even when entire line is a single hyperlink');
        assert.equal(out.byAccount.nvidia.docId, 'NV_FULL_LINK');
    });

    // ── 6. body.content has only sectionBreak, real content in tabs ──

    test('body.content has sectionBreak only, real content in tabs', () => {
        var doc = {
            documentId: 'test',
            title: 'account-mapping.doc',
            body: {
                content: [
                    { endIndex: 1, sectionBreak: { sectionStyle: {} } }
                ]
            },
            tabs: [{
                tabProperties: { tabId: 't.0' },
                documentTab: {
                    body: {
                        content: [
                            { endIndex: 1, sectionBreak: { sectionStyle: {} } },
                            makePlainTextParagraph('Nvidia: https://docs.google.com/document/d/NV_TAB_ONLY/edit\n', 2)
                        ]
                    }
                }
            }]
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_TAB_ONLY');
    });

    // ── 7. Multiple tabs ──

    test('content spread across multiple tabs', () => {
        var doc = {
            documentId: 'test',
            title: 'account-mapping',
            body: {},
            tabs: [
                {
                    tabProperties: { tabId: 't.0' },
                    documentTab: {
                        body: {
                            content: [
                                makePlainTextParagraph('Nvidia: https://docs.google.com/document/d/NV_TAB0/edit\n', 2)
                            ]
                        }
                    }
                },
                {
                    tabProperties: { tabId: 't.1' },
                    documentTab: {
                        body: {
                            content: [
                                makePlainTextParagraph('Cisco: https://docs.google.com/document/d/CISCO_TAB1/edit\n', 2)
                            ]
                        }
                    }
                }
            ]
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_TAB0');
        assert.equal(out.byAccount.cisco.docId, 'CISCO_TAB1');
    });

    // ── 8. Child tabs (nested) ──

    test('content inside child tabs', () => {
        var doc = {
            documentId: 'test',
            title: 'account-mapping',
            body: {},
            tabs: [{
                tabProperties: { tabId: 't.0' },
                documentTab: { body: { content: [] } },
                childTabs: [{
                    tabProperties: { tabId: 't.0.1' },
                    documentTab: {
                        body: {
                            content: [
                                makePlainTextParagraph('Nvidia: https://docs.google.com/document/d/NV_CHILD/edit\n', 2)
                            ]
                        }
                    }
                }]
            }]
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_CHILD');
    });

    // ── 9. Table layout (mapping in a table) ──

    test('mapping inside a table', () => {
        var doc = makeRealisticTabDoc([{
            startIndex: 2,
            endIndex: 200,
            table: {
                rows: 2,
                columns: 2,
                tableRows: [
                    {
                        tableCells: [
                            { content: [makePlainTextParagraph('Nvidia\n')] },
                            { content: [makePlainTextParagraph('https://docs.google.com/document/d/NV_TABLE/edit\n')] }
                        ]
                    },
                    {
                        tableCells: [
                            { content: [makePlainTextParagraph('Cisco: https://docs.google.com/document/d/CISCO_TABLE/edit\n')] },
                            { content: [makePlainTextParagraph('notes\n')] }
                        ]
                    }
                ]
            }
        }]);
        var out = AM.parseAccountMappingFromDocument(doc);
        // Row 2: "Cisco: url" in one cell should parse
        assert.equal(out.byAccount.cisco.docId, 'CISCO_TABLE');
    });

    // ── 10. Bullet list style ──

    test('mapping lines as bullet list items', () => {
        var doc = makeRealisticTabDoc([
            makePlainTextParagraph('• Nvidia: https://docs.google.com/document/d/NV_BULLET/edit\n', 2),
            makePlainTextParagraph('- Cisco: https://docs.google.com/document/d/CISCO_BULLET/edit\n', 80),
            makePlainTextParagraph('* Qualcomm: https://docs.google.com/document/d/QCOM_BULLET/edit\n', 160)
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_BULLET');
        assert.equal(out.byAccount.cisco.docId, 'CISCO_BULLET');
        assert.equal(out.byAccount.qualcomm.docId, 'QCOM_BULLET');
    });

    // ── 11. Case insensitivity for lookup ──

    test('account lookup is case-insensitive', () => {
        var doc = makeRealisticTabDoc([
            makePlainTextParagraph('NVIDIA: https://docs.google.com/document/d/NV_UPPER/edit\n', 2)
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_UPPER');
        assert.equal(out.byAccount.nvidia.accountLabel, 'NVIDIA');
    });

    // ── 12. Empty doc: 0 accounts, no crash ──

    test('empty document returns 0 accounts (no crash)', () => {
        var doc = { documentId: 'empty', title: 'empty', body: {}, tabs: [] };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(Object.keys(out.byAccount).length, 0);
    });

    // ── 13. plainTextFallback handles deeply-nested textRuns ──

    test('plainTextFallback: extracts textRuns from arbitrary nesting', () => {
        // Deliberately weird structure where collectContentRoots would fail
        // but textRuns exist deep in the JSON
        var doc = {
            documentId: 'weird',
            body: { content: [] },
            tabs: [],
            someRandomKey: {
                nested: {
                    deeper: [{
                        paragraph: {
                            elements: [{
                                textRun: { content: 'Nvidia: https://docs.google.com/document/d/NV_DEEP/edit\n' }
                            }]
                        }
                    }]
                }
            }
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_DEEP');
    });

    // ── 14. plainTextFallback with hyperlink substitution ──

    test('plainTextFallback: substitutes link URLs for text', () => {
        var doc = {
            documentId: 'linktest',
            body: { content: [] },
            tabs: [],
            unknown: [{
                textRun: { content: 'Nvidia: ' }
            }, {
                textRun: {
                    content: 'click here',
                    textStyle: { link: { url: 'https://docs.google.com/document/d/NV_FALLBACK_LINK/edit' } }
                }
            }, {
                textRun: { content: '\n' }
            }]
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_FALLBACK_LINK');
    });

    // ── 15. URL with query params (?usp=drive_link, ?tab=t.0) ──

    test('URLs with query params are parsed correctly', () => {
        var doc = makeRealisticTabDoc([
            makePlainTextParagraph('Nvidia: https://docs.google.com/document/d/NV_PARAMS/edit?usp=drive_link&tab=t.0\n', 2)
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_PARAMS');
    });

    // ── 16. Bracket before URL ──

    test('bracket before URL (Qualcomm style)', () => {
        var line = 'Qualcomm: [https://docs.google.com/document/d/1DuHVkmTLxLl3-oCoOExUfULvC3mThe5exwUxkDa4Q2Q/edit';
        var doc = DP.buildMockDocFromPlainText(line);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.qualcomm.docId, '1DuHVkmTLxLl3-oCoOExUfULvC3mThe5exwUxkDa4Q2Q');
    });

    // ── 17. Lines with extra whitespace / blank lines ──

    test('handles blank lines and extra whitespace gracefully', () => {
        var doc = makeRealisticTabDoc([
            makePlainTextParagraph('\n', 1),
            makePlainTextParagraph('  \n', 2),
            makePlainTextParagraph('   Nvidia  :  https://docs.google.com/document/d/NV_SPACES/edit  \n', 4),
            makePlainTextParagraph('\n', 80)
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_SPACES');
    });

    // ── 18. The CRITICAL test: entire line is one hyperlink where flattenParagraphForMapping
    //        replaces the visible text with the URL, potentially losing the label ──

    test('CRITICAL: label-less hyperlink (entire text is URL, label lost) falls back', () => {
        // In Google Docs, if someone pastes a URL and it auto-links, the entire paragraph
        // is one textRun whose content IS the URL, and textStyle has link.url = same URL.
        // flattenParagraphForMapping replaces content with URL → label is the URL itself.
        // This is a URL without a label colon → should NOT crash.
        var doc = makeRealisticTabDoc([{
            startIndex: 2,
            endIndex: 80,
            paragraph: {
                elements: [{
                    textRun: {
                        content: 'https://docs.google.com/document/d/NV_BARE_LINK/edit\n',
                        textStyle: { link: { url: 'https://docs.google.com/document/d/NV_BARE_LINK/edit' } }
                    }
                }],
                paragraphStyle: {}
            }
        }]);
        var out = AM.parseAccountMappingFromDocument(doc);
        // No label colon → should not be in byAccount, but should not crash
        assert.equal(Object.keys(out.byAccount).length, 0);
    });

    // ── 19. Mixed: some lines have labels, some don't ──

    test('mixed: heading + mapping lines + blank lines', () => {
        var doc = makeRealisticTabDoc([
            makePlainTextParagraph('Account Mapping\n', 2),
            makePlainTextParagraph('\n', 20),
            makePlainTextParagraph('Nvidia: https://docs.google.com/document/d/NV_MIXED/edit\n', 22),
            makePlainTextParagraph('---\n', 80),
            makePlainTextParagraph('Cisco: https://docs.google.com/document/d/CISCO_MIXED/edit\n', 85)
        ]);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'NV_MIXED');
        assert.equal(out.byAccount.cisco.docId, 'CISCO_MIXED');
        assert.equal(Object.keys(out.byAccount).length, 2);
    });
});
