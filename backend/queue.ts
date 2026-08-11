import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { fchmod } from "fs";

const client = new SQSClient({region: process.env.AWS_REGION ?? "us-east-1"});


export async function enqueueOrder(orderId: string): Promise<void> {
    const queueURL = process.env.SQS_QUEUE_URL;
    // send message to SQS queue
    const command = new SendMessageCommand({
        QueueUrl: queueURL,
        MessageBody: JSON.stringify({ orderId }),
    });
    const result = await client.send(command);
    console.log(result);
  };


