"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { listClients } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["clients"],
    queryFn: listClients,
  });

  useEffect(() => {
    const first = data?.[0];
    if (first) router.replace(`/c/${first.slug}/overview`);
  }, [data, router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--ink)",
        padding: 32,
      }}
    >
      <div style={{ maxWidth: 520, textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.8px", marginBottom: 8 }}>
          NUX Pulse
        </h1>
        {isLoading && (
          <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando clientes…</p>
        )}
        {isError && (
          <p style={{ color: "var(--neg)", fontSize: 13 }}>
            Não consegui falar com a API em <code className="mono">/api/clients</code>.
            Verifique se o backend está rodando em <code className="mono">http://localhost:8000</code>.
          </p>
        )}
        {data && data.length === 0 && (
          <>
            <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 16 }}>
              Nenhum cliente cadastrado ainda. Rode o seed:
            </p>
            <pre
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 16,
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                textAlign: "left",
                color: "var(--ink-2)",
              }}
            >
{`docker compose exec api python -m scripts.seed`}
            </pre>
          </>
        )}
      </div>
    </main>
  );
}
