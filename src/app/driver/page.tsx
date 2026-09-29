"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Order = {
  orderId: string;
  status: string;
  customerName?: string;
};

export default function DriverHome() {
  const [orders, setOrders] = useState<Order[]>([]);

  async function fetchOrders() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    try {
      const response = await fetch(`${apiUrl}/driver/orders`);
      const data = await response.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.log(error);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          href="/"
          className="mb-4 inline-block text-sm text-green-700 hover:underline dark:text-green-400"
        >
          Customer order
        </Link>
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Available Orders
        </h1>
        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">No pending orders right now.</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <li
                key={order.orderId}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-800 dark:text-zinc-200"
              >
                <p className="font-medium">{order.orderId}</p>
                {order.customerName && (
                  <p className="text-zinc-500">{order.customerName}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
