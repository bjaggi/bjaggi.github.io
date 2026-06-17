const { describe, it } = require('node:test');
const assert = require('node:assert');
const XLSX = require('xlsx');

/* ════════════════════════════════════════════════════════════════
   SHARED CONSTANTS (mirrors cp-cost-estimator.html)
   ════════════════════════════════════════════════════════════════ */
const ENV_LABELS = { prod: 'Production', nonprod: 'Non Production', dev: 'Dev (No License Cost)' };
const ENV_KEYS = Object.fromEntries(Object.entries(ENV_LABELS).map(([k, v]) => [v, k]));

const defaultServices = [
    { name: 'Zookeeper or KRaft Nodes', nonProd: 3, prod: 3, defaultEnabled: true, free: true, group: 'Controllers' },
    { name: 'Zookeeper or KRaft Nodes Across 2 DC', nonProd: 3, prod: 3, free: true, group: 'Controllers' },
    { name: 'Kafka Broker', nonProd: 3, prod: 4, defaultEnabled: true, group: 'Broker Architecture' },
    { name: 'Kafka Broker - Stretch Across 2 DC', nonProd: 4, prod: 4, group: 'Broker Architecture' },
    { name: 'Kafka Broker - MRC Across 2 DC', nonProd: 6, prod: 6, group: 'Broker Architecture' },
    { name: 'Schema Registry', nonProd: 1, prod: 2 },
    { name: 'REST Proxy', nonProd: 1, prod: 2 },
    { name: 'ksqlDB', nonProd: 1, prod: 2 },
    { name: 'Kafka Connect', nonProd: 1, prod: 2 },
    { name: 'Kstreams', nonProd: 0, prod: 0 },
    { name: 'Control Center', nonProd: 1, prod: 1 },
    { name: 'Confluent Operator', nonProd: 1, prod: 1 },
    { name: 'CP Flink Nodes', nonProd: 3, prod: 3 },
    { name: 'CP Flink Nodes in 2 DC', nonProd: 6, prod: 6 },
];

const licensedServices = defaultServices.filter(s => !s.free);

const defaultPricing = {
    nodePricing: { nonProd: 0, prod: 0 },
    premiumPricing: { nonProd: 0, prod: 0 },
    cpPackPricing: { nonProd: 0, prod: 0 },
};

/* ════════════════════════════════════════════════════════════════
   buildWorkbook — mirrors the 3-tab download logic (no billed column)
   ════════════════════════════════════════════════════════════════ */
