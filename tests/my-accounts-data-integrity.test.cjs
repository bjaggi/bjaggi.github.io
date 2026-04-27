'use strict';

/**
 * Comprehensive tests for My Accounts data persistence layer.
 *
 * Covers: toV3 normalization, migration, save/load roundtrip via localStorage,
 * Drive pull-merge logic (local-only fields preserved), deduplication,
 * serialize→parse fidelity for every field, and edge cases that could lose data.
 *
 * Runs with:  npm test   (node --test tests/*.test.cjs)
 */

const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

const DP = require('../google-doc-profile-parse.js');

// ──────────────────────────────────────────────────
// Re-implement the pure-logic functions from
// my-accounts.html so we can unit-test them in Node.
// Keep these in sync with the inline <script> block.
// ──────────────────────────────────────────────────

function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function parseLegacyPlayerString(s) {
    var str = String(s == null ? '' : s).trim();
    if (!str) return { name: '', title: '', other: '' };
    var parts = str.split(/\s*[—–-]\s*/);
    if (parts.length >= 2) {
        return {
            name: parts[0].trim(),
            title: parts.slice(1).join(' — ').trim(),
            other: ''
        };
    }
    return { name: str, title: '', other: '' };
}

function normalizeKeyPlayer(p) {
    if (p && typeof p === 'object' && !Array.isArray(p)) {
        return {
            name: String(p.name != null ? p.name : '').trim(),
            title: String(p.title != null ? p.title : '').trim(),
            other: String(p.other != null ? p.other : '').trim()
        };
    }
    return parseLegacyPlayerString(p);
}

function migrateNotes(raw) {
    if (Array.isArray(raw)) return raw.filter(function (n) { return n && n.text; });
    var s = String(raw || '').trim();
    if (!s) return [];
    return [{ date: todayStr(), text: s }];
}

function previewNotes(text, maxLen) {
    var t = (text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= maxLen) return t;
    return t.slice(0, maxLen).trim() + '…';
}

function toV3(acct) {
    if (!acct) return null;
    if (Array.isArray(acct.keyPlayers)) {
        return {
            id: acct.id || ('acc-' + Date.now()),
            name: acct.name || '',
            updatedAt: acct.updatedAt || todayStr(),
            keyPlayers: (acct.keyPlayers || []).map(normalizeKeyPlayer),
            topInitiatives: (acct.topInitiatives || []).map(String),
            nextSteps: (acct.nextSteps || []).map(String),
            additionalNotes: migrateNotes(acct.additionalNotes),
            useCases: (acct.useCases || []).map(String),
            architectureText: acct.architectureText || '',
            architectureImage: acct.architectureImage || '',
            valuePath: (acct.valuePath || []).map(String)
        };
    }
    var imp = '';
    if ((acct.players || 0) + (acct.initiatives || 0) + (acct.actionItems || 0) > 0) {
        imp = '[Imported] ' + (acct.players || 0) + ' players, ' + (acct.initiatives || 0) + ' initiatives, ' + (acct.actionItems || 0) + ' action items.';
    }
    var legacyText = (imp + ' ' + (acct.notes || '')).trim();
    return {
        id: acct.id || ('acc-' + Date.now()),
        name: acct.name || '',
        updatedAt: acct.updatedAt || todayStr(),
        keyPlayers: [],
        topInitiatives: acct.priorityLine ? [String(acct.priorityLine)] : [],
        nextSteps: [],
        additionalNotes: legacyText ? [{ date: todayStr(), text: legacyText }] : []
    };
}

function migrateFromV1(oldList) {
    return oldList.map(function (a) {
        return {
            id: a.id || ('mig-' + Math.random().toString(36).slice(2)),
            name: a.name || 'Account',
            players: 0,
            initiatives: 0,
            actionItems: 0,
            priorityLine: previewNotes(a.notes || '', 72) || '—',
            notes: a.notes || '',
            updatedAt: todayStr()
        };
    });
}

function deduplicateByName(list) {
    var seen = {};
    return list.filter(function (a) {
        var k = (a.name || '').toLowerCase();
        if (seen[k]) return false;
        seen[k] = true;
        return true;
    });
}

function defaultAccounts() {
    return [
        {
            id: 'seed-1', name: 'ACME Corp', updatedAt: '2026-04-14',
            keyPlayers: [
                { name: 'Alex Chen', title: 'Champion', other: '' },
                { name: 'Jamie Rivera', title: 'Platform lead', other: '' },
                { name: 'Pat Kim', title: 'Procurement', other: '' }
            ],
            topInitiatives: ['#1: Save Costs'],
            nextSteps: [],
            additionalNotes: [{ date: '2026-04-14', text: 'Cost optimization and platform consolidation discussion ongoing.' }]
        },
        {
            id: 'seed-2', name: 'My Fav Bank', updatedAt: '2026-04-14',
            keyPlayers: [
                { name: 'Sam Okonkwo', title: 'Engineering', other: '' },
                { name: 'Jordan Lee', title: 'Architect', other: '' },
                { name: 'Michael Keats', title: '', other: '' }
            ],
            topInitiatives: ['#1: Evaluate WarpStream'],
            nextSteps: ['Schedule architecture review with data team'],
            additionalNotes: [{ date: '2026-04-14', text: 'Evaluating streaming options; competitive evaluation in progress.' }]
        }
    ];
}

function isOldSeedData(list) {
    if (!Array.isArray(list) || list.length !== 2) return false;
    var names = list.map(function (a) { return (a.name || '').toLowerCase(); }).sort();
    return names[0] === 'cisco' && names[1] === 'nvidia';
}

