---
name: Irreversible trip settlement
description: Preserve approved financial choices across the close-trip UI and immutable settlement boundary
---

For irreversible trip closure, the staff review must show the exact adjustments being approved and send those choices to the close transaction. A server capable of calculating adjustments does not make the workflow complete when its UI silently submits an empty adjustment payload. Treat uncollected extras and unpaid refunds as pending, not as cash already moved.

**Why:** A completion check caught a close screen that dropped customer-acknowledged charges and offered no refund input, even though the API supported both. Closing wrote an immutable receipt, preventing correction through the same workflow.

**How to apply:** For any close-time financial change, verify acknowledgment, staff selection, confirmation payload, stored ledger, and customer/operator presentation as one path. Check the preview against the saved payment terms, including refunds already processed.