"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  addExternalFile, deleteFile, listFiles, uploadFile,
  type ClientFile, type FileCategory,
} from "@/lib/api";
import { FILE_CATEGORY } from "./constants";

const CATEGORIES = (Object.keys(FILE_CATEGORY) as FileCategory[]).map((k) => ({
  key: k, label: FILE_CATEGORY[k].label, color: FILE_CATEGORY[k].color,
}));

function formatBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 3 letras do tipo — mostradas quando não tem preview (PDF, DOCX, etc.) */
function extensionTag(f: ClientFile): string {
  if (f.external_url) return "LINK";
  const m = f.mime_type ?? "";
  if (m === "application/pdf") return "PDF";
  if (m.includes("presentation")) return "PPT";
  if (m.includes("wordprocessing")) return "DOCX";
  if (m.includes("spreadsheet")) return "XLSX";
  if (m === "text/csv") return "CSV";
  if (m === "text/plain") return "TXT";
  if (m === "application/zip") return "ZIP";
  if (m.startsWith("video/")) return "VIDEO";
  if (m.startsWith("image/")) return "IMG";
  if (m === "application/json") return "JSON";
  return "FILE";
}

export function FilesTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const filesQ = useQuery({ queryKey: ["files", slug], queryFn: () => listFiles(slug), enabled: !!slug });

  const [filter, setFilter] = useState<FileCategory | "all">("all");
  const [uploadCategory, setUploadCategory] = useState<FileCategory>("briefing");
  const [externalOpen, setExternalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const files = (filesQ.data ?? []).filter((f) => filter === "all" || f.category === filter);

  const countsByCategory = CATEGORIES.reduce<Record<FileCategory, number>>((acc, c) => {
    acc[c.key] = (filesQ.data ?? []).filter((f) => f.category === c.key).length;
    return acc;
  }, { briefing: 0, id_visual: 0, fluxograma: 0, relatorio: 0, contrato: 0, outros: 0 });

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

  return (
    <div>
      {/* Toolbar: categorias + upload */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div className="seg" style={{ fontSize: 11 }}>
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
            Todos <span className="mono" style={{ marginLeft: 4, opacity: 0.5 }}>{filesQ.data?.length ?? 0}</span>
          </button>
          {CATEGORIES.map((c) => (
            <button key={c.key} className={filter === c.key ? "on" : ""} onClick={() => setFilter(c.key)}>
              {c.label} <span className="mono" style={{ marginLeft: 4, opacity: 0.5 }}>{countsByCategory[c.key]}</span>
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn ghost" onClick={() => setExternalOpen((s) => !s)}>
            {externalOpen ? "Cancelar" : "+ Link externo"}
          </button>
          <button className="btn" onClick={() => inputRef.current?.click()}>
            + Upload
          </button>
        </div>
      </div>

      {/* Dropzone */}
      <div
        className={dragOver ? "uploader-drop over" : "uploader-drop"}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files?.length) uploadMut.mutate(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragOver ? "var(--ink-2)" : "var(--border-2)"}`,
          borderRadius: 10, padding: "18px 16px", textAlign: "center",
          marginBottom: 16, cursor: "pointer", background: "var(--surface-2)",
          transition: "border-color .12s",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files?.length && uploadMut.mutate(e.target.files)}
        />
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6, color: "var(--ink-2)" }}>
          {uploadMut.isPending
            ? `Enviando ${uploadMut.variables?.length ?? 0} arquivo(s)…`
            : "Arraste arquivos ou clique para selecionar"}
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", justifyContent: "center", gap: 14, alignItems: "center" }}>
          <span>PDF · PPT · DOCX · XLSX · imagem · vídeo · zip — até 50MB</span>
          <span>·</span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }} onClick={(e) => e.stopPropagation()}>
            Categoria:
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value as FileCategory)}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--ink-2)" }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>
        {uploadError && (
          <div style={{ color: "var(--neg)", fontSize: 11, marginTop: 8 }}>
            ⚠ {uploadError}
          </div>
        )}
      </div>

      {externalOpen && (
        <ExternalLinkForm
          onSubmit={(body) => externalMut.mutate(body)}
          submitting={externalMut.isPending}
          error={externalMut.error ? (externalMut.error as Error).message : null}
        />
      )}

      {/* Grid */}
      {filesQ.isLoading && <p style={{ color: "var(--ink-3)", fontSize: 13 }}>Carregando…</p>}
      {filesQ.isError && (
        <div className="card" style={{ padding: 14, borderLeft: "3px solid var(--neg)" }}>
          {(filesQ.error as Error)?.message}
        </div>
      )}
      {files.length === 0 && !filesQ.isLoading && (
        <div className="card" style={{ padding: 28, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
          Nenhum arquivo {filter === "all" ? "ainda" : `na categoria ${CATEGORIES.find((c) => c.key === filter)?.label.toLowerCase()}`}.
        </div>
      )}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: 12,
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
    </div>
  );
}

function FileTile({ file, onDelete }: { file: ClientFile; onDelete: () => void }) {
  const cat = CATEGORIES.find((c) => c.key === (file.category as FileCategory)) ?? CATEGORIES[5];
  const isImage = file.mime_type?.startsWith("image/");
  const href = file.download_url ?? file.external_url ?? "#";
  const ext = extensionTag(file);

  return (
    <div
      className="card"
      style={{
        overflow: "hidden", display: "flex", flexDirection: "column",
        transition: "border-color .08s, transform .08s",
        borderTop: `2px solid ${cat.color}`,
      }}
    >
      <a href={href} target="_blank" rel="noopener" style={{ textDecoration: "none", color: "inherit" }}>
        <div style={{
          aspectRatio: "16 / 9",
          background: isImage && file.download_url ? "var(--ink)" : "var(--surface-2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          {isImage && file.download_url ? (
            <img src={file.download_url} alt={file.name}
                 style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span
              className="mono"
              style={{
                fontSize: 22, fontWeight: 700, letterSpacing: 1.5,
                color: cat.color, opacity: 0.82,
              }}
            >
              {ext}
            </span>
          )}
          <span
            className="mono"
            style={{
              position: "absolute", top: 8, left: 8,
              fontSize: 9, padding: "3px 8px",
              background: "var(--surface)", color: cat.color,
              borderRadius: 3, letterSpacing: 0.6,
              textTransform: "uppercase", fontWeight: 700,
              border: "1px solid var(--border)",
            }}
          >
            {cat.label}
          </span>
        </div>
      </a>
      <div style={{ padding: "12px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <div title={file.name} style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.35, color: "var(--ink)",
          overflow: "hidden", textOverflow: "ellipsis",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          minHeight: 32,
        }}>
          {file.name}
        </div>
        <div className="mono" style={{
          fontSize: 10, color: "var(--ink-4)", display: "flex", gap: 6,
          flexWrap: "wrap", letterSpacing: 0.2,
        }}>
          {file.external_url ? "link externo" : formatBytes(file.size_bytes)}
          <span>·</span>
          <span>{new Date(file.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
          {file.uploaded_by_name && (
            <>
              <span>·</span>
              <span>{file.uploaded_by_name.split(" ")[0]}</span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <a
            href={href}
            target="_blank"
            rel="noopener"
            className="btn ghost"
            style={{ flex: 1, textAlign: "center", fontSize: 11, padding: "7px 8px" }}
            download={file.storage_path ? file.name : undefined}
          >
            {file.external_url ? "Abrir" : "Baixar"}
          </a>
          <button
            onClick={onDelete}
            title="Excluir"
            style={{
              background: "transparent", border: "1px solid var(--border)",
              color: "var(--ink-4)", cursor: "pointer",
              padding: "7px 10px", borderRadius: 6, fontSize: 12,
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function ExternalLinkForm({
  onSubmit, submitting, error,
}: {
  onSubmit: (b: { name: string; external_url: string; category: FileCategory; description: string | null }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<FileCategory>("outros");
  const [description, setDescription] = useState("");

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
    <form onSubmit={submit} className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10 }}>Adicionar link externo (Figma, Drive, Dropbox…)</div>
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
        <input
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
          placeholder="https://figma.com/file/…"
          required
          style={{ ...inputStyle, gridColumn: "1 / -1" }}
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
      {error && <div style={{ color: "var(--neg)", fontSize: 11, marginTop: 8 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
        <button type="submit" className="btn" disabled={submitting || !name || !url}>
          {submitting ? "Salvando…" : "Adicionar link"}
        </button>
      </div>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--ink)",
  fontSize: 12,
  fontFamily: "var(--font-sans)",
  outline: "none",
  width: "100%",
};