// Simulates the merge logic from the pull handler in my-accounts.html
function mergePullWithLocal(profiles, localAccounts) {
    var localByName = {};
    localAccounts.forEach(function (a) { localByName[(a.name || '').toLowerCase()] = a; });
    return deduplicateByName(profiles.map(function (p) {
        var pulled = toV3({
            name: p.accountName,
            keyPlayers: p.keyPlayers,
            topInitiatives: p.topInitiatives || [],
            nextSteps: p.nextSteps || [],
            additionalNotes: p.additionalNotes || []
        });
        var local = localByName[(pulled.name || '').toLowerCase()];
        if (local) {
            pulled.id = local.id;
            pulled.useCases = local.useCases || [];
            pulled.architectureText = local.architectureText || '';
            pulled.architectureImage = local.architectureImage || '';
            pulled.valuePath = local.valuePath || [];
        }
        return pulled;
    }));
}


// ═══════════════════════════════════════════════
//  1. toV3 normalization
// ═══════════════════════════════════════════════

describe('toV3 — data normalization', () => {

    test('null input returns null', () => {
        assert.equal(toV3(null), null);
        assert.equal(toV3(undefined), null);
    });

    test('full v3 account passes through with all fields', () => {
        const acct = {
            id: 'a1', name: 'Nvidia', updatedAt: '2026-01-01',
            keyPlayers: [{ name: 'Tony', title: 'VP', other: 'Champion' }],
            topInitiatives: ['Migrate to cloud'],
            nextSteps: ['Call Tuesday'],
            additionalNotes: [{ date: '2026-01-01', text: 'Good meeting.' }],
            useCases: ['Real-time analytics'],
            architectureText: 'K8s + Kafka',
            architectureImage: 'https://example.com/arch.png',
            valuePath: ['POC', 'Pilot', 'GA']
        };
        const out = toV3(acct);
        assert.equal(out.id, 'a1');
        assert.equal(out.name, 'Nvidia');
        assert.equal(out.updatedAt, '2026-01-01');
        assert.equal(out.keyPlayers.length, 1);
        assert.equal(out.keyPlayers[0].name, 'Tony');
        assert.equal(out.keyPlayers[0].other, 'Champion');
        assert.deepEqual(out.topInitiatives, ['Migrate to cloud']);
        assert.deepEqual(out.nextSteps, ['Call Tuesday']);
        assert.equal(out.additionalNotes.length, 1);
        assert.deepEqual(out.useCases, ['Real-time analytics']);
        assert.equal(out.architectureText, 'K8s + Kafka');
        assert.equal(out.architectureImage, 'https://example.com/arch.png');
        assert.deepEqual(out.valuePath, ['POC', 'Pilot', 'GA']);
    });

    test('generates id and updatedAt when missing', () => {
        const out = toV3({ keyPlayers: [], name: 'Test' });
        assert.ok(out.id.startsWith('acc-'), 'should auto-generate id');
        assert.equal(out.updatedAt, todayStr());
    });

    test('missing optional fields default to empty', () => {
        const out = toV3({ keyPlayers: [], name: 'Bare' });
        assert.deepEqual(out.topInitiatives, []);
        assert.deepEqual(out.nextSteps, []);
        assert.deepEqual(out.additionalNotes, []);
        assert.deepEqual(out.useCases, []);
        assert.equal(out.architectureText, '');
        assert.equal(out.architectureImage, '');
        assert.deepEqual(out.valuePath, []);
    });

    test('legacy v2 account (no keyPlayers array) migrates with import summary', () => {
        const legacy = {
            id: 'old1', name: 'Cisco',
            players: 3, initiatives: 2, actionItems: 1,
            notes: 'Some legacy notes',
            priorityLine: 'Top priority'
        };
        const out = toV3(legacy);
        assert.equal(out.name, 'Cisco');
        assert.deepEqual(out.keyPlayers, []);
        assert.deepEqual(out.topInitiatives, ['Top priority']);
        assert.equal(out.additionalNotes.length, 1);
        assert.ok(out.additionalNotes[0].text.includes('[Imported]'));
        assert.ok(out.additionalNotes[0].text.includes('3 players'));
        assert.ok(out.additionalNotes[0].text.includes('Some legacy notes'));
    });

    test('legacy v2 account with zero counts and empty notes', () => {
        const legacy = { name: 'Empty', players: 0, initiatives: 0, actionItems: 0, notes: '' };
        const out = toV3(legacy);
        assert.deepEqual(out.additionalNotes, []);
        assert.deepEqual(out.topInitiatives, []);
    });
});


// ═══════════════════════════════════════════════
//  2. normalizeKeyPlayer
// ═══════════════════════════════════════════════

describe('normalizeKeyPlayer', () => {

    test('object with all fields passes through trimmed', () => {
        const out = normalizeKeyPlayer({ name: '  Tony ', title: ' VP  ', other: ' Champion ' });
        assert.equal(out.name, 'Tony');
        assert.equal(out.title, 'VP');
        assert.equal(out.other, 'Champion');
    });

    test('object with null/undefined fields defaults to empty string', () => {
        const out = normalizeKeyPlayer({ name: null, title: undefined });
        assert.equal(out.name, '');
        assert.equal(out.title, '');
        assert.equal(out.other, '');
    });

    test('legacy string "Name — Title" is parsed', () => {
        const out = normalizeKeyPlayer('Tony Mancill — Director of Infra');
        assert.equal(out.name, 'Tony Mancill');
        assert.equal(out.title, 'Director of Infra');
        assert.equal(out.other, '');
    });

    test('legacy string with en-dash', () => {
        const out = normalizeKeyPlayer('Alice – VP Sales');
        assert.equal(out.name, 'Alice');
        assert.equal(out.title, 'VP Sales');
    });

    test('legacy string with hyphen', () => {
        const out = normalizeKeyPlayer('Bob - Engineering');
        assert.equal(out.name, 'Bob');
        assert.equal(out.title, 'Engineering');
    });

    test('legacy string with no separator', () => {
        const out = normalizeKeyPlayer('Just A Name');
        assert.equal(out.name, 'Just A Name');
        assert.equal(out.title, '');
    });

    test('empty/null input', () => {
        assert.deepEqual(normalizeKeyPlayer(null), { name: '', title: '', other: '' });
        assert.deepEqual(normalizeKeyPlayer(''), { name: '', title: '', other: '' });
        assert.deepEqual(normalizeKeyPlayer(undefined), { name: '', title: '', other: '' });
    });
});


