"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";

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
    return JSON.parse(text) as {
      error?: string;
      order?: Order | null;
      orderId?: string;
      status?: string;
    };
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

    async function tick() {
      // one poll of GET /driver/offer
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
      const response = await fetch(
        `${apiUrl}/driver/${next ? "online" : "offline"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId }),
        },
      );
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
      const response = await fetch(
        `${apiUrl}/order/${order.orderId}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId }),
        },
      );
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
    <AppShell>
      <section className="rounded-3xl border border-line bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-carrot">Shopper</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              Driver offer
            </h1>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              online
                ? "bg-[#E7F6E7] text-ic-green-dark"
                : "bg-[#F2F3F4] text-muted"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ic-green" : "bg-[#B0B3B8]"}`}
            />
            {online ? "Online" : "Offline"}
          </span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Go online to receive available orders.
        </p>

        <label className="mt-6 mb-2 block text-sm font-semibold">
          Driver id
        </label>
        <input
          type="text"
          value={driverId}
          onChange={(e) => setDriverId(e.target.value)}
          disabled={online || busy}
          className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-foreground outline-none focus:border-ic-green focus:ring-2 focus:ring-[#0AAD0A]/20 disabled:bg-[#F7F8F8] disabled:opacity-70"
        />

        <button
          onClick={() => setAvailability(!online)}
          disabled={busy || !driverId.trim()}
          className={`mt-4 w-full rounded-full py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
            online
              ? "border border-line bg-white text-foreground hover:bg-[#F7F8F8]"
              : "bg-ic-green text-white hover:bg-ic-green-dark"
          }`}
        >
          {online ? "Go offline" : "Go online"}
        </button>

        {online && !order && (
          <p className="mt-5 text-sm text-muted">
            You are online. Waiting for the next order.
          </p>
        )}

        {order && (
          <div className="mt-5 rounded-2xl border border-[#FFE0C7] bg-[#FFF8F3] p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-carrot">
              New offer
            </p>
            <p className="mt-1 text-base font-semibold">
              {order.customerName ?? "Customer"}
            </p>
            <p className="text-muted">Order {order.orderId}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => decide("accept")}
                disabled={busy}
                className="flex-1 rounded-full bg-ic-green py-2.5 font-semibold text-white hover:bg-ic-green-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                Accept
              </button>
              <button
                onClick={() => decide("deny")}
                disabled={busy}
                className="flex-1 rounded-full border border-line bg-white py-2.5 font-semibold text-foreground hover:bg-[#F7F8F8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </div>
        )}

        {notice && (
          <p className="mt-4 rounded-2xl bg-[#E7F6E7] p-3 text-sm text-ic-green-dark">
            {notice}
          </p>
        )}

        {error && (
          <p className="mt-4 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>
    </AppShell>
  );
}
