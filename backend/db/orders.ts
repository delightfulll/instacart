import { PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE } from "./client";
import type { Order } from "../types";

// True when a DynamoDB condition lost a race with another update.
function isConditionalFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "ConditionalCheckFailedException" // someone else already changed the row; API returns 409
  );
}

// Writes a new order row.
export async function saveOrder(order: Order): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: ORDERS_TABLE,
      Item: order,
    })
  );
}

// Loads one order, or null if it does not exist.
export async function getOrder(orderId: string): Promise<Order | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
    })
  );

  return (result.Item as Order) ?? null;
}

// Marks the order offered to one driver. Returns null if another receive pinned it first.
export async function pinOffer(
  orderId: string,
  driverId: string,
  expiresAt: string
): Promise<Order | null> {
  const now = new Date().toISOString();
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: "SET #status = :offered, offeredTo = :driverId, offerExpiresAt = :expires",
        ConditionExpression: "#status = :pending OR (#status = :offered AND offerExpiresAt < :now)", // pending, or the last offer already expired
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":offered": "offered",
          ":pending": "pending",
          ":driverId": driverId,
          ":expires": expiresAt,
          ":now": now,
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return (result.Attributes as Order) ?? null;
  } catch (error) {
    if (isConditionalFailure(error)) return null;
    throw error;
  }
}

// Pushes the decision deadline out for the driver who already has this offer.
export async function extendOffer(
  orderId: string,
  driverId: string,
  expiresAt: string
): Promise<Order | null> {
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: "SET offerExpiresAt = :expires", // new receipt handle, so the deadline matches the new 60s hide
        ConditionExpression: "#status = :offered AND offeredTo = :driverId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":expires": expiresAt,
          ":offered": "offered",
          ":driverId": driverId,
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return (result.Attributes as Order) ?? null;
  } catch (error) {
    if (isConditionalFailure(error)) return null;
    throw error;
  }
}

// Puts an offer back to pending without counting a deny.
export async function releaseOffer(orderId: string, driverId: string): Promise<void> {
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: "SET #status = :pending REMOVE offeredTo, offerExpiresAt", // offline or timeout. Does not add them to declinedBy.
        ConditionExpression: "#status = :offered AND offeredTo = :driverId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":pending": "pending",
          ":offered": "offered",
          ":driverId": driverId,
        },
      })
    );
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
  }
}

// Sets the order to assigned. Returns null if it is no longer this driver's offer.
export async function acceptOffer(orderId: string, driverId: string): Promise<Order | null> {
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression: "SET #status = :assigned, driverId = :driverId REMOVE offeredTo, offerExpiresAt",
        ConditionExpression: "#status = :offered AND offeredTo = :driverId", // only the driver it was offered to
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":assigned": "assigned",
          ":offered": "offered",
          ":driverId": driverId,
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return (result.Attributes as Order) ?? null;
  } catch (error) {
    if (isConditionalFailure(error)) return null;
    throw error;
  }
}

// Adds this driver to declinedBy and sets the order back to pending.
export async function declineOffer(orderId: string, driverId: string): Promise<Order | null> {
  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: ORDERS_TABLE,
        Key: { orderId },
        UpdateExpression:
          "SET #status = :pending, declinedBy = list_append(if_not_exists(declinedBy, :empty), :one) REMOVE offeredTo, offerExpiresAt", // DynamoDB only. The API copies the SQS message.
        ConditionExpression: "#status = :offered AND offeredTo = :driverId",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":pending": "pending",
          ":offered": "offered",
          ":driverId": driverId,
          ":empty": [],
          ":one": [driverId],
        },
        ReturnValues: "ALL_NEW",
      })
    );
    return (result.Attributes as Order) ?? null;
  } catch (error) {
    if (isConditionalFailure(error)) return null;
    throw error;
  }
}

// Stops the order after every seeded driver has denied it.
export async function markUnassigned(orderId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
      UpdateExpression: "SET #status = :unassigned REMOVE offeredTo, offerExpiresAt", // every seeded driver already denied it
      ConditionExpression: "#status = :pending",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":unassigned": "unassigned",
        ":pending": "pending",
      },
    })
  );
}
