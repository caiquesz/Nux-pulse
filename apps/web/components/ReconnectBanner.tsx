"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { connectionsHealth } from "@/lib/api";

/**
 * ReconnectBanner — alerta global no AppShell quando ha contas com token
 * quebrado. Causa tipica: chave de criptografia (TOKEN_ENCRYPTION_KEY ou
 * legacy API_SECRET_KEY) mudou — todos os tokens armazenados deixam de
 * decriptar (InvalidToken).
 *
 * UX:
 *   - Renderiza so quando needs_reconnect > 0 (silencioso quando tudo ok)
 *   - Lista os clientes afetados, link clicavel pra Settings de cada
 *   - Dismissable mas reaparece em qualquer reload (nao oculta o problema)
 *   - Polling 60s — quando user reconecta uma conta, banner atualiza sozinho
 */
export function ReconnectBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["connections-health"],
    queryFn: connectionsHealth,
    refetchInterval: 60_000,
    // Tolera erro silenciosamente — se o endpoint falhar, nao spamma o user
    retry: 1,
  });

  if (!data || data.needs_reconnect === 0 || dismissed) return null;

  const broken = data.connections.filter((c) => c.status !== "ok");

  return (
    <div className="reconnect-banner" role="alert">
      <div className="reconnect-banner-icon" aria-hidden>⚠</div>
      <div className="reconnect-banner-body">
        <div className="reconnect-banner-title">
          {broken.length === 1
            ? "1 conta precisa ser reconectada"
            : `${broken.length} contas precisam ser reconectadas`}
        </div>
        <div className="reconnect-banner-detail">
          Os tokens armazenados não podem ser decriptados — provavelmente a chave
          de criptografia foi rotacionada.{" "}
          <strong>Reconecte cada conta uma vez</strong> e configure{" "}
          <code>TOKEN_ENCRYPTION_KEY</code> como env var imutável pra não voltar
          a acontecer.
        </div>
        <div className="reconnect-banner-list">
          {broken.map((c) => (
            <Link
              key={c.connection_id}
              href={`/c/${c.client_slug}/settings`}
              className="reconnect-banner-chip"
              title={c.reason ?? c.last_error ?? c.status}
            >
              {c.client_name}
              <span className="reconnect-banner-chip-arrow">→</span>
            </Link>
          ))}
        </div>
      </div>
      <button
        className="reconnect-banner-dismiss"
        onClick={() => setDismissed(true)}
        aria-label="Fechar aviso (reaparece em reload)"
        title="Fechar (volta no proximo reload)"
      >
        ×
      </button>
    </div>
  );
}