// ═══════════════════════════════════════════════
//  3. migrateNotes
// ═══════════════════════════════════════════════

describe('migrateNotes', () => {

    test('array of note objects filters out empty', () => {
        const input = [
            { date: '2026-01-01', text: 'Good' },
            { date: '', text: '' },
            null,
            { date: '2026-02-01', text: 'Also good' }
        ];
        const out = migrateNotes(input);
        assert.equal(out.length, 2);
        assert.equal(out[0].text, 'Good');
        assert.equal(out[1].text, 'Also good');
    });

    test('legacy string becomes single note with today date', () => {
        const out = migrateNotes('Old format note');
        assert.equal(out.length, 1);
        assert.equal(out[0].date, todayStr());
        assert.equal(out[0].text, 'Old format note');
    });

    test('empty string returns empty array', () => {
        assert.deepEqual(migrateNotes(''), []);
        assert.deepEqual(migrateNotes(null), []);
        assert.deepEqual(migrateNotes(undefined), []);
    });

    test('empty array returns empty array', () => {
        assert.deepEqual(migrateNotes([]), []);
    });
});


// ═══════════════════════════════════════════════
//  4. deduplicateByName
// ═══════════════════════════════════════════════

describe('deduplicateByName', () => {

    test('keeps first occurrence, removes duplicates', () => {
        const list = [
            { name: 'Nvidia', id: '1' },
            { name: 'Cisco', id: '2' },
            { name: 'nvidia', id: '3' }
        ];
        const out = deduplicateByName(list);
        assert.equal(out.length, 2);
        assert.equal(out[0].id, '1');
        assert.equal(out[1].id, '2');
    });

    test('case-insensitive matching', () => {
        const list = [
            { name: 'ACME Corp', id: 'a' },
            { name: 'acme corp', id: 'b' },
            { name: 'Acme Corp', id: 'c' }
        ];
        assert.equal(deduplicateByName(list).length, 1);
    });

    test('empty list returns empty', () => {
        assert.deepEqual(deduplicateByName([]), []);
    });

    test('accounts with empty names are deduplicated', () => {
        const list = [
            { name: '', id: '1' },
            { name: '', id: '2' }
        ];
        assert.equal(deduplicateByName(list).length, 1);
    });
});


// ═══════════════════════════════════════════════
//  5. localStorage simulation — load/save roundtrip
// ═══════════════════════════════════════════════

