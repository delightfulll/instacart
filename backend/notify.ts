import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { getDriver } from "./db/drivers";

const client = new SNSClient({region: process.env.AWS_REGION ?? "us-east-1"});

// Publishes an SNS message that this driver accepted the order.
export async function notifyOrderStatus(orderId: string, driverId: string): Promise<void> {
    const driver = await getDriver(driverId)

    if (!driver) {
        console.error("Driver is not found")
        return; // accept already saved. A missing driver should not fail that request.
    }
    const command = new PublishCommand({
        TopicArn: process.env.SNS_TOPIC_ARN,
        Message: `Order ${orderId} assigned to driver ${driver.name}`,
    });
    await client.send(command);
    console.log(orderId, "assigned to driver", driver.name)
}

