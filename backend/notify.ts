import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { getDriver } from "./db/drivers";

const client = new SNSClient({region: process.env.AWS_REGION ?? "us-east-1"});

export async function notifyOrderStatus(orderId: string, driverId: string): Promise<void> {
    const driver = await getDriver(driverId)

    //handle if driver doesnt exist
    if (!driver){
        console.error("Driver is not found")
        return;
    }
    const command = new PublishCommand({
        TopicArn: process.env.SNS_TOPIC_ARN,
        Message: `Order ${orderId} assigned to driver ${driver.name}`,
    });
    //send the topic
    await client.send(command);
    console.log(orderId, "assigned to driver", driver.name)
}

