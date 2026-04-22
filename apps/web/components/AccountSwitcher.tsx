"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  createClient, listClients,
  type ClientCreatePayload, type ClientRead,
} from "@/lib/api";
import { Icon } from "./icons/Icon";

const COLOR_PRESETS = [
  "#8A5A3B", "#2B6A4F", "#B5454B", "#3B5A8A", "#6B4A8A",
  "#C9851F", "#4F6BA0", "#6F6B68",
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function AccountSwitcher({ currentSlug }: { currentSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
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
            borderRadius: 8, minWidth: 300,
            boxShadow: "0 10px 28px rgba(0,0,0,0.14)",
            padding: 6, zIndex: 50,
            maxHeight: "70vh", display: "flex", flexDirection: "column",
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

          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "12px 10px", fontSize: 12, color: "var(--ink-4)" }}>
                {query ? `Nada encontrado para “${query}”.` : "Nenhum cliente ainda."}
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

          {/* Divider + CTA "Novo cliente" */}
          <div style={{ borderTop: "1px solid var(--border)", padding: 4, marginTop: 4 }}>
            <button
              onClick={() => { setOpen(false); setCreateOpen(true); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8,
                padding: "9px 10px", borderRadius: 6,
                background: "transparent", border: "none", cursor: "pointer",
                fontSize: 12, color: "var(--ink-2)", fontWeight: 500,
                fontFamily: "var(--font-sans)", textAlign: "left",
                transition: "background .08s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 4,
                background: "var(--surface-2)", color: "var(--ink-2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 400, lineHeight: 1,
              }}>+</span>
              Novo cliente
              <span className="mono" style={{
                marginLeft: "auto", fontSize: 9, color: "var(--ink-4)",
                letterSpacing: 0.5, textTransform: "uppercase",
              }}>
                cadastrar
              </span>
            </button>
          </div>
        </div>
      )}

      {createOpen && (
        <NewClientModal
          onCreated={(c) => {
            setCreateOpen(false);
            router.push(`/c/${c.slug}/overview`);
          }}
          onCancel={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  NEW CLIENT MODAL
// ─────────────────────────────────────────────────────────────────────────

function NewClientModal({
  onCreated, onCancel,
}: {
  onCreated: (c: ClientRead) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [accent, setAccent] = useState(COLOR_PRESETS[0]);
  const [budget, setBudget] = useState<string>("");
  const [goal, setGoal] = useState<string>("");
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const mut = useMutation({
    mutationFn: (body: ClientCreatePayload) => createClient(body),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      onCreated(c);
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    mut.mutate({
      name: name.trim(),
      slug: slug.trim(),
      accent_color: accent,
      monthly_budget: budget ? Number(budget) : null,
      monthly_revenue_goal: goal ? Number(goal) : null,
    });
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(10, 10, 8, 0.55)",
        backdropFilter: "blur(2px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "10vh 16px 16px",
        overflow: "auto",
      }}
    >
      <div style={{
        width: "100%", maxWidth: 520,
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 12, boxShadow: "0 24px 56px rgba(0,0,0,0.28)",
        padding: 22,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>
              Novo cliente
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Cadastrar nova conta
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Fechar"
            style={{
              background: "transparent", border: "none", color: "var(--ink-4)",
              fontSize: 16, cursor: "pointer", padding: "2px 6px", lineHeight: 1,
            }}
          >✕</button>
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
          <div>
            <Lbl>Nome do cliente *</Lbl>
            <input
              ref={firstRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              placeholder="Ex: Segredos de Minas"
              required
              style={{ ...inputStyle, fontSize: 14 }}
            />
          </div>

          <div>
            <Lbl>Slug (URL) *</Lbl>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>/c/</span>
              <input
                value={slug}
                onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                placeholder="segredos-de-minas"
                required
                pattern="[a-z0-9-]+"
                style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <Lbl>Cor de destaque</Lbl>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  aria-label={c}
                  style={{
                    width: 24, height: 24, borderRadius: 5, background: c,
                    border: accent === c ? "2px solid var(--ink)" : "1px solid var(--border)",
                    cursor: "pointer", padding: 0,
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Lbl>Budget mensal (R$)</Lbl>
              <input
                type="number" min="0" step="100" value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="10000" style={inputStyle}
              />
            </div>
            <div>
              <Lbl>Meta de receita (R$)</Lbl>
              <input
                type="number" min="0" step="100" value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="50000" style={inputStyle}
              />
            </div>
          </div>

          {mut.isError && (
            <div style={{ color: "var(--neg)", fontSize: 12 }}>
              {(mut.error as Error).message}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" className="btn ghost" onClick={onCancel} disabled={mut.isPending}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={mut.isPending || !name.trim() || !slug.trim()}>
              {mut.isPending ? "Criando…" : "Criar cliente"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Lbl({ children }: { children: React.ReactNode }) {
  return (
    <div className="mono" style={{
      fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.8,
      textTransform: "uppercase", marginBottom: 4, fontWeight: 600,
    }}>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  outline: "none",
  width: "100%",
};
