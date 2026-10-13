"use client";

import { useState } from "react";
import { AppShell } from "../components/AppShell";

type Order = {
  orderId: string;
  status: string;
  customerName?: string;
  driverId?: string;
};

// Customer page. Places an order, then shows the id the API saved.
export default function Home() {
  const [customerName, setCustomerName] = useState("");
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // POST /order saves the row and puts it on the dispatch queue. Status comes back as pending.
  async function handlePlaceOrder() {
    setError("");
    setLoading(true);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000); // don't hang the button if the API is down

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
            .join(" — "),
        );
      }

      setOrder(data as Order);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setError(
          "Request timed out. Is the backend running on port 3001? Did you run `npm run setup:aws`?",
        );
      } else if (err instanceof TypeError) {
        setError(
          "Cannot reach backend at http://localhost:3001. Start it with: cd backend && npm start",
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
    <AppShell>
      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-carrot">Delivery</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Place an order</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Enter your name and we&apos;ll send the order out for a driver.
        </p>

        <label className="mt-6 mb-2 block text-sm font-semibold">Your name</label>
        <input
          type="text"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Vinay"
          className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-foreground outline-none placeholder:text-[#B0B3B8] focus:border-ic-green focus:ring-2 focus:ring-[#0AAD0A]/20"
        />

        <button
          onClick={handlePlaceOrder}
          disabled={loading || !customerName.trim()}
          className="mt-4 w-full rounded-full bg-ic-green py-3 font-semibold text-white hover:bg-ic-green-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Placing order..." : "Place order"}
        </button>

        {error && (
          <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        {order && (
          <div className="mt-4 rounded-2xl bg-[#E7F6E7] p-4 text-sm">
            <p className="font-semibold text-ic-green-dark">Order placed</p>
            <p className="mt-1 text-foreground">ID {order.orderId}</p>
            <p className="capitalize text-muted">Status: {order.status}</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
