/* Browser stand-in for the dashboard API, so the same UI runs on a static page. */
(function () {
  const products = [
    { sku: "RUN-AIRSTRIDE-01", name: "AirStride Runner", category: "Running", price: 140, hero_launch: false, base: 8 },
    { sku: "LIFE-RETRO-HI", name: "Retro Court High \"Volt\"", category: "Lifestyle", price: 180, hero_launch: true, base: 5 },
    { sku: "TRAIN-FLEX-TEE", name: "FlexDry Training Tee", category: "Apparel", price: 35, hero_launch: false, base: 14 },
    { sku: "BBALL-ELEVATE-7", name: "Elevate 7 Basketball Shoe", category: "Basketball", price: 160, hero_launch: false, base: 6 },
    { sku: "OUT-TRAIL-JKT", name: "Trailhead Shell Jacket", category: "Outdoor", price: 120, hero_launch: false, base: 5 },
    { sku: "ACC-PRO-SOCK-3P", name: "Pro Cushion Socks 3-Pack", category: "Accessories", price: 18, hero_launch: false, base: 16 }
  ];
  const regions = [
    { id: "NA-EAST", name: "North America East" },
    { id: "NA-WEST", name: "North America West" },
    { id: "EMEA", name: "Europe" }
  ];
  const channels = { ONLINE: { name: "Web & App" }, STORE: { name: "Stores" } };
  const profile = {
    brand: {
      name: "Stride Athletics",
      vertical: "Footwear & Apparel",
      tagline: "Real-time demand sensing for product drops and promotions",
      primary_color: "#111111",
      accent_color: "#FA5400"
    },
    period: { seconds: 10, label: "hour", periods_per_day: 24 },
    products: products.map(p => ({ sku: p.sku, name: p.name, category: p.category, hero_launch: p.hero_launch })),
    regions,
    channels,
    launch: { label: "Product drop" },
    promo: { label: "Flash promo", default_periods: 12 },
    lead_time_periods: 8,
    peak_event: {
      label: "Black Friday demo",
      name: "Black Friday rush: North America East",
      sku: "LIFE-RETRO-HI",
      surge_region: "NA-EAST",
      surplus_region: "NA-WEST",
      multiplier: 5
    },
    prices: Object.fromEntries(products.map(p => [p.sku, p.price])),
    forecast_topic: "demand.forecast"
  };

  const now = Date.now();
  const period = 10000;
  let version = 1;
  let agentOn = true;
  let requireApproval = true;
  let events = 4835587;
  let rejected = 0;
  let scenario = {
    name: "Black Friday rush: North America East",
    sku: "LIFE-RETRO-HI",
    surge_region: "NA-EAST",
    surplus_region: "NA-WEST",
    multiplier: 5,
    promo_id: "peak-1",
    started_t: now - 12 * period
  };
  let promotions = [{
    promo_id: "peak-1", promo_type: "PEAK", name: "Black Friday rush: North America East",
    sku: "LIFE-RETRO-HI", region: "NA-EAST", discount_pct: 0,
    event_time: scenario.started_t, planned_end: now + 24 * period, status: "STARTED"
  }];

  const pending = {
    id: "rec-wait-1",
    t: now - 60000,
    kind: "STOCKOUT",
    action: "TRANSFER",
    status: "PENDING",
    sku: "BBALL-ELEVATE-7",
    product: "Elevate 7 Basketball Shoe",
    channel: "STORE",
    from_region: "NA-WEST",
    to_region: "NA-EAST",
    units: 37,
    max_units: 34,
    rate: 6,
    dest_on_hand: 21,
    price: 160,
    detected: "North America East Stores is selling 6 units/hour (3.0x its normal 2/hour) with 21 on hand: sells out in 3.5 hours. A supplier order takes 8 hours, too late.",
    found: "North America West Stores has 106 units, 35 hours of cover. It keeps 24 hours for its own shoppers, so 34 are spare.",
    proposal_text: "Move 37 units from North America West Stores to North America East Stores, arriving in 1 hour. That lifts North America East to about 10 hours of cover."
  };
  const history = [{
    id: "rec-w-1",
    t: now - 120000,
    decided_t: now - 90000,
    kind: "OVERSTOCK",
    action: "TRANSFER",
    status: "WITHDRAWN",
    sku: "OUT-TRAIL-JKT",
    product: "Trailhead Shell Jacket",
    channel: "STORE",
    from_region: "EMEA",
    to_region: "NA-EAST",
    units: 78,
    max_units: 80,
    rate: 1.4,
    dest_on_hand: 40,
    price: 120,
    detected: "Europe Stores holds 142 units but typically sells 1.4/hour: 101 hours of stock.",
    found: "North America East Stores sells faster, so the extra units would sell there.",
    proposal_text: "Move 78 units from Europe Stores to North America East Stores.",
    result: "Stock or demand changed, so the agent withdrew it. Nothing was moved."
  }];

  function riskRows() {
    const rows = [];
    products.forEach(p => {
      regions.forEach(region => {
        Object.keys(channels).forEach(channel => {
          let onHand = 90 + ((p.name.length * 13 + region.id.length * 7) % 180);
          let rate = Math.max(1, p.base * (channel === "STORE" ? 0.6 : 1));
          if (scenario && p.sku === scenario.sku && region.id === scenario.surge_region) {
            onHand = channel === "STORE" ? 36 : 94;
            rate = channel === "STORE" ? 19 : 8;
          }
          if (scenario && p.sku === scenario.sku && region.id === scenario.surplus_region) {
            onHand = channel === "STORE" ? 133 : 210;
            rate = 8;
          }
          if (p.sku === "LIFE-RETRO-HI" && region.id === "EMEA" && channel === "STORE") {
            onHand = 12; rate = 3;
          }
          if (p.sku === "BBALL-ELEVATE-7" && region.id === "NA-EAST" && channel === "STORE") {
            onHand = 21; rate = 6;
          }
          if (p.sku === "OUT-TRAIL-JKT" && region.id === "EMEA" && channel === "STORE") {
            onHand = 142; rate = 1.4;
          }
          const cover = rate > 0 ? onHand / rate : 40;
          const level = onHand <= 0 ? "OUT_OF_STOCK" : cover > 120 ? "OVERSTOCK" : cover < 6 ? "HIGH" : cover < 12 ? "MEDIUM" : "LOW";
          rows.push({
            sku: p.sku, region: region.id, channel, risk_level: level,
            on_hand: onHand, on_order: p.sku === "LIFE-RETRO-HI" && region.id === "EMEA" ? 65 : 0,
            periods_of_cover: Math.round(cover * 10) / 10,
            suggested_replenishment_units: level === "HIGH" ? Math.max(0, Math.ceil(8 * rate - onHand)) : 0,
            forecast_next: rate, units_sold: rate, window_time: Date.now()
          });
        });
      });
    });
    return rows;
  }

  function series(sku) {
    const product = products.find(p => p.sku === sku) || products[0];
    const points = [];
    for (let i = 48; i >= 1; i--) {
      const t = Date.now() - i * period;
      const hour = new Date(t).getHours();
      const wave = 0.6 + 0.8 * Math.max(0, Math.sin((hour - 6) / 5));
      let actual = Math.max(1, Math.round(product.base * 3 * wave));
      let pred = Math.max(1, Math.round(actual * 0.92));
      if (scenario && sku === scenario.sku && i < 8) actual = Math.round(actual * scenario.multiplier);
      points.push({
        t, actual, pred, lower: Math.round(pred * 0.7), upper: Math.round(pred * 1.35),
        promo: !!(scenario && sku === scenario.sku && i < 10),
        views: actual * 4, sold_out: 0, locations: 6
      });
    }
    const last = points[points.length - 1];
    return {
      points,
      next: { t: Date.now() + period, forecast: last.pred + 1, lower: last.lower, upper: last.upper, horizon: (last.pred + 1) * 6 },
      wape: 0.49,
      coverage: 0.8,
      series_count: 6
    };
  }

  function recommendations() {
    return [{ ...pending, status: "PENDING" }, ...history];
  }

  function snapshot(sku) {
    return {
      version,
      model: "hosted demo",
      series: series(sku || "LIFE-RETRO-HI"),
      risk: riskRows(),
      anomalies: [],
      explanations: [],
      promotions: promotions.filter(p => p.status === "STARTED"),
      promo_periods: promotions.map(p => ({
        promo_id: p.promo_id, promo_type: p.promo_type, name: p.name, sku: p.sku, region: p.region,
        discount_pct: p.discount_pct, start_t: p.event_time, end_t: p.status === "STARTED" ? null : Date.now(),
        planned_end: p.planned_end
      })),
      counts: { sales: events },
      agent: {
        enabled: agentOn,
        enabled_at: now,
        require_approval: requireApproval,
        pending: recommendations().filter(r => r.status === "PENDING"),
        recommendations: recommendations(),
        monitored: 36,
        decisions: [],
        in_transit: [],
        stats: { transfers: 0, units_moved: 0, value_moved: 0, ticks: 12, checks: 36 },
        policy: { trigger_cover: 6, target_cover: 10, donor_keep_cover: 8, transit_periods: 1, supplier_lead_time: 8 }
      },
      scenario: scenario
    };
  }

  const streams = new Set();
  function publish() {
    version += 1;
    streams.forEach(es => {
      if (typeof es.onmessage === "function") es.onmessage({ data: JSON.stringify(snapshot(es.sku)) });
    });
  }

  class HostedStream {
    constructor(url) {
      const q = new URL(url, location.origin).searchParams;
      this.sku = q.get("sku") || "LIFE-RETRO-HI";
      streams.add(this);
      setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(snapshot(this.sku)) }), 20);
    }
    close() { streams.delete(this); }
  }
  window.EventSource = HostedStream;

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts) {
    const path = String(url);
    if (!path.startsWith("/api/")) return realFetch(url, opts);
    let body = {};
    if (path === "/api/profile") body = profile;
    else if (path.startsWith("/api/datagen")) body = { producer: { sent: { simulated: events }, rejected_by_data_contract: rejected ? { bad: rejected } : {} } };
    else if (path.startsWith("/api/agent/approval/")) {
      requireApproval = path.endsWith("/on");
      body = { require_approval: requireApproval };
      publish();
    } else if (path.startsWith("/api/agent/proposals/")) {
      const parts = path.split("/");
      const id = parts[4];
      const decision = parts[5];
      const rec = pending.id === id ? pending : history.find(r => r.id === id);
      if (rec) {
        rec.status = decision === "approve" ? "APPROVED" : "REJECTED";
        rec.decided_t = Date.now();
        rec.decided_by = "planner";
        rec.result = decision === "approve" ? "Transfer sent to the warehouse." : "Left in place.";
        if (rec === pending) history.unshift({ ...rec });
      }
      body = { decision: { headline: rec ? rec.title || rec.product : "Updated" } };
      publish();
    } else if (path.startsWith("/api/agent/")) {
      agentOn = path.endsWith("/on");
      body = { enabled: agentOn };
      publish();
    } else if (path.startsWith("/api/demo/peak")) {
      scenario = {
        name: profile.peak_event.name,
        sku: profile.peak_event.sku,
        surge_region: profile.peak_event.surge_region,
        surplus_region: profile.peak_event.surplus_region,
        multiplier: profile.peak_event.multiplier,
        promo_id: "peak-1",
        started_t: Date.now()
      };
      promotions = [{
        promo_id: "peak-1", promo_type: "PEAK", name: scenario.name, sku: scenario.sku, region: scenario.surge_region,
        discount_pct: 0, event_time: scenario.started_t, planned_end: Date.now() + 36 * period, status: "STARTED"
      }];
      agentOn = !path.includes("agent_on=false");
      body = { scenario, agent: agentOn };
      publish();
    } else if (path.startsWith("/api/demo/stop")) {
      scenario = null;
      promotions = [];
      body = { scenario: null };
      publish();
    } else if (path.startsWith("/api/trigger/bad-record")) {
      rejected += 1;
      body = { accepted: false, message: "Rejected by Schema Registry data contract rule", detail: "missing sku" };
      publish();
    } else if (path.startsWith("/api/trigger/restock")) {
      body = { restocked: 1 };
      publish();
    } else if (path.startsWith("/api/trigger/")) {
      const name = path.includes("launch") ? "Product drop" : "Flash promo 25% off";
      const id = "promo-" + Date.now();
      promotions.push({
        promo_id: id, promo_type: path.includes("launch") ? "LAUNCH" : "PROMO", name,
        sku: profile.products[1].sku, region: null, discount_pct: 0.25,
        event_time: Date.now(), planned_end: Date.now() + 12 * period, status: "STARTED"
      });
      body = { name, promo_id: id, accepted: true, ended: true };
      publish();
    } else if (path.startsWith("/api/snapshot")) {
      const q = new URL(path, location.origin).searchParams;
      body = snapshot(q.get("sku"));
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
})();
