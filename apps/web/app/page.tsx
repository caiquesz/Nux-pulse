"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { createClient, listClients, type ClientCreatePayload } from "@/lib/api";

const COLOR_PRESETS = ["#8A5A3B", "#2B6A4F", "#B5454B", "#3B5A8A", "#6B4A8A", "#6F6B68"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function Home() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [accent, setAccent] = useState(COLOR_PRESETS[0]);
  const [budget, setBudget] = useState<string>("");
  const [goal, setGoal] = useState<string>("");

  const create = useMutation({
    mutationFn: (body: ClientCreatePayload) => createClient(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setShowForm(false);
      setName(""); setSlug(""); setSlugTouched(false);
      setBudget(""); setGoal("");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    create.mutate({
      name: name.trim(),
      slug: slug.trim(),
      accent_color: accent,
      monthly_budget: budget ? Number(budget) : null,
      monthly_revenue_goal: goal ? Number(goal) : null,
    });
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)", padding: "48px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.8px" }}>NUX Pulse</h1>
            <p style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 4 }}>
              Clientes sob análise — escolha um pra abrir o dashboard.
            </p>
          </div>
          {!showForm && (
            <button className="btn" onClick={() => setShowForm(true)}>
              + Novo cliente
            </button>
          )}
        </header>

        {isLoading && <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando…</p>}
        {isError && (
          <div className="card" style={{ padding: 16, borderLeft: "3px solid var(--neg)" }}>
            <strong>Erro ao falar com a API.</strong>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
              {(error as Error)?.message}
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={submit} className="card" style={{ padding: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Novo cliente</h2>

            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Nome *</span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
                  placeholder="Segredos de Minas"
                  required
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
                  Slug (URL) * <code className="mono" style={{ color: "var(--ink-4)" }}>— /c/[slug]</code>
                </span>
                <input
                  value={slug}
                  onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
                  placeholder="segredos-de-minas"
                  required
                  pattern="[a-z0-9-]+"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                />
              </label>

              <div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>Cor de destaque</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {COLOR_PRESETS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAccent(c)}
                      aria-label={c}
                      style={{
                        width: 28, height: 28, borderRadius: 6, background: c,
                        border: accent === c ? "2px solid var(--ink)" : "1px solid var(--border)",
                        cursor: "pointer",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Budget mensal (R$)</span>
                  <input
                    type="number" min="0" step="100" value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="10000" style={inputStyle}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Meta de receita (R$)</span>
                  <input
                    type="number" min="0" step="100" value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="50000" style={inputStyle}
                  />
                </label>
              </div>

              {create.isError && (
                <div style={{ color: "var(--neg)", fontSize: 12 }}>
                  {(create.error as Error).message}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="btn ghost" onClick={() => setShowForm(false)} disabled={create.isPending}>
                  Cancelar
                </button>
                <button type="submit" className="btn" disabled={create.isPending}>
                  {create.isPending ? "Salvando…" : "Criar cliente"}
                </button>
              </div>
            </div>
          </form>
        )}

        {data && data.length === 0 && !showForm && (
          <div className="card" style={{ padding: 32, textAlign: "center" }}>
            <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 16 }}>
              Nenhum cliente cadastrado ainda.
            </p>
            <button className="btn" onClick={() => setShowForm(true)}>+ Criar primeiro cliente</button>
          </div>
        )}

        {data && data.length > 0 && (
          <ul style={{ listStyle: "none", display: "grid", gap: 8 }}>
            {data.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/c/${c.slug}/overview`}
                  className="card"
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: 16,
                    textDecoration: "none", color: "var(--ink)",
                  }}
                >
                  <span
                    style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: c.accent_color ?? "var(--ink-4)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>/{c.slug}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>abrir →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 14,
  fontFamily: "var(--font-sans)",
  outline: "none",
};
