const $ = (id) => document.getElementById(id);
let profile = null;
let chart = null;
let source = null;
let chartTimes = [];
let promoPeriods = [];
let activePromoIds = null;
let chartPoints = [];
let chartNext = null;
let hourAvg = null;
let hoverIdx = null;
let pinnedT = null;
let agentSwitchedOff = false;

const RANGE_FILL = "rgba(17, 17, 17, 0.05)";
const RANGE_LINE = "rgba(17, 17, 17, 0.28)";
const ZONE_COLORS = { PROMO: "17, 81, 255", LAUNCH: "214, 140, 0", PEAK: "211, 0, 5" };
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const KINDS = { PROMO: { word: "Promo", cls: "promo" }, LAUNCH: { word: "Launch", cls: "launch" }, PEAK: { word: "Sales event", cls: "peak" } };
const kindOf = (p) => KINDS[p.promo_type] || KINDS.PROMO;

const ZONE_ROW = 18;
// "6 hours left" for anything with a planned end (promos, sales events); null for launches.
function timeLeft(p, short = false) {
  if (!p || !p.planned_end) return null;
  const n = Math.max(Math.round((p.planned_end - Date.now()) / (profile.period.seconds * 1000)), 0);
  const unit = short ? profile.period.label[0] : ` ${profile.period.label}${n === 1 ? "" : "s"}`;
  return `${n}${unit} left`;
}
const zoneLabel = (p) => p.promo_type === "PROMO" ? `Promo ${Math.round(p.discount_pct * 100)}% off`
  : p.promo_type === "PEAK" ? p.name.split(":")[0] : profile.launch.label || "Launch";

// Labels each promo / launch / sales event with a strip above the plot and a faint tint below it.
const promoZones = {
  id: "promoZones",
  beforeDatasetsDraw(c) {
    if (!chartTimes.length || !promoPeriods.length) return;
    const { ctx, chartArea, scales } = c;
    const step = chartTimes.length > 1 ? scales.x.getPixelForValue(1) - scales.x.getPixelForValue(0) : 20;
    const rows = [];
    promoPeriods.forEach((p) => {
      const first = chartTimes.findIndex((t) => t > p.start_t);
      let last = chartTimes.length - 1;
      if (p.end_t) while (last >= 0 && chartTimes[last] > p.end_t) last--;
      if (first < 0 || last < first) return;
      const x0 = Math.max(scales.x.getPixelForValue(first) - step / 2, chartArea.left);
      const x1 = Math.min(scales.x.getPixelForValue(last) + step / 2, chartArea.right);
      let row = rows.findIndex((end) => end < x0);
      if (row < 0) row = rows.length;
      if (row > 1) return;
      rows[row] = x1;
      const rgb = ZONE_COLORS[p.promo_type] || ZONE_COLORS.PROMO;
      const y = chartArea.top - 2 * ZONE_ROW - 4 + row * ZONE_ROW;
      ctx.save();
      ctx.fillStyle = `rgba(${rgb}, 0.05)`;
      ctx.fillRect(x0, chartArea.top, x1 - x0, chartArea.bottom - chartArea.top);
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.beginPath();
      ctx.roundRect(x0, y, x1 - x0, ZONE_ROW - 3, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.rect(x0, y, x1 - x0, ZONE_ROW - 3);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.font = `600 11px ${css("--font")}`;
      ctx.fillText(`${zoneLabel(p)}${p.end_t ? "" : ` · ${timeLeft(p, true) || "running"}`}`, x0 + 6, y + 11);
      ctx.restore();
    });
  },
};

const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "-" : Number(v).toFixed(d));
const timeLabel = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const regionName = (id) => (profile.regions.find((r) => r.id === id) || {}).name || id;
const channelName = (id) => (profile.channels[id] || {}).name || id;
const productName = (sku) => (profile.products.find((p) => p.sku === sku) || {}).name || sku;

function toast(msg, kind = "ok") {
  const el = $("toast");
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.className = "toast"), 4500);
}

function option(value, label) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = label;
  return o;
}

async function init() {
  profile = await (await fetch("/api/profile")).json();
  const b = profile.brand;
  if (b.primary_color) document.documentElement.style.setProperty("--brand", b.primary_color);
  if (b.accent_color) document.documentElement.style.setProperty("--accent", b.accent_color);
  document.title = "Powering AI Agents with StreamHouse to manage Inventory & demand in real time";
  $("brand-name").textContent = "Powering AI Agents with StreamHouse to manage Inventory & demand in real time";
  if (localStorage.getItem("hideGuide") === "1") $("guide").hidden = true;
  $("guide-x").onclick = () => { $("guide").hidden = true; localStorage.setItem("hideGuide", "1"); };
  $("brand-tagline").textContent = [b.vertical, b.tagline].filter(Boolean).join(" · ");
  $("logo").textContent = b.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  $("btn-launch").textContent = `Trigger ${(profile.launch.label || "launch").toLowerCase()}`;
  $("btn-promo").textContent = `Start ${(profile.promo.label || "promo").toLowerCase()}`;
  if (profile.peak_event) { $("btn-demo").hidden = false; $("btn-demo").textContent = `▶ ${profile.peak_event.label}`; }

  profile.products.forEach((p) => $("sku").appendChild(option(p.sku, `${p.name}${p.hero_launch ? "  (hero)" : ""}`)));
  const hero = profile.products.find((p) => p.hero_launch);
  if (hero) $("sku").value = hero.sku;
  $("region").appendChild(option("ALL", "All regions"));
  profile.regions.forEach((r) => $("region").appendChild(option(r.id, r.name)));
  $("channel").appendChild(option("ALL", "All channels"));
  Object.entries(profile.channels).forEach(([id, c]) => $("channel").appendChild(option(id, c.name)));

  ["sku", "region", "channel"].forEach((id) => $(id).addEventListener("change", connect));
  wireButtons();
  renderRiskLegend();
  buildChart();
  connect();
  pollDatagen();
  setInterval(pollDatagen, 3000);
}

function buildChart() {
  const accent = css("--accent"), ink = css("--text"), muted = css("--muted"), grid = "#ededed";
  Chart.defaults.font.family = css("--font");
  chart = new Chart($("chart"), {
    type: "line",
    plugins: [promoZones],
    data: {
      labels: [],
      datasets: [
        { label: "Range low", data: [], borderWidth: 1, borderColor: RANGE_LINE, borderDash: [2, 3], pointRadius: 0, tension: 0.25, fill: false, spanGaps: true },
        { label: "Range high", data: [], borderWidth: 1, borderColor: RANGE_LINE, borderDash: [2, 3], pointRadius: 0, tension: 0.25, fill: "-1", backgroundColor: RANGE_FILL, spanGaps: true },
        { label: "Forecast", data: [], borderColor: accent, borderDash: [6, 4], borderWidth: 2, pointRadius: 0, tension: 0.25, spanGaps: true },
        { label: "Actual", data: [], borderColor: ink, borderWidth: 2, tension: 0.2, pointRadius: [], pointBackgroundColor: [] },
      ],
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      layout: { padding: { top: 2 * ZONE_ROW + 6 } },
      interaction: { mode: "index", intersect: false },
      onHover: (evt, els) => {
        const i = els.length ? els[0].index : null;
        if (i !== hoverIdx) { hoverIdx = i; renderWhy(); }
      },
      onClick: (evt, els) => {
        const t = els.length ? chartTimes[els[0].index] : null;
        pinnedT = t !== pinnedT ? t : null;
        renderWhy();
      },
      plugins: { legend: { display: false }, tooltip: { filter: (i) => !i.dataset.hidden } },
      scales: {
        x: { ticks: { color: muted, maxTicksLimit: 12 }, grid: { color: grid } },
        y: { beginAtZero: true, ticks: { color: muted }, grid: { color: grid }, title: { display: true, text: "units per period", color: muted } },
      },
    },
  });
  const toggle = $("show-band");
  const apply = () => {
    chart.data.datasets[0].hidden = chart.data.datasets[1].hidden = !toggle.checked;
    localStorage.setItem("showRange", toggle.checked ? "1" : "0");
    chart.update();
  };
  toggle.checked = localStorage.getItem("showRange") === "1";
  toggle.addEventListener("change", apply);
  apply();
  $("chart").addEventListener("mouseleave", () => { hoverIdx = null; renderWhy(); });
  $("why").addEventListener("click", (e) => {
    if (e.target.closest("[data-unpin]")) { e.preventDefault(); pinnedT = null; renderWhy(); }
  });
}

