'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const DP = require('../google-doc-profile-parse.js');
globalThis.AccountBrainDocParse = DP;
const AM = require('../google-account-mapping.js');

describe('google-account-mapping', () => {
    test('plain lines: Account: https URL', () => {
        var plain =
            'Nvidia: https://docs.google.com/document/d/1XiWKp3ydQaXHtyTPJ5ZAile0QELwGTow5ROyYzw3Wx4/edit\n' +
            'Cisco: https://docs.google.com/document/d/1q5JIk8_Ra5ItIl4Y5gSsbclaYXaOztdp29j6l9RPUHw/edit\n';
        var doc = DP.buildMockDocFromPlainText(plain);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, '1XiWKp3ydQaXHtyTPJ5ZAile0QELwGTow5ROyYzw3Wx4');
        assert.equal(out.byAccount.cisco.docId, '1q5JIk8_Ra5ItIl4Y5gSsbclaYXaOztdp29j6l9RPUHw');
    });

    test('hyperlink runs use URL not visible text', () => {
        var doc = {
            body: {
                content: [
                    {
                        paragraph: {
                            elements: [
                                { textRun: { content: 'Nvidia: ' } },
                                {
                                    textRun: {
                                        content: 'Open profile',
                                        textStyle: {
                                            link: {
                                                url: 'https://docs.google.com/document/d/1XiWKp3ydQaXHtyTPJ5ZAile0QELwGTow5ROyYzw3Wx4/edit'
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, '1XiWKp3ydQaXHtyTPJ5ZAile0QELwGTow5ROyYzw3Wx4');
    });

    test('bracket before URL (Qualcomm style)', () => {
        var line = 'Qualcomm: [https://docs.google.com/document/d/1DuHVkmTLxLl3-oCoOExUfULvC3mThe5exwUxkDa4Q2Q/edit';
        var doc = DP.buildMockDocFromPlainText(line);
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.qualcomm.docId, '1DuHVkmTLxLl3-oCoOExUfULvC3mThe5exwUxkDa4Q2Q');
    });

    test('content inside tabs (not body) is parsed', () => {
        var doc = {
            body: {},
            tabs: [{
                tabProperties: { tabId: 't.0' },
                documentTab: {
                    body: {
                        content: [
                            {
                                paragraph: {
                                    elements: [
                                        { textRun: { content: 'Nvidia: https://docs.google.com/document/d/ABC123_test/edit\n' } }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }]
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.nvidia.docId, 'ABC123_test');
    });

    test('plainTextFallback kicks in when body and tabs are empty', () => {
        // Simulate a doc whose body.content is missing but textRuns exist deep in structure
        var doc = {
            body: { content: [] },
            tabs: [{
                tabProperties: {},
                documentTab: {
                    body: {
                        content: [
                            {
                                paragraph: {
                                    elements: [
                                        { textRun: { content: 'Cisco: ' } },
                                        { textRun: { content: 'profile link', textStyle: { link: { url: 'https://docs.google.com/document/d/CISCO_ID_123/edit' } } } },
                                        { textRun: { content: '\n' } }
                                    ]
                                }
                            }
                        ]
                    }
                }
            }]
        };
        var out = AM.parseAccountMappingFromDocument(doc);
        assert.equal(out.byAccount.cisco.docId, 'CISCO_ID_123');
    });
});
