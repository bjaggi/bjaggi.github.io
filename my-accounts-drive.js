/**
 * Google Sign-In + bidirectional Google Docs sync for Account Brain profiles.
 *
 * Pull: read account-mapping.doc → fetch each profile Google Doc by ID → parse
 * Push: write profiles back to mapped Google Docs (or create new ones)
 *
 * Depends on: window.GOOGLE_CLIENT_ID, https://accounts.google.com/gsi/client,
 * google-doc-profile-parse.js, google-account-mapping.js (load before this file).
 */
(function (global) {
    var TOKEN_KEY = 'ab_google_access_token';
    var EXP_KEY = 'ab_google_expires_at_ms';
    var SCOPE_TAG_KEY = 'ab_google_scope_tag';
    var SCOPE_TAG_VALUE = 'drive+documents+calendar-v9';
    var PROFILE_DOC_PREFIX = '[Account Profile] ';
    var MAPPING_DOC_NAMES = ['account-mapping.doc', 'account-mapping'];
    var SCOPE =
        'https://www.googleapis.com/auth/drive ' +
        'https://www.googleapis.com/auth/documents ' +
        'https://www.googleapis.com/auth/calendar.readonly';

    function getClientId() {
        var id = global.GOOGLE_CLIENT_ID;
        if (typeof id !== 'string') return '';
        id = id.replace(/^\uFEFF/, '').trim().replace(/^['"]+|['"]+$/g, '');
        return id.indexOf('.apps.googleusercontent.com') !== -1 ? id : '';
    }

    function getStoredToken() {
        if (sessionStorage.getItem(SCOPE_TAG_KEY) !== SCOPE_TAG_VALUE) {
            if (sessionStorage.getItem(TOKEN_KEY)) clearStoredToken();
            return null;
        }
        var t = sessionStorage.getItem(TOKEN_KEY);
        var exp = parseInt(sessionStorage.getItem(EXP_KEY), 10);
        if (!t || !exp) return null;
        if (Date.now() > exp - 120000) return null;
        return t;
    }

    function setStoredToken(accessToken, expiresInSec) {
        var sec = parseInt(expiresInSec, 10);
        if (isNaN(sec) || sec < 60) sec = 3600;
        sessionStorage.setItem(TOKEN_KEY, accessToken);
        sessionStorage.setItem(EXP_KEY, String(Date.now() + sec * 1000));
        sessionStorage.setItem(SCOPE_TAG_KEY, SCOPE_TAG_VALUE);
    }

    function clearStoredToken() {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(EXP_KEY);
        sessionStorage.removeItem(SCOPE_TAG_KEY);
    }

    var tokenClient = null;
    var pendingTokenCb = null;

    // ─── Error helpers ───

    var SCOPE_ERROR_HINT = 'Missing Google API scopes. Sign out, then sign back in to re-consent. ' +
        'If it persists, check the OAuth consent screen scopes in Google Cloud Console (see setup guide at the bottom of this page).';

    function isScopeError(status) {
        return status === 403 || status === 401;
    }

    function apiError(r, data, fallback) {
        var msg = (data && data.error && data.error.message) || fallback || ('API error ' + r.status);
        if (isScopeError(r.status)) {
            return new Error(SCOPE_ERROR_HINT + ' (API ' + r.status + ': ' + msg + ')');
        }
        return new Error(msg);
    }

    // ─── OAuth ───

    function whenGsReady(cb) {
        if (global.google && global.google.accounts && global.google.accounts.oauth2) {
            cb(null);
            return;
        }
        var tries = 0;
        var id = setInterval(function () {
            tries++;
            if (global.google && global.google.accounts && global.google.accounts.oauth2) {
                clearInterval(id);
                cb(null);
            } else if (tries > 400) {
                clearInterval(id);
                cb(new Error('Google Sign-In script did not load. Check network or ad blockers.'));
            }
        }, 25);
    }

    function initTokenClient() {
        if (tokenClient) return;
        tokenClient = global.google.accounts.oauth2.initTokenClient({
            client_id: getClientId(),
            scope: SCOPE,
            callback: function (resp) {
                if (resp.error !== undefined) {
                    var desc = resp.error_description || resp.error;
                    if (/access_denied|consent|scope/i.test(desc)) {
                        desc = SCOPE_ERROR_HINT + ' (' + desc + ')';
                    }
                    if (pendingTokenCb) pendingTokenCb(new Error(desc));
                    pendingTokenCb = null;
                    return;
                }
                setStoredToken(resp.access_token, resp.expires_in);
                if (pendingTokenCb) pendingTokenCb(null, resp.access_token);
                pendingTokenCb = null;
            }
        });
    }

    function requestToken(interactive, cb) {
        if (!getClientId()) {
            cb(new Error('Set window.GOOGLE_CLIENT_ID in google-oauth-config.js'));
            return;
        }
        whenGsReady(function (err) {
            if (err) return cb(err);
            initTokenClient();
            pendingTokenCb = cb;
            tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' });
        });
    }

    function getAccessToken(cb) {
        var existing = getStoredToken();
        if (existing) {
            cb(null, existing);
            return;
        }
        requestToken(false, function (err, token) {
            if (err || !token) requestToken(true, cb);
            else cb(null, token);
        });
    }

    // ─── Drive helpers ───

    function driveSearch(token, query, cb) {
        var url = 'https://www.googleapis.com/drive/v3/files?q=' +
            encodeURIComponent(query) +
            '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=100';
        fetch(url, { headers: { Authorization: 'Bearer ' + token } })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw apiError(r, data, 'Drive search failed');
                    return data.files || [];
                });
            })
            .then(function (files) { cb(null, files); })
            .catch(cb);
    }

    // ─── Docs API helpers ───

    var DP = global.AccountBrainDocParse;
    if (!DP) {
        throw new Error('Load google-doc-profile-parse.js before my-accounts-drive.js');
    }

    function readDocParsed(token, docId, cb) {
        fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + '?includeTabsContent=true', {
            headers: { Authorization: 'Bearer ' + token }
        })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw apiError(r, data, 'Could not read doc');
                    return DP.extractProfileFromDocument(data);
                });
            })
            .then(function (parsed) { cb(null, parsed); })
            .catch(cb);
    }

    function getDocEndIndex(token, docId, cb) {
        fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + '?includeTabsContent=true', {
            headers: { Authorization: 'Bearer ' + token }
        })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw apiError(r, data, 'Could not read doc');
                    var roots = DP.collectContentRoots(data);
                    var maxEnd = 1;
                    for (var ri = 0; ri < roots.length; ri++) {
                        var content = roots[ri];
                        for (var ci = 0; ci < content.length; ci++) {
                            var ei = content[ci].endIndex;
                            if (typeof ei === 'number' && ei > maxEnd) maxEnd = ei;
                        }
                    }
                    cb(null, maxEnd);
                });
            })
            .catch(cb);
    }

    function writeDocContent(token, docId, text, cb) {
        getDocEndIndex(token, docId, function (err, endIdx) {
            if (err) return cb(err);
            var requests = [];
            if (endIdx > 2) {
                requests.push({
                    deleteContentRange: {
                        range: { startIndex: 1, endIndex: endIdx - 1 }
                    }
                });
            }
            requests.push({
                insertText: {
                    location: { index: 1 },
                    text: text
                }
            });
            fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + ':batchUpdate', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ requests: requests })
            })
                .then(function (r) {
                    return r.json().then(function (data) {
                        if (!r.ok) throw apiError(r, data, 'Doc write failed');
                        cb(null);
                    });
                })
                .catch(cb);
        });
    }

    function createProfileDoc(token, accountName, text, cb) {
        var docTitle = PROFILE_DOC_PREFIX + accountName;
        fetch('https://docs.googleapis.com/v1/documents', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: docTitle })
        })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw apiError(r, data, 'Could not create doc');
                    var newDocId = data.documentId;
                    console.log('[AccountBrainDrive] created doc:', docTitle, newDocId);
                    writeDocContent(token, newDocId, text, function (e2) {
                        cb(e2, newDocId);
                    });
                });
            })
            .catch(cb);
    }

    // ─── Account Mapping doc ───

    var mappingCache = null;

    function clearMappingCache() { mappingCache = null; }

    function resolveMappingDocId(token, cb) {
        var override = global.GOOGLE_ACCOUNT_MAPPING_DOC_ID;
        if (typeof override === 'string') {
            var tid = override.trim();
            if (/^[a-zA-Z0-9_-]{12,}$/.test(tid)) { cb(null, tid); return; }
        }
        function searchFor(nameList, idx) {
            if (idx >= nameList.length) { cb(null, null); return; }
            var esc = nameList[idx].replace(/'/g, "\\'");
            var base = "name='" + esc + "' and trashed=false and mimeType='application/vnd.google-apps.document'";
            var qRoot = encodeURIComponent(base + " and 'root' in parents");
            driveSearch(token, base + " and 'root' in parents", function (err, rootFiles) {
                if (err) return cb(err);
                if (rootFiles && rootFiles.length) return cb(null, rootFiles[0].id);
                driveSearch(token, base + ' and sharedWithMe=true', function (e2, shared) {
                    if (e2) return cb(e2);
                    if (shared && shared.length) return cb(null, shared[0].id);
                    searchFor(nameList, idx + 1);
                });
            });
        }
        searchFor(MAPPING_DOC_NAMES, 0);
    }

    function fetchMappingDoc(token, cb) {
        if (mappingCache && Date.now() - mappingCache.at < 5 * 60 * 1000) {
            cb(null, mappingCache.data);
            return;
        }
        resolveMappingDocId(token, function (err, mapDocId) {
            if (err) return cb(err);
            if (!mapDocId) return cb(null, null);
            fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(mapDocId) + '?includeTabsContent=true', {
                headers: { Authorization: 'Bearer ' + token }
            })
                .then(function (r) {
                    return r.json().then(function (data) {
                        if (!r.ok) throw apiError(r, data, 'Could not read mapping doc');
                        var AM = global.AccountBrainAccountMapping;
                        if (!AM) throw new Error('google-account-mapping.js not loaded');
                        var parsed = AM.parseAccountMappingFromDocument(data);
                        console.log('[AccountBrainDrive] mapping doc accounts:', Object.keys(parsed.byAccount));
                        var payload = { mappingDocId: mapDocId, byAccount: parsed.byAccount };
                        mappingCache = { data: payload, at: Date.now() };
                        cb(null, payload);
                    });
                })
                .catch(cb);
        });
    }

    // ─── Pull: account-mapping.doc → read each profile doc → parse ───

    function pullFromDocs(cb) {
        getAccessToken(function (err, token) {
            if (err) return cb(err);
            fetchMappingDoc(token, function (e2, mapping) {
                if (e2) return cb(e2);
                var entries = [];
                if (mapping && mapping.byAccount) {
                    var keys = Object.keys(mapping.byAccount);
                    for (var i = 0; i < keys.length; i++) {
                        var row = mapping.byAccount[keys[i]];
                        if (row && row.docId) {
                            entries.push({ label: keys[i], docId: row.docId });
                        }
                    }
                }
                if (!entries.length) {
                    var hint = mapping ? 'account-mapping.doc was found but has 0 accounts. ' : 'No account-mapping.doc found in Drive. ';
                    hint += 'Also searching for "[Account Profile] *" docs...';
                    console.log('[AccountBrainDrive]', hint);
                    return pullByDocName(token, cb);
                }
                console.log('[AccountBrainDrive] pulling', entries.length, 'accounts from mapping doc');
                var results = [];
                var pending = entries.length;
                var firstErr = null;
                entries.forEach(function (entry) {
                    readDocParsed(token, entry.docId, function (e3, parsed) {
                        if (e3) {
                            console.error('[AccountBrainDrive] pull error for', entry.label, e3);
                            if (!firstErr) firstErr = e3;
                        } else {
                            results.push({
                                docId: entry.docId,
                                accountName: parsed.accountName || entry.label,
                                keyPlayers: parsed.keyPlayers || [],
                                topInitiatives: parsed.topInitiatives || [],
                                nextSteps: parsed.nextSteps || [],
                                additionalNotes: parsed.additionalNotes || []
                            });
                        }
                        pending--;
                        if (pending === 0) {
                            console.log('[AccountBrainDrive] pull complete:', results.length, 'of', entries.length);
                            cb(firstErr && !results.length ? firstErr : null, results);
                        }
                    });
                });
            });
        });
    }

    function pullByDocName(token, cb) {
        var query = "name contains '" + PROFILE_DOC_PREFIX.replace(/'/g, "\\'") + "' and trashed=false and mimeType='application/vnd.google-apps.document'";
        driveSearch(token, query, function (e2, files) {
            if (e2) return cb(e2);
            if (!files.length) return cb(null, []);
            var results = [];
            var pending = files.length;
            var firstErr = null;
            files.forEach(function (file) {
                readDocParsed(token, file.id, function (e3, parsed) {
                    if (e3) {
                        console.error('[AccountBrainDrive] pull read error for', file.name, e3);
                        if (!firstErr) firstErr = e3;
                    } else {
                        results.push({
                            docId: file.id,
                            accountName: parsed.accountName || file.name.replace(PROFILE_DOC_PREFIX, '').trim(),
                            keyPlayers: parsed.keyPlayers || [],
                            topInitiatives: parsed.topInitiatives || [],
                            nextSteps: parsed.nextSteps || [],
                            additionalNotes: parsed.additionalNotes || []
                        });
                    }
                    pending--;
                    if (pending === 0) {
                        console.log('[AccountBrainDrive] pull (by name) complete:', results.length);
                        cb(firstErr && !results.length ? firstErr : null, results);
                    }
                });
            });
        });
    }

    // ─── Push: localStorage → Google Docs (mapping doc IDs preferred) ───

    function pushToDocs(accountsArray, cb) {
        getAccessToken(function (err, token) {
            if (err) return cb(err);
            if (!accountsArray.length) return cb(null, { created: 0, updated: 0 });
            fetchMappingDoc(token, function (e2, mapping) {
                var byAccount = (mapping && mapping.byAccount) || {};
                var nameQuery = "name contains '" + PROFILE_DOC_PREFIX.replace(/'/g, "\\'") + "' and trashed=false and mimeType='application/vnd.google-apps.document'";
                driveSearch(token, nameQuery, function (e3, files) {
                    if (e3) return cb(e3);
                    var docsByName = {};
                    (files || []).forEach(function (f) {
                        var label = f.name.replace(PROFILE_DOC_PREFIX, '').trim().toLowerCase();
                        if (!docsByName[label]) docsByName[label] = f;
                    });
                    var stats = { created: 0, updated: 0, errors: [] };
                    var pending = accountsArray.length;
                    accountsArray.forEach(function (acct) {
                        var name = (acct.name || '').trim();
                        if (!name) { pending--; checkDone(); return; }
                        var text = DP.serializeAccountToProfileText(acct);
                        var key = name.toLowerCase();
                        var mappedRow = byAccount[key];
                        var targetDocId = (mappedRow && mappedRow.docId) || (docsByName[key] && docsByName[key].id);
                        if (targetDocId) {
                            writeDocContent(token, targetDocId, text, function (e4) {
                                if (e4) stats.errors.push(name + ': ' + e4.message);
                                else stats.updated++;
                                pending--;
                                checkDone();
                            });
                        } else {
                            createProfileDoc(token, name, text, function (e4) {
                                if (e4) stats.errors.push(name + ': ' + e4.message);
                                else stats.created++;
                                pending--;
                                checkDone();
                            });
                        }
                    });
                    function checkDone() {
                        if (pending <= 0) {
                            console.log('[AccountBrainDrive] push complete:', stats);
                            cb(stats.errors.length && !stats.updated && !stats.created ? new Error(stats.errors.join('; ')) : null, stats);
                        }
                    }
                });
            });
        });
    }

    // ─── Auth events ───

    function notifyAuthChange() {
        if (typeof global.AccountBrainDrive.onAuthChange === 'function') {
            try { global.AccountBrainDrive.onAuthChange(); } catch (e) { console.warn(e); }
        }
    }

    // ─── Public API ───

    global.AccountBrainDrive = {
        onAuthChange: null,

        isConfigured: function () { return !!getClientId(); },
        hasSessionToken: function () { return !!getStoredToken(); },

        signIn: function (cb) {
            clearStoredToken();
            clearMappingCache();
            requestToken(true, function (err, token) {
                notifyAuthChange();
                if (cb) cb(err, token);
            });
        },

        signOut: function (cb) {
            var t = sessionStorage.getItem(TOKEN_KEY);
            clearStoredToken();
            tokenClient = null;
            clearMappingCache();
            notifyAuthChange();
            if (!t) { if (cb) cb(null); return; }
            fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }).catch(function () {}).then(function () { if (cb) cb(null); });
        },

        pullFromDocs: pullFromDocs,
        pushToDocs: pushToDocs,
        invalidateMappingCache: clearMappingCache
    };
})(typeof window !== 'undefined' ? window : this);
