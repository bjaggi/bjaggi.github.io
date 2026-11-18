# Demo Script: Real-Time Demand & Inventory Management for Launches and Promotions

Length: 15-20 minutes. Audience: merchandising, supply chain, or data platform leaders,
plus their architects.

## Pre-flight checklist (do this 30 minutes before)

- [ ] `make up` has completed, and all statements show **Running** in Confluent Cloud >
      Flink > Statements.
- [ ] `make gen` (with the right `PROFILE`) has been running for at least 5 minutes, so
      forecasts are warm and the chart has history.
- [ ] `make explainer` shows `watsonx model ...`, not template mode. If watsonx is not
      available, say that the explanation step is pluggable.
- [ ] `make dashboard` is open at http://localhost:8000, with the hero product selected.
- [ ] Browser tabs open: the dashboard, the Flink SQL workspace (catalog = environment,
      database = cluster), Stream Lineage, and the Schema Registry `orders-value` subject.
- [ ] `BRAND_NAME` and `BRAND_COLOR` are set for this customer, or you are using a neutral
      profile.
- [ ] Optional: Tableflow has been on for 15+ minutes, so `make analytics` returns data.

## 1. The pain (2 minutes)

> "Most retailers forecast demand in a nightly or weekly batch. That works for steady
> sellers. It breaks exactly when it matters most: a product drop, a promotion, or a
> heatwave. By the time tomorrow's forecast lands, the hero SKU is sold out in one region
> and sitting in a warehouse in another. Today I'll show forecasts that update every few
> seconds, from the same events your apps and stores already produce."

Ask: *"How are forecasts for launches and promos produced today, and how often are they
refreshed?"*

## 2. The data streams in (3 minutes)

Dashboard: point to **Events streamed** and the chart's daily rhythm.

Flink workspace: run queries 1 and 2 from `flink/99_presenter_queries.sql`.

- Orders from the app and web, POS from stores, clickstream and cart events, inventory
  snapshots: all in Kafka, all governed.
- One view (`demand_signals`) unifies them, and a `TUMBLE` window rolls them up per SKU,
  region and channel. Explain the time compression: one period is 10 seconds, which
  represents one simulated hour.

Governance moment: click **Send bad record** on the dashboard. The toast shows that
Schema Registry's data contract rule (`units > 0`) rejected the record before it reached
Kafka. Show the `orders-value` subject: the rules, plus the `PII` tag on `customer_id`.

## 3. Forecasting in SQL (4 minutes)

Open `flink/03_demand_forecast.sql`.

> "This is the forecasting model. It's one SQL function, `ML_FORECAST`, running as an
> `OVER` window partitioned by SKU, region and channel. It retrains continuously and
> returns the next 6 periods with confidence bounds. There's no separate ML platform to
> run and no batch job to schedule."

Run query 3. On the dashboard, show the dashed orange forecast line tracking the black
units-sold line, then the **WAPE** and **band coverage** tiles. Tick **Show expected range**
to reveal the model's low-to-high band (it's off by default to keep the chart simple).
Coloured bars above the chart name whatever was running: "Promo 20% off", "Product drop",
or a sales event such as "Black Friday rush" (a big shopping day with far more buyers than
usual).

If AI_FORECAST is enabled: *"The same pipeline can call `AI_FORECAST`, a time-series
foundation model hosted by Confluent. IBM Granite TTM is the default. You switch with
one line of SQL."*

## 4. The launch (5 minutes): the main moment

Make sure the hero SKU is selected, with all regions and all channels.

Click **Trigger product drop** (or **Trigger demand surge** for grocery).

Within 1-2 periods (10-20 seconds):

1. Actual demand breaks far above the expected range. Flink's `ML_DETECT_ANOMALIES`
   flags these periods in the `demand_anomalies` topic (show it in the Confluent Cloud UI).
2. The forecast line bends upward on the next periods. The model adapts in seconds,
   not overnight.
3. The **inventory line** under the chart flips to RESTOCK NOW or OUT OF STOCK, and the
   **Restock needed** panel lists each location with the reason (on hand vs the 6-hour
   forecast, hours until sell-out, stock already on order, and which promo or launch is
   driving demand). The **risk grid** turns red too. Hover a cell for the reason, or click
   it to drill into that region and channel.