function connect() {
  if (source) source.close();
  const q = new URLSearchParams({ sku: $("sku").value, region: $("region").value, channel: $("channel").value });
  $("chart-sub").textContent = `${productName($("sku").value)} · ${$("region").value === "ALL" ? "all regions" : regionName($("region").value)} · ${$("channel").value === "ALL" ? "all channels" : channelName($("channel").value)}`;
  source = new EventSource(`/api/stream?${q}`);
  source.onmessage = (e) => render(JSON.parse(e.data));
}

function render(s) {
  if (s.model) $("model-chip").textContent = s.model.split(" (")[0];
  promoPeriods = s.promo_periods || [];
  notifyEnded(s.promotions);
  renderPromoStatus(s);
  renderAgent(s);
  renderStory(s);
  renderPromoButton(s);
  renderInventoryStatus(s);
  renderRestock(s);
  renderChart(s.series);
  renderKpis(s);
  renderPromos(s.promotions);
  renderRisk(s.risk, s.promotions);
}

function renderChart(series) {
  const pts = series.points.slice(-72);
  const labels = pts.map((p) => timeLabel(p.t));
  const actual = pts.map((p) => p.actual);
  const pred = pts.map((p) => p.pred);
  const lower = pts.map((p) => p.lower);
  const upper = pts.map((p) => p.upper);
  if (series.next && series.next.t) {
    labels.push(`${timeLabel(series.next.t)} (next)`);
    actual.push(null);
    pred.push(series.next.forecast);
    lower.push(series.next.lower);
    upper.push(series.next.upper);
  }
  chartTimes = pts.map((p) => p.t);
  if (series.next && series.next.t) chartTimes.push(series.next.t);
  chartPoints = pts;
  chartNext = series.next && series.next.t ? series.next : null;
  hourAvg = learnHourly(series.points);
  renderWhy();
  chart.data.labels = labels;
  chart.data.datasets[0].data = lower;
  chart.data.datasets[1].data = upper;
  chart.data.datasets[2].data = pred;
  chart.data.datasets[3].data = actual;
  chart.data.datasets[3].pointRadius = 0;
  chart.update();
}

const periodMs = () => profile.period.seconds * 1000;
const perDay = () => profile.period.periods_per_day || 24;
const simHour = (t) => (((Math.floor(t / periodMs()) - 1) % perDay()) + perDay()) % perDay();
const hourName = (h) => (perDay() === 24 ? `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}` : `period ${h}`);
const movedDir = (a, b) => (Math.abs(a - b) < Math.max(2, 0.1 * Math.max(b, 1)) ? 0 : Math.sign(a - b));
const activeAt = (t) => promoPeriods.filter((p) => p.start_t < t && (!p.end_t || t <= p.end_t));
const signed = (x, d = 0) => `${x >= 0 ? "+" : "-"}${fmt(Math.abs(x), d)}`;
const arrow = (x) => (x > 0.5 ? `<span class="up">▲</span>` : x < -0.5 ? `<span class="down">▼</span>` : `<span class="flat">▬</span>`);

// Typical sales for each hour of the day, learned from periods with no campaign and no stock-out.
function learnHourly(points) {
  const sum = {}, n = {};
  points.forEach((p) => {
    if (p.sold_out || activeAt(p.t).length) return;
    const h = simHour(p.t);
    sum[h] = (sum[h] || 0) + p.actual;
    n[h] = (n[h] || 0) + 1;
  });
  const avg = {};
  Object.keys(sum).forEach((h) => (avg[h] = sum[h] / n[h]));
  const vals = Object.values(avg);
  return { avg, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, days: Math.max(...Object.values(n), 0) };
}

function actualReasons(p, q) {
  const out = [];
  const P = profile.period.label;
  const delta = p.actual - q.actual;
  if (p.sold_out) {
    out.push({ dir: -1, tag: "Stock-out", cls: "bad", text: `${p.sold_out} of ${p.locations} location${p.locations > 1 ? "s" : ""} had no stock, so sales are capped. Real demand is higher than the chart shows (lost sales).` });
  } else if (q.sold_out && delta > 0) {
    out.push({ dir: 1, tag: "Restocked", cls: "ok", text: "Stock is back after a stock-out, so pent-up demand converts to sales again." });
  }
  const now = activeAt(p.t), before = activeAt(q.t);
  now.filter((c) => !before.includes(c)).forEach((c) =>
    out.push({ dir: 1, tag: `${kindOf(c).word} started`, cls: kindOf(c).cls, text: `${c.name} started, pulling demand up.` }));
  before.filter((c) => !now.includes(c)).forEach((c) =>
    out.push({ dir: -1, tag: `${kindOf(c).word} ended`, cls: "flat", text: `${c.name} ended, so demand falls back to its normal level.` }));
  now.filter((c) => before.includes(c)).forEach((c) => {
    const age = Math.round((p.t - c.start_t) / periodMs());
    if (c.promo_type === "LAUNCH") {
      out.push({ dir: 0, tag: "Launch running", cls: "launch", text: delta < 0
        ? `${c.name} is ${age} ${P}s old. Launch hype peaks early and fades, so sales ease off from the peak.`
        : `${c.name} is ${age} ${P}s old and still keeping demand well above normal.` });
    } else {
      out.push({ dir: 0, tag: `${kindOf(c).word} running`, cls: kindOf(c).cls, text: `${c.name} has run for ${age} ${P}s and keeps demand above normal.` });
    }
  });
  if (hourAvg && hourAvg.mean) {
    const hp = simHour(p.t), hq = simHour(q.t);
    const ap = hourAvg.avg[hp], aq = hourAvg.avg[hq];
    if (ap != null && aq != null && aq > 0 && Math.abs(ap / aq - 1) > 0.1) {
      const rel = ap / hourAvg.mean;
      const label = rel > 1.2 ? "Peak hours" : rel < 0.6 ? "Quiet hours" : "Time of day";
      out.push({ dir: Math.sign(ap - aq), tag: label, cls: "time", text: `Daily pattern: ${hourName(hp)} usually sells ${fmt(ap, 0)} units vs ${fmt(aq, 0)} at ${hourName(hq)} (learned from the last ${hourAvg.days} days).` });
    }
  }
  if (p.views && q.views && Math.abs(p.views / q.views - 1) > 0.25) {
    const pct = (p.views / q.views - 1) * 100;
    out.push({ dir: Math.sign(pct), tag: pct > 0 ? "Traffic up" : "Traffic down", cls: "time", text: `Online product views ${pct > 0 ? "rose" : "fell"} ${fmt(Math.abs(pct), 0)}% (${p.views} vs ${q.views}): ${pct > 0 ? "more" : "fewer"} shoppers looking at the product.` });
  }
  const move = movedDir(p.actual, q.actual);
  const events = ["Stock-out", "Restocked", "Launch started", "Promo started", "Launch ended", "Promo ended"];
  const kept = out.filter((r) => events.includes(r.tag) || r.dir === 0 || r.dir === move);
  out.length = 0;
  out.push(...kept);
  if (!out.length) {
    const inside = p.lower == null || (p.actual >= p.lower && p.actual <= p.upper);
    out.push(inside
      ? { tag: "Normal noise", cls: "flat", text: "No campaign, stock-out, daily pattern or traffic shift explains this move. It is ordinary random variation, inside the expected range." }
      : { tag: "Unexplained", cls: "bad", text: "Outside the expected range with no known driver, so it is flagged as an anomaly for a planner to look at." });
  }
  return out;
}

