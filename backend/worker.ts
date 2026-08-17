import "dotenv/config";

import { SQSClient, ReceiveMessageCommand, DeleteMessageCommand, Message } from "@aws-sdk/client-sqs";
import { dispatchOrder } from "./dispatch";
import { getOrder } from "./db/orders";
import { notifyOrderStatus } from "./notify";

const client = new SQSClient({region: process.env.AWS_REGION ?? "us-east-1"});

console.log("Worker started polling SQS...");

async function processMessage(message: Message): Promise<void> {
    const data = JSON.parse(message.Body ?? "{}");
    const orderid = data.orderId;
    console.log("Processing order:", orderid);

    //getting the order object from the dynamoDB table
    const order = await getOrder(orderid);
    if (!order) {
        console.error("Order ID not found in message", message);
        return;
    }

    //after retreiving the order via the orderID, dispatch the order
    const dispatched = await dispatchOrder(order);
    console.log("Dispatching order:", orderid, "status:", dispatched.status);

    //if dispatched, send a notificaton via email with SNS
    if (dispatched.status === "assigned" && dispatched.driverId){
        //send a message via SNS that it has found a driver
        await notifyOrderStatus(orderid, dispatched.driverId)
        //deletes the message only if the if order is assigned
        const deleteMessageCommand = new DeleteMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,

        
    });
    //use await for async work
    await client.send(deleteMessageCommand);
    console.log("Deleted message from queue since dispatched");
    } else {
        console.log("Order not dispatched, no driver available sending back into queue")
    }
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
