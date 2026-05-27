Role: Senior Full-Stack Engineer & Database Architect
Task: Fix Data Logic Bugs and Implement C-Level Food Supply Chain Metrics in ERP Dashboard

Context:
I am developing an Executive Cockpit Dashboard for a Food Supply Chain business using Next.js/React and our database. The UI is already 9/10 (minimalist, clean, premium Apple-like aesthetic), but the backend data aggregation, SQL queries, and accounting logic are currently incorrect or incomplete due to placeholder logic.

Please refactor the component state, API endpoints, and database queries based on the following strict business and technical rules:

1. FIX DATA & ACCOUNTING LOGIC BUGS:
- Accounts Receivable (Piutang Usaha): Currently showing a negative value (Rp-632.421.723). In standard accounting, AR is an asset. Remove the negative sign. Ensure it calculates the positive sum of all unpaid/partially paid outbound invoices.
- OpEx Breakdown (Others Anomaly): Currently, the "Others" category accounts for ~95% of total expenses (Rp430M+ vs Salaries/Logistics which are low). Refactor the expense classification query. Group large recurring costs (like COGS/Inventory Purchase, Vendor Payments, or Rent) into their proper categories so "Others" only captures actual miscellaneous expenses (<10% of total OpEx).
- Operational Health Radar: Currently showing '0 Total' for Incoming, Procurement, Warehouse, and Completed. Fix the COUNT queries to fetch active, real-time transaction counts for the current day/week.
- Inventory Value: Currently showing Rp0. Update the calculation to multiply (Current Stock Quantity * Average Unit Purchase Price) from the warehouse database.

2. IMPLEMENT CRITICAL FOOD SUPPLY CHAIN METRICS (C-LEVEL VIEW):
Modify or expand the current metrics to include these two indicators without breaking the layout:
- Wastage & Spoilage Rate: Create a calculation for food items that expired, shrunk, or decayed. Formula: (Value of Damaged Goods / Total Inventory Value) * 100. Display this as a 'Risk Alert' or 'Loss Metric' in the watchlist or operational section.
- OTIF (On-Time In-Full) Rate: Calculate the percentage of orders delivered on time and with correct quantities. Formula: (Perfect Deliveries / Total Deliveries) * 100.

3. TECHNICAL IMPLEMENTATION RULES:
- DO NOT break the existing premium minimalist UI, padding, or layout. Only fix the data mapping, state management, and underlying query logic.
- Ensure all financial numbers are correctly formatted in IDR (Rp) using proper Indonesian locale formatting.
- Implement proper loading states and error boundaries so if a query returns 0 or null, it doesn't break the UI.
- Return the refactored code for the dashboard component and the corresponding data fetching logic/SQL queries.