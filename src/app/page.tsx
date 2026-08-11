"use client";

import { useState } from "react";

// WHAT: shape of the order JSON our backend returns
type Order = {
  orderId: string;
  status: string;
  customerName?: string;
  driverId?: string;
};

export default function Home() {
  // WHERE: state lives here so React re-renders when values change
  const [customerName, setCustomerName] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // WHAT: when user clicks Place Order, POST to backend and show result
  async function handlePlaceOrder() {
    setError("");
    setLoading(true);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(`${apiUrl}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        const details =
          typeof data.details === "string" ? data.details : undefined;
        const hint = typeof data.hint === "string" ? data.hint : undefined;
        throw new Error(
          [data.error ?? `Request failed: ${response.status}`, details, hint]
            .filter(Boolean)
            .join(" — ")
        );
      }

      setOrder(data as Order);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError(
          "Request timed out. Is the backend running on port 3001? Did you run `npm run setup:aws`?"
        );
      } else if (err instanceof TypeError) {
        setError(
          "Cannot reach backend at http://localhost:3001. Start it with: cd backend && npm start"
        );
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 font-sans dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Place an Order
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Frontend → backend (3001) → DynamoDB. Backend must be running.
        </p>

        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Your name
        </label>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Vinay"
          className="mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-green-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        <button
          onClick={handlePlaceOrder}
          disabled={loading || !customerName.trim()}
          className="w-full rounded-lg bg-green-600 py-2.5 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Placing order..." : "Place Order"}
        </button>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        {order && (
          <div className="mt-4 rounded-lg bg-green-50 p-4 text-sm dark:bg-green-950">
            <p className="font-medium text-green-800 dark:text-green-200">
              Order placed!
            </p>
            <p className="mt-1 text-green-700 dark:text-green-300">
              ID: {order.orderId}
            </p>
            <p className="text-green-700 dark:text-green-300">
              Status: {order.status}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
