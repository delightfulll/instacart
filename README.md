# Order Dispatch

Event-driven order dispatch on AWS: place an order, persist it, queue it, offer it to one online driver, then notify if they accept.

This is a learning project for applied AWS (Solutions Architect Associate). It is a **dispatch slice**, not a full marketplace (no catalog, cart, or payments).

## Why this project

The HTTP API should accept orders quickly. Matching a driver waits until someone is online and chooses to take the order.

The app uses the same building blocks as production systems:

- **DynamoDB** — orders and drivers persist independently of the API process
- **SQS** — new orders land on a dispatch queue; a deny copies the message to a second queue
- **SNS** — publish when a driver accepts (email subscription)
- **SQS visibility timeout** — while a driver decides, the message stays invisible. If nobody is online, the worker releases it and tries again

## Architecture

```
Browser (Next.js, :3000)
  → POST /order
    → Express API (:3001)
      → DynamoDB  instacart-orders   (status: pending)
      → SQS       order-dispatch-queue
      ← 200 { orderId, status: "pending" }

Driver goes online (driver-1 or driver-2)

Worker
  → long-poll order-passed-queue first, then order-dispatch-queue
  → pin one order to one online driver (status: offered, 60s)
  → leave the message invisible until accept, deny, or timeout

Driver page
  → GET /driver/offer shows that one order
  → Accept: status assigned, DeleteMessage, SNS
  → Deny: append driver to declinedBy, SendMessage to order-passed-queue, DeleteMessage
    the next online driver who has not declined gets the offer
```

If every seeded driver denies the order, it is marked `unassigned` and the message is deleted so it cannot loop.

Standard SQS does not guarantee oldest-first order. "Next" means the next message the worker receives.

## Tech stack

| Layer      | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| UI         | Next.js, React, TypeScript                                 |
| API        | Express, TypeScript                                        |
| Worker     | Node process polling SQS                                   |
| Data       | Amazon DynamoDB                                            |
| Queue      | Amazon SQS (standard), dispatch queue and passed queue    |
| Notify     | Amazon SNS                                                 |
| Containers | Docker image for the backend (API + worker from one image) |

## Repo layout

```
src/app/page.tsx          Order form — POST to the API
src/app/driver/page.tsx   One offer, Accept or Deny
backend/api.ts            Express: save order, enqueue, accept, deny
backend/queue.ts          SQS send, delete, and release
backend/worker.ts         Poll both queues and offer one message
backend/dispatch.ts       Pick an online driver and pin the offer
backend/notify.ts         SNS publish (driver name)
backend/db/orders.ts      DynamoDB order CRUD
backend/db/drivers.ts     DynamoDB drivers
backend/scripts/setup-aws.ts   Create tables + seed driver-1 and driver-2
backend/Dockerfile        Node 22 image, CMD npm start
```

## Local run

**Prereqs:** Node.js, AWS CLI (`aws configure`), DynamoDB tables, both SQS queues, and an SNS topic in `us-east-1`.

```bash
# one-time: tables + seed both drivers
cd backend
npm install
npm run setup:aws

# one-time: passed queue, then put the URL in backend/.env as SQS_PASSED_QUEUE_URL
aws sqs create-queue --queue-name order-passed-queue --region us-east-1
```

`backend/.env` needs `SQS_QUEUE_URL`, `SQS_PASSED_QUEUE_URL`, `SNS_TOPIC_ARN`, and the table names.

Three terminals:

```bash
# 1 — API (port 3001)
cd backend && npm start

# 2 — worker
cd backend && npx tsx worker.ts

# 3 — UI (port 3000)
npm install && npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and place an order. On [http://localhost:3000/driver](http://localhost:3000/driver), go online as `driver-1`. Open the driver page again as `driver-2`. Accept assigns the order. Deny moves it to the passed queue for the other driver.

Frontend env: `.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:3001`

## Docker (backend)

Image is built from `backend/`. Same image, different command for API vs worker.

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
| SQS      | `order-passed-queue`                |
| SNS      | `order-status-updates`              |

IAM for local: credentials from `aws configure`.
