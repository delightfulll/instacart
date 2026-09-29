import { getPendingOrders } from "@/backend/db/orders";
import { useEffect, useState } from "react";
import type { Order } from "@/backend/types";

export default function DriverHome() {
  //list of orders
  const [orders, setOrders] = useState<Order[]>([]);
  async function fetchOrders() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    try {
      const response = await fetch(`${apiUrl}/orders`);
      const data = await response.json();
      setOrders(data);
    } catch (error) {
      console.log(error);
    }
  }

  //fetch the orders after the page loads
  useEffect(() => {
    fetchOrders();
  }, []);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Available Orders
        </h1>
        <ul>
          {orders.map((order) => (
            <li key={order.orderId}>{order.orderId}</li>
          ))}
        </ul>
      </main>
    </div>
  );
}