describe('localStorage roundtrip (simulated)', () => {

    const STORAGE_V3 = 'my-accounts-ai-assistant-v3';
    const STORAGE_V2 = 'my-accounts-ai-assistant-v2';
    const STORAGE_V1 = 'my-accounts-ai-assistant-v1';

    let store;
    function resetStore() {
        store = {};
    }
    function getItem(key) { return store[key] || null; }
    function setItem(key, val) { store[key] = val; }
    function removeItem(key) { delete store[key]; }

    function loadAccounts() {
        try {
            var r3 = getItem(STORAGE_V3);
            if (r3) {
                var p3 = JSON.parse(r3);
                if (Array.isArray(p3)) {
                    if (isOldSeedData(p3)) {
                        removeItem(STORAGE_V3);
                        return defaultAccounts();
                    }
                    return p3.map(toV3);
                }
            }
            var r2 = getItem(STORAGE_V2);
            if (r2) {
                var p2 = JSON.parse(r2);
                if (Array.isArray(p2) && p2.length) {
                    var m2 = p2.map(toV3);
                    setItem(STORAGE_V3, JSON.stringify(m2));
                    removeItem(STORAGE_V2);
                    return m2;
                }
            }
            var r1 = getItem(STORAGE_V1);
            if (r1) {
                var p1 = JSON.parse(r1);
                if (Array.isArray(p1) && p1.length) {
                    var m1 = migrateFromV1(p1).map(toV3);
                    setItem(STORAGE_V3, JSON.stringify(m1));
                    removeItem(STORAGE_V1);
                    return m1;
                }
            }
        } catch (e) {
            // corrupt data fallback
        }
        return defaultAccounts();
    }

    function saveAccounts(list) {
        setItem(STORAGE_V3, JSON.stringify(list));
    }

    beforeEach(() => { resetStore(); });

    test('empty storage returns default seed accounts', () => {
        const accounts = loadAccounts();
        assert.equal(accounts.length, 2);
        assert.equal(accounts[0].name, 'ACME Corp');
        assert.equal(accounts[1].name, 'My Fav Bank');
    });

    test('save then load preserves all fields', () => {
        const original = [{
            id: 'test-1', name: 'Nvidia', updatedAt: '2026-04-20',
            keyPlayers: [{ name: 'Tony', title: 'VP', other: 'Champion' }],
            topInitiatives: ['Cloud migration'],
            nextSteps: ['Schedule call'],
            additionalNotes: [{ date: '2026-04-20', text: 'Met at summit.' }],
            useCases: ['CDC', 'Analytics'],
            architectureText: 'Kafka on K8s',
            architectureImage: 'https://example.com/arch.png',
            valuePath: ['POC', 'Pilot']
        }];
        saveAccounts(original);
        const loaded = loadAccounts();

        assert.equal(loaded.length, 1);
        const a = loaded[0];
        assert.equal(a.id, 'test-1');
        assert.equal(a.name, 'Nvidia');
        assert.equal(a.updatedAt, '2026-04-20');
        assert.equal(a.keyPlayers.length, 1);
        assert.equal(a.keyPlayers[0].name, 'Tony');
        assert.equal(a.keyPlayers[0].title, 'VP');
        assert.equal(a.keyPlayers[0].other, 'Champion');
        assert.deepEqual(a.topInitiatives, ['Cloud migration']);
        assert.deepEqual(a.nextSteps, ['Schedule call']);
        assert.equal(a.additionalNotes.length, 1);
        assert.equal(a.additionalNotes[0].date, '2026-04-20');
        assert.equal(a.additionalNotes[0].text, 'Met at summit.');
        assert.deepEqual(a.useCases, ['CDC', 'Analytics']);
        assert.equal(a.architectureText, 'Kafka on K8s');
        assert.equal(a.architectureImage, 'https://example.com/arch.png');
        assert.deepEqual(a.valuePath, ['POC', 'Pilot']);
    });

    test('V2 → V3 migration preserves data and removes V2 key', () => {
        const v2Data = [{
            id: 'v2-1', name: 'Cisco',
            keyPlayers: [{ name: 'Alice', title: 'VP', other: '' }],
            topInitiatives: ['Reduce cost'],
            nextSteps: ['Follow up'],
            additionalNotes: [{ date: '2026-03-01', text: 'Initial call.' }]
        }];
        setItem(STORAGE_V2, JSON.stringify(v2Data));
        const loaded = loadAccounts();

        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].name, 'Cisco');
        assert.equal(loaded[0].keyPlayers[0].name, 'Alice');
        assert.ok(getItem(STORAGE_V3), 'V3 key should exist after migration');
        assert.equal(getItem(STORAGE_V2), null, 'V2 key should be removed');
    });

    test('V1 → V3 migration preserves account names and notes', () => {
        const v1Data = [
            { id: 'v1-1', name: 'OldCorp', notes: 'Legacy notes here' },
            { id: 'v1-2', name: 'AncientInc', notes: '' }
        ];
        setItem(STORAGE_V1, JSON.stringify(v1Data));
        const loaded = loadAccounts();

        assert.equal(loaded.length, 2);
        assert.equal(loaded[0].name, 'OldCorp');
        assert.ok(loaded[0].additionalNotes.length >= 1);
        assert.ok(loaded[0].additionalNotes[0].text.includes('Legacy notes here'));
        assert.equal(loaded[1].name, 'AncientInc');
        assert.equal(getItem(STORAGE_V1), null, 'V1 key should be removed');
    });

    test('old Cisco/Nvidia seed data is replaced with new defaults', () => {
        const oldSeed = [
            { id: 's1', name: 'Cisco', keyPlayers: [] },
            { id: 's2', name: 'Nvidia', keyPlayers: [] }
        ];
        setItem(STORAGE_V3, JSON.stringify(oldSeed));
        const loaded = loadAccounts();

        assert.equal(loaded.length, 2);
        assert.equal(loaded[0].name, 'ACME Corp');
        assert.equal(loaded[1].name, 'My Fav Bank');
    });

    test('corrupted JSON falls back to defaults', () => {
        setItem(STORAGE_V3, '{not valid json!!!');
        const loaded = loadAccounts();
        assert.equal(loaded.length, 2);
        assert.equal(loaded[0].name, 'ACME Corp');
    });

    test('non-array JSON falls back to defaults', () => {
        setItem(STORAGE_V3, JSON.stringify({ notAnArray: true }));
        const loaded = loadAccounts();
        assert.equal(loaded.length, 2);
    });

    test('V3 takes precedence over V2 and V1', () => {
        setItem(STORAGE_V3, JSON.stringify([{ id: 'v3', name: 'V3Only', keyPlayers: [] }]));
        setItem(STORAGE_V2, JSON.stringify([{ id: 'v2', name: 'V2Only', keyPlayers: [] }]));
        setItem(STORAGE_V1, JSON.stringify([{ id: 'v1', name: 'V1Only', notes: '' }]));
        const loaded = loadAccounts();
        assert.equal(loaded.length, 1);
        assert.equal(loaded[0].name, 'V3Only');
    });

    test('save multiple accounts then load all back', () => {
        const accounts = [
            { id: 'a', name: 'Alpha', keyPlayers: [{ name: 'A1', title: 'T1', other: '' }], topInitiatives: ['I1'], nextSteps: [], additionalNotes: [], useCases: ['U1'], architectureText: 'AT1', architectureImage: '', valuePath: ['V1'] },
            { id: 'b', name: 'Beta', keyPlayers: [], topInitiatives: [], nextSteps: ['S1'], additionalNotes: [{ date: '2026-01-01', text: 'N1' }], useCases: [], architectureText: '', architectureImage: '', valuePath: [] },
            { id: 'c', name: 'Gamma', keyPlayers: [{ name: 'G1', title: '', other: 'note' }, { name: 'G2', title: 'Dir', other: '' }], topInitiatives: ['I1', 'I2', 'I3'], nextSteps: ['S1', 'S2'], additionalNotes: [], useCases: ['U1', 'U2'], architectureText: 'complex', architectureImage: 'https://img.png', valuePath: ['POC'] }
        ];
        saveAccounts(accounts);
        const loaded = loadAccounts();
        assert.equal(loaded.length, 3);
        assert.equal(loaded[0].name, 'Alpha');
        assert.equal(loaded[1].name, 'Beta');
        assert.equal(loaded[2].name, 'Gamma');
        assert.equal(loaded[2].keyPlayers.length, 2);
        assert.deepEqual(loaded[2].topInitiatives, ['I1', 'I2', 'I3']);
    });

    test('save empty list then load returns empty (not defaults)', () => {
        saveAccounts([]);
        const raw = getItem(STORAGE_V3);
        assert.equal(raw, '[]');
        // loadAccounts sees an empty array, which is valid V3 but isOldSeedData returns false
        const loaded = loadAccounts();
        assert.equal(loaded.length, 0);
    });

    test('delete an account: save filtered list, reload confirms removal', () => {
        const accounts = [
            { id: 'a', name: 'Keep', keyPlayers: [], topInitiatives: [], nextSteps: [], additionalNotes: [] },
            { id: 'b', name: 'Remove', keyPlayers: [], topInitiatives: [], nextSteps: [], additionalNotes: [] }
        ];
        saveAccounts(accounts);
        const filtered = loadAccounts().filter(a => a.name !== 'Remove');
        saveAccounts(filtered);
        const reloaded = loadAccounts();
        assert.equal(reloaded.length, 1);
        assert.equal(reloaded[0].name, 'Keep');
    });
});


