# Instacart AWS Learning Project — Session Notes

> **For AI assistants:** Read this file at the start of any new chat to continue where we left off.

---

## Learning mode (IMPORTANT — follow this)

**Option B — user writes code, AI guides.**

- Explain concepts in plain English first (WHAT → WHERE → HOW → WIRE)
- User types the code; AI reviews and hints — **do NOT dump full file solutions**
- User does AWS Console steps themselves (AI gives step-by-step, user clicks)
- One tiny step at a time — not "build Phase 2" all at once
- If user is stuck >10 min on HOW, give a 5-line snippet + doc link, not 200 lines
- Checkpoint questions before moving on
- User is studying for **AWS SAA** — tie concepts to exam when relevant
- User is **not a strong coder yet** — prefer clear long-form code over clever shortcuts (`??`, destructuring optional)

---

## Project goal

Learn **applied AWS engineering** by building an Instacart-style order dispatch app — not just exam memorization. Domain: place order → persist → queue → async dispatch → (next) notify.

---

## Current status (last updated: Aug 2026)

### Done
- [x] **Phase 1a** — Next.js frontend calls Express `POST /order` via `fetch`
- [x] **Phase 1b** — DynamoDB persistence (`instacart-orders`, `instacart-drivers`)
- [x] **Phase 2 (partial)** — SQS enqueue on order create + worker polls and dispatches
- [x] **SNS** — `notify.ts` publishes when order assigned (email subscription tested)

### Not done yet
- [ ] Fix worker to only delete SQS message on successful dispatch (or DLQ)
- [ ] **Phase 3** — Cognito auth
- [ ] **Phase 4** — EC2 deploy, then ECS, microservices split, CDK

---

## Architecture (current)

```
Browser (localhost:3000, Next.js)
  → POST /order
    → Express API (localhost:3001, backend/api.ts)
      → saveOrder()        → DynamoDB instacart-orders
      → enqueueOrder()     → SQS order-dispatch-queue
      ← returns order (status: "pending")

Worker (backend/worker.ts, separate process)
  → poll SQS (WaitTimeSeconds: 20 — looks "stuck" but is normal)
  → getOrder(orderId)      → DynamoDB
  → dispatchOrder()        → assign driver, update both tables
  → notifyOrderStatus()    → SNS email/notification
  → DeleteMessage          → removes from queue (even if dispatch fails — known bug)
```

---

## How to run (user had port conflicts — follow this order)

**Kill stuck processes first if needed:**
```bash
lsof -i :3000
lsof -i :3001
kill -9 <PID>
```

**Terminal 1 — API (must be 3001):**
```bash
cd backend
npm start
# expect: API listening at port: 3001 (or 127.0.0.1:3001)
```

**Terminal 2 — Worker:**
```bash
cd backend
npx tsx worker.ts
# expect: "Worker started — polling SQS..."
# WaitTimeSeconds: 20 means up to 20s silence is NORMAL
```

**Terminal 3 — Frontend (must be 3000):**
```bash
npm run dev
# expect: localhost:3000 — NOT 3001
```

**Env files:**
- Frontend: `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:3001`
- Backend: `backend/.env` → `AWS_REGION`, `SQS_QUEUE_URL`, table names, `AWS_EC2_METADATA_DISABLED=true`

**AWS credentials:** `aws configure` (IAM user, not root). Verify: `aws sts get-caller-identity`

**One-time setup:** `cd backend && npm run setup:aws` (creates DynamoDB tables + seeds driver-1)

---

## AWS resources (account: new, 185-day free plan + $100 credits, region us-east-1)

| Resource | Name |
|----------|------|
| DynamoDB table | `instacart-orders` (PK: `orderId` String) |
| DynamoDB table | `instacart-drivers` (PK: `driverId` String) |
| SQS queue | `order-dispatch-queue` (Standard) |
| SNS topic | `order-status-updates` (email subscription) |
| Seeded driver | `driver-1` (Alex, `available: true/false`) |

---