4. watsonx.ai Granite writes a plain-English explanation of each forecast shift (what
   changed, the likely driver and a recommended action) to the `forecast_explanations`
   topic. Open that topic in the Confluent Cloud UI to show the messages.

Hover or click any point on the chart. The **Why did it move?** panel under it explains
why actual sales and the forecast rose or fell in that period. Possible reasons are a promo
or launch starting or ending, a stock-out capping sales, the daily shopping pattern learned
from history, and online traffic. It also shows that the forecast follows the latest sales,
which is why it lags a sudden spike by a period or two.

> "Your planners didn't open a spreadsheet. The system saw the spike, re-forecast,
> checked inventory, and told the merchandiser what to do, all within a minute."

Then click **Start flash promo** on a slower SKU to show promo lift. The banner above the
chart reads PROMO ON (blue) or LAUNCH ON (yellow), and the chart shades exactly the periods
each one ran. While a promo runs, the same button turns blue and reads
**■ End promo · 11h left**, and the banner shows the exact end time. Click it (or **End now**
in the banner) to stop early. That sends a `promotions` ENDED event, its bar stops, and
demand falls back to baseline. Otherwise promos end on their own after 12 simulated hours
(about 2 real minutes). Each `promotions` STARTED event carries its `planned_end`.

For a stock-out story, run the flash promo on **Volt** instead. It's a hyped product stocked
lean: 25% off roughly doubles demand, so within half a simulated day several Volt locations
turn to Restock now and the first stores sell out. Overstock is measured against typical
sales over the last simulated day, so a quiet night doesn't flag every location. Click **Restock** on a row
in the Restock needed panel to order the suggested units and watch the risk clear.

Ask: *"Which decisions would benefit most from forecasts updated within minutes:
replenishment, allocation across DCs and stores, pricing, or marketing spend? Which
systems would need to consume them?"*

Integration angle: `demand_forecast`, `stockout_risk` and `forecast_explanations` are
Kafka topics. Replenishment, allocation, pricing systems, or IBM Sterling order
management can subscribe to them directly.

## 4b. Black Friday: AI agents manage inventory round the clock (4 minutes)

Click **Black Friday demo** (grocery: **Thanksgiving demo**). In one step it:

- sets "Volt" stock in North America West to plenty (about 1,400 units) and North America
  East to a normal level;
- starts a sustained 5x **Black Friday rush** in North America East (a PEAK event on the
  `promotions` topic);
- switches the **AI inventory agent** on and points the dashboard at North America East.

The story panel at the top walks through four steps as they actually happen, usually
within 20-30 seconds:

1. **Rush begins.** East sells about 5x faster than normal.
2. **Agent spots the risk.** It reads `stockout_risk` (forecast joined with inventory in
   Flink) plus the latest sales rate, and sees East will sell out in a few hours. A supplier
   restock takes 8 hours, which is too late.
3. **Agent asks for your approval.** It finds spare units in North America West (West keeps
   24 hours of cover for its own shoppers) and a recommendation appears at the top of the
   **AI Recommendations** panel on the right: what it detected, what it found, and the
   proposed transfer. You can change the units, then click **Approve** or **Reject**.
   Nothing moves until a human approves.
4. **Stock-out avoided.** The transfer arrives in 1 hour and East stays in stock. The panel
   shows the value of sales protected.

### Human approval

Approval is on by default (**Human approval: required** at the top of the AI
Recommendations panel). The panel is the full trail: every recommendation the agent made
and what happened to it. Waiting ones sit at the top with **Approve** / **Reject**, and a toast
announces each new one. Resolved ones show who decided and when, newest first:

- **Approved**: executed, logged as "Approved by planner".
- **Auto**: executed by the agent itself in autonomous mode.
- **Rejected**: nothing moved; the agent won't propose the same thing again for 6 hours.
- **Withdrawn**: stock or demand recovered before anyone decided, so the agent dropped it.

