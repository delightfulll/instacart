"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function CarrotMark() {
  return (
    <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden>
      <path
        d="M20 16c-1.2 1.6-6.5 2.2-9.2 1.2 2.2-3.4 6.4-5.2 9.2-1.2Z"
        fill="#0AAD0A"
      />
      <path
        d="M19.2 15.2C16.4 10.6 17.6 5.2 20.4 3.2c1.6 4.2 1.2 8.4-1.2 12Z"
        fill="#0AAD0A"
      />
      <path
        d="M21.4 15.4c3.6-3.2 8.2-3.4 11-1.2-3.4 1.2-7.2 2-11 1.2Z"
        fill="#088608"
      />
      <path
        d="M20 14.5c-4.6 5.2-7.4 12.6-6.2 21.2 3.6 1.6 8.8 1.6 12.4 0 1.2-8.6-1.6-16-6.2-21.2Z"
        fill="#FF7009"
      />
      <path
        d="M16.8 22.5h6.2M16.2 27.2h7.6M16.8 32h6.2"
        stroke="#E85D00"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Order" },
    { href: "/driver", label: "Drive" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <CarrotMark />
            <span className="text-[22px] font-bold tracking-tight">
              instacart
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-semibold">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3 py-1.5 ${
                    active
                      ? "bg-[#E7F6E7] text-ic-green"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-lg px-5 py-8">{children}</main>
    </div>
  );
}
