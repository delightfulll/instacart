import "dotenv/config";
import express from "express";
import {
  acceptOffer,
  declineOffer,
  getOrder,
  markUnassigned,
  releaseOffer,
  saveOrder,
} from "./db/orders";
import {
  getDriver,
  listDrivers,
  setDriverOffer,
  setDriverOnline,
} from "./db/drivers";
import type { Order } from "./types";
import { deleteQueuedMessage, enqueueOrder, enqueuePassedOrder, releaseQueuedMessage } from "./queue";
import { notifyOrderStatus } from "./notify";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(express.json());

// Lets the Next.js app on port 3000 call this API from the browser.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Pulls driverId out of a JSON body, or "" if it is missing.
function readDriverId(body: unknown): string {
  if (!body || typeof body !== "object" || !("driverId" in body)) return "";
  const driverId = (body as { driverId?: unknown }).driverId;
  return typeof driverId === "string" ? driverId.trim() : "";
}

app.get("/", (_req, res) => {
  res.send("Server is running!");
});

app.get("/api", (_req, res) => {
  res.json({ message: "Success" });
});

// Returns one order, or 404.
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



// Marks the driver online so the worker can offer them orders.
app.post("/driver/online", async (req, res) => {
  try {
    const driverId = readDriverId(req.body);
    if (!driverId) return res.status(400).json({ error: "driverId is required" });

    const driver = await getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    await setDriverOnline(driverId, true);
    res.json({ driverId, online: true });
  } catch (error) {
    console.error("POST /driver/online failed:", error);
    res.status(500).json({ error: "Failed to go online" });
  }
});

// Marks the driver offline and puts any open offer back on its queue.
app.post("/driver/offline", async (req, res) => {
  try {
    const driverId = readDriverId(req.body);
    if (!driverId) return res.status(400).json({ error: "driverId is required" });

    const driver = await getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });

    await setDriverOnline(driverId, false);
    if (driver.currentOffer) {
      await releaseOffer(driver.currentOffer.orderId, driverId); // back to pending, not a deny
      try {
        await releaseQueuedMessage(driver.currentOffer.queueUrl, driver.currentOffer.receiptHandle);
      } catch (error) {
        console.error("Offline release message failed:", error);
      }
      await setDriverOffer(driverId, null);
    }

    res.json({ driverId, online: false });
  } catch (error) {
    console.error("POST /driver/offline failed:", error);
    res.status(500).json({ error: "Failed to go offline" });
  }
});

// Returns the order this driver is deciding on, or clears it if the 60s window is over.
app.get("/driver/offer", async (req, res) => {
  try {
    const driverId = typeof req.query.driverId === "string" ? req.query.driverId.trim() : "";
    if (!driverId) return res.status(400).json({ error: "driverId is required" });

    const driver = await getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if (!driver.currentOffer) return res.json({ order: null });

    const order = await getOrder(driver.currentOffer.orderId);
    const now = new Date().toISOString();
    const active =
      order?.status === "offered" &&
      order.offeredTo === driverId &&
      !!order.offerExpiresAt &&
      order.offerExpiresAt > now;

    if (!active) { // 60s ran out while the page was polling. Same path as going offline.
      if (order?.status === "offered" && order.offeredTo === driverId) {
        await releaseOffer(order.orderId, driverId);
      }
      try {
        await releaseQueuedMessage(driver.currentOffer.queueUrl, driver.currentOffer.receiptHandle);
      } catch (error) {
        console.error("Expired offer release failed:", error);
      }
      await setDriverOffer(driverId, null);
      return res.json({ order: null });
    }

    res.json({ order });
  } catch (error) {
    console.error("GET /driver/offer failed:", error);
    res.status(500).json({ error: "Failed to fetch offer" });
  }
});

// Assigns the order to this driver, deletes the SQS message, and publishes to SNS.
app.post("/order/:orderId/accept", async (req, res) => {
  try {
    const driverId = readDriverId(req.body);
    if (!driverId) return res.status(400).json({ error: "driverId is required" });

    const orderId = req.params.orderId;
    const driver = await getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if (!driver.currentOffer || driver.currentOffer.orderId !== orderId) {
      return res.status(409).json({ error: "This offer is no longer yours" });
    }

    const updated = await acceptOffer(orderId, driverId);
    if (!updated) return res.status(409).json({ error: "This offer is no longer yours" });

    try {
      await deleteQueuedMessage(driver.currentOffer.queueUrl, driver.currentOffer.receiptHandle);
    } catch (error) {
      console.error("Accept delete message failed:", error);
    }
    await setDriverOffer(driverId, null);

    try {
      await notifyOrderStatus(orderId, driverId);
    } catch (error) {
      console.error("Accept notify failed:", error);
    }

    res.json(updated);
  } catch (error) {
    console.error("POST /order/:orderId/accept failed:", error);
    res.status(500).json({ error: "Failed to accept order" });
  }
});

// Records the deny, then either stops the order or copies it onto the passed queue.
app.post("/order/:orderId/deny", async (req, res) => {
  try {
    const driverId = readDriverId(req.body);
    if (!driverId) return res.status(400).json({ error: "driverId is required" });

    const orderId = req.params.orderId;
    const driver = await getDriver(driverId);
    if (!driver) return res.status(404).json({ error: "Driver not found" });
    if (!driver.currentOffer || driver.currentOffer.orderId !== orderId) {
      return res.status(409).json({ error: "This offer is no longer yours" });
    }

    const updated = await declineOffer(orderId, driverId);
    if (!updated) return res.status(409).json({ error: "This offer is no longer yours" });

    const drivers = await listDrivers();
    const declined = new Set(updated.declinedBy ?? []);
    const everyoneDeclined = drivers.length > 0 && drivers.every((candidate) => declined.has(candidate.driverId));
    const offer = driver.currentOffer;

    if (everyoneDeclined) { // delete it so the order cannot loop forever
      await markUnassigned(orderId);
      try {
        await deleteQueuedMessage(offer.queueUrl, offer.receiptHandle);
      } catch (error) {
        console.error("Deny delete message failed:", error);
      }
      await setDriverOffer(driverId, null);
      return res.json({ ...updated, status: "unassigned" });
    }

    try {
      await enqueuePassedOrder(orderId, updated.declinedBy ?? []); // copy first, so a failed send can still retry
    } catch (error) {
      console.error("Failed to enqueue passed order:", error);
      await setDriverOffer(driverId, null);
      return res.status(500).json({
        error: "Denied, but the handoff to the next queue failed. The original message will retry.",
      });
    }

    try {
      await deleteQueuedMessage(offer.queueUrl, offer.receiptHandle); // drop the original so both queues don't offer it
    } catch (error) {
      console.error("Deny delete message failed:", error);
    }
    await setDriverOffer(driverId, null);
    res.json(updated);
  } catch (error) {
    console.error("POST /order/:orderId/deny failed:", error);
    res.status(500).json({ error: "Failed to deny order" });
  }
});

// Saves a pending order and sends it to the dispatch queue.
app.post("/order", async (req, res) => {
  try {
    const customerName = req.body?.customerName ?? "Guest";

    const order: Order = {
      orderId: String(Date.now()),
      status: "pending",
      customerName,
      createdAt: new Date().toISOString(),
    };

    await saveOrder(order);
    await enqueueOrder(order.orderId); // dispatch queue only. A deny copies it onto the passed queue later.
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
