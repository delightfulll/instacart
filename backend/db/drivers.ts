import { PutCommand, ScanCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, DRIVERS_TABLE } from "./client";
import type { Driver } from "../types";

export async function saveDriver(driver: Driver): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: DRIVERS_TABLE,
      Item: driver,
    })
  );
}

export async function findAvailableDriver(): Promise<Driver | null> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: DRIVERS_TABLE,
      FilterExpression: "available = :available",
      ExpressionAttributeValues: { ":available": true },
      Limit: 2,
    })
  );

  const driver = result.Items?.[0] as Driver | undefined;
  return driver ?? null;
}

export async function getDriver(driverId: string): Promise<Driver | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: DRIVERS_TABLE,
      Key: { driverId },
    })
  );

  // You want to return the driver object if it exists, or null otherwise.
  // The DynamoDB result is in result.Item, so coerce/cast it to Driver type if present.
  if (result.Item) {
    return result.Item as Driver;
  }
  return null;
}

//updates the driver in dynamoDB
export async function setDriverAvailability(
  driverId: string,
  available: boolean
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: DRIVERS_TABLE,
      Key: { driverId },
      UpdateExpression: "SET available = :available",
      ExpressionAttributeValues: { ":available": available },
    })
  );
}