function buildWorkbook(params) {
    const {
        clusters, services, connectors,
        nodePricing, premiumPricing, cpPackPricing,
        notes, connectorNotes, preparedFor, preparedBy
    } = params;

    const wb = XLSX.utils.book_new();

    const clusterData = clusters.map(cluster => {
        const isProd = cluster.env === 'prod';
        const svcRows = services.map(svc => {
            const svcState = cluster.services[svc.name] || {};
            const enabled = svcState.enabled !== undefined ? svcState.enabled : !!svc.defaultEnabled;
            const nodeVal = isProd ? (svcState.prod ?? svc.prod) : (svcState.nonProd ?? svc.nonProd);
            return { svcName: svc.name, nodeVal, enabled, free: !!svc.free };
        });
        const isDev = cluster.env === 'dev';
        return { clusterName: cluster.name, env: cluster.env, isProd, isDev, svcRows };
    });

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    /* ── Tab 1: Configurations ── */
    const cfgData = [];
    const cfgMerges = [];
    let r = 0;

    cfgData.push(['Confluent Platform — Cost Estimate']); cfgMerges.push({ s: { r, c: 0 }, e: { r, c: 3 } }); r++;
    cfgData.push([]); r++;
    cfgData.push(['Date:', today, 'Prepared For:', preparedFor || '']); r++;
    cfgData.push(['Prepared By:', preparedBy || '', 'Notes:', notes || '']); r++;
    cfgData.push([]); r++;

    clusterData.forEach(cluster => {
        const envLabel = ENV_LABELS[cluster.env] || 'Production';
        cfgData.push(['Cluster:', cluster.clusterName, 'Environment:', envLabel]);
        r++;
        cfgData.push(['Service', 'Number of Nodes', 'Enabled']);
        r++;
        cluster.svcRows.forEach(svc => {
            cfgData.push([svc.svcName, svc.nodeVal, svc.enabled]);
            r++;
        });
        cfgData.push([]); r++;
    });

    const wsCfg = XLSX.utils.aoa_to_sheet(cfgData);
    wsCfg['!merges'] = cfgMerges;
    XLSX.utils.book_append_sheet(wb, wsCfg, 'Configurations');

    /* ── Tab 2: Summary (excludes free & dev) ── */
    const billedClusters = clusterData.filter(c => !c.isDev);
    const billedNames = billedClusters.map(c => c.clusterName);
    const summaryData = [['Component', ...billedNames]];

    services.forEach(service => {
        if (service.free) return;
        const vals = billedClusters.map(cluster => {
            const svc = cluster.svcRows.find(s => s.svcName === service.name);
            if (!svc || !svc.enabled) return 0;
            return Number.isNaN(svc.nodeVal) ? 0 : svc.nodeVal;
        });
        summaryData.push([service.name, ...vals]);
    });

    const totalRowIdx = summaryData.length;
    const totalFormulas = ['TOTAL'];
    for (let c = 1; c <= billedNames.length; c++) {
        const colLetter = XLSX.utils.encode_col(c);
        totalFormulas.push({ f: `SUM(${colLetter}2:${colLetter}${totalRowIdx})` });
    }
    summaryData.push(totalFormulas);

    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    /* ── Tab 3: Pricing ── */
    const pData = [];
    let pr = 0;

    let npNodeCount = 0, pNodeCount = 0;
    clusterData.forEach(cluster => {
        if (cluster.env !== 'prod' && cluster.env !== 'nonprod') return;
        cluster.svcRows.forEach(svc => {
            if (!svc.enabled || svc.free) return;
            if (cluster.isProd) pNodeCount += svc.nodeVal;
            else npNodeCount += svc.nodeVal;
        });
    });

    pData.push(['CONNECTOR COUNTS']); pr++;
    pData.push(['Number of Premium Connectors', connectors.premium]); pr++;
    const cntPremRow = pr;
    pData.push(['Number of Open Source Connectors', connectors.openSource || 0]); pr++;
    pData.push(['CP Commercial Connector Pack', connectors.cpPack]); pr++;
    const cntCpRow = pr;
    if (connectorNotes) { pData.push(['Connector Notes:', connectorNotes]); pr++; }
    pData.push([]); pr++;
    pData.push(['PRICING RATES', 'Non Production ($)', 'Production ($)']); pr++;
    pData.push(['Price per Node', nodePricing.nonProd, nodePricing.prod]); pr++;
    const rateNodeRow = pr;
    pData.push(['Price per Premium Connector', premiumPricing.nonProd, premiumPricing.prod]); pr++;
    const ratePremRow = pr;
    pData.push(['Price per CP Commercial Connector Pack', cpPackPricing.nonProd, cpPackPricing.prod]); pr++;
    const rateCpRow = pr;
    pData.push([]); pr++;
    pData.push([]); pr++;

    pData.push(['COST SUMMARY', 'Non Production', 'Production']); pr++;
    pData.push([]); pr++;

    pData.push(['Nodes']); pr++;
    pData.push(['  Licensed Node Count', npNodeCount, pNodeCount]); pr++;
    const ncRow = pr;
    pData.push(['  Price per Node', { f: `B${rateNodeRow}` }, { f: `C${rateNodeRow}` }]); pr++;
    const npRow = pr;
    pData.push(['  Node Cost', { f: `B${ncRow}*B${npRow}` }, { f: `C${ncRow}*C${npRow}` }]); pr++;
    const nodeSubRow = pr;
    pData.push([]); pr++;

    pData.push([`Premium Connectors (${connectors.premium})`]); pr++;
    pData.push(['  Price per Connector', { f: `B${ratePremRow}` }, { f: `C${ratePremRow}` }]); pr++;
    const premPrRow = pr;
    pData.push(['  Premium Cost', { f: `B${cntPremRow}*B${premPrRow}` }, { f: `B${cntPremRow}*C${premPrRow}` }]); pr++;
    const premSubRow = pr;
    pData.push([]); pr++;

    pData.push([`CP Commercial Connector Pack (${connectors.cpPack})`]); pr++;
    pData.push(['  Price per Pack', { f: `B${rateCpRow}` }, { f: `C${rateCpRow}` }]); pr++;
    const cpPrRow = pr;
    pData.push(['  CP Pack Cost', { f: `B${cntCpRow}*B${cpPrRow}` }, { f: `B${cntCpRow}*C${cpPrRow}` }]); pr++;
    const cpSubRow = pr;
    pData.push([]); pr++;
    pData.push([]); pr++;

    pData.push(['TOTAL NODE COST', { f: `B${nodeSubRow}` }, { f: `C${nodeSubRow}` }]); pr++;
    const tNodeRow = pr;
    pData.push(['TOTAL CONNECTOR COST', { f: `B${premSubRow}+B${cpSubRow}` }, { f: `C${premSubRow}+C${cpSubRow}` }]); pr++;
    const tConnRow = pr;
    pData.push([]); pr++;
    pData.push(['GRAND TOTAL', { f: `B${tNodeRow}+C${tNodeRow}+B${tConnRow}+C${tConnRow}` }]); pr++;

    const wsPricing = XLSX.utils.aoa_to_sheet(pData);
    XLSX.utils.book_append_sheet(wb, wsPricing, 'Pricing');

    return {
        wb, clusterData,
        meta: { cntPremRow, cntCpRow, rateNodeRow, ratePremRow, rateCpRow, ncRow, npRow, nodeSubRow, premPrRow, premSubRow, cpPrRow, cpSubRow, tNodeRow, tConnRow }
    };
}

