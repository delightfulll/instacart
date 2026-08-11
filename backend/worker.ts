import "dotenv/config";

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, Message } from "@aws-sdk/client-sqs";
import { dispatchOrder } from "./dispatch";
import { getOrder } from "./db/orders";

const client = new SQSClient({region: process.env.AWS_REGION ?? "us-east-1"});

console.log("Worker started — polling SQS every ~20s (this wait is normal)");

async function processMessage(message: Message): Promise<void> {
    const data = JSON.parse(message.Body ?? "{}");
    const orderid = data.orderId;
    console.log("Processing order:", orderid);

    const order = await getOrder(orderid);
    if (!order) {
        console.error("Order ID not found in message", message);
        return;
    }

    const dispatched = await dispatchOrder(order);
    console.log("Dispatched order:", orderid, "status:", dispatched.status);

    const deleteMessageCommand = new DeleteMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
    });
    await client.send(deleteMessageCommand);
    console.log("Deleted message from queue");
}


async function readMessagesFromSQS(): Promise<void> {
    while (true) {
    console.log("Polling SQS...");
    const receiveMessageCommand = new ReceiveMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
    });
    const result = await client.send(receiveMessageCommand);
    const messages = result.Messages ?? [];

    //loop throgh array of messages and process one by one
    for (const message of messages) {
        //process one by one
        await processMessage(message);
    }

    if (messages.length === 0) {
         //sleep for 30 seconds before polling again
        await new Promise(resolve => setTimeout(resolve, 30000));
    }
    }
}

//call this when the worker is called
readMessagesFromSQS()
