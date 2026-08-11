import { PutCommand, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, ORDERS_TABLE } from "./client";
import type { Order, OrderStatus } from "../types";

export async function saveOrder(order: Order): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: ORDERS_TABLE,
      Item: order,
    })
  );
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
    })
  );

  return (result.Item as Order) ?? null;
}

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus,
  driverId: string
): Promise<Order | null> {
  const result = await docClient.send(
    new UpdateCommand({
      TableName: ORDERS_TABLE,
      Key: { orderId },
      UpdateExpression: "SET #status = :status, driverId = :driverId",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":status": status, ":driverId": driverId },
      ReturnValues: "ALL_NEW",
    })
  );

  return (result.Attributes as Order) ?? null;
}
