# Order Dispatch

Event-driven order dispatch on AWS: place an order, persist it, queue it, assign a driver asynchronously, then notify.

This is a learning project for applied AWS (Solutions Architect Associate). It is a **dispatch slice**, not a full marketplace (no catalog, cart, or payments).

## Why this project

Dispatch system is a good fit for cloud patterns: the HTTP API should accept orders quickly, while matching a driver can wait, retry, and notify separately.

The app uses the same building blocks as production systems:

- **DynamoDB** — orders and drivers persist independently of the API process
- **SQS** — the API enqueues work; a worker consumes it
- **SNS** — publish when an order is assigned (email subscription)
- **SQS visibility timeout** — if no driver is free, the message is not deleted and is retried

## Architecture

```
Browser (Next.js, :3000)
  → POST /order
    → Express API (:3001)
      → DynamoDB  instacart-orders   (status: pending)
      → SQS       order-dispatch-queue
      ← 200 { orderId, status: "pending" }

Worker (separate process)
  → long-poll SQS
  → load order from DynamoDB
  → find available driver, assign
  → SNS  order-status-updates
  → DeleteMessage only if status === assigned
```

If dispatch fails (no driver), the SQS message stays in flight and becomes visible again after the visibility timeout so the worker can retry.

## Tech stack

| Layer      | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| UI         | Next.js, React, TypeScript                                 |
| API        | Express, TypeScript                                        |
| Worker     | Node process polling SQS                                   |
| Data       | Amazon DynamoDB                                            |
| Queue      | Amazon SQS (standard)                                      |
| Notify     | Amazon SNS                                                 |
| Containers | Docker image for the backend (API + worker from one image) |

## Repo layout

```
src/app/page.tsx          Order form — POST to the API
backend/api.ts            Express: save order, enqueue SQS
backend/queue.ts          SQS SendMessage
backend/worker.ts         Poll SQS, dispatch, SNS, delete on success
backend/dispatch.ts       Assign available driver
backend/notify.ts         SNS publish (driver name)
backend/db/orders.ts      DynamoDB order CRUD
backend/db/drivers.ts     DynamoDB drivers
backend/scripts/setup-aws.ts   Create tables + seed driver-1
backend/Dockerfile        Node 22 image, CMD npm start
```

## Local run

**Prereqs:** Node.js, AWS CLI (`aws configure`), DynamoDB tables + SQS queue + SNS topic in `us-east-1`.

```bash
# one-time: tables + seed driver
cd backend
cp .env.example .env   # add SQS_QUEUE_URL, SNS_TOPIC_ARN, table names
npm install
npm run setup:aws
```

Three terminals:

```bash
# 1 — API (port 3001)
cd backend && npm start

# 2 — worker
cd backend && npx tsx worker.ts

# 3 — UI (port 3000)
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000), place an order. Confirm in DynamoDB that status moves from `pending` to `assigned` when a driver is free.

Frontend env: `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:3001`

## Docker (backend)

Image is built from `backend/`. Same image, different command for API vs worker (Compose/EC2 next).

```bash
cd backend
docker build -t instacart-backend .
docker run --rm -p 3001:3001 --env-file .env -v "$HOME/.aws:/root/.aws:ro" instacart-backend
```

## AWS resources

| Resource | Name                                |
| -------- | ----------------------------------- |
| DynamoDB | `instacart-orders` (PK `orderId`)   |
| DynamoDB | `instacart-drivers` (PK `driverId`) |
| SQS      | `order-dispatch-queue`              |
| SNS      | `order-status-updates`              |

IAM for local: credentials from `aws configure`.
