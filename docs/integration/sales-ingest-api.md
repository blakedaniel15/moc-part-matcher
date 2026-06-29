# Service Data Ingest API

**For the Easy Wins dev team.** Push each store's service data — repair-order
operation lines and the parts under them — to one authenticated endpoint. One
feed, one database; it powers **both** the parts matcher and the op-code
identifier. Your side is a single HTTPS POST of data you already export.

> **Status:** this is the **target contract (v2)**. The live endpoint is being
> updated from the previous flat shape to this nested one — **don't integrate yet**;
> we'll confirm when it's live (the health/dry-run endpoints will report v2).

---

## The shape: one hierarchy, two grains

A repair order is **op lines (the jobs) → parts (under each job)**. Send it nested,
so each fact is sent once at its own level — labor/hours per op line, SKU/qty per
part. (A flat one-row-per-part export duplicates labor across parts; nesting avoids
that entirely.)

- **Op-code identifier** reads the **op lines** (op code + description + labor + hours).
- **Parts matcher** reads the **parts** (SKU + name), with the op description for context.

---

## Endpoint

```
POST https://parts.ez-wins.com/api/v1/sales
```

### Headers

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | ✅ | `Bearer <API_KEY>` — the key we share with you (in your secrets). |
| `Content-Type` | ✅ | `application/json` |
| `Idempotency-Key` | recommended | Unique per batch (e.g. `"<storeId>-<weekStart>"`). Re-sending the same key returns the original result — safe retries. |

---

## Request body

One request = **one store, one period**. `opLines` is one object per RO operation
line; each carries its **own** parts.

```jsonc
{
  "store":  { "id": "STORE-1234", "name": "Toyota of Gallatin" }, // id REQUIRED; name optional
  "period": { "start": "2026-05-16", "end": "2026-06-16" },       // REQUIRED, ISO YYYY-MM-DD

  "opLines": [                          // REQUIRED — non-empty
    {
      "ro":            "50863",         // REQUIRED — repair order number  ┐ together these
      "line":          "1",            // REQUIRED — operations line number ┘ uniquely key the op line
      "opCode":        "10KSYN",       // REQUIRED — the service op code
      "opDescription": "12 Months/10,000 Mile Service (ToyotaCare)", // strongly recommended — primary signal
      "correction":    "Performed 10k service; rotated tires", // optional — tech correction text (extra signal)
      "payType":       "WM",           // optional — CWI / pay-coverage (warranty / internal / customer)
      "laborSale":     66.53,          // optional — number
      "techHours":     0.50,           // optional — number
      "saleDate":      "2026-05-18",   // optional — RO close date, ISO YYYY-MM-DD

      "parts": [                       // optional — 0..n parts under THIS op line
        {
          "dealerSku": "04152-YZZA1",  // REQUIRED (per part) — the part SKU
          "partName":  "OIL FILTER",   // recommended — part description
          "qty":       1,              // optional — number
          "sale":      9.50,           // optional — number
          "cost":      6.20            // optional — number
        }
      ]
    }
  ]
}
```

### Field rules

- **Required:** `store.id`, `period.start`, `period.end`, and for every op line
  `ro` + `line` + `opCode`. Each part needs a `dealerSku`.
- `opDescription` and `partName` are the matching signals — **send them whenever
  available.**
- An op line with no parts is fine (`"parts": []` or omitted).
- Everything else is optional — send what you have.
- Dates are `YYYY-MM-DD`. Up to **~5,000 op lines per request** (with their parts);
  split a larger backfill into multiple requests.

### What we intentionally don't need (keep it lean)

VIN, make, model, year, mileage, customer #, advisor, tech name/#, service name,
complaint/cause, all contract / misc / discount / claim / insurance fields,
extended cost/sale. Don't send them.

---

## Response

**`200 OK`**
```jsonc
{
  "ok": true,
  "batchId": "c27527e4-…",
  "opLines": 320,        // op lines received
  "parts": 1180,         // parts received
  "newParts": 7          // parts not yet set up — what our team reviews
  // (a newOpCodes count is added when the op-code identifier ships)
}
```
A repeat with the same `Idempotency-Key` returns the same body plus `"idempotent": true`.

**Errors:** `401` bad key · `400` validation (body names the field) · `500`
server error (safe to retry with the same `Idempotency-Key`).

---

## Working example

```bash
curl -X POST https://parts.ez-wins.com/api/v1/sales \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Idempotency-Key: STORE-1234-2026-05-16" \
  -H "Content-Type: application/json" \
  -d '{
    "store":  { "id": "STORE-1234", "name": "Toyota of Gallatin" },
    "period": { "start": "2026-05-16", "end": "2026-06-16" },
    "opLines": [
      { "ro": "50863", "line": "1", "opCode": "10KSYN",
        "opDescription": "12 Months/10,000 Mile Service", "payType": "WM",
        "laborSale": 66.53, "techHours": 0.50, "saleDate": "2026-05-18",
        "parts": [ { "dealerSku": "04152-YZZA1", "partName": "OIL FILTER", "qty": 1, "sale": 9.50, "cost": 6.20 } ] }
    ]
  }'
```

---

## Testing (no data created)

- **Health / auth / schema:** `GET /api/v1/health` with your `Authorization` header
  returns `200`, the contract, and `"auth": "ok"` — confirm reachability + your key
  + the field list. (It will report `version: v2`.)
- **Dry-run a real payload:** `POST /api/v1/sales?dryRun=1` validates auth + shape
  and returns the counts (`opLines`, `parts`) with **nothing stored, matched, or
  notified**. A bad payload returns the same `400` you'd get live. Drop `?dryRun=1`
  to go live.

---

## When to send (two triggers)

1. **First sync (onboarding).** Once, when a store's initial data sync finishes —
   establishes its baseline. Add `"initial": true` at the top level so the
   onboarding ticket reads "Initial setup".
2. **Weekly thereafter.** Each week's service data; we surface only the new parts
   (and, once it ships, new op codes).

For a large first sync, **dedup parts to distinct SKUs** and split into multiple
requests to stay under the per-request cap and the ~60s response window.

---

## What you need to build (the whole job)

1. A per-store job — **weekly**, plus a **one-time first-sync** — that selects the
   period's op lines and their parts and nests them (group parts under their op
   line by `RO + line`).
2. POST one request per store with an `Idempotency-Key`; on a non-2xx, retry with
   the **same** key.

The only field that's "new" vs your current exports: the **operations line number
on the parts** (your op-line export already has it; the parts/uplift export needs
it added) so parts attach to the right op line and labor isn't double-counted.

---

## Notes

- HTTPS only; the API key is the only credential. Rotated rarely.
- Cadence is yours; we don't schedule anything. Stagger the weekly send across
  stores rather than firing all at once; use a client timeout of ~60s.
- `payType` (CWI) is optional but useful — it tells a customer-pay menu service
  from a warranty/recall/internal line.