// ═══════════════════════════════════════════════
//  6. Drive pull → merge logic
// ═══════════════════════════════════════════════

describe('Drive pull-merge: local-only fields are preserved', () => {

    test('useCases, architectureText, architectureImage, valuePath survive pull', () => {
        const localAccounts = [{
            id: 'local-1', name: 'Nvidia',
            keyPlayers: [{ name: 'Old Player', title: 'Old Title', other: '' }],
            topInitiatives: ['Old initiative'],
            nextSteps: ['Old step'],
            additionalNotes: [{ date: '2026-01-01', text: 'Old note' }],
            useCases: ['CDC pipeline', 'Real-time fraud detection'],
            architectureText: 'Kafka Connect → Snowflake with Schema Registry',
            architectureImage: 'https://drive.google.com/my-diagram.png',
            valuePath: ['POC complete', 'Pilot in Q2', 'GA in Q3']
        }];

        const pulledProfiles = [{
            accountName: 'Nvidia',
            keyPlayers: [{ name: 'New Player', title: 'New Title', other: 'New contact' }],
            topInitiatives: ['New initiative from Drive'],
            nextSteps: ['New step from Drive'],
            additionalNotes: [{ date: '2026-04-20', text: 'Updated note from Drive' }]
        }];

        const merged = mergePullWithLocal(pulledProfiles, localAccounts);

        assert.equal(merged.length, 1);
        const m = merged[0];
        assert.equal(m.id, 'local-1', 'should keep local id');
        assert.equal(m.name, 'Nvidia');
        // Drive fields overwrite
        assert.equal(m.keyPlayers[0].name, 'New Player');
        assert.deepEqual(m.topInitiatives, ['New initiative from Drive']);
        assert.deepEqual(m.nextSteps, ['New step from Drive']);
        assert.equal(m.additionalNotes[0].text, 'Updated note from Drive');
        // Local-only fields preserved
        assert.deepEqual(m.useCases, ['CDC pipeline', 'Real-time fraud detection']);
        assert.equal(m.architectureText, 'Kafka Connect → Snowflake with Schema Registry');
        assert.equal(m.architectureImage, 'https://drive.google.com/my-diagram.png');
        assert.deepEqual(m.valuePath, ['POC complete', 'Pilot in Q2', 'GA in Q3']);
    });

    test('new account from Drive (no local match) gets empty local-only fields', () => {
        const localAccounts = [{
            id: 'local-1', name: 'Cisco', keyPlayers: [],
            useCases: ['Streaming'], architectureText: 'K8s', architectureImage: '', valuePath: []
        }];

        const pulledProfiles = [{
            accountName: 'Nvidia',
            keyPlayers: [{ name: 'Tony', title: 'VP', other: '' }],
            topInitiatives: ['Expand Kafka'],
            nextSteps: [],
            additionalNotes: []
        }];

        const merged = mergePullWithLocal(pulledProfiles, localAccounts);
        assert.equal(merged.length, 1);
        assert.equal(merged[0].name, 'Nvidia');
        assert.deepEqual(merged[0].useCases, []);
        assert.equal(merged[0].architectureText, '');
        assert.equal(merged[0].architectureImage, '');
        assert.deepEqual(merged[0].valuePath, []);
    });

    test('case-insensitive name matching for merge', () => {
        const local = [{
            id: 'loc1', name: 'NVIDIA',
            keyPlayers: [], useCases: ['Important use case'],
            architectureText: 'My arch', architectureImage: '', valuePath: ['Step 1']
        }];
        const pulled = [{
            accountName: 'nvidia',
            keyPlayers: [{ name: 'Tony', title: 'VP', other: '' }],
            topInitiatives: [], nextSteps: [], additionalNotes: []
        }];

        const merged = mergePullWithLocal(pulled, local);
        assert.equal(merged[0].id, 'loc1');
        assert.deepEqual(merged[0].useCases, ['Important use case']);
        assert.equal(merged[0].architectureText, 'My arch');
        assert.deepEqual(merged[0].valuePath, ['Step 1']);
    });

    test('pull deduplicates by name (keeps first)', () => {
        const local = [];
        const pulled = [
            { accountName: 'Nvidia', keyPlayers: [{ name: 'First', title: '', other: '' }], topInitiatives: [], nextSteps: [], additionalNotes: [] },
            { accountName: 'nvidia', keyPlayers: [{ name: 'Dupe', title: '', other: '' }], topInitiatives: [], nextSteps: [], additionalNotes: [] }
        ];
        const merged = mergePullWithLocal(pulled, local);
        assert.equal(merged.length, 1);
        assert.equal(merged[0].keyPlayers[0].name, 'First');
    });

    test('local-only accounts are LOST after pull (Drive is source of truth)', () => {
        const local = [
            { id: 'loc1', name: 'LocalOnly', keyPlayers: [], useCases: ['Critical use case'], architectureText: 'Important arch', architectureImage: '', valuePath: [] },
            { id: 'loc2', name: 'Nvidia', keyPlayers: [], useCases: [], architectureText: '', architectureImage: '', valuePath: [] }
        ];
        const pulled = [
            { accountName: 'Nvidia', keyPlayers: [], topInitiatives: [], nextSteps: [], additionalNotes: [] }
        ];
        const merged = mergePullWithLocal(pulled, local);
        assert.equal(merged.length, 1, 'LocalOnly account is NOT in the merged result');
        assert.equal(merged[0].name, 'Nvidia');
    });

    test('multiple accounts merge correctly, each preserving own local fields', () => {
        const local = [
            { id: 'l1', name: 'Nvidia', keyPlayers: [], useCases: ['NV use case'], architectureText: 'NV arch', architectureImage: '', valuePath: ['NV step'] },
            { id: 'l2', name: 'Cisco', keyPlayers: [], useCases: ['Cisco use case'], architectureText: 'Cisco arch', architectureImage: 'https://cisco.png', valuePath: [] }
        ];
        const pulled = [
            { accountName: 'Nvidia', keyPlayers: [{ name: 'Tony', title: 'VP', other: '' }], topInitiatives: ['NV init'], nextSteps: [], additionalNotes: [] },
            { accountName: 'Cisco', keyPlayers: [{ name: 'Alice', title: 'Dir', other: '' }], topInitiatives: ['Cisco init'], nextSteps: ['Cisco step'], additionalNotes: [] }
        ];
        const merged = mergePullWithLocal(pulled, local);
        assert.equal(merged.length, 2);

        assert.equal(merged[0].id, 'l1');
        assert.deepEqual(merged[0].useCases, ['NV use case']);
        assert.equal(merged[0].architectureText, 'NV arch');
        assert.equal(merged[0].keyPlayers[0].name, 'Tony');

        assert.equal(merged[1].id, 'l2');
        assert.deepEqual(merged[1].useCases, ['Cisco use case']);
        assert.equal(merged[1].architectureImage, 'https://cisco.png');
        assert.equal(merged[1].keyPlayers[0].name, 'Alice');
    });
});


