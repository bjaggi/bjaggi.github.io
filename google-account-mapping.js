/**
 * Parse account-mapping.doc: account label → Google Doc URL/ID.
 * Hyperlinks: use link URL, not visible link text. Depends on AccountBrainDocParse.collectContentRoots.
 * Load after google-doc-profile-parse.js.
 */
(function (root) {
    'use strict';

    function extractDocIdFromGoogleDocUrl(s) {
        var str = String(s || '').trim();
        if (!str) return null;
        var m = str.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
        if (m) return m[1];
        if (/^[a-zA-Z0-9_-]+$/.test(str) && str.length >= 12) return str;
        return null;
    }

    /** One paragraph / cell: linked runs contribute URL; plain runs contribute text. */
    function flattenParagraphForMapping(para) {
        var els = (para && para.elements) || [];
        var parts = [];
        for (var i = 0; i < els.length; i++) {
            if (!els[i].textRun) continue;
            var tr = els[i].textRun;
            var url = tr.textStyle && tr.textStyle.link && tr.textStyle.link.url;
            var content = tr.content || '';
            if (url) {
                // If content already embeds the doc URL (e.g. "Nvidia: https://docs.google.com/…"),
                // keep it so the label isn't lost. Only substitute when content is
                // pure display text like "Click here" or "Open profile".
                if (/docs\.google\.com\/document\/d\//.test(content)) {
                    parts.push(content);
                } else {
                    parts.push(String(url).trim());
                }
            } else if (content) {
                parts.push(content);
            }
        }
        return parts.join('').replace(/\u200b/g, '').trim();
    }

    /**
     * Parse one logical line: "Account: url", "Account: [url", markdown "(url)", or only URL after colon.
     */
    function applyMappingLine(line, byAccount) {
        if (!line) return;
        var trimmed = String(line).replace(/^[-*•\s]+/g, '').trim();
        if (!trimmed || /^[-_=]{3,}$/.test(trimmed)) return;

        var docUrlRe = /https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i;

        // Find the label colon (skip colons inside "https:" or "http:")
        var colon = -1;
        for (var ci = 0; ci < trimmed.length; ci++) {
            if (trimmed[ci] !== ':') continue;
            var before = trimmed.slice(0, ci);
            if (/https?$/i.test(before)) continue;
            colon = ci;
            break;
        }
        if (colon === -1) {
            console.log('[AccountMapping] applyMappingLine: no label colon in:', JSON.stringify(trimmed).slice(0, 120));
            return;
        }
        var label = trimmed.slice(0, colon).trim();
        if (!label) return;
        var tail = trimmed.slice(colon + 1).trim();
        var md = tail.match(docUrlRe);
        // Also scan the full line in case the URL precedes the tail split
        if (!md) md = trimmed.match(docUrlRe);
        var id = md ? md[1] : extractDocIdFromGoogleDocUrl(tail);
        console.log('[AccountMapping] applyMappingLine: label=' + JSON.stringify(label) + ' id=' + (id || 'NULL') + ' tail=' + JSON.stringify(tail).slice(0, 100));
        if (!id) return;
        var key = label.toLowerCase();
        byAccount[key] = { docId: id, accountLabel: label };
    }

    function walkMappingContent(contentArr, byAccount) {
        if (!contentArr || !contentArr.length) {
            console.log('[AccountMapping] walkMappingContent: empty/null contentArr');
            return;
        }
        console.log('[AccountMapping] walkMappingContent: elements count =', contentArr.length);
        for (var i = 0; i < contentArr.length; i++) {
            var el = contentArr[i];
            if (el.paragraph) {
                var flat = flattenParagraphForMapping(el.paragraph);
                console.log('[AccountMapping] paragraph[' + i + '] flat:', JSON.stringify(flat).slice(0, 200));
                if (flat.indexOf('\n') >= 0) {
                    flat.split(/\r?\n/).forEach(function (sub) {
                        applyMappingLine(sub, byAccount);
                    });
                } else {
                    applyMappingLine(flat, byAccount);
                }
            } else if (el.table && el.table.tableRows) {
                var rows = el.table.tableRows;
                for (var r = 0; r < rows.length; r++) {
                    var cells = rows[r].tableCells || [];
                    for (var c = 0; c < cells.length; c++) {
                        walkMappingContent(cells[c].content || [], byAccount);
                    }
                }
            }
        }
    }

    /**
     * Recursively extract every textRun from the raw Docs API JSON.
     * Yields {content, linkUrl} for each run, regardless of nesting depth.
     */
    function deepCollectTextRuns(obj, out) {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
            for (var i = 0; i < obj.length; i++) deepCollectTextRuns(obj[i], out);
            return;
        }
        if (obj.textRun) {
            var tr = obj.textRun;
            var url = tr.textStyle && tr.textStyle.link && tr.textStyle.link.url;
            out.push({ content: tr.content || '', linkUrl: url || '' });
        }
        var keys = Object.keys(obj);
        for (var k = 0; k < keys.length; k++) {
            if (keys[k] !== 'textRun') deepCollectTextRuns(obj[keys[k]], out);
        }
    }

    /**
     * Fallback: rebuild lines from all textRuns, substituting link URLs.
     */
    function plainTextFallback(doc, byAccount) {
        var runs = [];
        deepCollectTextRuns(doc, runs);
        if (!runs.length) return;
        var buf = '';
        for (var i = 0; i < runs.length; i++) {
            var r = runs[i];
            var text = r.linkUrl ? r.linkUrl : r.content;
            buf += text;
        }
        console.log('[AccountMapping] plainTextFallback total chars:', buf.length);
        var lines = buf.split(/\r?\n/);
        for (var li = 0; li < lines.length; li++) {
            applyMappingLine(lines[li], byAccount);
        }
    }

    function parseAccountMappingFromDocument(doc) {
        var byAccount = {};
        var DP = root.AccountBrainDocParse;
        if (DP && typeof DP.collectContentRoots === 'function') {
            var roots = DP.collectContentRoots(doc);
            console.log('[AccountMapping] collectContentRoots returned', roots.length, 'root(s)');
            for (var ri = 0; ri < roots.length; ri++) {
                console.log('[AccountMapping] root[' + ri + '] length:', roots[ri].length);
                walkMappingContent(roots[ri], byAccount);
            }
        } else {
            console.warn('[AccountMapping] collectContentRoots unavailable, skipping structured walk');
        }
        if (!Object.keys(byAccount).length) {
            console.log('[AccountMapping] structured walk found 0 accounts, trying plainTextFallback');
            plainTextFallback(doc, byAccount);
        }
        console.log('[AccountMapping] final byAccount keys:', Object.keys(byAccount));
        return { byAccount: byAccount };
    }

    var api = {
        extractDocIdFromGoogleDocUrl: extractDocIdFromGoogleDocUrl,
        flattenParagraphForMapping: flattenParagraphForMapping,
        parseAccountMappingFromDocument: parseAccountMappingFromDocument
    };

    root.AccountBrainAccountMapping = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
