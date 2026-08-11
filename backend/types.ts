export type OrderStatus = "pending" | "assigned" | "completed";

export interface Order {
  orderId: string;
  status: OrderStatus;
  customerName: string;
  driverId?: string;
  createdAt: string;
}

export interface Driver {
  driverId: string;
  name: string;
  available: boolean;
}
