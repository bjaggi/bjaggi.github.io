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
            if (url) {
                parts.push(String(url).trim());
            } else if (tr.content) {
                parts.push(tr.content);
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
        var colon = trimmed.indexOf(':');
        if (colon === -1) return;
        var label = trimmed.slice(0, colon).trim();
        if (!label) return;
        var tail = trimmed.slice(colon + 1).trim();
        var md = tail.match(/https:\/\/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/i);
        var id = md ? md[1] : extractDocIdFromGoogleDocUrl(tail);
        if (!id) return;
        var key = label.toLowerCase();
        byAccount[key] = { docId: id, accountLabel: label };
    }

    function walkMappingContent(contentArr, byAccount) {
        if (!contentArr || !contentArr.length) return;
        for (var i = 0; i < contentArr.length; i++) {
            var el = contentArr[i];
            if (el.paragraph) {
                var flat = flattenParagraphForMapping(el.paragraph);
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

    function parseAccountMappingFromDocument(doc) {
        var byAccount = {};
        var DP = root.AccountBrainDocParse;
        if (!DP || typeof DP.collectContentRoots !== 'function') {
            throw new Error('Load google-doc-profile-parse.js before google-account-mapping.js');
        }
        var roots = DP.collectContentRoots(doc);
        for (var ri = 0; ri < roots.length; ri++) {
            walkMappingContent(roots[ri], byAccount);
        }
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
