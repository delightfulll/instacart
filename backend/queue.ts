import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

const client = new SQSClient({region: process.env.AWS_REGION ?? "us-east-1"});


export async function enqueueOrder(orderId: string): Promise<void> {
    const queueURL = process.env.SQS_QUEUE_URL;

    // check if queue URL is set
    if (!queueURL) {
        throw new Error("SQS_QUEUE_URL is not set");
    }
    // send message to SQS queue
    const command = new SendMessageCommand({
        QueueUrl: queueURL,
        //converts orderId object (object notation) into a json string to be sent to the queue
        MessageBody: JSON.stringify({ orderId }),
    });

    const result = await client.send(command)
    console.log("Message sent to SQS queue", orderId, "message ID", result.MessageId);
  }

