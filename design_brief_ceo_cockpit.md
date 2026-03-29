# CEO Cockpit Design Brief (Redesign Reference)

This brief outlines the core components and data points currently present in the **CEO Cockpit** of the DISMA application. Use this as a reference for your redesign in Google Stitch.

## 1. Page Identity & Header
- **Title**: Executive Cockpit Review.
- **Tone**: "One screen, total control. Real-time business health summary."
- **Status Indicators**: "System Online" (Pulse effect) and Current Date.

## 2. Financial Position (Macro View)
Four key high-level metric cards:
- **Total Assets (Harta)**: Display current value + percentage growth comparison.
- **Total Liabilities (Hutang)**: Display current value + status badge (e.g., "MANAGED").
- **Total Equity (Modal)**: Representing owner's net worth.
- **Monthly Net Profit**: The "Hero" metric showing the bottom line + Profit Margin percentage.

## 3. Data Visualizations (Analytics Layer)
- **Growth Momentum Chart**: A dual-line area chart showing **Revenue vs Profit** trend over the current month (Weekly granularity).
- **OpEx Breakdown**: A radial/pie chart showing **Operational Expenses** categorized (e.g., Salaries, Rent, Logistics, Marketing).

## 4. Operational Health Radar
A tracking section showing the flow of business from "Hulu ke Hilir" (Upstream to Downstream):
- **Incoming**: New client request volume.
- **Procurement**: Active sourcing/shopping tasks.
- **Warehouse**: Items currently in packing/QC.
- **Completed**: Total delivered orders.

## 5. Executive Priority Watchlist
Focused monitoring for crucial accounting heads that require CEO attention:
- **Accounts Receivable (AR)**: Total money owed by clients (with "High AR" alerts).
- **Accounts Payable (AP)**: Total money owed to suppliers.
- **Inventory Value**: Total capital tied up in stock.
- **Liquid Cash**: Current balance in Kas & Bank (with "Low Cash" alerts).

## 6. Strategic Pipeline
- **Market Coverage**: A summary of B2B Leads currenty in the pipeline.
- **CRM Integration**: Quick action button to jump into the CRM/Sales portal.

## 7. Leadership Control (Broadcast Center)
- **Broadcast Hub**: An interactive tool for the CEO to type a message and push it as a real-time banner to every active employee's dashboard.
- **Controls**: "Broadcast Now" (Green/Indigo) and "Stop Announcement" (Red/Ghost).

---

### Suggested AI Prompt for Stitch:
> "Design a high-fidelity 'Executive Cockpit' dashboard for a supply chain and B2B trading CEO. Use a 'Liquid Glass' aesthetic with ultra-rounded corners (32px+), emerald green accents, and a dark/light mode toggle.
> The layout should feature:
> 1. Four hero metric cards for Assets, Liabilities, Equity, and Net Profit.
> 2. A large central Area Chart for Revenue vs Profit trends and a side Pie Chart for OpEx breakdown.
> 3. An operational status radar tracking orders from Inbound to Delivery.
> 4. A 'Priority Accounts' grid for AR/AP and Cash visibility with alert icons.
> 5. A prominent 'CEO Broadcast Hub' with a large text input and a 'Push to Team' action button.
> Ensure the use of 3D-styled emojis as icons for a playful yet premium look."