function forecastReasons(p, q, isNext) {
  const out = [];
  const P = profile.period.label;
  if (p.pred == null) return [{ text: "The model is still warming up for this series." }];
  const startedNow = activeAt(p.t).filter((c) => !activeAt(q.t).includes(c));
  if (!isNext && startedNow.length && p.actual > (p.upper ?? p.pred)) {
    out.push({ text: `The forecast missed this jump: it only learns from past sales and had not seen ${startedNow[0].name} yet. It catches up within 1-2 ${P}s.` });
  }
  const dir = p.pred - (q.pred ?? p.pred);
  const basis = isNext
    ? `${q.actual != null ? `the ${fmt(q.actual, 0)} units sold in the latest ${P}` : "the latest sales"}`
    : `${fmt(q.actual, 0)} units sold in the previous ${P}`;
  out.push({ text: `Forecast ${Math.abs(dir) < 0.5 ? "held steady" : dir > 0 ? "rose" : "fell"} (${signed(dir, 1)}) because the model re-forecasts every ${P} from the newest sales: ${basis}${q.pred != null ? `, against ${fmt(q.pred, 1)} it had expected` : ""}.` });
  if (!isNext) {
    const miss = p.actual - p.pred;
    if (Math.abs(miss) > Math.max(2, 0.25 * p.pred)) {
      out.push({ text: `Actual came in ${signed(miss, 0)} vs this forecast, so the next forecast moves ${miss > 0 ? "up" : "down"} to follow.` });
    }
  }
  return out;
}

function renderWhy() {
  const el = $("why");
  if (!chartPoints.length) { el.innerHTML = ""; return; }
  let i = hoverIdx ?? (pinnedT != null ? chartTimes.indexOf(pinnedT) : -1);
  if (i < 0) { pinnedT = null; i = chartPoints.length - 1; }
  const isNext = i >= chartPoints.length;
  const P = profile.period.label;
  const reasonList = (rs) => rs.map((r) => `<li>${r.tag ? `<span class="tag ${r.cls}">${r.tag}</span>` : ""}${r.text}</li>`).join("");
  const mode = hoverIdx != null ? "hovered period" : pinnedT != null ? `pinned period · <a data-unpin href="#">back to latest</a>` : "latest period · hover or click the chart to explain any other period";
  if (isNext) {
    const last = chartPoints[chartPoints.length - 1];
    const fake = { t: chartNext.t, pred: chartNext.forecast, actual: null };
    el.innerHTML = `<div class="why-head"><b>Next ${P}</b> <span class="muted">(${timeLabel(chartNext.t)}, simulated ${hourName(simHour(chartNext.t))})</span>
      <span>Forecast <b>${fmt(chartNext.forecast)}</b> ${arrow(chartNext.forecast - (last.pred ?? chartNext.forecast))}</span><span class="muted mode">${mode}</span></div>
      <div class="why-cols"><div><h5>Why the forecast is where it is</h5><ul>${reasonList(forecastReasons(fake, last, true))}</ul></div></div>`;
    return;
  }
  const p = chartPoints[i], q = chartPoints[i - 1];
  if (!q) { el.innerHTML = ""; return; }
  const dA = p.actual - q.actual, dF = p.pred != null && q.pred != null ? p.pred - q.pred : 0;
  el.innerHTML = `<div class="why-head"><b>${timeLabel(p.t)}</b> <span class="muted">(simulated ${hourName(simHour(p.t))})</span>
      <span>Actual <b>${fmt(p.actual, 0)}</b> ${arrow(dA)} ${signed(dA, 0)}</span>
      <span>Forecast <b>${p.pred != null ? fmt(p.pred, 1) : "-"}</b> ${arrow(dF)} ${p.pred != null ? signed(dF, 1) : ""}</span>
      <span class="muted mode">${mode}</span></div>
    <div class="why-cols">
      <div><h5>Why actual sales ${["fell", "held about steady", "rose"][movedDir(p.actual, q.actual) + 1]}</h5><ul>${reasonList(actualReasons(p, q))}</ul></div>
      <div><h5>Why the forecast ${dF > 0.5 ? "rose" : dF < -0.5 ? "fell" : "held steady"}</h5><ul>${reasonList(forecastReasons(p, q, false))}</ul></div>
    </div>`;
}

const appliesHere = (p, sku, region) => p.sku === sku && (region === "ALL" || !p.region || p.region === region);
const scopeName = (p) => (p.region ? regionName(p.region) : "all regions");
const promoLabel = (p) => (p.promo_type === "LAUNCH" ? profile.launch.label || "Launch" : p.promo_type === "PEAK" ? p.name.split(":")[0] : `${profile.promo.label || "Promo"} -${Math.round(p.discount_pct * 100)}%`);

// The promo button doubles as the off switch while a promo is running for the selected product.
function renderPromoButton(s) {
  const btn = $("btn-promo");
  const running = s.promotions.filter((p) => p.promo_type === "PROMO" && appliesHere(p, $("sku").value, $("region").value));
  btn.dataset.promoIds = running.map((p) => p.promo_id).join(",");
  btn.classList.toggle("running", running.length > 0);
  btn.textContent = running.length
    ? `■ End promo${timeLeft(running[0], true) ? ` · ${timeLeft(running[0], true)}` : ""}`
    : `Start ${(profile.promo.label || "promo").toLowerCase()}`;
  btn.title = running.length
    ? `${running[0].name} ends on its own at ${timeLabel(running[0].planned_end)}. Click to end it now.`
    : `Runs ${profile.promo.default_periods || 8} simulated ${profile.period.label}s, then ends on its own.`;
}

