---
name: Rental hold ownership
description: Security boundary for temporary rental vehicle holds.
---

Temporary rental holds must be bound to the server-side browser session that created them. Hold reads and reservation conversion must require that same session, rather than trusting a numeric hold ID supplied by the client.

**Why:** Numeric hold IDs are guessable and, without an ownership check, another visitor could inspect or convert someone else's active hold.

**How to apply:** Preserve the current session binding whenever adding hold status, cancellation, extension, or reservation-conversion behavior. Keep public hold responses free of session or internal reservation identifiers.