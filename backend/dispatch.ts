import { findAvailableDriver, setDriverAvailability } from "./db/drivers";
import { updateOrderStatus } from "./db/orders";
import type { Order } from "./types";

export async function dispatchOrder(order: Order): Promise<Order> {
  const driver = await findAvailableDriver();

  if (!driver) {
    return order;
  }

  await setDriverAvailability(driver.driverId, false);

  const updated = await updateOrderStatus(
    order.orderId,
    "assigned",
    driver.driverId
  );

  return updated ?? { ...order, status: "assigned", driverId: driver.driverId };
}