function renderPromoStatus(s) {
  const sku = $("sku").value, region = $("region").value;
  const active = s.promotions.filter((p) => appliesHere(p, sku, region));
  const el = $("promo-status");
  const P = profile.period.label;
  const ended = (s.promo_periods || []).filter((p) => p.end_t).sort((a, b) => b.end_t - a.end_t)[0];
  const age = (p) => Math.max(Math.round((Date.now() - p.event_time) / (profile.period.seconds * 1000)), 0);
  const key = `${sku}|${region}|` + active.map((p) => `${p.promo_id}:${age(p)}`).join(",") + `|${ended ? ended.promo_id : ""}`;
  if (key === el.dataset.key) return;
  el.dataset.key = key;
  if (active.length) {
    const first = kindOf(active.find((p) => p.promo_type !== "PROMO") || active[0]);
    el.className = `promo-status ${first.cls === "promo" ? "on" : first.cls}`;
    el.innerHTML = active.map((p) => {
      const a = age(p), k = kindOf(p);
      return `<div class="row"><span class="state ${k.cls}">${k.word.toUpperCase()} ON</span>
        <span class="item"><b>${p.name}</b>${p.promo_type === "PEAK" ? " (a big shopping day: far more buyers than usual)" : ""} · ${scopeName(p)} · started ${timeLabel(p.event_time)}${p.planned_end
          ? ` · <b>ends ${timeLabel(p.planned_end)} (${timeLeft(p)})</b>`
          : `, running ${a} simulated ${P}${a === 1 ? "" : "s"}, fades out on its own`}</span>
        <button class="end-btn" data-promo-id="${p.promo_id}" title="Stop it now: sends a promotions ENDED event">End now</button></div>`;
    }).join("");
    return;
  }
  el.className = "promo-status off";
  el.innerHTML = `<span class="state">OFF</span><span>No promo or launch running for ${productName(sku)}${region === "ALL" ? "" : " in " + regionName(region)}: demand is baseline.</span>` +
    (ended ? `<span class="muted">Last: ${ended.name} ended ${timeLabel(ended.end_t)}</span>` : "");
}

let knownPromos = {};
const endedByUser = new Set();
function notifyEnded(promotions) {
  const now = Object.fromEntries(promotions.map((p) => [p.promo_id, p]));
  if (activePromoIds) {
    Object.keys(knownPromos).filter((id) => !now[id] && !endedByUser.has(id)).forEach((id) => {
      const p = knownPromos[id];
      toast(`${p.name} ended for ${productName(p.sku)} (${scopeName(p)}). Demand goes back to baseline.`);
    });
  }
  activePromoIds = new Set(Object.keys(now));
  knownPromos = now;
}

const RISK_INFO = {
  OUT_OF_STOCK: { label: "Out of stock", color: "var(--accent)", desc: "0 on hand, sales are being lost" },
  HIGH: { label: "Restock now", color: "var(--bad)", desc: "stock runs out before the next 6 periods of forecast demand" },
  MEDIUM: { label: "Watch", color: "var(--warn)", desc: "covers expected demand, not the high end of the forecast" },
  LOW: { label: "Healthy", color: "var(--ok)", desc: "covers even the high end of the forecast" },
  OVERSTOCK: { label: "Overstock", color: "var(--violet)", desc: "more than 120 periods of cover, markdown risk" },
  WARMING_UP: { label: "Warming up", color: "var(--border-strong)", desc: "forecast model still collecting history" },
};
const NEEDS_RESTOCK = ["OUT_OF_STOCK", "HIGH"];
const locName = (r) => `${productName(r.sku)} · ${regionName(r.region)} · ${channelName(r.channel)}`;

function riskReason(r, promotions) {
  const P = profile.period.label, lead = profile.lead_time_periods;
  const fh = fmt(r.forecast_horizon, 0), up = r.upper_horizon != null ? fmt(r.upper_horizon, 0) : null;
  let why;
  if (r.risk_level === "OUT_OF_STOCK") why = `Sold out. The forecast still expects ${fh} units of demand over the next 6 ${P}s, which will be lost sales.`;
  else if (r.risk_level === "HIGH") why = `${r.on_hand} on hand vs ${fh} forecast over the next 6 ${P}s: sells out in about ${fmt(r.periods_of_cover, 1)} ${P}s.`;
  else if (r.risk_level === "MEDIUM") why = `${r.on_hand} on hand covers the expected ${fh} units, but not the high end of the forecast (${up}).`;
  else if (r.risk_level === "OVERSTOCK") why = `${r.on_hand} on hand is ${fmt(r.periods_of_cover, 0)} ${P}s of demand: capital tied up and markdown risk.`;
  else if (r.risk_level === "WARMING_UP") why = "The forecast model is still collecting history for this location.";
  else why = `${r.on_hand} on hand covers ${fmt(r.periods_of_cover, 0)} ${P}s of forecast demand.`;
  const inbound = r.on_order > 0
    ? `${r.on_order} units already on order, arriving up to ${lead} ${P}s after they were ordered${NEEDS_RESTOCK.includes(r.risk_level) && r.periods_of_cover != null && r.periods_of_cover < lead ? " (likely too late)" : ""}.`
    : NEEDS_RESTOCK.includes(r.risk_level) ? "Nothing on order." : "";
  const driver = promotions.find((p) => appliesHere(p, r.sku, r.region));
  return {
    why,
    inbound,
    driver: driver ? `Demand is lifted by: ${driver.name}.` : r.promo_active ? "Demand is lifted by an active promo." : "",
  };
}

let lastRestockKey = "";
function renderRestock(s) {
  if (!$("restock-list")) return;
  const rows = s.risk.filter((r) => NEEDS_RESTOCK.includes(r.risk_level))
    .sort((a, b) => (a.risk_level === b.risk_level ? (a.periods_of_cover ?? 0) - (b.periods_of_cover ?? 0) : a.risk_level === "OUT_OF_STOCK" ? -1 : 1));
  $("restock-count").textContent = rows.length || "";
  const key = rows.map((r) => `${r.sku}|${r.region}|${r.channel}|${r.on_hand}|${r.on_order}|${r.window_time}`).join(",") + s.promotions.length;
  if (key === lastRestockKey) return;
  lastRestockKey = key;
  if (!rows.length) {
    $("restock-list").innerHTML = `<div class="empty">Every location has enough stock for the next 6 ${profile.period.label}s of forecast demand.</div>`;
    return;
  }
  $("restock-list").innerHTML = rows.slice(0, 12).map((r) => {
    const info = RISK_INFO[r.risk_level], x = riskReason(r, s.promotions);
    const units = r.suggested_replenishment_units || 0;
    return `<div class="restock r-${r.risk_level}">
      <div class="top"><b>${locName(r)}</b><span class="badge" style="background:${info.color}">${info.label}</span></div>
      <div class="why">${x.why}</div>
      ${x.driver ? `<div class="why driver">${x.driver}</div>` : ""}
      ${x.inbound ? `<div class="why">${x.inbound}</div>` : ""}
      <div class="act"><span>${units ? `Suggested: order ${units} units to cover the high end of the forecast` : "Inbound stock covers the forecast; expedite to avoid the gap"}</span>
        <button data-sku="${r.sku}" data-region="${r.region}" data-channel="${r.channel}" data-units="${units}">Restock${units ? " " + units : ""}</button></div>
    </div>`;
  }).join("") + (rows.length > 12 ? `<div class="empty">+${rows.length - 12} more locations at risk</div>` : "");
}

function renderInventoryStatus(s) {
  const sku = $("sku").value, region = $("region").value, channel = $("channel").value;
  const rows = s.risk.filter((r) => r.sku === sku && (region === "ALL" || r.region === region) && (channel === "ALL" || r.channel === channel));
  const el = $("inv-status");
  if (!rows.length) { el.innerHTML = ""; return; }
  const order = ["OUT_OF_STOCK", "HIGH", "MEDIUM", "OVERSTOCK", "LOW", "WARMING_UP"];
  const worst = rows.slice().sort((a, b) => order.indexOf(a.risk_level) - order.indexOf(b.risk_level) || (a.periods_of_cover ?? 0) - (b.periods_of_cover ?? 0))[0];
  const info = RISK_INFO[worst.risk_level];
  const onHand = rows.reduce((a, r) => a + r.on_hand, 0), onOrder = rows.reduce((a, r) => a + r.on_order, 0);
  const atRisk = rows.filter((r) => NEEDS_RESTOCK.includes(r.risk_level)).length;
  const x = riskReason(worst, s.promotions);
  el.className = `inv-status r-${worst.risk_level}`;
  el.innerHTML = `<span class="badge" style="background:${info.color}">INVENTORY: ${info.label.toUpperCase()}</span>
    <span><b>${onHand}</b> on hand · <b>${onOrder}</b> on order${rows.length > 1 ? ` · ${atRisk} of ${rows.length} locations need restock` : ""}</span>
    <span class="why">${rows.length > 1 ? `Worst: ${regionName(worst.region)} ${channelName(worst.channel)}. ` : ""}${x.why} ${x.driver}</span>`;
}

