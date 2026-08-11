import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";

const region = process.env.AWS_REGION ?? "us-east-1";

const client = new DynamoDBClient({
  region,
  requestHandler: new NodeHttpHandler({
    connectionTimeout: 5_000,
    requestTimeout: 10_000,
  }),
});

export const docClient = DynamoDBDocumentClient.from(client);

export const ORDERS_TABLE = process.env.ORDERS_TABLE ?? "instacart-orders";
export const DRIVERS_TABLE = process.env.DRIVERS_TABLE ?? "instacart-drivers";