Filter the trail by status (All, Waiting, Approved, Auto, Rejected, Withdrawn) and by type
(Stock-out, Overstock). Expand **Why the agent recommends this** on any card for the
reasoning. While your mouse is over the list it doesn't reshuffle, so you never click a card
that just moved under your cursor. Click the toggle to switch to **autonomous** mode:
anything waiting is auto-approved and the agent acts on its own from then on.

> "The agent does the analysis in seconds, but the planner stays in control. One click to
> approve, and every decision, including rejections, is on the record."

### Overstock prompts

The agent also flags the opposite problem: a location holding more than 120 hours of its
typical sales. It proposes one of two fixes:

- **Move the excess** to the region of the same channel that has the least cover, if that
  region would sell it faster (under 48 hours of cover); or
- **A 20% markdown** in that region for 8 hours, if no other region needs it. Approving starts
  a normal promo, visible on the chart and endable from the promo banner.

There's at most one overstock request per product and two waiting at a time, so stock-out
prompts don't get buried.

The East vs West tiles and the moving "units in transit" bar make the rebalancing visible.
The **AI inventory agent** card lists every decision with what it detected, what it found
and what it did. It keeps working for every product and location, 24/7, not just Volt.

> "The agent saw the rush in the live data, checked every other region, and had a transfer
> ready for approval hours before the shelves went empty. Overnight you can let it run
> autonomously.
> Every move is an event on Kafka, so it's auditable and other systems can react."

Point to the `inventory_updates` topic in the Confluent Cloud UI: transfers appear as
TRANSFER_OUT, TRANSFER_IN_TRANSIT and TRANSFER_IN events.

While the rush runs, the orange button reads **■ Stop Black Friday rush · 33h left**. It
ends on its own after 36 simulated hours (about 6 real minutes); click it to stop sooner.

To show the contrast, click **Stop demo**, switch **AI agent: OFF**, then click the demo
button again. It keeps the agent off, and East runs out while West sits on spare stock. **Stop demo** ends the rush; the agent keeps running
until you switch it off.

## 5. History for analytics and retraining (3 minutes)

Show Tableflow on `demand_windowed`, `demand_forecast` and `stockout_risk`: Iceberg
tables with no ETL pipeline. Run:

```bash
make analytics
```

Walk through:

- Forecast accuracy (MAPE, WAPE, band coverage) per SKU-region-channel. This is the
  success metric from the discovery questions.
- **Streaming vs stale batch baseline**: compares the rolling forecast with "same hour
  yesterday", which is what a daily batch effectively gives you. The biggest gains show
  up on launch and promo SKUs, and steady sellers can be close to even. Be honest about
  that; it's the point of the demo.
- Promo lift per SKU, and stockout and overstock exposure.
- The exported `training_set.parquet`, which data science can use to train richer
  models in Spark, Snowflake, Databricks or watsonx.

Finally, open Stream Lineage to show the full flow from source topics to forecasts and
explanations.

## 6. Close (1 minute)

> "More accurate, fresher forecasts reduce stockouts on high-demand releases and cut the
> overstock that drives markdowns. That protects both revenue and margin. And all of it
> is SQL on data you already have in motion."

Metrics to agree on for a pilot:

- Forecast accuracy improvement (MAPE or WAPE) versus the current batch baseline, at
  SKU-region level.
- Reduction in stockout rate and in excess inventory or markdown cost on launch and
  promotional products.

## Resetting between demos

- Restart `make gen`. It rebuilds inventory and backfills fresh history. The Flink
  statements keep running, and old windows simply age out of the chart.
- For a completely clean slate, run `make down` and then `make up`.

## Re-skinning checklist

| Customer type | Profile | Hero moment |
| --- | --- | --- |
| Footwear, apparel, consumer electronics | `apparel_drops` | Product drop on the hero SKU |
| Grocery, convenience, pharmacy | `grocery` | Demand surge (heatwave) on ice cream, then the weekly circular promo |
| Anything else | Copy the closer profile | Rename products, regions and channel names (for example, Marketplace and Wholesale) |

Set `BRAND_NAME` and `BRAND_COLOR` in `.env.local`, then restart the dashboard.
