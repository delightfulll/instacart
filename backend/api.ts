import "dotenv/config";
import express from "express";
import { dispatchOrder } from "./dispatch";
import { saveOrder, getOrder } from "./db/orders";
import type { Order } from "./types";
import { enqueueOrder } from "./queue";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (_req, res) => {
  res.send("Server is running!");
});

app.get("/api", (_req, res) => {
  res.json({ message: "Success" });
});

app.get("/order/:orderId", async (req, res) => {
  try {
    const order = await getOrder(req.params.orderId);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  } catch (error) {
    console.error("GET /order failed:", error);
    res.status(500).json({ error: "Failed to fetch order" });
  }
});

app.post("/order", async (req, res) => {
  try {
    const customerName = req.body?.customerName ?? "Guest";

    const order: Order = {
      orderId: String(Date.now()),
      status: "pending",
      customerName,
      createdAt: new Date().toISOString(),
    };

    //save order to database
    await saveOrder(order);
    //enqueue order to SQS queue
    await enqueueOrder(order.orderId);
    //return order
    res.json(order);
  
  } catch (error) {
    console.error("POST /order failed:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

app.listen(port, () => {
  console.log(`API listening at port: ${port}`);
});

export default app;
