"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  addExternalFile, deleteFile, listFiles, uploadFile,
  type ClientFile, type FileCategory,
} from "@/lib/api";

// ═══════════════════════════════════════════════════════════════════════════
//  FILES TAB — biblioteca de arquivos por cliente
//  Layout estilo Frontify/Notion: busca + categorias + tile grid.
//  Drop global (arrastar em qualquer lugar da aba mostra overlay).
// ═══════════════════════════════════════════════════════════════════════════

type CategoryCfg = { key: FileCategory; label: string; color: string; icon: string };

const CATEGORIES: CategoryCfg[] = [
  { key: "briefing",   label: "Briefing",   color: "oklch(0.52 0.08 235)", icon: "📋" },
  { key: "id_visual",  label: "ID Visual",  color: "oklch(0.68 0.14 65)",  icon: "🎨" },
  { key: "fluxograma", label: "Fluxograma", color: "oklch(0.56 0.22 265)", icon: "🧭" },
  { key: "relatorio",  label: "Relatórios", color: "oklch(0.45 0.14 255)", icon: "📊" },
  { key: "contrato",   label: "Contratos",  color: "oklch(0.58 0.13 155)", icon: "📜" },
  { key: "outros",     label: "Outros",     color: "var(--ink-3)",         icon: "📁" },
];

function formatBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "agora";
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 30) return `${Math.floor(d / 7)}sem`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function iconFor(f: ClientFile): string {
  if (f.external_url) return "🔗";
  const m = f.mime_type ?? "";
  if (m.startsWith("image/")) return "🖼";
  if (m.startsWith("video/")) return "🎬";
  if (m === "application/pdf") return "📄";
  if (m.includes("presentation")) return "📽";
  if (m.includes("spreadsheet") || m === "text/csv") return "📊";
  if (m.includes("word") || m === "text/plain") return "📝";
  if (m === "application/zip") return "📦";
  return "📁";
}

// ═══════════════════════════════════════════════════════════════════════════

