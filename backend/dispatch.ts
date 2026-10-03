import { findOnlineDriver, setDriverOffer } from "./db/drivers";
import { extendOffer, getOrder, pinOffer, releaseOffer } from "./db/orders";

export const OFFER_VISIBILITY_SECONDS = 60; // SQS hide and the offer deadline use the same window

export type OfferResult = { action: "delete" } | { action: "release" } | { action: "offered"; driverId: string };

// Offer deadline, 60s from now, matching how long SQS hides the message.
function expiresAtFromNow(): string {
  return new Date(Date.now() + OFFER_VISIBILITY_SECONDS * 1000).toISOString();
}

// Picks one driver for this message and tells the worker to delete it, put it back, or leave it hidden.
export async function offerMessage(
  orderId: string,
  receiptHandle: string,
  queueUrl: string
): Promise<OfferResult> {
  const order = await getOrder(orderId);
  if (!order || order.status === "assigned" || order.status === "completed" || order.status === "unassigned") {
    return { action: "delete" }; // nothing left to offer
  }

  const expiresAt = expiresAtFromNow();
  const now = new Date().toISOString();
  const offerIsOpen =
    order.status === "offered" &&
    !!order.offeredTo &&
    !!order.offerExpiresAt &&
    order.offerExpiresAt > now; // someone is still inside their 60s window

  if (offerIsOpen && order.offeredTo) {
    const extended = await extendOffer(order.orderId, order.offeredTo, expiresAt);
    if (!extended) return { action: "release" };
    // Message came back while they are still deciding. Keep the offer and store the new receipt handle.
    await setDriverOffer(order.offeredTo, { orderId: order.orderId, receiptHandle, queueUrl });
    console.log("Refreshed offer", order.orderId, "for", order.offeredTo);
    return { action: "offered", driverId: order.offeredTo };
  }

  if (order.status === "offered" && order.offeredTo) {
    await releaseOffer(order.orderId, order.offeredTo); // window expired. Not a deny.
    await setDriverOffer(order.offeredTo, null);
  }

  const driver = await findOnlineDriver(order.declinedBy ?? []); // skips offline, already denied, or already deciding
  if (!driver) {
    console.log("No online driver for", order.orderId);
    return { action: "release" };
  }

  const pinned = await pinOffer(order.orderId, driver.driverId, expiresAt); // fails if another receive pinned it first
  if (!pinned) {
    console.log("Could not pin offer", order.orderId);
    return { action: "release" };
  }

  // Stored on the driver so accept, deny, and offline can find this exact message later.
  await setDriverOffer(driver.driverId, { orderId: order.orderId, receiptHandle, queueUrl });
  console.log("Offering", order.orderId, "to", driver.driverId);
  return { action: "offered", driverId: driver.driverId };
}