/* ════════════════════════════════════════════════════════════════
   parseWorkbook — mirrors the upload logic (no billed column)
   ════════════════════════════════════════════════════════════════ */
function parseWorkbook(wb, knownServices) {
    const cell = (ws, addr) => {
        const c = ws?.[addr];
        return c ? (c.v !== undefined ? c.v : c.w) : undefined;
    };

    const result = {
        preparedFor: '', preparedBy: '', notes: '',
        clusters: [],
        connectors: { premium: 0, openSource: 0, cpPack: 0 },
        connectorNotes: '',
        nodePricing: { nonProd: 0, prod: 0 },
        premiumPricing: { nonProd: 0, prod: 0 },
        cpPackPricing: { nonProd: 0, prod: 0 }
    };

    const wsCfg = wb.Sheets['Configurations'] || wb.Sheets['Cluster Configurations'];
    if (wsCfg) {
        const rows = XLSX.utils.sheet_to_json(wsCfg, { header: 1, defval: '' });
        let current = null;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const a = String(row[0] || '').trim();

            if (a === 'Date:' && String(row[2] || '').trim() === 'Prepared For:') {
                result.preparedFor = String(row[3] || '').trim();
                continue;
            }
            if (a === 'Prepared By:') {
                result.preparedBy = String(row[1] || '').trim();
                if (String(row[2] || '').trim() === 'Notes:') {
                    result.notes = String(row[3] || '').trim();
                }
                continue;
            }

            if (a === 'Cluster:') {
                if (current) result.clusters.push(current);
                const name = String(row[1] || '').trim();
                const envLabel = String(row[3] || '').trim();
                const env = ENV_KEYS[envLabel] || 'prod';
                current = { name, env, services: {} };
                continue;
            }
            if (a === 'Service') continue;
            if (!current) continue;
            const svcName = a;
            if (!svcName) continue;
            const knownSvc = knownServices.find(s => s.name === svcName);
            if (!knownSvc) continue;

            const nodeVal = Number(row[1]) || 0;
            const rawEnabled = row[2];
            const enabled = rawEnabled === true || rawEnabled === 'true' || rawEnabled === 'TRUE' || rawEnabled === 1;
            const isProd = current.env === 'prod';

            current.services[svcName] = isProd
                ? { prod: nodeVal, nonProd: knownSvc.nonProd, enabled }
                : { nonProd: nodeVal, prod: knownSvc.prod, enabled };
        }
        if (current) result.clusters.push(current);
    }

    const wsInputs = wb.Sheets['Pricing'] || wb.Sheets['Connectors & Pricing'];
    if (wsInputs) {
        const pRows = XLSX.utils.sheet_to_json(wsInputs, { header: 1, defval: '' });
        let pastCostSummary = false;
        pRows.forEach(pRow => {
            const raw = String(pRow[0] || '');
            const label = raw.trim();
            if (label === 'COST SUMMARY') { pastCostSummary = true; return; }
            if (pastCostSummary) return;
            if (label.startsWith('Number of Premium')) result.connectors.premium = Number(pRow[1]) || 0;
            else if (label.startsWith('Number of Open Source')) result.connectors.openSource = Number(pRow[1]) || 0;
            else if (label.startsWith('CP Commercial Connector Pack') || label === 'CP Connector Pack') result.connectors.cpPack = Number(pRow[1]) || 0;
            else if (label === 'Connector Notes:') result.connectorNotes = String(pRow[1] || '').trim();
            else if (label === 'Price per Node') { result.nodePricing = { nonProd: Number(pRow[1]) || 0, prod: Number(pRow[2]) || 0 }; }
            else if (label.startsWith('Price per Premium')) { result.premiumPricing = { nonProd: Number(pRow[1]) || 0, prod: Number(pRow[2]) || 0 }; }
            else if (label.startsWith('Price per CP')) { result.cpPackPricing = { nonProd: Number(pRow[1]) || 0, prod: Number(pRow[2]) || 0 }; }
        });
    }

    return result;
}