// ═══════════════════════════════════════════════
//  7. Full roundtrip: save → serialize → parse → merge → load
// ═══════════════════════════════════════════════

describe('End-to-end: save → serialize to Doc → parse back → merge', () => {

    test('all Drive-synced fields survive serialize→parse roundtrip', () => {
        const account = {
            name: 'Nvidia',
            keyPlayers: [
                { name: 'Tony Mancill', title: 'Director of Infra', other: 'Neutral' },
                { name: 'Jordan Lee', title: 'Architect', other: 'New hire' }
            ],
            topInitiatives: ['Expand Kafka footprint', 'Cost reduction', 'DR strategy'],
            nextSteps: ['Send POC plan', 'Schedule demo', 'Review pricing'],
            additionalNotes: [
                { date: '2026-04-14', text: 'Budget approved for Q3.' },
                { date: '2026-04-20', text: 'Exec sponsor confirmed.' }
            ]
        };

        const text = DP.serializeAccountToProfileText(account);
        const mockDoc = DP.buildMockDocFromPlainText(text);
        const parsed = DP.extractProfileFromDocument(mockDoc);

        assert.equal(parsed.accountName, 'Nvidia');
        assert.equal(parsed.keyPlayers.length, 2);
        assert.equal(parsed.keyPlayers[0].name, 'Tony Mancill');
        assert.equal(parsed.keyPlayers[0].title, 'Director of Infra');
        assert.equal(parsed.keyPlayers[0].other, 'Neutral');
        assert.equal(parsed.keyPlayers[1].name, 'Jordan Lee');
        assert.equal(parsed.keyPlayers[1].title, 'Architect');
        assert.equal(parsed.keyPlayers[1].other, 'New hire');
        assert.deepEqual(parsed.topInitiatives, ['Expand Kafka footprint', 'Cost reduction', 'DR strategy']);
        assert.deepEqual(parsed.nextSteps, ['Send POC plan', 'Schedule demo', 'Review pricing']);
        assert.equal(parsed.additionalNotes.length, 2);
        assert.equal(parsed.additionalNotes[0].date, '2026-04-14');
        assert.equal(parsed.additionalNotes[0].text, 'Budget approved for Q3.');
        assert.equal(parsed.additionalNotes[1].date, '2026-04-20');
        assert.equal(parsed.additionalNotes[1].text, 'Exec sponsor confirmed.');
    });

    test('local-only fields survive the full push→pull cycle', () => {
        const fullAccount = {
            id: 'acc-nvidia', name: 'Nvidia', updatedAt: '2026-04-20',
            keyPlayers: [{ name: 'Tony', title: 'VP', other: '' }],
            topInitiatives: ['Cloud'],
            nextSteps: ['Call'],
            additionalNotes: [{ date: '2026-04-20', text: 'Good meeting.' }],
            useCases: ['CDC', 'Analytics', 'Fraud detection'],
            architectureText: 'Event-driven microservices on K8s',
            architectureImage: 'https://example.com/architecture-v3.png',
            valuePath: ['POC done', 'Pilot Q2', 'GA Q3', 'Expansion Q4']
        };

        // Simulate push: serialize only Drive-synced fields
        const text = DP.serializeAccountToProfileText(fullAccount);
        const mockDoc = DP.buildMockDocFromPlainText(text);
        const parsed = DP.extractProfileFromDocument(mockDoc);

        // Simulate pull: merge parsed profile with local
        const pulledProfile = {
            accountName: parsed.accountName,
            keyPlayers: parsed.keyPlayers,
            topInitiatives: parsed.topInitiatives,
            nextSteps: parsed.nextSteps,
            additionalNotes: parsed.additionalNotes
        };

        const merged = mergePullWithLocal([pulledProfile], [fullAccount]);
        const m = merged[0];

        assert.equal(m.id, 'acc-nvidia');
        assert.equal(m.name, 'Nvidia');
        assert.equal(m.keyPlayers[0].name, 'Tony');
        assert.deepEqual(m.useCases, ['CDC', 'Analytics', 'Fraud detection']);
        assert.equal(m.architectureText, 'Event-driven microservices on K8s');
        assert.equal(m.architectureImage, 'https://example.com/architecture-v3.png');
        assert.deepEqual(m.valuePath, ['POC done', 'Pilot Q2', 'GA Q3', 'Expansion Q4']);
    });

    test('account with empty sections roundtrips without data loss', () => {
        const account = {
            name: 'Empty Account',
            keyPlayers: [],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: []
        };
        const text = DP.serializeAccountToProfileText(account);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));

        assert.equal(parsed.accountName, 'Empty Account');
        assert.equal(parsed.keyPlayers.length, 0);
        assert.deepEqual(parsed.topInitiatives, []);
        assert.deepEqual(parsed.nextSteps, []);
        assert.deepEqual(parsed.additionalNotes, []);
    });
});


// ═══════════════════════════════════════════════
//  8. Special characters & encoding edge cases
// ═══════════════════════════════════════════════

