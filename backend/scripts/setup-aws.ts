import "dotenv/config";
import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ResourceNotFoundException,
} from "@aws-sdk/client-dynamodb";
import { saveDriver } from "../db/drivers";

const region = process.env.AWS_REGION ?? "us-east-1";
const client = new DynamoDBClient({ region });

const ORDERS_TABLE = process.env.ORDERS_TABLE ?? "instacart-orders";
const DRIVERS_TABLE = process.env.DRIVERS_TABLE ?? "instacart-drivers";

async function waitForTableActive(name: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await client.send(new DescribeTableCommand({ TableName: name }));
    if (result.Table?.TableStatus === "ACTIVE") {
      console.log(`Table ready: ${name}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Timed out waiting for table: ${name}`);
}

async function ensureTable(name: string, keyName: string) {
  try {
    await client.send(new DescribeTableCommand({ TableName: name }));
    console.log(`Table exists: ${name}`);
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }

    try {
      await client.send(
        new CreateTableCommand({
          TableName: name,
          BillingMode: "PAY_PER_REQUEST",
          AttributeDefinitions: [{ AttributeName: keyName, AttributeType: "S" }],
          KeySchema: [{ AttributeName: keyName, KeyType: "HASH" }],
        })
      );
      console.log(`Creating table: ${name}...`);
    } catch (createError) {
      if (createError instanceof ResourceInUseException) {
        console.log(`Table already exists: ${name}`);
      } else {
        throw createError;
      }
    }
  }

  await waitForTableActive(name);
}

async function seedDriver() {
  await saveDriver({
    driverId: "driver-1",
    name: "Alex",
    available: true,
  });
  console.log("Seeded driver: driver-1 (Alex)");
}

async function main() {
  console.log(`Using region: ${region}`);
  await ensureTable(ORDERS_TABLE, "orderId");
  await ensureTable(DRIVERS_TABLE, "driverId");
  await seedDriver();
  console.log("Setup complete.");
}

main().catch((error) => {
  console.error("Setup failed:", error);
  process.exit(1);
});