/* ════════════════════════════════════════════════════════════════ */
function getCellValue(ws, addr) {
    const cell = ws[addr];
    return cell ? (cell.v !== undefined ? cell.v : null) : null;
}
function getCellFormula(ws, addr) {
    const cell = ws[addr];
    return cell ? (cell.f || null) : null;
}
function getCellType(ws, addr) {
    const cell = ws[addr];
    return cell ? cell.t : null;
}
function roundTrip(wb) {
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return XLSX.read(buf, { type: 'buffer' });
}

/* ════════════════════════════════════════════════════════════════
   TESTS — Download
   ════════════════════════════════════════════════════════════════ */

describe('CP Cost Estimator Excel Export', () => {

    it('creates a workbook with 3 sheets', () => {
        const { wb } = buildWorkbook({
            clusters: [{ name: 'prod', env: 'prod', services: {} }],
            services: defaultServices,
            connectors: { premium: 0, cpPack: 0 },
            ...defaultPricing, notes: ''
        });
        assert.strictEqual(wb.SheetNames.length, 3);
        assert.deepStrictEqual(wb.SheetNames, ['Configurations', 'Summary', 'Pricing']);
    });

    describe('Configurations tab', () => {

        it('has cover info at the top', () => {
            const { wb } = buildWorkbook({
                clusters: [{ name: 'test', env: 'prod', services: {} }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: 'A note',
                preparedFor: 'Acme Corp', preparedBy: 'Jane'
            });
            const ws = wb.Sheets['Configurations'];
            assert.strictEqual(getCellValue(ws, 'A1'), 'Confluent Platform — Cost Estimate');
            assert.strictEqual(getCellValue(ws, 'D3'), 'Acme Corp');
            assert.strictEqual(getCellValue(ws, 'B4'), 'Jane');
            assert.strictEqual(getCellValue(ws, 'D4'), 'A note');
        });

        it('uses Cluster: marker rows', () => {
            const { wb } = buildWorkbook({
                clusters: [
                    { name: 'prod-1', env: 'prod', services: {} },
                    { name: 'uat', env: 'nonprod', services: {} }
                ],
                services: [{ name: 'Kafka Broker', nonProd: 3, prod: 4, defaultEnabled: true }],
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Configurations'];
            assert.strictEqual(getCellValue(ws, 'A6'), 'Cluster:');
            assert.strictEqual(getCellValue(ws, 'B6'), 'prod-1');
            assert.strictEqual(getCellValue(ws, 'D6'), 'Production');
        });

        it('writes Enabled as boolean', () => {
            const { wb } = buildWorkbook({
                clusters: [{
                    name: 'test', env: 'prod', services: {
                        'Kafka Broker': { prod: 4, enabled: true },
                        'Schema Registry': { prod: 2, enabled: false },
                    }
                }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Configurations'];
            const firstSvcRow = 8;
            assert.strictEqual(getCellType(ws, `C${firstSvcRow}`), 'b');
            assert.strictEqual(getCellValue(ws, `C${firstSvcRow}`), true);
        });

        it('shows environment labels correctly', () => {
            const { wb } = buildWorkbook({
                clusters: [
                    { name: 'p', env: 'prod', services: {} },
                    { name: 'np', env: 'nonprod', services: {} },
                    { name: 'd', env: 'dev', services: {} }
                ],
                services: [{ name: 'Kafka Broker', nonProd: 3, prod: 4, defaultEnabled: true }],
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Configurations'];
            assert.strictEqual(getCellValue(ws, 'D6'), 'Production');
            assert.strictEqual(getCellValue(ws, 'D10'), 'Non Production');
            assert.strictEqual(getCellValue(ws, 'D14'), 'Dev (No License Cost)');
        });

        it('does not have billed nodes column', () => {
            const { wb } = buildWorkbook({
                clusters: [{ name: 'test', env: 'prod', services: {} }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Configurations'];
            assert.strictEqual(getCellValue(ws, 'A7'), 'Service');
            assert.strictEqual(getCellValue(ws, 'B7'), 'Number of Nodes');
            assert.strictEqual(getCellValue(ws, 'C7'), 'Enabled');
        });
    });

    describe('Summary tab', () => {

        it('excludes free services from summary', () => {
            const { wb } = buildWorkbook({
                clusters: [{
                    name: 'prod-1', env: 'prod', services: {
                        'Zookeeper or KRaft Nodes': { prod: 3, enabled: true },
                        'Kafka Broker': { prod: 4, enabled: true },
                    }
                }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Summary'];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            const componentNames = rows.slice(1, -1).map(r => r[0]);
            assert.ok(!componentNames.includes('Zookeeper or KRaft Nodes'), 'ZK should be excluded');
            assert.ok(!componentNames.includes('Zookeeper or KRaft Nodes Across 2 DC'), 'ZK 2DC should be excluded');
            assert.ok(componentNames.includes('Kafka Broker'), 'Kafka Broker should be included');
        });

        it('only enabled services contribute nodes', () => {
            const { wb, clusterData } = buildWorkbook({
                clusters: [{
                    name: 'NetApp-prod', env: 'prod', services: {
                        'Kafka Broker': { prod: 4, enabled: true },
                        'Kafka Connect': { prod: 2, enabled: false },
                        'Control Center': { prod: 1, enabled: true },
                    }
                }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });

            const ws = wb.Sheets['Summary'];
            const cluster = clusterData[0];
            licensedServices.forEach((svc, idx) => {
                const svcData = cluster.svcRows.find(s => s.svcName === svc.name);
                const expected = (svcData && svcData.enabled) ? svcData.nodeVal : 0;
                const actual = getCellValue(ws, `B${idx + 2}`) ?? 0;
                assert.strictEqual(actual, expected, `"${svc.name}": expected ${expected}, got ${actual}`);
            });
        });

        it('dev cluster is hidden from summary', () => {
            const { wb } = buildWorkbook({
                clusters: [
                    { name: 'prod-1', env: 'prod', services: { 'Kafka Broker': { prod: 4, enabled: true } } },
                    { name: 'dev-1', env: 'dev', services: { 'Kafka Broker': { nonProd: 3, enabled: true } } }
                ],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Summary'];
            assert.strictEqual(getCellValue(ws, 'B1'), 'prod-1');
            assert.ok(!getCellValue(ws, 'C1'), 'Dev column absent');
        });

        it('has TOTAL row with SUM formula', () => {
            const { wb } = buildWorkbook({
                clusters: [{ name: 'test', env: 'prod', services: { 'Kafka Broker': { prod: 4, enabled: true } } }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Summary'];
            const totalRow = licensedServices.length + 2;
            assert.strictEqual(getCellFormula(ws, `B${totalRow}`), `SUM(B2:B${totalRow - 1})`);
        });
    });

    describe('Pricing tab', () => {

        it('has connector counts and pricing rates at top', () => {
            const { wb, meta } = buildWorkbook({
                clusters: [{ name: 'test', env: 'prod', services: {} }],
                services: defaultServices,
                connectors: { premium: 5, openSource: 7, cpPack: 2 },
                nodePricing: { nonProd: 1000, prod: 2000 },
                premiumPricing: { nonProd: 500, prod: 800 },
                cpPackPricing: { nonProd: 1500, prod: 2500 },
                notes: ''
            });
            const ws = wb.Sheets['Pricing'];
            assert.strictEqual(getCellValue(ws, `B${meta.cntPremRow}`), 5, 'Premium count');
            assert.strictEqual(getCellValue(ws, `B${meta.cntCpRow}`), 2, 'CP Pack count');
            assert.strictEqual(getCellValue(ws, `B${meta.rateNodeRow}`), 1000, 'Node NP rate');
            assert.strictEqual(getCellValue(ws, `C${meta.rateNodeRow}`), 2000, 'Node P rate');
            assert.strictEqual(getCellValue(ws, `B${meta.ratePremRow}`), 500);
            assert.strictEqual(getCellValue(ws, `C${meta.rateCpRow}`), 2500);
        });

        it('has node cost formulas', () => {
            const allDisabled = {};
            defaultServices.forEach(s => { allDisabled[s.name] = { prod: 0, nonProd: 0, enabled: false }; });

            const { wb, meta } = buildWorkbook({
                clusters: [
                    { name: 'p', env: 'prod', services: { ...allDisabled, 'Kafka Broker': { prod: 4, enabled: true } } },
                    { name: 'np', env: 'nonprod', services: { ...allDisabled, 'Kafka Broker': { nonProd: 3, enabled: true } } }
                ],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                nodePricing: { nonProd: 1000, prod: 2000 },
                premiumPricing: { nonProd: 0, prod: 0 },
                cpPackPricing: { nonProd: 0, prod: 0 },
                notes: ''
            });
            const ws = wb.Sheets['Pricing'];
            assert.strictEqual(getCellFormula(ws, `B${meta.nodeSubRow}`), `B${meta.ncRow}*B${meta.npRow}`);
            assert.strictEqual(getCellFormula(ws, `C${meta.nodeSubRow}`), `C${meta.ncRow}*C${meta.npRow}`);
        });

        it('grand total sums all costs', () => {
            const { wb, meta } = buildWorkbook({
                clusters: [{ name: 'test', env: 'prod', services: {} }],
                services: defaultServices,
                connectors: { premium: 1, cpPack: 1 },
                nodePricing: { nonProd: 100, prod: 200 },
                premiumPricing: { nonProd: 10, prod: 20 },
                cpPackPricing: { nonProd: 50, prod: 100 },
                notes: ''
            });
            const ws = wb.Sheets['Pricing'];
            const grandRow = meta.tConnRow + 2;
            assert.strictEqual(getCellFormula(ws, `B${grandRow}`), `B${meta.tNodeRow}+C${meta.tNodeRow}+B${meta.tConnRow}+C${meta.tConnRow}`);
        });

        it('dev cluster excluded from node counts', () => {
            const allDisabled = {};
            defaultServices.forEach(s => { allDisabled[s.name] = { prod: 0, nonProd: 0, enabled: false }; });

            const { wb, meta } = buildWorkbook({
                clusters: [
                    { name: 'p', env: 'prod', services: { ...allDisabled, 'Kafka Broker': { prod: 4, enabled: true } } },
                    { name: 'd', env: 'dev', services: { ...allDisabled, 'Kafka Broker': { nonProd: 3, enabled: true } } },
                    { name: 'np', env: 'nonprod', services: { ...allDisabled, 'Kafka Broker': { nonProd: 3, enabled: true } } }
                ],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Pricing'];
            assert.strictEqual(getCellValue(ws, `C${meta.ncRow}`), 4, 'Prod excludes dev');
            assert.strictEqual(getCellValue(ws, `B${meta.ncRow}`), 3, 'NonProd excludes dev');
        });

        it('broker architecture defaults flow into node counts', () => {
            const allDisabled = {};
            defaultServices.forEach(s => { allDisabled[s.name] = { prod: 0, nonProd: 0, enabled: false }; });

            const { wb: wbStretch, meta: mStretch } = buildWorkbook({
                clusters: [{ name: 'stretch', env: 'prod', services: { ...allDisabled, 'Kafka Broker - Stretch Across 2 DC': { prod: 4, enabled: true } } }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            assert.strictEqual(getCellValue(wbStretch.Sheets['Pricing'], `C${mStretch.ncRow}`), 4, 'Stretch prod=4');

            const { wb: wbMRC, meta: mMRC } = buildWorkbook({
                clusters: [{ name: 'mrc', env: 'prod', services: { ...allDisabled, 'Kafka Broker - MRC Across 2 DC': { prod: 6, enabled: true } } }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            assert.strictEqual(getCellValue(wbMRC.Sheets['Pricing'], `C${mMRC.ncRow}`), 6, 'MRC prod=6');
        });

        it('free services excluded from licensed node counts', () => {
            const allDisabled = {};
            defaultServices.forEach(s => { allDisabled[s.name] = { prod: 0, nonProd: 0, enabled: false }; });

            const { wb, meta } = buildWorkbook({
                clusters: [{
                    name: 'p', env: 'prod', services: {
                        ...allDisabled,
                        'Zookeeper or KRaft Nodes': { prod: 3, enabled: true },
                        'Kafka Broker': { prod: 4, enabled: true },
                    }
                }],
                services: defaultServices,
                connectors: { premium: 0, cpPack: 0 },
                ...defaultPricing, notes: ''
            });
            const ws = wb.Sheets['Pricing'];
            assert.strictEqual(getCellValue(ws, `C${meta.ncRow}`), 4, 'Only Kafka Broker counted, not ZK');
        });
    });
});

/* ════════════════════════════════════════════════════════════════
   TESTS — Upload / Round-trip
   ════════════════════════════════════════════════════════════════ */

describe('CP Cost Estimator Excel Upload (Round-trip)', () => {

    it('preserves cluster names and environments', () => {
        const { wb } = buildWorkbook({
            clusters: [
                { name: 'prod-cluster', env: 'prod', services: {} },
                { name: 'uat-cluster', env: 'nonprod', services: {} },
                { name: 'dev-cluster', env: 'dev', services: {} }
            ],
            services: defaultServices,
            connectors: { premium: 0, cpPack: 0 },
            ...defaultPricing, notes: '', preparedFor: '', preparedBy: ''
        });
        const parsed = parseWorkbook(roundTrip(wb), defaultServices);

        assert.strictEqual(parsed.clusters.length, 3);
        assert.strictEqual(parsed.clusters[0].name, 'prod-cluster');
        assert.strictEqual(parsed.clusters[0].env, 'prod');
        assert.strictEqual(parsed.clusters[1].env, 'nonprod');
        assert.strictEqual(parsed.clusters[2].env, 'dev');
    });

    it('preserves cover metadata', () => {
        const { wb } = buildWorkbook({
            clusters: [{ name: 'test', env: 'prod', services: {} }],
            services: defaultServices,
            connectors: { premium: 0, cpPack: 0 },
            ...defaultPricing,
            notes: 'Customer notes', preparedFor: 'Acme Corp', preparedBy: 'Jane'
        });
        const parsed = parseWorkbook(roundTrip(wb), defaultServices);
        assert.strictEqual(parsed.preparedFor, 'Acme Corp');
        assert.strictEqual(parsed.preparedBy, 'Jane');
        assert.strictEqual(parsed.notes, 'Customer notes');
    });

    it('preserves connector counts and pricing rates', () => {
        const { wb } = buildWorkbook({
            clusters: [{ name: 'test', env: 'prod', services: {} }],
            services: defaultServices,
            connectors: { premium: 5, openSource: 7, cpPack: 2 },
            nodePricing: { nonProd: 1000, prod: 2000 },
            premiumPricing: { nonProd: 500, prod: 800 },
            cpPackPricing: { nonProd: 1500, prod: 2500 },
            notes: ''
        });
        const parsed = parseWorkbook(roundTrip(wb), defaultServices);
        assert.deepStrictEqual(parsed.connectors, { premium: 5, openSource: 7, cpPack: 2 });
        assert.deepStrictEqual(parsed.nodePricing, { nonProd: 1000, prod: 2000 });
        assert.deepStrictEqual(parsed.premiumPricing, { nonProd: 500, prod: 800 });
    });

    it('preserves service values for prod cluster', () => {
        const { wb } = buildWorkbook({
            clusters: [{
                name: 'prod-1', env: 'prod', services: {
                    'Kafka Broker': { prod: 6, enabled: true },
                    'Schema Registry': { prod: 2, enabled: false },
                }
            }],
            services: defaultServices,
            connectors: { premium: 0, cpPack: 0 },
            ...defaultPricing, notes: ''
        });
        const parsed = parseWorkbook(roundTrip(wb), defaultServices);
        const svc = parsed.clusters[0].services;
        assert.strictEqual(svc['Kafka Broker'].prod, 6);
        assert.strictEqual(svc['Kafka Broker'].enabled, true);
        assert.strictEqual(svc['Schema Registry'].enabled, false);
    });

    it('preserves service values for nonprod cluster', () => {
        const { wb } = buildWorkbook({
            clusters: [{ name: 'uat', env: 'nonprod', services: {
                'Kafka Broker': { nonProd: 3, enabled: true },
            }}],
            services: defaultServices,
            connectors: { premium: 0, cpPack: 0 },
            ...defaultPricing, notes: ''
        });
        const parsed = parseWorkbook(roundTrip(wb), defaultServices);
        assert.strictEqual(parsed.clusters[0].services['Kafka Broker'].nonProd, 3);
        assert.strictEqual(parsed.clusters[0].services['Kafka Broker'].enabled, true);
    });

    it('full multi-cluster round-trip', () => {
        const allDisabled = {};
        defaultServices.forEach(s => { allDisabled[s.name] = { prod: 0, nonProd: 0, enabled: false }; });

        const { wb } = buildWorkbook({
            clusters: [
                { name: 'production', env: 'prod', services: { ...allDisabled, 'Kafka Broker': { prod: 8, enabled: true } } },
                { name: 'staging', env: 'nonprod', services: { ...allDisabled, 'Kafka Broker': { nonProd: 3, enabled: true } } },
                { name: 'dev', env: 'dev', services: { ...allDisabled, 'Kafka Broker': { nonProd: 3, enabled: true } } }
            ],
            services: defaultServices,
            connectors: { premium: 10, openSource: 5, cpPack: 3 },
            nodePricing: { nonProd: 1000, prod: 2000 },
            premiumPricing: { nonProd: 500, prod: 800 },
            cpPackPricing: { nonProd: 1500, prod: 2500 },
            notes: 'Full test', preparedFor: 'BigCo', preparedBy: 'Sales'
        });
        const parsed = parseWorkbook(roundTrip(wb), defaultServices);

        assert.strictEqual(parsed.clusters.length, 3);
        assert.strictEqual(parsed.clusters[0].name, 'production');
        assert.strictEqual(parsed.clusters[2].env, 'dev');
        assert.strictEqual(parsed.connectors.premium, 10);
        assert.strictEqual(parsed.preparedFor, 'BigCo');
    });

    it('customer-edited values survive round-trip', () => {
        const { wb, meta } = buildWorkbook({
            clusters: [{ name: 'original', env: 'prod', services: {
                'Kafka Broker': { prod: 4, enabled: true },
            }}],
            services: defaultServices,
            connectors: { premium: 2, openSource: 0, cpPack: 0 },
            nodePricing: { nonProd: 500, prod: 1000 },
            premiumPricing: { nonProd: 100, prod: 200 },
            cpPackPricing: { nonProd: 0, prod: 0 },
            notes: ''
        });

        const ws = wb.Sheets['Pricing'];
        ws[`B${meta.cntPremRow}`] = { t: 'n', v: 8 };
        ws[`C${meta.rateNodeRow}`] = { t: 'n', v: 3000 };

        const wsCfg = wb.Sheets['Configurations'];
        wsCfg['D3'] = { t: 's', v: 'New Customer' };

        const parsed = parseWorkbook(roundTrip(wb), defaultServices);
        assert.strictEqual(parsed.connectors.premium, 8);
        assert.strictEqual(parsed.nodePricing.prod, 3000);
        assert.strictEqual(parsed.preparedFor, 'New Customer');
    });

    it('ignores unknown services', () => {
        const wb = XLSX.utils.book_new();
        const cfgData = [
            ['Confluent Platform'], [], ['Date:', '', 'Prepared For:', ''], ['Prepared By:', '', 'Notes:', ''], [],
            ['Cluster:', 'test', 'Environment:', 'Production'],
            ['Service', 'Number of Nodes', 'Enabled'],
            ['Kafka Broker', 4, true],
            ['Imaginary Service', 99, true],
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfgData), 'Configurations');
        const pricingData = [
            ['CONNECTOR COUNTS'],
            ['Number of Premium Connectors', 0],
            ['Number of Open Source Connectors', 0],
            ['CP Commercial Connector Pack', 0],
            [], ['PRICING RATES'],
            ['Price per Node', 0, 0],
            ['Price per Premium Connector', 0, 0],
            ['Price per CP Commercial Connector Pack', 0, 0]
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pricingData), 'Pricing');

        const parsed = parseWorkbook(roundTrip(wb), defaultServices);
        assert.ok(parsed.clusters[0].services['Kafka Broker']);
        assert.ok(!parsed.clusters[0].services['Imaginary Service']);
    });

    it('handles empty workbook', () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['empty']]), 'Sheet1');
        const parsed = parseWorkbook(wb, defaultServices);
        assert.strictEqual(parsed.clusters.length, 0);
    });

    it('double round-trip produces identical input data', () => {
        const allDisabled = {};
        defaultServices.forEach(s => { allDisabled[s.name] = { prod: 0, nonProd: 0, enabled: false }; });

        const original = {
            clusters: [
                { name: 'prod', env: 'prod', services: { ...allDisabled, 'Kafka Broker': { prod: 6, enabled: true } } },
                { name: 'uat', env: 'nonprod', services: { ...allDisabled, 'Kafka Broker': { nonProd: 3, enabled: true } } }
            ],
            services: defaultServices,
            connectors: { premium: 4, openSource: 2, cpPack: 1 },
            nodePricing: { nonProd: 800, prod: 1600 },
            premiumPricing: { nonProd: 400, prod: 700 },
            cpPackPricing: { nonProd: 1200, prod: 2000 },
            notes: 'RT test', preparedFor: 'TestCo', preparedBy: 'QA'
        };

        const { wb: wb1 } = buildWorkbook(original);
        const p1 = parseWorkbook(roundTrip(wb1), defaultServices);
        const { wb: wb2 } = buildWorkbook({ ...p1, services: defaultServices });
        const p2 = parseWorkbook(roundTrip(wb2), defaultServices);

        assert.strictEqual(p2.preparedFor, p1.preparedFor);
        assert.strictEqual(p2.notes, p1.notes);
        assert.deepStrictEqual(p2.connectors, p1.connectors);
        assert.deepStrictEqual(p2.nodePricing, p1.nodePricing);
        assert.strictEqual(p2.clusters.length, p1.clusters.length);
        for (let i = 0; i < p1.clusters.length; i++) {
            assert.strictEqual(p2.clusters[i].name, p1.clusters[i].name);
            assert.strictEqual(p2.clusters[i].env, p1.clusters[i].env);
        }
    });
});