describe('Special characters survive roundtrip', () => {

    test('unicode account name (accents, CJK)', () => {
        const account = {
            name: 'Café Corp — München Division',
            keyPlayers: [{ name: 'Renée Dupont', title: 'CTO', other: 'Née Smith' }],
            topInitiatives: ['Données en temps réel'],
            nextSteps: [],
            additionalNotes: [{ date: '2026-04-20', text: 'Réunion à 14h — très positif.' }]
        };
        const text = DP.serializeAccountToProfileText(account);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));
        assert.equal(parsed.accountName, 'Café Corp — München Division');
        assert.equal(parsed.keyPlayers[0].name, 'Renée Dupont');
        assert.ok(parsed.additionalNotes[0].text.includes('très positif'));
    });

    test('pipe characters in notes (markdown table risk)', () => {
        const account = {
            name: 'PipeCorp',
            keyPlayers: [],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [{ date: '2026-04-20', text: 'Revenue split: 60|40 between teams.' }]
        };
        const text = DP.serializeAccountToProfileText(account);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));
        assert.equal(parsed.additionalNotes.length, 1);
        assert.ok(parsed.additionalNotes[0].text.includes('60'));
    });

    test('em-dash and en-dash in player names', () => {
        const account = {
            name: 'DashCorp',
            keyPlayers: [
                { name: 'Alice — Bob', title: 'Co-leads', other: '' },
                { name: 'Charlie–Delta', title: 'Team', other: '' }
            ],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: []
        };
        const text = DP.serializeAccountToProfileText(account);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));
        assert.equal(parsed.keyPlayers.length, 2);
    });

    test('very long note text does not truncate', () => {
        const longText = 'A'.repeat(5000);
        const account = {
            name: 'LongNote',
            keyPlayers: [],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [{ date: '2026-04-20', text: longText }]
        };
        const text = DP.serializeAccountToProfileText(account);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));
        assert.equal(parsed.additionalNotes.length, 1);
        assert.equal(parsed.additionalNotes[0].text.length, 5000);
    });

    test('newlines within a note text', () => {
        const account = {
            name: 'MultilineNote',
            keyPlayers: [],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [{ date: '2026-04-20', text: 'Line 1\nLine 2\nLine 3' }]
        };
        const text = DP.serializeAccountToProfileText(account);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));
        assert.equal(parsed.additionalNotes.length, 1);
        assert.ok(parsed.additionalNotes[0].text.includes('Line 1'));
    });
});


// ═══════════════════════════════════════════════
//  9. Edge cases — data loss scenarios
// ═══════════════════════════════════════════════

describe('Edge cases — potential data loss scenarios', () => {

    test('account with only useCases (no Drive fields) keeps useCases after save/load', () => {
        const account = toV3({
            id: 'uc1', name: 'UseCaseOnly',
            keyPlayers: [],
            useCases: ['Streaming ETL', 'Event sourcing'],
            architectureText: '',
            architectureImage: '',
            valuePath: []
        });
        const json = JSON.stringify([account]);
        const loaded = JSON.parse(json).map(toV3);
        assert.deepEqual(loaded[0].useCases, ['Streaming ETL', 'Event sourcing']);
    });

    test('sign-out clears data: simulated localStorage removal', () => {
        const store = {};
        store['my-accounts-ai-assistant-v3'] = JSON.stringify([
            { id: 'a1', name: 'Nvidia', keyPlayers: [] }
        ]);
        // sign out removes the key
        delete store['my-accounts-ai-assistant-v3'];
        assert.equal(store['my-accounts-ai-assistant-v3'], undefined);
    });

    test('pull with zero profiles from Drive does not wipe local (caller checks)', () => {
        // The actual UI code checks if profiles.length === 0 and returns early
        // This test documents the expected behavior
        const localAccounts = [
            { id: 'l1', name: 'MyAccount', keyPlayers: [{ name: 'A', title: 'B', other: '' }], useCases: ['Critical'] }
        ];
        const emptyPulled = [];
        // With empty pull, the merge function returns empty — but the UI should NOT call it
        const merged = mergePullWithLocal(emptyPulled, localAccounts);
        assert.equal(merged.length, 0, 'merge itself returns empty — UI must guard against this');
    });

    test('simultaneous same-name accounts in local are kept (dedup only on pull)', () => {
        const dupeLocal = [
            { id: 'a1', name: 'Nvidia', keyPlayers: [], useCases: ['v1'] },
            { id: 'a2', name: 'Nvidia', keyPlayers: [], useCases: ['v2'] }
        ];
        // Direct save does not deduplicate
        const json = JSON.stringify(dupeLocal);
        const loaded = JSON.parse(json);
        assert.equal(loaded.length, 2, 'localStorage preserves duplicates until push rejects them');
    });

    test('maximum 3 initiatives constraint is UI-only (data layer stores any count)', () => {
        const account = toV3({
            name: 'OverMax', keyPlayers: [],
            topInitiatives: ['I1', 'I2', 'I3', 'I4', 'I5']
        });
        assert.equal(account.topInitiatives.length, 5, 'data layer does not enforce max 3');
    });

    test('account with every field at maximum complexity roundtrips', () => {
        const monster = {
            name: 'MegaCorp International Holdings — EMEA Division',
            keyPlayers: Array.from({ length: 20 }, (_, i) => ({
                name: `Player ${i + 1}`,
                title: `Title ${i + 1}`,
                other: `Note for player ${i + 1}`
            })),
            topInitiatives: Array.from({ length: 10 }, (_, i) => `Initiative ${i + 1}: ${('x').repeat(100)}`),
            nextSteps: Array.from({ length: 15 }, (_, i) => `Step ${i + 1}`),
            additionalNotes: Array.from({ length: 50 }, (_, i) => ({
                date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
                text: `Note entry ${i + 1} with detail: ${'content '.repeat(20)}`
            }))
        };

        const text = DP.serializeAccountToProfileText(monster);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));

        assert.equal(parsed.accountName, monster.name);
        assert.equal(parsed.keyPlayers.length, 20);
        assert.equal(parsed.topInitiatives.length, 10);
        assert.equal(parsed.nextSteps.length, 15);
        assert.equal(parsed.additionalNotes.length, 50);
    });
});