## Key files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Order form, fetch to API |
| `backend/api.ts` | Express routes — POST /order saves + enqueues |
| `backend/queue.ts` | `enqueueOrder()` — SendMessage to SQS (user wrote this) |
| `backend/worker.ts` | Poll SQS, dispatch, notify SNS, delete message (user wrote this) |
| `backend/notify.ts` | `notifyOrderStatus()` — SNS publish with driver name (user wrote this) |
| `backend/db/orders.ts` | DynamoDB order CRUD |
| `backend/db/drivers.ts` | Driver scan + availability update |
| `backend/dispatch.ts` | Find driver, assign order |
| `backend/scripts/setup-aws.ts` | Create tables + seed driver |

---

## Known bugs / quirks (learned the hard way)

1. **Port conflict** — If Next.js steals 3001, API won't respond. Backend=3001, Frontend=3000 always.
2. **Worker "stuck"** — Long polling waits 20s with no output. Not frozen.
3. **Queue looks empty** — Worker deletes messages fast. Empty queue ≠ not working. Proof of send = `MessageId` in API terminal.
4. **Worker deletes even on failed dispatch** — If no driver available, order stays `pending` but message is gone. User understands this.
5. **Only 1 driver** — After one assigned order, `driver-1.available = false`. Set back to `true` in DynamoDB console or re-run setup:aws.
6. **Stale SQS messages** — Old CLI test messages (`test-123`) cause "Order not found". Purge queue in console.
7. **`dotenv/config`** — Required in any **entry point** file run directly (`api.ts`, `worker.ts`). Files imported by api.ts (like `queue.ts`) inherit dotenv from api.
8. **`JSON.parse` / `JSON.stringify`** — Used when crossing boundaries (SQS body). DynamoDB SDK takes plain objects, no JSON needed.

---

## Concepts user learned (don't re-explain from scratch unless asked)

- Partition key = unique lookup (`orderId`, not `customerName`)
- GetItem vs Scan
- `process.env` + `.env.local` + `NEXT_PUBLIC_` prefix for Next.js browser vars
- `{ orderId }` shorthand = `{ orderId: orderId }`
- JSON.stringify (send) / JSON.parse (receive) for SQS message bodies
- SQS ReceiptHandle comes from ReceiveMessage, NOT orderId
- Compute (Express) vs data (DynamoDB) separation

---

## Next session: start here

**Options (pick one with user):**

1. **Fix worker** — only delete SQS message if dispatch succeeds; add DLQ (good SAA topic)
2. **Phase 3 Cognito** — auth on order API
3. **Phase 1c EC2 deploy** — get API + worker off localhost onto AWS

---

## ~~Next session: SNS~~ (DONE)

~~SNS topic `order-status-updates`, `backend/notify.ts`, wired in worker with await. Email tested working.~~

---

## What NOT to do in next session

- Don't rewrite worker/queue/api from scratch
- Don't skip to EC2/microservices before SNS
- Don't create a new AWS account for free tier
- Don't run frontend and backend on same port
- Don't assume empty SQS queue means enqueue failed — check API terminal for MessageId

---

## Useful commands

```bash
# Test API
curl http://127.0.0.1:3001/health
curl -X POST http://127.0.0.1:3001/order -H "Content-Type: application/json" -d '{"customerName":"Test"}'

# Test SQS manually
aws sqs send-message --queue-url "$SQS_QUEUE_URL" --message-body '{"orderId":"test-123"}'
aws sqs receive-message --queue-url "$SQS_QUEUE_URL"

# Purge queue (careful — deletes all messages)
aws sqs purge-queue --queue-url "$SQS_QUEUE_URL"
```

---

## User profile (for tone/pacing)

- AWS SAA exam prep — knows services conceptually, wants hands-on
- Weaker on coding — needs step-by-step, plain English, small tasks
- Fast MVP preference, real AWS free tier account (185 days + $100 credits)
- EC2 bare metal first, ECS later when dockerizing worker
- Gets confused by AWS SDK doc snippets (`STRING_VALUE` placeholders) — explain doc vs tutorial difference
