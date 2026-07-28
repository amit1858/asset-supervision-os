# Asset Supervision OS — Demo Story: The K-201 Vertical Slice

> **All data in this demonstration is synthetic demonstration data.** K-201, its signals, work orders, losses, and financials are fabricated for illustration. No real, proprietary, or confidential data is used.

---

## The Hero Asset

**K-201 — Hydrogen Recycle Compressor** (rotating equipment) in a synthetic refinery hydrotreating unit.

- **Type:** Centrifugal recycle compressor (critical rotating equipment)
- **Criticality:** High — a K-201 trip forces a unit rate cut or shutdown
- **Why it's the hero:** Rotating equipment deteriorates on an observable curve (vibration, bearing temperature), the failure is expensive, and the decision — *fix now or fold into the turnaround* — is exactly the kind of evidence-backed, human-authorized call the platform is built for.

This is the **first vertical slice**: one asset, walked end to end through all four modules and all five views.

---

## The 9-Step Flow

Each step notes the **view** it happens in and labels each fact as **[Deterministic]**, **[Model-inferred]**, or **[Human decision]**.

### Step 1 — Signals deteriorate over ~90 days
**View:** Asset 360 (condition history)
- Over roughly 90 days, K-201's vibration and bearing-temperature signals drift upward from baseline. **[Deterministic]** — this is recorded synthetic time-series data.
- Early in the window the values are still within alarm limits, but the *trend* is unmistakable.

### Step 2 — Deterministic condition engine detects deterioration
**View:** Asset 360
- The condition engine flags K-201 using two independent criteria: a **threshold breach** (a signal crossing its configured limit) and a **deterioration slope** (rate-of-change exceeding a configured limit over the rolling window). **[Deterministic]**
- The detection fires on slope *before* the hard threshold is fully breached — the platform catches the degradation early.

### Step 3 — Risk connected to recent downtime and production losses
**View:** Asset 360 → OEE Loss Intelligence
- The K-201 risk is correlated with recent short-duration downtime events and rate reductions on the hydrotreating unit. **[Deterministic]** — the linkage is drawn from recorded downtime and production data, not inferred.

### Step 4 — OEE impact and financial exposure calculated
**View:** OEE Loss Intelligence
- Availability, Performance, and Quality impacts attributable to K-201 are computed and placed in the OEE loss tree. **[Deterministic]**
- Lost production is converted to **financial exposure** using explicit, auditable rates. **[Deterministic]**

### Step 5 — Work orders, inspections, and spares checked
**View:** Asset 360
- The platform surfaces open and historical **work orders**, prior **inspection history**, and current **spare-part availability** (e.g., seals, bearings) for K-201. **[Deterministic]**
- This determines whether an immediate repair is even feasible with parts on hand.

### Step 6 — Immediate action vs. turnaround decision
**View:** Asset 360 → Turnaround Control Tower
- Using deterioration slope, projected time-to-action, spare availability, and the next turnaround window, the platform proposes whether to **handle immediately** or **add K-201 to an upcoming turnaround** work package. **[Deterministic]** framing / **[Model-inferred]** recommendation narrative.
- If routed to the turnaround, it appears as a candidate work package in Turnaround OS with readiness dimensions attached.

### Step 7 — AI explanation grounded only in supplied evidence
**View:** Asset 360 (and OEE Loss Intelligence)
- An AI-generated explanation summarizes the situation — the deterioration, the OEE and financial impact, the spares position, and the recommended path — **using ONLY the evidence supplied to it.** **[Model-inferred]**, explicitly labeled, with the underlying evidence shown alongside.
- The model narrates the numbers; it does not create them.

### Step 8 — Human approves, rejects, or modifies
**View:** Asset 360
- An accountable engineer or planner **approves, rejects, or modifies** the recommendation. **[Human decision]**
- Nothing becomes an action without this step. The decision and its rationale are recorded.

### Step 9 — Outcome and Return on Token Spend recorded
**View:** AI Value & Token Economics
- The interaction is written to ROTS: provider, model, use case, input/output tokens, estimated model cost, latency, the recommendation, the evidence used, the acceptance/rejection, the action taken, the **estimated value**, and — later — the **realised value** with its **value status (projected / validated / realised)**. **[Deterministic]** capture of **[Human decision]** and **[Model-inferred]** artifacts.
- Projected value is shown as projected. It is never presented as realised.

---

## Presenter Script

Start at the **Operations Command Center** and move outward. Synthetic data throughout.

1. **Operations Command Center** — Open here. Point to current operational and financial exposure and the top asset risks. K-201 is at the top of the risk list. Say: *"One pane of glass. Let's follow the highest risk."* Click **K-201**.
2. **Asset 360** — Show the ~90-day vibration and bearing-temperature trend (Step 1). Point out the condition engine's flag and that it fired on **slope**, not just a threshold (Step 2). Scroll to work orders, inspection history, and spares (Step 5).
3. **OEE Loss Intelligence** — Follow the link from the asset to production impact. Walk the loss tree and the financial exposure attributed to K-201 (Steps 3–4). Emphasize: *"Every number here is calculated."*
4. **Turnaround Control Tower** — Show the fix-now-vs-turnaround decision and, if deferred, K-201 appearing as a candidate work package with readiness dimensions (Step 6).
5. **Back to Asset 360** — Reveal the AI explanation with its evidence panel side by side (Step 7). Then perform the **human decision**: approve, reject, or modify (Step 8).
6. **AI Value & Token Economics** — Close on ROTS. Show the interaction just recorded, its token cost, and projected vs. realised value (Step 9).

---

## What to Emphasize

- **Evidence-backed.** Every recommendation is shown next to the specific evidence that produced it — nothing is asserted without proof.
- **Deterministic vs. AI.** The OEE numbers, financial exposure, and detection are *calculated*. The AI only *explains*, and it is always labeled as model-inferred.
- **Human authority.** The platform recommends; a named human approves, rejects, or modifies. No action happens without a person.
- **Return on Token Spend.** Every AI call is instrumented for cost and value, and **projected savings are never shown as realised savings.**
- **Synthetic data.** State clearly that K-201 and everything around it is synthetic demonstration data.