export function FilesTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const filesQ = useQuery({ queryKey: ["files", slug], queryFn: () => listFiles(slug), enabled: !!slug });

  const [filter, setFilter] = useState<FileCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [uploadCategory, setUploadCategory] = useState<FileCategory>("briefing");
  const [externalOpen, setExternalOpen] = useState(false);
  const [globalDrag, setGlobalDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const allFiles = filesQ.data ?? [];
  const files = useMemo(() => {
    return allFiles
      .filter((f) => filter === "all" || f.category === filter)
      .filter((f) => !search || f.name.toLowerCase().includes(search.toLowerCase()));
  }, [allFiles, filter, search]);

  const countsByCategory = useMemo(() => {
    const base: Record<FileCategory, number> = {
      briefing: 0, id_visual: 0, fluxograma: 0, relatorio: 0, contrato: 0, outros: 0,
    };
    for (const f of allFiles) {
      base[f.category as FileCategory] = (base[f.category as FileCategory] ?? 0) + 1;
    }
    return base;
  }, [allFiles]);

  const uploadMut = useMutation({
    mutationFn: async (files: FileList | File[]) => {
      const arr = Array.from(files);
      const results: ClientFile[] = [];
      for (const f of arr) {
        const r = await uploadFile(slug, f, uploadCategory);
        results.push(r);
      }
      return results;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["files", slug] });
      setUploadError(null);
    },
    onError: (e) => setUploadError((e as Error).message),
  });

  const externalMut = useMutation({
    mutationFn: (payload: { name: string; external_url: string; category: FileCategory; description: string | null }) =>
      addExternalFile(slug, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["files", slug] });
      setExternalOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files", slug] }),
  });

  // Drag global: escuta dragover/dragleave na window
  useEffect(() => {
    let counter = 0;
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      counter++;
      setGlobalDrag(true);
    };
    const onLeave = () => {
      counter--;
      if (counter <= 0) { counter = 0; setGlobalDrag(false); }
    };
    const onDrop = () => { counter = 0; setGlobalDrag(false); };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const totalFiles = allFiles.length;

  return (
    <div style={{ position: "relative" }}>
      {/* ── TOOLBAR superior ──────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 8, alignItems: "center",
        marginBottom: 12, flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 360 }}>
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }}
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar arquivo…"
            style={{
              width: "100%", padding: "7px 11px 7px 32px", height: 32,
              borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--ink)",
              fontSize: 12.5, outline: "none",
            }}
          />
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <UploadCategoryPill value={uploadCategory} onChange={setUploadCategory} />
          <button className="btn ghost" onClick={() => setExternalOpen((s) => !s)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "-2px" }}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" />
            </svg>
            Link externo
          </button>
          <button className="btn" onClick={() => inputRef.current?.click()} disabled={uploadMut.isPending}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "-2px" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploadMut.isPending ? "Enviando…" : "Enviar arquivo"}
          </button>
          <input
            ref={inputRef} type="file" multiple hidden
            onChange={(e) => e.target.files?.length && uploadMut.mutate(e.target.files)}
          />
        </div>
      </div>

      {/* ── Categoria: segmented chips ────────────────────────── */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 6,
        marginBottom: 18, paddingBottom: 14,
        borderBottom: "1px solid var(--border)",
      }}>
        <CategoryChip
          label="Todos"
          count={totalFiles}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c.key}
            label={c.label}
            icon={c.icon}
            color={c.color}
            count={countsByCategory[c.key]}
            active={filter === c.key}
            onClick={() => setFilter(c.key)}
          />
        ))}
      </div>

      {/* ── Upload error ────────────────────────────────────── */}
      {uploadError && (
        <div style={{
          padding: "10px 14px", marginBottom: 14,
          background: "oklch(0.96 0.02 28)", color: "oklch(0.40 0.14 28)",
          border: "1px solid oklch(0.85 0.07 28)",
          borderRadius: 8, fontSize: 12,
        }}>
          ⚠ Falha no upload: {uploadError}
        </div>
      )}

      {/* ── Form externo ────────────────────────────────────── */}
      {externalOpen && (
        <ExternalLinkForm
          onSubmit={(body) => externalMut.mutate(body)}
          submitting={externalMut.isPending}
          error={externalMut.error ? (externalMut.error as Error).message : null}
          onCancel={() => setExternalOpen(false)}
        />
      )}

      {/* ── Estados ─────────────────────────────────────────── */}
      {filesQ.isLoading && <LoadingGrid />}
      {filesQ.isError && (
        <div className="card" style={{ padding: 14,  }}>
          {(filesQ.error as Error)?.message}
        </div>
      )}

      {!filesQ.isLoading && files.length === 0 && (
        <EmptyState
          filter={filter}
          search={search}
          onUpload={() => inputRef.current?.click()}
        />
      )}

      {/* ── GRID DE TILES ───────────────────────────────────── */}
      {files.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 14,
        }}>
          {files.map((f) => (
            <FileTile
              key={f.id}
              file={f}
              onDelete={() => {
                if (confirm(`Excluir "${f.name}"?`)) deleteMut.mutate(f.id);
              }}
            />
          ))}
        </div>
      )}

      {/* ── DROP OVERLAY GLOBAL (aparece ao arrastar) ─────── */}
      {globalDrag && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            setGlobalDrag(false);
            if (e.dataTransfer.files?.length) uploadMut.mutate(e.dataTransfer.files);
          }}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            background: "rgba(10, 10, 8, 0.55)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 48, pointerEvents: "auto",
          }}
        >
          <div style={{
            width: "100%", maxWidth: 520, padding: "48px 32px",
            background: "var(--surface)",
            border: "2px dashed var(--ink-2)",
            borderRadius: 14, textAlign: "center",
            boxShadow: "0 24px 56px rgba(0,0,0,0.32)",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 14,
              background: "var(--surface-2)", color: "var(--ink-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>
              Solte os arquivos aqui
            </div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: 0.4 }}>
              categoria: {CATEGORIES.find((c) => c.key === uploadCategory)?.label}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  CATEGORY CHIP
// ─────────────────────────────────────────────────────────────────────────

