"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { listClients, type ClientRead } from "@/lib/api";
import { Icon } from "./icons/Icon";

export function AccountSwitcher({ currentSlug }: { currentSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const { data: clients = [] } = useQuery<ClientRead[]>({
    queryKey: ["clients"],
    queryFn: listClients,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const current = clients.find((c) => c.slug === currentSlug);
  const page = pathname.split("/").slice(3).join("/") || "overview";

  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  const switchTo = (slug: string) => {
    setOpen(false);
    router.push(`/c/${slug}/${page}`);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className={`pill ${open ? "active" : ""}`} onClick={() => setOpen(!open)}>
        <span
          style={{ width: 8, height: 8, borderRadius: 2, background: current?.accent_color ?? "var(--ink-4)" }}
          aria-hidden
        />
        <span className="mono" style={{ color: "var(--ink-4)" }}>CONTA</span>
        <span>{current?.name ?? currentSlug}</span>
        <Icon name="chevdown" size={11} />
      </button>
      {open && (
        <div
          style={{
            position: "absolute", right: 0, top: "calc(100% + 6px)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, minWidth: 280, boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            padding: 6, zIndex: 50,
          }}
        >
          <div style={{ padding: "6px 8px 10px" }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente…"
              style={{
                width: "100%", padding: "6px 8px", fontSize: 12,
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: 6, color: "var(--ink)", outline: "none",
                fontFamily: "var(--font-sans)",
              }}
            />
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 10px", fontSize: 12, color: "var(--ink-4)" }}>
              Nenhum cliente encontrado.
            </div>
          ) : (
            filtered.map((c) => (
              <button
                key={c.slug}
                className="sb-item"
                onClick={() => switchTo(c.slug)}
                style={{ justifyContent: "space-between", width: "100%" }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 10, height: 10, borderRadius: 2,
                      background: c.accent_color ?? "var(--ink-4)", flexShrink: 0,
                    }}
                  />
                  {c.name}
                </span>
                {currentSlug === c.slug && <Icon name="check" size={12} />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
