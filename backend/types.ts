// pending: saved, not shown yet. offered: one driver is deciding.
// assigned: they accepted. completed: unused. unassigned: every seeded driver denied it.
export type OrderStatus = "pending" | "offered" | "assigned" | "completed" | "unassigned";

export interface Order {
  orderId: string;
  status: OrderStatus;
  customerName: string;
  driverId?: string;
  createdAt: string;
  offeredTo?: string; // driver currently deciding
  offerExpiresAt?: string; // when that decision window ends
  declinedBy?: string[]; // drivers who already passed, so we don't offer it to them again
}

export interface DriverOffer {
  orderId: string;
  receiptHandle: string; // from the ReceiveMessage that hid this message
  queueUrl: string; // dispatch or passed queue. A receipt handle only works on the one that issued it.
}

export interface Driver {
  driverId: string;
  name: string;
  available: boolean;
  online?: boolean; // true after the driver clicks Go online
  currentOffer?: DriverOffer;
}
