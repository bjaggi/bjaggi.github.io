/**
 * Google Sign-In + Drive appDataFolder sync for Account Brain profiles.
 * Depends on: window.GOOGLE_CLIENT_ID, https://accounts.google.com/gsi/client,
 * google-doc-profile-parse.js, google-account-mapping.js (load before this file).
 */
(function (global) {
    var TOKEN_KEY = 'ab_google_access_token';
    var EXP_KEY = 'ab_google_expires_at_ms';
    var SCOPE_TAG_KEY = 'ab_google_scope_tag';
    var SCOPE_TAG_VALUE = 'drive.appdata+documents.readonly+metadata-v5';
    var FILE_NAME = 'account-brain-profiles.json';
    var MAPPING_DOC_NAMES = ['account-mapping.doc', 'account-mapping'];
    var SCOPE =
        'https://www.googleapis.com/auth/drive.appdata ' +
        'https://www.googleapis.com/auth/drive.metadata.readonly ' +
        'https://www.googleapis.com/auth/documents.readonly';

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
                    if (pendingTokenCb) pendingTokenCb(new Error(resp.error_description || resp.error));
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

    function findFileId(token, cb) {
        var q = encodeURIComponent("name='" + FILE_NAME + "' and trashed=false");
        var url = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=files(id,name)';
        fetch(url, { headers: { Authorization: 'Bearer ' + token } })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) {
                        var msg = (data.error && data.error.message) || 'Drive list failed (' + r.status + ')';
                        console.error('[AccountBrainDrive] findFileId error:', msg, data);
                        throw new Error(msg);
                    }
                    var files = data.files || [];
                    return files.length ? files[0].id : null;
                });
            })
            .then(function (id) { cb(null, id); })
            .catch(function (e) {
                console.error('[AccountBrainDrive] findFileId catch:', e);
                cb(e);
            });
    }

    function createMultipartBody(metadata, content, boundary) {
        var delimiter = '\r\n--' + boundary + '\r\n';
        var close = '\r\n--' + boundary + '--';
        return (
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            content +
            close
        );
    }

    function createFile(token, jsonBody, cb) {
        var boundary = 'ab_brain_' + Math.random().toString(36).slice(2);
        var body = createMultipartBody({ name: FILE_NAME, parents: ['appDataFolder'] }, jsonBody, boundary);
        fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            body: body
        })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) {
                        var msg = (data.error && data.error.message) || 'Drive create failed (' + r.status + ')';
                        console.error('[AccountBrainDrive] createFile error:', msg, data);
                        throw new Error(msg);
                    }
                    console.log('[AccountBrainDrive] created backup file:', data.id);
                    cb(null, data.id);
                });
            })
            .catch(cb);
    }

    function patchFile(token, fileId, jsonBody, cb) {
        fetch('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?uploadType=media', {
            method: 'PATCH',
            headers: {
                Authorization: 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: jsonBody
        })
            .then(function (r) {
                if (!r.ok) {
                    return r.text().then(function (t) {
                        console.error('[AccountBrainDrive] patchFile error:', r.status, t);
                        throw new Error(t || ('Drive update failed (' + r.status + ')'));
                    });
                }
                return r.json();
            })
            .then(function () {
                console.log('[AccountBrainDrive] backup updated:', fileId);
                cb(null);
            })
            .catch(cb);
    }

    function parseAccountsPayload(text) {
        var j = JSON.parse(text);
        if (Array.isArray(j)) return j;
        if (j && Array.isArray(j.accounts)) return j.accounts;
        throw new Error('Unrecognized backup format');
    }

    var DP = global.AccountBrainDocParse;
    if (!DP) {
        throw new Error('Load google-doc-profile-parse.js before my-accounts-drive.js');
    }
    var extractPlainTextFromDoc = DP.extractPlainTextFromDoc;
    var extractProfileFromDocument = DP.extractProfileFromDocument;

    var accountMappingCache = null;

    function clearAccountMappingCache() {
        accountMappingCache = null;
    }

    function resolveMappingDocId(token, cb) {
        var override = global.GOOGLE_ACCOUNT_MAPPING_DOC_ID;
        if (typeof override === 'string') {
            var tid = override.trim();
            if (/^[a-zA-Z0-9_-]{12,}$/.test(tid)) {
                cb(null, tid);
                return;
            }
        }
        function listMappingCandidates(encodedQuery) {
            return fetch(
                'https://www.googleapis.com/drive/v3/files?q=' +
                    encodedQuery +
                    '&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc&pageSize=5',
                { headers: { Authorization: 'Bearer ' + token } }
            ).then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw new Error(data.error ? data.error.message : 'Drive list failed');
                    return data.files || [];
                });
            });
        }

        function findMappingDocForName(rawName, done) {
            var esc = rawName.replace(/'/g, "\\'");
            var base =
                "name='" +
                esc +
                "' and trashed=false and mimeType='application/vnd.google-apps.document'";
            var qRoot = encodeURIComponent(base + " and 'root' in parents");
            listMappingCandidates(qRoot)
                .then(function (rootFiles) {
                    if (rootFiles.length) {
                        done(null, rootFiles[0].id);
                        return;
                    }
                    var qShared = encodeURIComponent(base + ' and sharedWithMe=true');
                    return listMappingCandidates(qShared);
                })
                .then(function (sharedFiles) {
                    if (!sharedFiles) return;
                    if (sharedFiles.length) {
                        done(null, sharedFiles[0].id);
                    } else {
                        done(null, null);
                    }
                })
                .catch(done);
        }

        var nameIdx = 0;
        function tryNextName() {
            if (nameIdx >= MAPPING_DOC_NAMES.length) {
                cb(null, null);
                return;
            }
            var rawName = MAPPING_DOC_NAMES[nameIdx++];
            findMappingDocForName(rawName, function (err, id) {
                if (err) {
                    cb(err);
                    return;
                }
                if (id) {
                    cb(null, id);
                } else {
                    tryNextName();
                }
            });
        }
        tryNextName();
    }

    function fetchAccountMappingData(cb) {
        if (accountMappingCache && Date.now() - accountMappingCache.at < 5 * 60 * 1000) {
            cb(null, accountMappingCache.data);
            return;
        }
        getAccessToken(function (err, token) {
            if (err) return cb(err);
            resolveMappingDocId(token, function (e2, mapDocId) {
                if (e2) return cb(e2);
                if (!mapDocId) {
                    return cb(
                        new Error(
                            'Could not find account-mapping.doc in My Drive root or in Shared with me. Use that exact name, or set window.GOOGLE_ACCOUNT_MAPPING_DOC_ID to its document ID.'
                        )
                    );
                }
                fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(mapDocId) + '?includeTabsContent=true', {
                    headers: { Authorization: 'Bearer ' + token }
                })
                    .then(function (r) {
                        return r.json().then(function (data) {
                            if (!r.ok) {
                                throw new Error(
                                    (data.error && (data.error.message || data.error.status)) ||
                                        'Could not read account-mapping doc.'
                                );
                            }
                            var AM = global.AccountBrainAccountMapping;
                            if (!AM || typeof AM.parseAccountMappingFromDocument !== 'function') {
                                throw new Error(
                                    'google-account-mapping.js did not load. Check Network tab for a 404 on that file; it must appear before my-accounts-drive.js in my-accounts.html.'
                                );
                            }
                            var parsed = AM.parseAccountMappingFromDocument(data);
                            var payload = { mappingDocId: mapDocId, byAccount: parsed.byAccount };
                            accountMappingCache = { data: payload, at: Date.now() };
                            cb(null, payload);
                        });
                    })
                    .catch(cb);
            });
        });
    }

    function notifyAuthChange() {
        if (typeof global.AccountBrainDrive.onAuthChange === 'function') {
            try {
                global.AccountBrainDrive.onAuthChange();
            } catch (e) {
                console.warn(e);
            }
        }
    }

    global.AccountBrainDrive = {
        onAuthChange: null,

        isConfigured: function () {
            return !!getClientId();
        },

        hasSessionToken: function () {
            return !!getStoredToken();
        },

        signIn: function (cb) {
            clearStoredToken();
            clearAccountMappingCache();
            requestToken(true, function (err, token) {
                notifyAuthChange();
                if (cb) cb(err, token);
            });
        },

        signOut: function (cb) {
            var t = sessionStorage.getItem(TOKEN_KEY);
            clearStoredToken();
            tokenClient = null;
            clearAccountMappingCache();
            notifyAuthChange();
            if (!t) {
                if (cb) cb(null);
                return;
            }
            fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t), {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            })
                .catch(function () {})
                .then(function () {
                    if (cb) cb(null);
                });
        },

        uploadAccounts: function (accountsArray, cb) {
            getAccessToken(function (err, token) {
                if (err) return cb(err);
                var envelope = {
                    version: 1,
                    savedAt: new Date().toISOString(),
                    accounts: accountsArray
                };
                var jsonBody = JSON.stringify(envelope);
                findFileId(token, function (e2, fileId) {
                    if (e2) return cb(e2);
                    if (fileId) patchFile(token, fileId, jsonBody, cb);
                    else createFile(token, jsonBody, function (e3) { cb(e3); });
                });
            });
        },

        downloadAccounts: function (cb) {
            getAccessToken(function (err, token) {
                if (err) return cb(err);
                findFileId(token, function (e2, fileId) {
                    if (e2) return cb(e2);
                    if (!fileId) return cb(null, null);
                    fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(fileId) + '?alt=media', {
                        headers: { Authorization: 'Bearer ' + token }
                    })
                        .then(function (r) {
                            if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
                            return r.text();
                        })
                        .then(function (text) {
                            cb(null, parseAccountsPayload(text));
                        })
                        .catch(cb);
                });
            });
        },

        /**
         * Read a Google Doc the signed-in user can access. Plain text is flattened from the Docs API structure.
         * Requires Google Docs API enabled in GCP and OAuth scope documents.readonly on the consent screen.
         */
        fetchGoogleDocPlainText: function (docId, cb) {
            getAccessToken(function (err, token) {
                if (err) return cb(err);
                fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + '?includeTabsContent=true', {
                    headers: { Authorization: 'Bearer ' + token }
                })
                    .then(function (r) {
                        return r.json().then(function (data) {
                            if (!r.ok) {
                                throw new Error(
                                    (data.error && (data.error.message || data.error.status)) ||
                                        'Could not read Google Doc (enable Docs API and re-consent scopes).'
                                );
                            }
                            return extractPlainTextFromDoc(data);
                        });
                    })
                    .then(function (plain) {
                        cb(null, plain);
                    })
                    .catch(cb);
            });
        },

        /** Preferred: parses Docs API structure (bullets, headings), not markdown text. */
        fetchGoogleDocProfileParsed: function (docId, cb) {
            getAccessToken(function (err, token) {
                if (err) return cb(err);
                fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId) + '?includeTabsContent=true', {
                    headers: { Authorization: 'Bearer ' + token }
                })
                    .then(function (r) {
                        return r.json().then(function (data) {
                            if (!r.ok) {
                                throw new Error(
                                    (data.error && (data.error.message || data.error.status)) ||
                                        'Could not read Google Doc (enable Docs API and re-consent scopes).'
                                );
                            }
                            return extractProfileFromDocument(data);
                        });
                    })
                    .then(function (parsed) {
                        cb(null, parsed);
                    })
                    .catch(cb);
            });
        },

        /** Loads account-mapping.doc from Drive root (or GOOGLE_ACCOUNT_MAPPING_DOC_ID). Cached ~5 min. */
        fetchAccountMapping: function (cb) {
            fetchAccountMappingData(cb);
        },

        invalidateAccountMappingCache: function () {
            clearAccountMappingCache();
        },

        /**
         * Resolves profile Google Doc ID for an account label using account-mapping.doc.
         * cb(err, docId|null, mappingPayload?)
         */
        lookupProfileDocIdForAccount: function (accountName, cb) {
            fetchAccountMappingData(function (err, data) {
                if (err) return cb(err);
                var k = String(accountName || '').trim().toLowerCase();
                var row = data.byAccount[k];
                cb(null, row ? row.docId : null, data);
            });
        }
    };
})(typeof window !== 'undefined' ? window : this);