const money = (x) => `$${Math.round(x).toLocaleString()}`;
const rateOf = (r) => Math.max(r.forecast_next || 0, r.units_sold || 0);

function regionStock(risk, sku, region) {
  const rows = risk.filter((r) => r.sku === sku && r.region === region);
  const onHand = rows.reduce((a, r) => a + r.on_hand, 0);
  const rate = rows.reduce((a, r) => a + rateOf(r), 0);
  return { onHand, rate, cover: rate > 0 ? onHand / rate : null, rows };
}

let lastAgentKey = "";
function renderAgent(s) {
  const a = s.agent;
  const card = $("agent-card");
  const agentBtn = $("btn-agent");
  if (agentBtn) {
    agentBtn.textContent = `AI agent: ${a.enabled ? "ON" : "OFF"}`;
    agentBtn.classList.toggle("on", a.enabled);
  }
  renderRecs(a);
  if (!card) return;
  card.hidden = !a.enabled && !a.decisions.length && !(a.pending || []).length;
  if (card.hidden) return;
  const P = profile.period.label, pol = a.policy;
  $("agent-state").textContent = a.enabled ? "ON · 24/7" : "OFF";
  $("agent-state").className = `agent-state ${a.enabled ? "on" : ""}`;
  $("agent-policy").textContent = `Acts when a location has under ${pol.trigger_cover} ${P}s of stock left (supplier restock takes ${pol.supplier_lead_time} ${P}s); refills to ${pol.target_cover} ${P}s; donors keep ${pol.donor_keep_cover} ${P}s for themselves. Flags overstock above 120 ${P}s of stock.`;
  $("agent-stats").innerHTML = [
    [a.enabled ? `${a.monitored}` : "-", `locations watched every ${P}`],
    [a.stats.transfers, "stock transfers made"],
    [a.stats.units_moved.toLocaleString(), "units moved to where they sell"],
    [money(a.stats.value_moved), "of stock put back on sale"],
  ].map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");
  const key = a.decisions.map((d) => d.id).join(",");
  if (key === lastAgentKey) return;
  lastAgentKey = key;
  const TAGS = { TRANSFER: "MOVED STOCK", ESCALATE: "ESCALATED", REJECTED: "REJECTED", MARKDOWN: "MARKDOWN" };
  $("agent-feed").innerHTML = a.decisions.length
    ? a.decisions.map((d) => `<div class="decision ${d.action}">
        <div class="d-head"><span class="d-tag">${TAGS[d.action] || d.action}</span><b>${d.headline}</b><span class="muted">${timeLabel(d.t)}</span></div>
        <div class="d-row"><span>Detected</span>${d.detected}</div>
        <div class="d-row"><span>Found</span>${d.found}</div>
        <div class="d-row act"><span>Action</span>${d.action_text}</div>
      </div>`).join("")
    : `<div class="empty">Watching every location. Nothing needs moving right now.</div>`;
}

const PROPOSAL_KIND = {
  STOCKOUT: { tag: "STOCK-OUT RISK", cls: "stockout" },
  OVERSTOCK: { tag: "OVERSTOCK RISK", cls: "overstock" },
};
const REC_STATUS = {
  PENDING: { label: "Waiting for you", chip: "Waiting", cls: "pending" },
  APPROVED: { label: "Approved", chip: "Approved", cls: "approved" },
  AUTO: { label: "Auto-approved", chip: "Auto", cls: "auto" },
  REJECTED: { label: "Rejected", chip: "Rejected", cls: "rejected" },
  WITHDRAWN: { label: "Withdrawn", chip: "Withdrawn", cls: "withdrawn" },
  FAILED: { label: "Failed", chip: "Failed", cls: "failed" },
};
const recFilter = { status: "ALL", kind: "ALL" };
const recOpen = {};
const announced = new Set();
let recsPrimed = false, recsData = [], lastAgent = null, recsForce = false, recsDeferredSince = 0;

function recTitle(r) {
  if (r.action === "MARKDOWN") return `${Math.round(r.discount_pct * 100)}% markdown on ${r.product} in ${regionName(r.region)}`;
  if (r.action === "ORDER") return `Order ${r.executed_units ?? r.units} × ${r.product} from the warehouse for ${regionName(r.to_region)} (${channelName(r.channel)})`;
  return `Move ${r.executed_units ?? r.units} × ${r.product}: ${regionName(r.from_region)} → ${regionName(r.to_region)} (${channelName(r.channel)})`;
}

function transferValueText(r, units) {
  const u = Math.max(1, Math.min(Number(units) || 0, r.max_units));
  return `${money(u * r.price)} of stock · up to ${r.max_units} spare · lifts ${regionName(r.to_region)} to ~${fmt((r.dest_on_hand + u) / r.rate, 0)} ${profile.period.label}s of cover`;
}

function syncApprovalMode(required) {
  const mode = $("approval-mode");
  if (mode) {
    mode.classList.toggle("is-required", required);
    const choice = mode.querySelector(`input[value="${required ? "required" : "auto"}"]`);
    if (choice) choice.checked = true;
    return;
  }
  const btn = $("btn-approval");
  if (!btn) return;
  btn.textContent = `Human approval: ${required ? "required" : "off (autonomous)"}`;
  btn.classList.toggle("on", required);
}