function CategoryChip({
  label, icon, color, count, active, onClick,
}: {
  label: string;
  icon?: string;
  color?: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "6px 12px 6px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "var(--ink-2)" : "var(--border)"}`,
        background: active ? "var(--ink)" : "var(--surface)",
        color: active ? "var(--accent-ink)" : "var(--ink-2)",
        fontSize: 12, cursor: "pointer", fontFamily: "var(--font-sans)",
        transition: "background .08s, border-color .08s, color .08s",
        whiteSpace: "nowrap", fontWeight: active ? 600 : 500,
      }}
    >
      {icon && !active && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color ?? "var(--ink-4)" }} />
      )}
      {icon && active && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent-ink)", opacity: 0.8 }} />
      )}
      {label}
      <span
        className="mono"
        style={{
          fontSize: 10, opacity: active ? 0.8 : 0.55,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  UPLOAD CATEGORY PILL (seletor visível da categoria de upload)
// ─────────────────────────────────────────────────────────────────────────

function UploadCategoryPill({
  value, onChange,
}: { value: FileCategory; onChange: (v: FileCategory) => void }) {
  const [open, setOpen] = useState(false);
  const cfg = CATEGORIES.find((c) => c.key === value) ?? CATEGORIES[5];

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        title="Categoria do próximo upload"
        style={{
          height: 32, padding: "0 11px", borderRadius: 8,
          display: "inline-flex", alignItems: "center", gap: 7,
          background: "var(--surface)", border: "1px solid var(--border)",
          color: "var(--ink-2)", cursor: "pointer",
          fontSize: 12, fontFamily: "var(--font-sans)",
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg.color }} />
        <span style={{ fontWeight: 500 }}>{cfg.label}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 41, minWidth: 180,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 10px 28px rgba(0,0,0,0.18)", padding: 4,
          }}>
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => { onChange(c.key); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 10px", borderRadius: 5,
                  background: c.key === value ? "var(--surface-2)" : "transparent",
                  border: "none", cursor: "pointer",
                  fontSize: 12, color: "var(--ink-2)", textAlign: "left",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  FILE TILE
// ─────────────────────────────────────────────────────────────────────────

function FileTile({ file, onDelete }: { file: ClientFile; onDelete: () => void }) {
  const [hover, setHover] = useState(false);
  const cat = CATEGORIES.find((c) => c.key === (file.category as FileCategory)) ?? CATEGORIES[5];
  const isImage = file.mime_type?.startsWith("image/");
  const href = file.download_url ?? file.external_url ?? "#";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10, overflow: "hidden",
        display: "flex", flexDirection: "column",
        transition: "border-color .08s, box-shadow .08s",
        boxShadow: hover ? "0 4px 14px rgba(0,0,0,0.08)" : "none",
        borderColor: hover ? "var(--border-2)" : "var(--border)",
      }}
    >
      {/* PREVIEW */}
      <a
        href={href}
        target="_blank"
        rel="noopener"
        style={{ textDecoration: "none", color: "inherit" }}
      >
        <div style={{
          aspectRatio: "16 / 10",
          background: "var(--surface-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          {isImage && file.download_url ? (
            <img
              src={file.download_url}
              alt={file.name}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 4, opacity: 0.9 }}>{iconFor(file)}</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.5, textTransform: "uppercase" }}>
                {file.mime_type?.split("/")[1]?.slice(0, 10) ?? (file.external_url ? "link" : "arquivo")}
              </div>
            </div>
          )}
          {/* Categoria badge — fundo claro fixo, texto dark fixo (legivel em ambos os temas).
              Usar var(--ink-2) aqui quebraria no dark mode pq seria texto claro em fundo claro. */}
          <span style={{
            position: "absolute", top: 8, left: 8,
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 9, padding: "3px 8px",
            background: "rgba(250,250,248,0.95)",
            color: "#1a1a1a",
            borderRadius: 999, fontFamily: "var(--font-mono)", letterSpacing: 0.4,
            textTransform: "uppercase", fontWeight: 700,
            border: "1px solid rgba(10,10,8,0.10)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: cat.color }} />
            {cat.label}
          </span>
          {file.external_url && (
            <span style={{
              position: "absolute", top: 8, right: 8,
              background: "rgba(250,250,248,0.95)", borderRadius: 999,
              padding: "3px 7px", fontSize: 9,
              color: "#1a1a1a", fontFamily: "var(--font-mono)", letterSpacing: 0.4,
              textTransform: "uppercase", fontWeight: 700,
              border: "1px solid rgba(10,10,8,0.10)",
            }}>
              ↗ link
            </span>
          )}
        </div>
      </a>

      {/* META */}
      <div style={{ padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        <div
          title={file.name}
          style={{
            fontSize: 13, fontWeight: 500, lineHeight: 1.3, color: "var(--ink)",
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            minHeight: 34,
          }}
        >
          {file.name}
        </div>
        <div className="mono" style={{
          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          fontSize: 10, color: "var(--ink-4)", letterSpacing: 0.3,
        }}>
          {!file.external_url && file.size_bytes && <span>{formatBytes(file.size_bytes)}</span>}
          {!file.external_url && file.size_bytes && <span>·</span>}
          <span>{timeAgo(file.created_at)}</span>
          {file.uploaded_by_name && (
            <>
              <span>·</span>
              <span title={`Enviado por ${file.uploaded_by_name}`}>{file.uploaded_by_name.split(" ")[0]}</span>
            </>
          )}
        </div>
      </div>

      {/* ACTIONS */}
      <div style={{
        display: "flex", gap: 0,
        borderTop: "1px solid var(--border)",
      }}>
        <a
          href={href}
          target="_blank"
          rel="noopener"
          download={!file.external_url ? file.name : undefined}
          style={{
            flex: 1, padding: "8px 10px",
            fontSize: 11, color: "var(--ink-2)", textDecoration: "none",
            textAlign: "center", fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            transition: "background .08s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {file.external_url ? (
              <>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </>
            ) : (
              <>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </>
            )}
          </svg>
          {file.external_url ? "Abrir" : "Baixar"}
        </a>
        <div style={{ width: 1, background: "var(--border)" }} />
        <button
          onClick={onDelete}
          title="Excluir"
          style={{
            width: 40, padding: "8px 0",
            background: "transparent", border: "none",
            color: "var(--ink-4)", cursor: "pointer",
            fontSize: 12, transition: "background .08s, color .08s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-2)"; e.currentTarget.style.color = "var(--neg)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-4)"; }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block", margin: "0 auto" }}>
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" /><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  EMPTY STATE — ilustrado e contextual
// ─────────────────────────────────────────────────────────────────────────

function EmptyState({
  filter, search, onUpload,
}: { filter: FileCategory | "all"; search: string; onUpload: () => void }) {
  if (search) {
    return (
      <div style={{
        padding: "56px 24px", textAlign: "center",
      }}>
        <div style={{ fontSize: 32, marginBottom: 10, opacity: 0.4 }}>🔍</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>
          Nada encontrado
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
          Sem resultados para “{search}”.
        </div>
      </div>
    );
  }

  const catCfg = filter !== "all" ? CATEGORIES.find((c) => c.key === filter) : null;

  return (
    <div style={{
      padding: "60px 24px", textAlign: "center",
      border: "1px dashed var(--border-2)",
      borderRadius: 12, background: "var(--surface-2)",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: "var(--surface)", color: "var(--ink-2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 16px",
        border: "1px solid var(--border)",
      }}>
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 5 }}>
        {catCfg ? `Nenhum arquivo em ${catCfg.label}` : "Biblioteca vazia"}
      </div>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 18, maxWidth: 340, margin: "0 auto 18px", lineHeight: 1.5 }}>
        {catCfg
          ? `Guarde aqui ${catCfg.label.toLowerCase()} do cliente. Aceita PDF, PPT, DOCX, imagens, vídeo e zip — até 50MB.`
          : "Organize briefings, identidade visual, fluxogramas, contratos e relatórios em um só lugar. Arraste arquivos pra qualquer lugar ou clique abaixo."}
      </div>
      <div style={{ display: "inline-flex", gap: 8 }}>
        <button className="btn" onClick={onUpload}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: "-2px" }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Enviar primeiro arquivo
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  LOADING GRID (skeletons)
// ─────────────────────────────────────────────────────────────────────────

function LoadingGrid() {
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
      gap: 14,
    }}>
      {[...Array(4)].map((_, i) => (
        <div key={i} style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          <div style={{
            aspectRatio: "16 / 10",
            background: "linear-gradient(90deg, var(--surface-2), var(--surface-3), var(--surface-2))",
            backgroundSize: "200% 100%",
            animation: "files-shimmer 1.5s ease-in-out infinite",
          }} />
          <div style={{ padding: 12 }}>
            <div style={{ height: 12, width: "80%", background: "var(--surface-2)", borderRadius: 3, marginBottom: 6 }} />
            <div style={{ height: 9, width: "50%", background: "var(--surface-2)", borderRadius: 3 }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes files-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  EXTERNAL LINK FORM
// ─────────────────────────────────────────────────────────────────────────

function ExternalLinkForm({
  onSubmit, onCancel, submitting, error,
}: {
  onSubmit: (b: { name: string; external_url: string; category: FileCategory; description: string | null }) => void;
  onCancel: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<FileCategory>("outros");
  const [description, setDescription] = useState("");
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    onSubmit({
      name: name.trim(),
      external_url: url.trim(),
      category,
      description: description.trim() || null,
    });
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 16, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--ink-3)" }}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" />
        </svg>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Adicionar link externo</div>
        <span className="mono" style={{
          fontSize: 9, color: "var(--ink-4)", letterSpacing: 0.4,
          textTransform: "uppercase",
        }}>
          Figma · Drive · Dropbox · Notion
        </span>
      </div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <input
          ref={firstRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome de exibição"
          required
          style={{ ...inputStyle, gridColumn: "1 / -1" }}
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          type="url"
          placeholder="https://…"
          required
          style={{ ...inputStyle, gridColumn: "1 / -1", fontFamily: "var(--font-mono)", fontSize: 12 }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value as FileCategory)} style={inputStyle}>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição (opcional)"
          style={inputStyle}
        />
      </div>
      {error && <div style={{ color: "var(--neg)", fontSize: 11, marginTop: 10 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
        <button type="button" className="btn ghost" onClick={onCancel} disabled={submitting}>Cancelar</button>
        <button type="submit" className="btn" disabled={submitting || !name || !url}>
          {submitting ? "Salvando…" : "Adicionar link"}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
  outline: "none",
  width: "100%",
};
