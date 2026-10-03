"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Order = {
  orderId: string;
  status: string;
  customerName?: string;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Parses the API body. A missing route comes back as an HTML page, which is not JSON.
async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as { error?: string; order?: Order | null; orderId?: string; status?: string };
  } catch {
    throw new Error(
      "The API returned a page instead of JSON. Point NEXT_PUBLIC_API_URL at the local API on port 3001 and restart the frontend.",
    );
  }
}

// Driver page. Go online, then poll until the worker pins an order to this driver id.
export default function DriverHome() {
  const [driverId, setDriverId] = useState("driver-1");
  const [online, setOnline] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const pollGeneration = useRef(0); // bumped on accept/deny so an in-flight poll cannot restore the card

  // While online, asks every 3 seconds whether this driver has an offer.
  useEffect(() => {
    if (!online) return;

    let cancelled = false;

    async function tick() { // one poll of GET /driver/offer
      const generation = pollGeneration.current;
      try {
        const response = await fetch(
          `${apiUrl}/driver/offer?driverId=${encodeURIComponent(driverId)}`,
        );
        const data = await readJson(response);
        if (!response.ok) {
          throw new Error(data.error ?? "Could not load offer");
        }
        if (!cancelled && generation === pollGeneration.current) {
          setOrder(data.order ?? null);
          setError("");
        }
      } catch (err) {
        if (!cancelled && generation === pollGeneration.current) {
          setError(err instanceof Error ? err.message : "Could not load offer");
        }
      }
    }

    tick();
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [online, driverId]);

  // Go online so the worker can offer orders, or offline and release any open offer.
  async function setAvailability(next: boolean) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const response = await fetch(`${apiUrl}/driver/${next ? "online" : "offline"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error ?? "Could not update driver");
      }
      setOnline(next);
      if (!next) setOrder(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update driver");
    } finally {
      setBusy(false);
    }
  }

  // Accept assigns the order. Deny copies it to the passed queue for the next driver.
  async function decide(action: "accept" | "deny") {
    if (!order) return;
    pollGeneration.current += 1;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`${apiUrl}/order/${order.orderId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverId }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data.error ?? `Could not ${action} order`);
      }
      pollGeneration.current += 1;
      setOrder(null);
      setNotice(
        action === "accept"
          ? `Accepted order ${data.orderId}.`
          : data.status === "unassigned"
            ? `Denied order ${data.orderId}. No drivers left, so it was closed.`
            : `Denied order ${data.orderId}. It moved to the next driver.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

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
          Driver offer
        </h1>
        <p className="mb-6 text-sm text-zinc-500">
          Go online to receive one order. Deny sends it to the next driver. Use driver-2 in
          another window to catch a pass.
        </p>

        <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Driver id
        </label>
        <input
          type="text"
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          disabled={online || busy}
          className="mb-4 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 outline-none focus:border-green-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        <button
          onClick={() => setAvailability(!online)}
          disabled={busy || !driverId.trim()}
          className="mb-6 w-full rounded-lg bg-zinc-900 py-2.5 font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {online ? "Go offline" : "Go online"}
        </button>

        {online && !order && (
          <p className="text-sm text-zinc-500">You are online. Waiting for the next order.</p>
        )}

        {order && (
          <div className="rounded-lg border border-zinc-200 px-3 py-3 text-sm text-zinc-800 dark:border-zinc-800 dark:text-zinc-200">
            <p className="font-medium">{order.customerName ?? "Customer"}</p>
            <p className="text-zinc-500">Order {order.orderId}</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => decide("accept")}
                disabled={busy}
                className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => decide("deny")}
                disabled={busy}
                className="flex-1 rounded-lg border border-zinc-300 py-2 font-medium text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900"
              >
                Deny
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">
            {notice}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}
      </main>
    </div>
  );
}
