# MOC Part Matcher — Sales Ingest API

**For the Easy Wins dev team.** Push each store's weekly parts-sales data to one
authenticated endpoint. We detect the new parts not yet set up, match them, and
notify our onboarding team. Your side is a single HTTPS POST of JSON you already
have — **~half a day of work.**

---

## Endpoint

```
POST https://parts.ez-wins.com/api/v1/sales
```

### Headers

| Header | Required | Value |
|--------|----------|-------|
| `Authorization` | ✅ | `Bearer <API_KEY>` — the key we share with you (kept in your secrets, not in code). |
| `Content-Type` | ✅ | `application/json` |
| `Idempotency-Key` | recommended | A unique string per weekly batch (e.g. a UUID, or `"<storeId>-<weekStart>"`). Re-sending the same key returns the original result instead of double-processing. Makes retries safe. |

---

## Request body

One request = **one store, one period**. `lines` is one object **per individual
sale** (the same SKU can appear many times across the week — that's expected; we
de-duplicate for matching and keep the raw lines).

```jsonc
{
  "store": {
    "id":      "STORE-1234",          // REQUIRED — your stable, unique store identifier
    "name":    "Modesto Toyota",      // optional — display name (used for our labels + the ClickUp ticket)
    "dmsType": "R&R"                  // optional — "R&R" | "CDK" (informational)
  },
  "period": {
    "start": "2026-06-16",            // REQUIRED — week start, ISO date YYYY-MM-DD (inclusive)
    "end":   "2026-06-22"             // REQUIRED — week end,   ISO date YYYY-MM-DD (inclusive)
  },

  "knownSkus": ["8888804461", "A01071"], // optional — SKUs already set up for this store (the
                                          // gap baseline). Omit for now; we'll confirm when to send it.
  "initial": true,                        // optional — true on a store's FIRST (onboarding) sync;
                                          // omit/false for weekly. Only changes the onboarding ticket wording.

  "lines": [                          // REQUIRED — non-empty, max 5000 per request
    {
      "dealerSku":      "FA2031",                 // REQUIRED — the DMS part SKU
      "skuDescription": "ELEMENT ASY - AIR CLE",  // optional — part name/description
      "opCode":         "BR01",                   // optional — service operation code
      "opDescription":  "BRAKE FLUSH SERVICE",    // optional — service operation description
      "vehicleMake":    "TOYOTA",                 // optional
      "quantitySold":   1,                        // optional — integer
      "saleDate":       "2026-06-18",             // optional — ISO date YYYY-MM-DD
      "cost":           12.34,                    // optional — number
      "sale":           24.99                     // optional — number
    }
    // … one object per sale
  ]
}
```

### Field rules

- **Required:** `store.id`, `period.start`, `period.end`, and every line's `dealerSku`.
- **Everything else is optional** — send what you have; missing fields are fine.
- Dates are `YYYY-MM-DD`. `dealerSku` and `skuDescription` are the most useful
  signals for matching — send those whenever available.
- **Max 5,000 lines per request.** At ~1,000 sales/store/week you're well under;
  if a store ever exceeds it, split into multiple requests (each with its own
  `Idempotency-Key`).

---

## Response

**`200 OK`**
```jsonc
{
  "ok": true,
  "batchId": "c27527e4-…",   // our id for this batch
  "received": 1000,          // raw lines stored
  "distinctSkus": 240,       // unique SKUs after de-dup
  "newParts": 7              // SKUs not yet set up — what our team will review
}
```
A repeat with the same `Idempotency-Key` returns the same body plus `"idempotent": true`.

**Errors**

| Status | Meaning |
|--------|---------|
| `401` | Missing/invalid `Authorization` key |
| `400` | Validation error (body tells you which field) — e.g. `{"error":"every line needs a dealerSku."}` |
| `500` | Server error — safe to retry with the same `Idempotency-Key` |

You don't need to act on `newParts` — it's just a confirmation. We handle review
and notify onboarding.

---

## Working example

