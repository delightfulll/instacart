import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

const client = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

// Reads one queue URL from the environment and throws if it is missing.
function requireQueueUrl(name: "SQS_QUEUE_URL" | "SQS_PASSED_QUEUE_URL"): string {
  const queueUrl = process.env[name];
  if (!queueUrl) {
    throw new Error(`${name} is not set`);
  }
  return queueUrl;
}

// Queue for brand-new orders from POST /order.
export function getDispatchQueueUrl(): string {
  return requireQueueUrl("SQS_QUEUE_URL"); // brand-new orders from POST /order
}

// Queue for orders a driver just denied. The worker checks this one first.
export function getPassedQueueUrl(): string {
  return requireQueueUrl("SQS_PASSED_QUEUE_URL"); // worker reads this before the dispatch queue
}

// Sends a new order to the dispatch queue.
export async function enqueueOrder(orderId: string): Promise<void> {
  const result = await client.send(
    new SendMessageCommand({
      QueueUrl: getDispatchQueueUrl(),
      MessageBody: JSON.stringify({ orderId }),
    })
  );
  console.log("Message sent to dispatch queue", orderId, "message ID", result.MessageId);
}

// Copies a denied order onto the passed queue so the next driver is offered it first.
export async function enqueuePassedOrder(orderId: string, declinedBy: string[]): Promise<void> {
  const result = await client.send(
    new SendMessageCommand({
      QueueUrl: getPassedQueueUrl(),
      // declinedBy is for the SQS console. The worker reads the list off the order row.
      MessageBody: JSON.stringify({ orderId, declinedBy }),
    })
  );
  console.log("Message sent to passed queue", orderId, "message ID", result.MessageId);
}

// Removes a message after accept, after the deny copy lands, or when every driver has passed.
export async function deleteQueuedMessage(queueUrl: string, receiptHandle: string): Promise<void> {
  await client.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl, // a receipt handle only works on the queue that issued it
      ReceiptHandle: receiptHandle,
    })
  );
}

// Makes a hidden message visible again when nobody takes the offer.
export async function releaseQueuedMessage(queueUrl: string, receiptHandle: string): Promise<void> {
  await client.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: 0, // visible again now. This is not a deny.
    })
  );
}
