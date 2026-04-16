/**
 * Google Doc → account name + key players (shared by browser + Node tests).
 * Load before my-accounts-drive.js. Run tests: npm test
 */
(function (root) {
    'use strict';

    /**
     * Google Docs with tabs stores most content under document.tabs[].documentTab.body,
     * not only document.body. Missing tabs yields empty/plain-wrong text and 0 key players.
     */
    function collectContentRoots(doc) {
        var roots = [];
        if (doc && doc.body && doc.body.content && doc.body.content.length) {
            roots.push(doc.body.content);
        }
        function collectTabs(tabs) {
            if (!Array.isArray(tabs) || !tabs.length) return;
            for (var i = 0; i < tabs.length; i++) {
                var tab = tabs[i];
                if (tab && tab.documentTab && tab.documentTab.body && tab.documentTab.body.content && tab.documentTab.body.content.length) {
                    roots.push(tab.documentTab.body.content);
                }
                if (tab && tab.childTabs && tab.childTabs.length) {
                    collectTabs(tab.childTabs);
                }
            }
        }
        collectTabs(doc.tabs);
        return roots;
    }

    function extractPlainTextFromDoc(doc) {
        var parts = [];
        function walkContent(contentArr) {
            if (!contentArr || !contentArr.length) return;
            for (var i = 0; i < contentArr.length; i++) {
                var el = contentArr[i];
                if (el.paragraph) {
                    var pe = el.paragraph.elements || [];
                    var lineText = '';
                    for (var j = 0; j < pe.length; j++) {
                        if (pe[j].textRun && pe[j].textRun.content) {
                            lineText += pe[j].textRun.content;
                        }
                    }
                    if (el.paragraph.bullet) {
                        lineText = '- ' + lineText;
                    }
                    parts.push(lineText);
                    parts.push('\n');
                } else if (el.table && el.table.tableRows) {
                    var rows = el.table.tableRows;
                    for (var r = 0; r < rows.length; r++) {
                        var cells = rows[r].tableCells || [];
                        for (var c = 0; c < cells.length; c++) {
                            if (c > 0) {
                                parts.push('\n');
                            }
                            walkContent(cells[c].content || []);
                        }
                        parts.push('\n');
                    }
                }
            }
        }
        var roots = collectContentRoots(doc);
        for (var ri = 0; ri < roots.length; ri++) {
            if (ri > 0) {
                parts.push('\n');
            }
            walkContent(roots[ri]);
        }
        return parts.join('');
    }

    function paragraphPlainText(para) {
        if (!para) return '';
        var els = para.elements || [];
        var s = '';
        for (var i = 0; i < els.length; i++) {
            if (els[i].textRun && els[i].textRun.content) {
                s += els[i].textRun.content;
            }
        }
        return s.replace(/\u200b/g, '');
    }

    /** Remove common markdown noise so headings / profile lines still match in Google Docs exports. */
    function stripMarkdownNoise(s) {
        return String(s || '')
            .replace(/\u200b/g, '')
            .replace(/\*{1,2}/g, '')
            .replace(/_{1,2}/g, '')
            .trim();
    }

    /** e.g. "## 👥 Key Players", "### Key Players", "## **Key Players**", plain "👥 Key Players" (styled heading) */
    function isKeyPlayersHeading(trimmed) {
        var t = stripMarkdownNoise(trimmed);
        if (!t) return false;
        if (/^Key Players\b/i.test(t)) return true;
        if (/^#{1,6}\s+.*Key Players\b/i.test(t)) return true;
        var m = /\bKey Players\b/i.exec(t);
        if (!m) return false;
        var idx = m.index;
        if (idx > 16) return false;
        var before = t.slice(0, idx).replace(/\s/g, '');
        if (/[a-zA-Z]{4,}/i.test(before)) return false;
        return true;
    }

    function splitNameTitle(line) {
        var trimmed = stripMarkdownNoise(String(line || '').trim());
        if (!trimmed) return null;
        var parts = trimmed.split(/\s*[—–]\s*/);
        if (parts.length >= 2) {
            return {
                name: parts[0].trim(),
                title: parts.slice(1).join(' — ').trim(),
                other: ''
            };
        }
        parts = trimmed.split(/\s-\s/);
        if (parts.length >= 2) {
            return {
                name: parts[0].trim(),
                title: parts.slice(1).join(' - ').trim(),
                other: ''
            };
        }
        return { name: trimmed, title: '', other: '' };
    }

    function extractBestFencedMarkdown(plain) {
        if (!plain || typeof plain !== 'string') return '';
        var norm = plain
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\u2028/g, '\n')
            .replace(/\uFF40/g, '`');
        plain = norm;
        var blocks = [];
        var re = /```[a-zA-Z0-9._-]*\s*\n?([\s\S]*?)```/g;
        var m;
        while ((m = re.exec(plain)) !== null) {
            blocks.push(m[1].trim());
        }
        if (!blocks.length) return plain;
        for (var i = 0; i < blocks.length; i++) {
            if (/ACCOUNT PROFILE/i.test(blocks[i]) && /Key Players/i.test(blocks[i])) return blocks[i];
        }
        for (var j = 0; j < blocks.length; j++) {
            if (/ACCOUNT PROFILE|Key Players/i.test(blocks[j])) return blocks[j];
        }
        return blocks[0];
    }

    function parseProfilePlainTextFallback(text) {
        var accountName = '';
        var keyPlayers = [];
        var inPlayers = false;
        var lines = String(text || '').split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmed = line.trim();
            var scan = stripMarkdownNoise(trimmed);
            var bracketProf = scan.match(/^#\s*\[\s*Account Profile\s*\]\s+(.+)$/i);
            if (bracketProf) {
                accountName = bracketProf[1].trim();
                inPlayers = false;
                continue;
            }
            var hashProf = scan.match(/^#\s*Account Profile\s*:\s*(.+)$/i);
            if (hashProf) {
                accountName = hashProf[1].trim();
                inPlayers = false;
                continue;
            }
            var profile = scan.match(/^ACCOUNT PROFILE\s*:\s*(.+)$/i);
            if (profile) {
                accountName = profile[1].trim();
                inPlayers = false;
                continue;
            }
            if (isKeyPlayersHeading(trimmed)) {
                inPlayers = true;
                continue;
            }
            if (/^#{1,6}\s+/.test(scan)) {
                inPlayers = false;
                continue;
            }
            if (!inPlayers) continue;
            var subNotes = line.match(/^\s*Notes:\s*(.+)$/i);
            if (subNotes && keyPlayers.length > 0) {
                keyPlayers[keyPlayers.length - 1].other = subNotes[1].trim();
                continue;
            }
            var numbered = trimmed.match(/^\d+\.\s+(.+)$/);
            if (numbered) {
                var pln = splitNameTitle(numbered[1].trim());
                if (pln && pln.name) {
                    keyPlayers.push({ name: pln.name, title: pln.title, other: pln.other || '' });
                }
                continue;
            }
            var bullet = trimmed.match(/^[-*•\u2022\u25CF]\s+(.+)$/);
            if (bullet) {
                var pl = splitNameTitle(bullet[1].trim());
                if (pl && pl.name) {
                    keyPlayers.push({ name: pl.name, title: pl.title, other: pl.other || '' });
                }
                continue;
            }
            if (/[—–\-]/.test(trimmed) && !/^notes:/i.test(trimmed)) {
                var pl2 = splitNameTitle(trimmed);
                if (pl2 && pl2.name) {
                    keyPlayers.push({ name: pl2.name, title: pl2.title, other: pl2.other || '' });
                }
            }
        }
        return { accountName: accountName, keyPlayers: keyPlayers };
    }

    function extractProfileFromDocument(doc) {
        var plainFull = extractPlainTextFromDoc(doc)
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\u2028/g, '\n')
            .replace(/\uFEFF/g, '');
        var fencedSource = extractBestFencedMarkdown(plainFull);
        var fromFence = parseProfilePlainTextFallback(fencedSource);
        if (fromFence.keyPlayers.length > 0) {
            if (!fromFence.accountName) {
                var fromOuter = parseProfilePlainTextFallback(plainFull);
                if (fromOuter.accountName) {
                    fromFence.accountName = fromOuter.accountName;
                }
            }
            return fromFence;
        }

        var accountName = '';
        var keyPlayers = [];
        var inKeyPlayers = false;

        function processParagraph(para) {
            var raw = paragraphPlainText(para);
            var bullet = !!(para && para.bullet);
            var style = (para.paragraphStyle && para.paragraphStyle.namedStyleType) || '';
            var sublines = raw.split(/\r?\n/);
            for (var li = 0; li < sublines.length; li++) {
                var line = sublines[li];
                var trimmed = line.trim();
                var scan = stripMarkdownNoise(trimmed);
                var bulletThisLine = bullet && li === 0;

                var bracketTop = scan.match(/^#\s*\[\s*Account Profile\s*\]\s+(.+)$/i);
                if (bracketTop) {
                    accountName = bracketTop[1].trim();
                    inKeyPlayers = false;
                    continue;
                }
                var prof = scan.match(/^ACCOUNT PROFILE\s*:\s*(.+)$/i);
                if (prof) {
                    accountName = prof[1].trim();
                    inKeyPlayers = false;
                    continue;
                }

                var isKeyPlayersHeader =
                    isKeyPlayersHeading(trimmed) ||
                    (/^HEADING_/i.test(style) && /^Key Players/i.test(scan));

                if (isKeyPlayersHeader) {
                    inKeyPlayers = true;
                    continue;
                }

                if (inKeyPlayers) {
                    if (/^#{1,6}\s+/.test(scan) && !isKeyPlayersHeading(trimmed)) {
                        inKeyPlayers = false;
                        continue;
                    }
                    if (/^HEADING_/i.test(style) && trimmed.length > 0 && !/^Key Players/i.test(scan)) {
                        inKeyPlayers = false;
                        continue;
                    }
                }

                if (!inKeyPlayers) {
                    continue;
                }

                var subNotes = line.match(/^\s*Notes:\s*(.+)$/i);
                if (subNotes && keyPlayers.length > 0) {
                    keyPlayers[keyPlayers.length - 1].other = subNotes[1].trim();
                    continue;
                }

                var notesM = trimmed.match(/^Notes:\s*(.+)$/i);
                if (notesM && keyPlayers.length > 0) {
                    keyPlayers[keyPlayers.length - 1].other = notesM[1].trim();
                    continue;
                }

                var numbered = trimmed.match(/^\d+\.\s+(.+)$/);
                if (numbered) {
                    var pln = splitNameTitle(numbered[1].trim());
                    if (pln && pln.name) {
                        keyPlayers.push({ name: pln.name, title: pln.title, other: pln.other || '' });
                    }
                    continue;
                }

                var body = trimmed;
                if (bulletThisLine) {
                    body = trimmed.replace(/^[\s\u2022\u25CF\-\*]+/, '').trim();
                }

                if (!body) {
                    continue;
                }

                if (bulletThisLine || /^[\-\*\u2022\u25CF]\s+/.test(trimmed)) {
                    if (/^[\-\*\u2022\u25CF]\s+/.test(trimmed)) {
                        body = trimmed.replace(/^[\-\*\u2022\u25CF]\s+/, '').trim();
                    }
                    var pl = splitNameTitle(body);
                    if (pl && pl.name) {
                        keyPlayers.push({ name: pl.name, title: pl.title, other: pl.other || '' });
                    }
                    continue;
                }

                if (/[—–\-]/.test(trimmed) && !/^notes:/i.test(trimmed)) {
                    var pl2 = splitNameTitle(trimmed);
                    if (pl2 && pl2.name) {
                        keyPlayers.push({ name: pl2.name, title: pl2.title, other: pl2.other || '' });
                    }
                }
            }
        }

        function walk(contentArr) {
            if (!contentArr || !contentArr.length) return;
            for (var i = 0; i < contentArr.length; i++) {
                var el = contentArr[i];
                if (el.paragraph) {
                    processParagraph(el.paragraph);
                } else if (el.table && el.table.tableRows) {
                    var rows = el.table.tableRows;
                    for (var r = 0; r < rows.length; r++) {
                        var cells = rows[r].tableCells || [];
                        for (var c = 0; c < cells.length; c++) {
                            if (c > 0) {
                                processParagraph({
                                    elements: [{ textRun: { content: '\n' } }],
                                    bullet: false,
                                    paragraphStyle: {}
                                });
                            }
                            walk(cells[c].content || []);
                        }
                    }
                }
            }
        }

        var roots = collectContentRoots(doc);
        for (var rj = 0; rj < roots.length; rj++) {
            walk(roots[rj]);
        }
        var out = { accountName: accountName, keyPlayers: keyPlayers };
        if (out.keyPlayers.length === 0) {
            var fb = parseProfilePlainTextFallback(fencedSource);
            if (fb.keyPlayers.length) {
                out.keyPlayers = fb.keyPlayers;
            }
            if (!out.accountName && fb.accountName) {
                out.accountName = fb.accountName;
            }
            if (out.keyPlayers.length === 0) {
                var fb2 = parseProfilePlainTextFallback(plainFull);
                if (fb2.keyPlayers.length) out.keyPlayers = fb2.keyPlayers;
                if (!out.accountName && fb2.accountName) out.accountName = fb2.accountName;
            }
        }
        return out;
    }

    /** Build a minimal Docs API-shaped document (one paragraph per line) for tests. */
    function buildMockDocFromPlainText(plainText) {
        var lines = String(plainText).split(/\r?\n/);
        return {
            body: {
                content: lines.map(function (line) {
                    return {
                        paragraph: {
                            elements: [{ textRun: { content: line } }],
                            bullet: false
                        }
                    };
                })
            }
        };
    }

    var api = {
        extractPlainTextFromDoc: extractPlainTextFromDoc,
        paragraphPlainText: paragraphPlainText,
        splitNameTitle: splitNameTitle,
        extractBestFencedMarkdown: extractBestFencedMarkdown,
        parseProfilePlainTextFallback: parseProfilePlainTextFallback,
        extractProfileFromDocument: extractProfileFromDocument,
        buildMockDocFromPlainText: buildMockDocFromPlainText
    };

    root.AccountBrainDocParse = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