function renderRecs(a) {
  lastAgent = a;
  if (window.renderRecHistory) window.renderRecHistory(a);
  syncApprovalMode(!!a.require_approval);
  const recs = a.recommendations || [];
  const waiting = recs.filter((r) => r.status === "PENDING");
  $("recs-waiting").textContent = waiting.length ? `${waiting.length} waiting` : "";
  $("recs").classList.toggle("has-waiting", waiting.length > 0);
  for (const r of waiting) {
    if (announced.has(r.id)) continue;
    announced.add(r.id);
    if (recsPrimed) toast(`New AI recommendation: ${recTitle(r)}. Approve or reject it in the AI Recommendations panel.`);
  }
  recsPrimed = true;

  const count = (fn) => recs.filter(fn).length;
  const chip = (group, value, label, n) =>
    `<button class="chip-btn ${recFilter[group] === value ? "on" : ""}" data-group="${group}" data-value="${value}">${label}${n != null ? ` <b>${n}</b>` : ""}</button>`;
  $("recs-status").innerHTML = chip("status", "ALL", "All", recs.length) +
    ["PENDING", "APPROVED", "AUTO", "REJECTED", "WITHDRAWN"].map((s) => chip("status", s, REC_STATUS[s].chip, count((r) => r.status === s))).join("");
  $("recs-kind").innerHTML = chip("kind", "ALL", "All types") +
    Object.entries(PROPOSAL_KIND).map(([k, v]) => chip("kind", k, v.tag.replace(" RISK", "").toLowerCase().replace(/^./, (c) => c.toUpperCase()), count((r) => r.kind === k))).join("");

  const shown = recs
    .filter((r) => (recFilter.status === "ALL" || r.status === recFilter.status) && (recFilter.kind === "ALL" || r.kind === recFilter.kind))
    .sort((x, y) => (x.status === "PENDING" ? 0 : 1) - (y.status === "PENDING" ? 0 : 1)
      || (x.status === "PENDING" ? x.t - y.t : (y.decided_t || y.t) - (x.decided_t || x.t)));
  const list = $("recs-list");
  const key = JSON.stringify([recFilter, shown.map((r) => [r.id, r.status, r.proposal_text])]);
  if (key === list.dataset.key) return;
  // don't reshuffle cards under the cursor; stale buttons are safe (the server rejects them)
  if (!recsForce && list.matches(":hover") && Date.now() - (recsDeferredSince || Date.now()) < 10000) {
    recsDeferredSince = recsDeferredSince || Date.now();
    return;
  }
  recsForce = false;
  recsDeferredSince = 0;
  list.dataset.key = key;
  recsData = shown;
  const typed = {};
  list.querySelectorAll("input[data-units]").forEach((el) => (typed[el.dataset.units] = el.value));
  const focused = document.activeElement?.dataset?.units;

  if (!shown.length) {
    list.innerHTML = `<div class="empty">${recs.length ? "No recommendations match this filter."
      : a.enabled ? "The agent is watching every location. Recommendations appear here when stock runs low or piles up."
      : "The agent is off. Turn it on with AI agent on the Trend & Forecast tab."}</div>`;
    return;
  }
  const P = profile.period.label;
  list.innerHTML = shown.map((r) => {
    const k = PROPOSAL_KIND[r.kind] || PROPOSAL_KIND.STOCKOUT;
    const st = REC_STATUS[r.status] || REC_STATUS.PENDING;
    const pending = r.status === "PENDING";
    const open = recOpen[r.id] ?? pending;
    let foot;
    if (pending) {
      foot = `<div class="rec-actions">
        ${r.action === "TRANSFER" || r.action === "ORDER"
          ? `<label>Units <input type="number" data-units="${r.id}" min="1" max="${r.max_units}" value="${typed[r.id] ?? r.units}" /></label>
             <span class="muted rec-value" data-value-for="${r.id}">${transferValueText(r, typed[r.id] ?? r.units)}</span>`
          : `<span class="muted rec-value">All channels in ${regionName(r.region)} for ${r.periods} ${P}s; end it early from the promo banner.</span>`}
        <div class="rec-btns"><button class="danger" data-decide="reject" data-id="${r.id}">Reject</button>
        <button class="primary" data-decide="approve" data-id="${r.id}">Approve</button></div></div>`;
    } else {
      const who = r.decided_by ? ` by ${r.decided_by}` : "";
      foot = `<div class="rec-outcome ${st.cls}"><b>${st.label}${who}</b> at ${timeLabel(r.decided_t || r.t)}${r.result ? ` · ${r.result}` : ""}</div>`;
    }
    return `<div class="rec ${st.cls}" data-rec="${r.id}">
      <div class="rec-head"><span class="ap-tag ${k.cls}">${k.tag}</span><span class="rec-st ${st.cls}">${st.label}</span><span class="muted">${timeLabel(r.t)}</span></div>
      <div class="rec-title">${recTitle(r)}</div>
      <details data-id="${r.id}" ${open ? "open" : ""}><summary>Why the agent recommends this</summary>
        <div class="d-row"><span>Detected</span>${r.detected}</div>
        <div class="d-row"><span>Found</span>${r.found}</div>
        <div class="d-row act"><span>Proposal</span>${r.proposal_text}</div>
      </details>
      ${foot}
    </div>`;
  }).join("");
  if (focused) list.querySelector(`input[data-units="${focused}"]`)?.focus();
}

async function decideRec(btn) {
  const id = btn.dataset.id, decision = btn.dataset.decide;
  const r = recsData.find((x) => x.id === id);
  const body = { approver: "planner" };
  const input = $("recs-list").querySelector(`input[data-units="${id}"]`);
  if (decision === "approve" && input) body.units = Number(input.value) || r?.units;
  const card = btn.closest(".rec");
  card.querySelectorAll("button").forEach((b) => (b.disabled = true));
  try {
    const resp = await fetch(`/api/agent/proposals/${id}/${decision}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || resp.statusText);
    toast(decision === "approve" ? `Approved. ${data.decision.headline}.`
      : `Rejected. ${r?.product || "The item"} stays where it is; the agent won't suggest this again for 6 ${profile.period.label}s.`,
      decision === "approve" ? "ok" : "err");
  } catch (e) {
    toast(e.message, "err");
    card.querySelectorAll("button").forEach((b) => (b.disabled = false));
  } finally {
    recsForce = true;
  }
}