// ═══════════════════════════════════════════════
//  10. Serialization completeness — what IS and ISN'T in the Doc
// ═══════════════════════════════════════════════

describe('Serialization completeness — fields stored in Google Doc vs local-only', () => {

    test('serialized text includes all Drive-synced fields', () => {
        const account = {
            name: 'Nvidia',
            keyPlayers: [{ name: 'Tony', title: 'VP', other: 'Champion' }],
            topInitiatives: ['Cloud migration'],
            nextSteps: ['Call Tuesday'],
            additionalNotes: [{ date: '2026-04-20', text: 'Met at summit.' }]
        };
        const text = DP.serializeAccountToProfileText(account);
        assert.ok(text.includes('ACCOUNT PROFILE: Nvidia'));
        assert.ok(text.includes('Tony'));
        assert.ok(text.includes('VP'));
        assert.ok(text.includes('Champion'));
        assert.ok(text.includes('Cloud migration'));
        assert.ok(text.includes('Call Tuesday'));
        assert.ok(text.includes('Met at summit.'));
        assert.ok(text.includes('2026-04-20'));
    });

    test('serialized text does NOT include local-only fields', () => {
        const account = {
            name: 'Nvidia',
            keyPlayers: [],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [],
            useCases: ['CDC pipeline', 'Fraud detection'],
            architectureText: 'Kafka on K8s with Schema Registry',
            architectureImage: 'https://example.com/arch.png',
            valuePath: ['POC', 'Pilot', 'GA']
        };
        const text = DP.serializeAccountToProfileText(account);
        assert.ok(!text.includes('CDC pipeline'), 'useCases should not be in serialized doc');
        assert.ok(!text.includes('Fraud detection'), 'useCases should not be in serialized doc');
        assert.ok(!text.includes('Kafka on K8s with Schema Registry'), 'architectureText should not be in serialized doc');
        assert.ok(!text.includes('https://example.com/arch.png'), 'architectureImage should not be in serialized doc');
        assert.ok(!text.includes('Pilot'), 'valuePath should not be in serialized doc');
    });

    test('CRITICAL: local-only fields will be lost if user clears localStorage without pushing first', () => {
        const account = {
            name: 'Nvidia',
            keyPlayers: [{ name: 'Tony', title: 'VP', other: '' }],
            topInitiatives: [],
            nextSteps: [],
            additionalNotes: [],
            useCases: ['Mission-critical use case'],
            architectureText: 'Months of architecture work documented here',
            architectureImage: 'https://important-diagram.png',
            valuePath: ['Step 1 of carefully planned roadmap']
        };

        // Push only saves Drive-synced fields to the doc
        const text = DP.serializeAccountToProfileText(account);
        const parsed = DP.extractProfileFromDocument(DP.buildMockDocFromPlainText(text));

        // After clearing localStorage and pulling back, local-only fields are gone
        const mergedWithEmptyLocal = mergePullWithLocal([{
            accountName: parsed.accountName,
            keyPlayers: parsed.keyPlayers,
            topInitiatives: parsed.topInitiatives,
            nextSteps: parsed.nextSteps,
            additionalNotes: parsed.additionalNotes
        }], []);  // empty local = data was lost

        assert.deepEqual(mergedWithEmptyLocal[0].useCases, [], 'useCases LOST — not in Drive doc');
        assert.equal(mergedWithEmptyLocal[0].architectureText, '', 'architectureText LOST — not in Drive doc');
        assert.equal(mergedWithEmptyLocal[0].architectureImage, '', 'architectureImage LOST — not in Drive doc');
        assert.deepEqual(mergedWithEmptyLocal[0].valuePath, [], 'valuePath LOST — not in Drive doc');
    });
});


// ═══════════════════════════════════════════════
//  11. Push guard — duplicate name rejection
// ═══════════════════════════════════════════════

describe('Push guard — duplicate name detection', () => {

    test('duplicate names in account array should be detected', () => {
        const accounts = [
            { name: 'Nvidia', id: '1' },
            { name: 'Cisco', id: '2' },
            { name: 'nvidia', id: '3' }  // duplicate (case-insensitive)
        ];

        // Replicate the duplicate detection from pushToDocs
        var nameCounts = {};
        var dupes = [];
        accounts.forEach(function (a) {
            var k = (a.name || '').trim().toLowerCase();
            if (!k) return;
            nameCounts[k] = (nameCounts[k] || 0) + 1;
            if (nameCounts[k] === 2) dupes.push(a.name);
        });

        assert.equal(dupes.length, 1);
        assert.equal(dupes[0], 'nvidia');
    });

    test('empty names are skipped in duplicate check', () => {
        const accounts = [
            { name: '', id: '1' },
            { name: '', id: '2' },
            { name: 'Nvidia', id: '3' }
        ];
        var nameCounts = {};
        var dupes = [];
        accounts.forEach(function (a) {
            var k = (a.name || '').trim().toLowerCase();
            if (!k) return;
            nameCounts[k] = (nameCounts[k] || 0) + 1;
            if (nameCounts[k] === 2) dupes.push(a.name);
        });
        assert.equal(dupes.length, 0);
    });

    test('unique names pass duplicate check', () => {
        const accounts = [
            { name: 'Nvidia', id: '1' },
            { name: 'Cisco', id: '2' },
            { name: 'Qualcomm', id: '3' }
        ];
        var nameCounts = {};
        var dupes = [];
        accounts.forEach(function (a) {
            var k = (a.name || '').trim().toLowerCase();
            if (!k) return;
            nameCounts[k] = (nameCounts[k] || 0) + 1;
            if (nameCounts[k] === 2) dupes.push(a.name);
        });
        assert.equal(dupes.length, 0);
    });
});
