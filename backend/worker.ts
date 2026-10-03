import "dotenv/config";

import { ReceiveMessageCommand, SQSClient, type Message } from "@aws-sdk/client-sqs";
import { OFFER_VISIBILITY_SECONDS, offerMessage } from "./dispatch";
import {
  deleteQueuedMessage,
  getDispatchQueueUrl,
  getPassedQueueUrl,
  releaseQueuedMessage,
} from "./queue";

const client = new SQSClient({ region: process.env.AWS_REGION ?? "us-east-1" });

// Long-polls one queue and hides the message for 60s if one arrives.
async function receiveOne(queueUrl: string): Promise<Message | null> {
  const result = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 10, // long poll; returns nothing if the queue stays empty
      VisibilityTimeout: OFFER_VISIBILITY_SECONDS, // hide it so a second receive can't offer it twice
    })
  );
  return result.Messages?.[0] ?? null;
}

// Offers the order in one message, then deletes it, puts it back, or leaves it hidden.
async function processMessage(message: Message, queueUrl: string): Promise<void> {
  const receiptHandle = message.ReceiptHandle;
  if (!receiptHandle) return;

  const label = queueUrl === process.env.SQS_PASSED_QUEUE_URL ? "passed queue" : "dispatch queue";
  let orderId = "";
  try {
    const data = JSON.parse(message.Body ?? "{}") as { orderId?: string };
    orderId = data.orderId ?? "";
  } catch (error) {
    console.error("Bad message body, deleting", error);
    await deleteQueuedMessage(queueUrl, receiptHandle);
    return;
  }

  if (!orderId) {
    console.error("Message missing orderId, deleting");
    await deleteQueuedMessage(queueUrl, receiptHandle);
    return;
  }

  console.log("Processing order:", orderId, "from", label);
  const result = await offerMessage(orderId, receiptHandle, queueUrl);

  if (result.action === "delete") {
    await deleteQueuedMessage(queueUrl, receiptHandle); // already assigned, completed, or unassigned
    console.log("Deleted message for", orderId);
    return;
  }

  if (result.action === "release") {
    await releaseQueuedMessage(queueUrl, receiptHandle); // nobody online, or the pin lost a race
    console.log("Released message for", orderId);
    await new Promise((resolve) => setTimeout(resolve, 5000)); // don't tight-loop an empty driver pool
  }
  // offered: leave the message hidden until accept, deny, or the 60s timeout
}

// Runs forever, offering passed-queue orders before new ones on the dispatch queue.
async function readMessagesFromSQS(): Promise<void> {
  const dispatchUrl = getDispatchQueueUrl();
  const passedUrl = getPassedQueueUrl();
  console.log("Worker offering orders from the passed queue first, then the dispatch queue");

  while (true) {
    const passed = await receiveOne(passedUrl); // a deny lands here, so it jumps ahead of new orders
    if (passed) {
      await processMessage(passed, passedUrl);
      continue;
    }

    const dispatched = await receiveOne(dispatchUrl);
    if (dispatched) {
      await processMessage(dispatched, dispatchUrl);
    }
  }
}

readMessagesFromSQS().catch((error) => {
  console.error("Worker failed:", error);
  process.exit(1);
});