function renderStory(s) {
  const sc = s.scenario;
  const story = $("story");
  $("btn-demo").classList.toggle("running", !!sc);
  const peakRow = sc && s.promotions.find((p) => p.promo_id === sc.promo_id);
  const peakName = (sc?.name || "").split(":")[0];
  $("btn-demo").textContent = sc
    ? `■ Stop ${peakName}${peakRow && timeLeft(peakRow, true) ? ` · ${timeLeft(peakRow, true)}` : ""}`
    : `▶ ${profile.peak_event?.label || "Peak season demo"}`;
  $("btn-demo").title = sc ? `Ends on its own ${peakRow?.planned_end ? "at " + timeLabel(peakRow.planned_end) : "soon"}. Click to stop it now.` : "";
  if (story) story.hidden = !sc;
  if (!sc) { if (localStorage.getItem("hideGuide") !== "1") $("guide").hidden = false; return; }
  $("guide").hidden = true;
  if (!story) return;
  const P = profile.period.label, name = productName(sc.sku);
  const surge = regionStock(s.risk, sc.sku, sc.surge_region), spare = regionStock(s.risk, sc.sku, sc.surplus_region);
  const moves = s.agent.decisions.filter((d) => d.action === "TRANSFER" && d.sku === sc.sku && d.t >= sc.started_t);
  const transit = s.agent.in_transit.filter((t) => t.sku === sc.sku && t.to_region === sc.surge_region && t.arrive_t > Date.now());
  const moved = moves.reduce((a, d) => a + d.units, 0);
  const elapsed = Math.round((Date.now() - sc.started_t) / periodMs());
  const atRisk = surge.cover != null && surge.cover < s.agent.policy.trigger_cover;
  const arrived = moves.length && moves.some((d) => d.t + periodMs() < Date.now());
  const soldOut = surge.rows.filter((r) => r.on_hand <= 0).length;
  const steps = [
    { done: true, title: `${sc.name.split(":")[0]} begins`,
      text: `Shoppers in ${regionName(sc.surge_region)} buy ${name} about ${sc.multiplier}x faster than normal.` },
    { done: atRisk || moves.length > 0, title: "Agent spots the risk",
      text: moves.length ? `${moves[moves.length - 1].detected}` : surge.cover != null ? `${regionName(sc.surge_region)} has ${surge.onHand} left, selling ${fmt(surge.rate, 0)}/${P}: about ${fmt(surge.cover, 1)} ${P}s of stock. A supplier restock takes ${profile.lead_time_periods} ${P}s.` : "Reading the live forecast and inventory..." },
    { done: moves.length > 0, title: "Agent moves stock",
      text: moves.length ? `Moved ${moved} units from ${regionName(sc.surplus_region)}, which has plenty (${spare.onHand} units, ${fmt(spare.cover, 0)} ${P}s of cover). Arrives in 1 ${P}.` : `${regionName(sc.surplus_region)} has ${spare.onHand} units, far more than it will sell.` },
    { done: arrived && !soldOut, title: "Stock-out avoided",
      text: arrived ? (soldOut ? `Stock arrived, but ${soldOut} location(s) briefly ran out.` : `${regionName(sc.surge_region)} stays in stock with ${surge.onHand} units, ${money(moved * (profile.prices[sc.sku] || 0))} of sales protected${moves.some((d) => d.approved_by && d.approved_by !== "auto-approve") ? ", approved by a planner in one click" : ", no human involved"}.`) : "Waiting for the transfer to land..." },
  ];
  const asking = (s.agent.pending || []).find((p) => p.sku === sc.sku && p.to_region === sc.surge_region);
  if (asking && !moves.length) {
    steps[2] = { done: false, title: "Agent asks for your approval",
      text: `Proposes moving ${asking.units} units from ${regionName(asking.from_region)}. Nothing moves until a planner clicks Approve in AI Recommendations →` };
    steps[3].text = "Waiting for a human decision...";
  }
  if (!s.agent.enabled && !moves.length) {
    steps[2] = { done: false, title: "Nobody moves stock", text: `AI agent is OFF. ${regionName(sc.surplus_region)} has ${spare.onHand} units it doesn't need, but they stay where they are.` };
    steps[3] = soldOut
      ? { done: false, title: "Stock-out", text: `${soldOut} location(s) in ${regionName(sc.surge_region)} are empty: every shopper there now is a lost sale.` }
      : { done: false, title: "Heading for a stock-out", text: `${regionName(sc.surge_region)} runs out in about ${fmt(surge.cover, 1)} ${P}s. The supplier needs ${profile.lead_time_periods}.` };
  }
  const activeIdx = steps.findIndex((x) => !x.done);
  $("story-title").textContent = sc.name;
  $("story-sub").textContent = `· ${name} · ${elapsed} simulated ${P}${elapsed === 1 ? "" : "s"} in · AI agent ${s.agent.enabled ? "ON" : "OFF"}`;
  $("story-steps").innerHTML = steps.map((x, i) =>
    `<div class="sstep ${x.done ? "done" : i === activeIdx ? "active" : ""}"><b>${x.done ? "✓" : i + 1}</b><div><strong>${x.title}</strong>${x.text}</div></div>`).join("");
  const tile = (st, region, role) => {
    const level = st.cover == null ? "NONE" : st.onHand <= 0 ? "OUT_OF_STOCK" : st.cover < 6 ? "HIGH" : st.cover < 12 ? "MEDIUM" : "LOW";
    return `<div class="tile r-${level}"><div class="t-role">${role}</div><div class="t-name">${regionName(region)}</div>
      <div class="t-num">${st.onHand}<small> units on hand</small></div>
      <div class="t-sub">${st.cover == null ? "-" : `${fmt(st.cover, 1)} ${P}s of stock`} · selling ${fmt(st.rate, 0)}/${P}</div></div>`;
  };
  const inTransit = transit.reduce((a, t) => a + t.units, 0);
  $("story-map").innerHTML = tile(spare, sc.surplus_region, "Plenty of stock") +
    `<div class="flow ${inTransit ? "moving" : ""}"><div class="flow-line"><span></span></div>
      <div class="flow-label">${inTransit ? `<b>${inTransit} units in transit</b> · AI agent transfer` : moves.length ? `<b>${moved} units moved</b> so far` : "Agent watching..."}</div></div>` +
    tile(surge, sc.surge_region, "Demand surge");
}

function renderRiskLegend() {
  $("risk-legend").innerHTML = ["OUT_OF_STOCK", "HIGH", "MEDIUM", "LOW", "OVERSTOCK"]
    .map((k) => `<span><i class="r-${k}"></i><b>${RISK_INFO[k].label}</b> ${RISK_INFO[k].desc}</span>`).join("") +
    `<span>Click a cell to chart that location.</span>`;
}

function renderKpis(s) {
  const pts = s.series.points;
  const last = pts[pts.length - 1];
  $("kpi-actual").textContent = last ? fmt(last.actual, 0) : "-";
  $("kpi-actual-sub").textContent = last && last.pred !== null ? `forecast was ${fmt(last.pred)} (${fmt(last.lower)}-${fmt(last.upper)})` : "";
  const n = s.series.next || {};
  $("kpi-next").textContent = fmt(n.forecast);
  $("kpi-next-sub").textContent = n.lower !== null && n.lower !== undefined ? `range ${fmt(n.lower)}-${fmt(n.upper)}` : "model warming up";
  $("kpi-horizon").textContent = fmt(n.horizon, 0);
  $("kpi-wape").textContent = s.series.wape === null ? "-" : `${fmt(s.series.wape * 100, 0)}%`;
  $("kpi-coverage").textContent = s.series.coverage === null ? "" : `${fmt(s.series.coverage * 100, 0)}% of actuals inside band`;
  const atRisk = s.risk.filter((r) => ["HIGH", "OUT_OF_STOCK"].includes(r.risk_level)).length;
  const over = s.risk.filter((r) => r.risk_level === "OVERSTOCK").length;
  $("kpi-risk").textContent = s.risk.length ? `${atRisk} / ${s.risk.length}` : "-";
  $("kpi-overstock").textContent = s.risk.length ? `${over} overstocked (markdown risk)` : "";
}

function renderPromos(promos) {
  const key = promos.map((p) => p.promo_id).join(",");
  if (key === $("promos").dataset.key) return;
  $("promos").dataset.key = key;
  $("promos").innerHTML = promos.length
    ? `<span class="muted">Running now, all products:</span>` + promos
      .map((p) => `<span class="promo-pill ${kindOf(p).cls}">${p.name}${p.region ? " · " + regionName(p.region) : ""}
        <button class="pill-x" data-promo-id="${p.promo_id}" title="End now">×</button></span>`)
      .join("")
    : "";
}

function renderRisk(risk, promotions) {
  const cols = [];
  profile.regions.forEach((r) => Object.keys(profile.channels).forEach((c) => cols.push([r.id, c])));
  const byKey = Object.fromEntries(risk.map((r) => [`${r.sku}|${r.region}|${r.channel}`, r]));
  const grid = $("risk-grid");
  grid.style.gridTemplateColumns = `220px repeat(${cols.length}, minmax(110px, 1fr))`;
  let html = `<div class="h">Product</div>` + cols.map(([r, c]) => `<div class="h">${regionName(r)}<br/>${channelName(c)}</div>`).join("");
  profile.products.forEach((p) => {
    html += `<div class="p">${p.name}</div>`;
    cols.forEach(([r, c]) => {
      const x = byKey[`${p.sku}|${r}|${c}`];
      const level = x ? x.risk_level : "NONE";
      const cover = x && x.periods_of_cover !== null && x.periods_of_cover !== undefined ? `${fmt(x.periods_of_cover, 0)} ${profile.period.label}s cover` : "";
      const reason = x ? Object.values(riskReason(x, promotions)).filter(Boolean).join(" ") : "";
      const selected = p.sku === $("sku").value && [r, "ALL"].includes($("region").value) && [c, "ALL"].includes($("channel").value);
      html += `<div class="cell r-${level}${selected ? " selected" : ""}" data-sku="${p.sku}" data-region="${r}" data-channel="${c}" title="${reason}">
        ${x ? `${level === "OUT_OF_STOCK" ? "📦 " : ""}${RISK_INFO[level]?.label || level}` : "-"}<small>${x ? `${x.on_hand} on hand` : ""}</small><small>${cover}</small></div>`;
    });
  });
  grid.innerHTML = html;
  grid.querySelectorAll(".cell").forEach((el) =>
    el.addEventListener("click", () => {
      $("sku").value = el.dataset.sku;
      $("region").value = el.dataset.region;
      $("channel").value = el.dataset.channel;
      connect();
    })
  );
}

