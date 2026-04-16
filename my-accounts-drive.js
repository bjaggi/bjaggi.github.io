/**
 * Google Sign-In + Drive appDataFolder sync for Account Brain profiles.
 * Depends on: window.GOOGLE_CLIENT_ID, https://accounts.google.com/gsi/client
 */
(function (global) {
    var TOKEN_KEY = 'ab_google_access_token';
    var EXP_KEY = 'ab_google_expires_at_ms';
    var SCOPE_TAG_KEY = 'ab_google_scope_tag';
    var SCOPE_TAG_VALUE = 'drive.appdata+documents.readonly-v3';
    var FILE_NAME = 'account-brain-profiles.json';
    var SCOPE =
        'https://www.googleapis.com/auth/drive.appdata ' +
        'https://www.googleapis.com/auth/documents.readonly';

    function getClientId() {
        var id = global.GOOGLE_CLIENT_ID;
        return typeof id === 'string' && id.indexOf('.apps.googleusercontent.com') !== -1 ? id.trim() : '';
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
        fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + q + '&fields=files(id,name)', {
            headers: { Authorization: 'Bearer ' + token }
        })
            .then(function (r) {
                return r.json().then(function (data) {
                    if (!r.ok) throw new Error(data.error ? data.error.message : 'Drive list failed');
                    var files = data.files || [];
                    cb(null, files.length ? files[0].id : null);
                });
            })
            .catch(function (e) {
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
                    if (!r.ok) throw new Error(data.error ? data.error.message : 'Drive create failed');
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
                if (!r.ok) return r.text().then(function (t) { throw new Error(t || r.status); });
                return r.json();
            })
            .then(function () { cb(null); })
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
            requestToken(true, function (err, token) {
                notifyAuthChange();
                if (cb) cb(err, token);
            });
        },

        signOut: function (cb) {
            var t = sessionStorage.getItem(TOKEN_KEY);
            clearStoredToken();
            tokenClient = null;
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
                fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId), {
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
                fetch('https://docs.googleapis.com/v1/documents/' + encodeURIComponent(docId), {
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
        }
    };
})(typeof window !== 'undefined' ? window : this);
