import { PutCommand, ScanCommand, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, DRIVERS_TABLE } from "./client";
import { getOrder } from "./orders";
import type { Driver, DriverOffer } from "../types";

// Inserts a driver row. The setup script uses this.
export async function saveDriver(driver: Driver): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: DRIVERS_TABLE,
      Item: driver,
    })
  );
}

// Loads one driver, or null if that id does not exist.
export async function getDriver(driverId: string): Promise<Driver | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: DRIVERS_TABLE,
      Key: { driverId },
    })
  );

  if (result.Item) {
    return result.Item as Driver;
  }
  return null;
}

// Returns every seeded driver, so a deny can tell when all of them have passed.
export async function listDrivers(): Promise<Driver[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: DRIVERS_TABLE,
    })
  );

  return (result.Items as Driver[]) ?? [];
}

// Sets whether the worker may offer this driver new orders.
export async function setDriverOnline(driverId: string, online: boolean): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: DRIVERS_TABLE,
      Key: { driverId },
      UpdateExpression: "SET #online = :online", // "online" is reserved, so the name is aliased
      ExpressionAttributeNames: { "#online": "online" },
      ExpressionAttributeValues: { ":online": online },
    })
  );
}

// Saves the SQS message this driver is deciding on. null clears it.
export async function setDriverOffer(driverId: string, offer: DriverOffer | null): Promise<void> {
  if (!offer) { // accept, deny, and offline clear it
    await docClient.send(
      new UpdateCommand({
        TableName: DRIVERS_TABLE,
        Key: { driverId },
        UpdateExpression: "REMOVE currentOffer",
      })
    );
    return;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: DRIVERS_TABLE,
      Key: { driverId },
      UpdateExpression: "SET currentOffer = :offer",
      ExpressionAttributeValues: { ":offer": offer },
    })
  );
}

// Returns the first driver who can take this order right now.
export async function findOnlineDriver(declinedBy: string[]): Promise<Driver | null> {
  const drivers = await listDrivers();
  const declined = new Set(declinedBy);
  const now = new Date().toISOString();

  for (const driver of drivers) {
    if (!driver.online || declined.has(driver.driverId)) continue; // offline, or they already denied this order

    if (driver.currentOffer) {
      const order = await getOrder(driver.currentOffer.orderId);
      const stillDeciding =
        order?.status === "offered" &&
        order.offeredTo === driver.driverId &&
        !!order.offerExpiresAt &&
        order.offerExpiresAt > now;
      if (stillDeciding) continue; // already looking at a different offer
      await setDriverOffer(driver.driverId, null); // window expired. Not a deny, so they can be picked.
    }

    return driver;
  }

  return null;
}