async function post(action, body) {
  const resp = await fetch(`/api/trigger/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.detail || resp.statusText);
  return data;
}

function wireButtons() {
  const selection = () => ({
    sku: $("sku").value,
    region: $("region").value === "ALL" ? null : $("region").value,
    channel: $("channel").value === "ALL" ? null : $("channel").value,
  });
  const run = async (btn, fn) => {
    btn.disabled = true;
    try { await fn(); } catch (e) { toast(e.message, "err"); } finally { btn.disabled = false; }
  };
  $("btn-launch").onclick = (e) => run(e.target, async () => {
    const s = selection();
    const r = await post("launch", { sku: s.sku, region: s.region });
    toast(`${r.name} started. Watch demand break out of the forecast band in the next period or two.`);
  });
  $("btn-promo").onclick = (e) => run(e.target, async () => {
    const ids = (e.target.dataset.promoIds || "").split(",").filter(Boolean);
    if (ids.length) {
      for (const id of ids) { endedByUser.add(id); await post("end", { promo_id: id }); }
      toast("Promo ended. Demand drops back to normal from the next period.");
      return;
    }
    const s = selection();
    const r = await post("promo", { sku: s.sku, region: s.region });
    const P = profile.period.label, n = profile.promo.default_periods || 8;
    toast(`${r.name} started. It ends on its own in ${n} simulated ${P}s (about ${Math.round(n * profile.period.seconds / 60 * 10) / 10} min), or click "End promo".`);
  });
  $("btn-restock").onclick = (e) => run(e.target, async () => {
    const s = selection();
    const r = await post("restock", s);
    toast(`Restocked ${r.restocked} location(s) for ${productName(s.sku)}.`);
  });
  const api = async (path) => {
    const resp = await fetch(path, { method: "POST" });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || resp.statusText);
    return data;
  };
  $("btn-agent").onclick = (e) => run(e.target, async () => {
    const on = !e.target.classList.contains("on");
    await api(`/api/agent/${on ? "on" : "off"}`);
    agentSwitchedOff = !on;
    toast(on ? "AI agent is ON: it now watches every location around the clock." : "AI agent is OFF: low stock will wait for a human or the supplier.");
  });
  $("btn-demo").onclick = (e) => run(e.target, async () => {
    if (e.target.classList.contains("running")) {
      await api("/api/demo/stop");
      toast(`${profile.peak_event.label} stopped. Demand returns to normal; the AI agent keeps watching until you switch it off.`);
      return;
    }
    const pe = profile.peak_event;
    const r = await api(`/api/demo/peak?agent_on=${!agentSwitchedOff}`);
    $("sku").value = pe.sku; $("region").value = pe.surge_region; $("channel").value = "ALL";
    connect();
    toast(r.agent
      ? `${r.scenario.name} started. The AI agent is on. Watch ${regionName(pe.surge_region)}.`
      : `${r.scenario.name} started with the AI agent OFF. Watch ${regionName(pe.surge_region)} run out while ${regionName(pe.surplus_region)} sits on spare stock.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  const approvalMode = $("approval-mode");
  if (approvalMode) {
    approvalMode.addEventListener("change", (e) => {
      const input = e.target;
      if (!input.matches('input[name="approval-mode"]')) return;
      const on = input.value === "required";
      run(input, async () => {
        if (lastAgent && !lastAgent.enabled) await api("/api/agent/on");
        await api(`/api/agent/approval/${on ? "on" : "off"}`);
        toast(on ? "Human approval required: the agent will ask before moving any stock."
          : "Autonomous mode: the agent acts on its own (anything waiting was auto-approved).");
      });
    });
  } else if ($("btn-approval")) {
    $("btn-approval").onclick = (e) => run(e.target, async () => {
      const on = !e.target.classList.contains("on");
      await api(`/api/agent/approval/${on ? "on" : "off"}`);
      toast(on ? "Human approval required: the agent will ask before moving any stock."
        : "Autonomous mode: the agent acts on its own (anything waiting was auto-approved).");
    });
  }
  const onFilter = (e) => {
    const b = e.target.closest("button[data-group]");
    if (!b) return;
    recFilter[b.dataset.group] = b.dataset.value;
    recsForce = true;
    if (lastAgent) renderRecs(lastAgent);
  };
  $("recs-status").addEventListener("click", onFilter);
  $("recs-kind").addEventListener("click", onFilter);
  $("recs-list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-decide]");
    if (b) decideRec(b);
  });
  $("recs-list").addEventListener("input", (e) => {
    const id = e.target.dataset.units;
    const r = id && recsData.find((x) => x.id === id);
    const out = r && $("recs-list").querySelector(`[data-value-for="${id}"]`);
    if (out) out.textContent = transferValueText(r, e.target.value);
  });
  $("recs-list").addEventListener("toggle", (e) => {
    if (e.target.matches("details[data-id]")) recOpen[e.target.dataset.id] = e.target.open;
  }, true);
  const stopDemo = $("btn-demo-stop");
  if (stopDemo) stopDemo.onclick = (e) => run(e.target, async () => {
    await api("/api/demo/stop");
    toast("Demo stopped. The AI agent keeps watching until you switch it off.");
  });
  const endPromotion = (e) => {
    const b = e.target.closest("button[data-promo-id]");
    if (!b) return;
    run(b, async () => {
      const id = b.dataset.promoId;
      const r = await post("end", { promo_id: id });
      if (!r.ended) throw new Error((r.errors || [])[0] || r.detail || `${id} is not running`);
      endedByUser.add(id);
      toast(`${r.name} ended. Demand drops back to baseline from the next period.`);
    });
  };
  $("promo-status").addEventListener("click", endPromotion);
  $("promos").addEventListener("click", endPromotion);
  $("restock-list")?.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    run(b, async () => {
      const units = Number(b.dataset.units) || null;
      await post("restock", { sku: b.dataset.sku, region: b.dataset.region, channel: b.dataset.channel, units });
      toast(`Restocked ${productName(b.dataset.sku)} in ${regionName(b.dataset.region)} ${channelName(b.dataset.channel)}${units ? ` with ${units} units` : ""}. Risk updates next period.`);
    });
  });
  $("btn-bad").onclick = (e) => run(e.target, async () => {
    const r = await post("bad-record", {});
    toast(r.accepted ? r.message : `${r.message}: ${r.detail || ""}`, r.accepted ? "err" : "ok");
  });
}

async function pollDatagen() {
  try {
    const d = await (await fetch("/api/datagen")).json();
    if (!d.producer) { $("kpi-events").textContent = "-"; $("kpi-rejected").textContent = "data generator not reachable"; return; }
    const total = Object.values(d.producer.sent || {}).reduce((a, b) => a + b, 0);
    const rejected = Object.values(d.producer.rejected_by_data_contract || {}).reduce((a, b) => a + b, 0);
    $("kpi-events").textContent = total.toLocaleString();
    $("kpi-rejected").textContent = `${rejected} rejected by data contracts`;
  } catch (_) { /* ignore */ }
}

init();