```bash
curl -X POST https://parts.ez-wins.com/api/v1/sales \
  -H "Authorization: Bearer <API_KEY>" \
  -H "Idempotency-Key: STORE-1234-2026-06-16" \
  -H "Content-Type: application/json" \
  -d '{
    "store":  { "id": "STORE-1234", "name": "Modesto Toyota", "dmsType": "R&R" },
    "period": { "start": "2026-06-16", "end": "2026-06-22" },
    "lines": [
      { "dealerSku": "FA2031", "skuDescription": "ELEMENT ASY - AIR CLE",
        "opDescription": "BRAKE FLUSH SERVICE", "vehicleMake": "TOYOTA",
        "quantitySold": 1, "saleDate": "2026-06-18" }
    ]
  }'
```

Node (fetch):
```js
await fetch("https://parts.ez-wins.com/api/v1/sales", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.MOC_API_KEY}`,
    "Idempotency-Key": `${store.id}-${weekStart}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ store, period, lines }),
});
```

---

## Testing (no data created)

Two zero-side-effect ways to verify your integration before sending real data:

**1. Health + auth + schema** — `GET /api/v1/health` (no body):
```bash
curl https://parts.ez-wins.com/api/v1/health -H "Authorization: Bearer <API_KEY>"
```
Returns `200` with the contract and `"auth": "ok"` (or `"invalid"` / `"none"`), so
you can confirm reachability, your key, and the exact field list.

**2. Dry-run a real payload** — add `?dryRun=1` to the live endpoint:
```bash
curl -X POST "https://parts.ez-wins.com/api/v1/sales?dryRun=1" \
  -H "Authorization: Bearer <API_KEY>" -H "Content-Type: application/json" \
  -d '{ "store": { "id": "STORE-1234" }, "period": { "start": "2026-06-16", "end": "2026-06-22" },
        "lines": [ { "dealerSku": "FA2031" } ] }'
```
Validates auth + payload shape and returns `{ "ok": true, "dryRun": true, "received": 1, "distinctSkus": 1 }`
— **nothing is stored, matched, or sent to onboarding.** A bad payload returns the
same `400` with the field error you'd get live. Drop `?dryRun=1` to go live.

---

## When to send (two triggers)

Same endpoint, same payload — just fired at two moments:

1. **First sync (onboarding).** Once, when a store's initial data sync finishes,
   send its current parts sales. This establishes the store's baseline so the
   onboarding team can set everything up. (Optionally mark it — see `initial`
   below.)
2. **Weekly thereafter.** Each week, send that week's parts sales. We diff against
   what's already set up and only surface the genuinely new parts.

Both are the same `POST /api/v1/sales`. You don't track which is which on your end
beyond choosing when to call it.

### First-sync notes
- The **5,000-line cap is per request.** A large onboarding backfill should be
  **de-duplicated to distinct SKUs** before sending (you don't need every
  historical sale for setup — one line per SKU is enough), or split into multiple
  requests for the same store.
- If you can include `knownSkus` (SKUs already set up for that store), the first
  sync surfaces only the *gap*. If you omit it, the first sync surfaces *all*
  parts for a full onboarding review — both are valid; tell us which you want.

## What you need to build (the whole job)

1. A per-store job that selects parts sales — **weekly**, plus a **one-time run
   when a store's first data sync completes**.
2. Map each row to a `line` (`dealerSku` + whatever else you have).
3. POST one request per store with an `Idempotency-Key`; on a non-2xx, retry with
   the **same** key.

That's it — no schema for us to design on your side, no callbacks to handle, no
state to keep. One key, one POST per store per send.

---

## Notes

- HTTPS only; the API key is the only credential. Rotated rarely (a couple times
  a year) — we'll hand you the new one ahead of time.
- Cadence is whatever you choose (weekly is the plan); we don't schedule anything.
- `knownSkus` is optional today. As Easy Wins becomes the system of record for
  what's "set up," sending it sharpens which parts we flag — we'll confirm timing.
