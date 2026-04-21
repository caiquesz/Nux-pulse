// Tokens visuais e labels do módulo Planejamento.

import type { TaskPlatform, TaskPriority, TaskStatus, TaskType, FileCategory } from "@/lib/api";

export const STATUS: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  todo:    { label: "A fazer",       color: "var(--ink-3)",  bg: "var(--surface-3)" },
  doing:   { label: "Em andamento",  color: "var(--cobalt)", bg: "oklch(0.94 0.05 265)" },
  waiting: { label: "Aguardando",    color: "var(--warn)",   bg: "oklch(0.95 0.06 75)"  },
  done:    { label: "Concluída",     color: "var(--pos)",    bg: "oklch(0.94 0.05 155)" },
};

export const PRIORITY: Record<TaskPriority, { label: string; color: string }> = {
  baixa:   { label: "Baixa",   color: "var(--ink-4)" },
  media:   { label: "Média",   color: "var(--info)"  },
  alta:    { label: "Alta",    color: "var(--warn)"  },
  urgente: { label: "Urgente", color: "var(--neg)"   },
};

export const PLATFORM: Record<TaskPlatform, { label: string; color: string }> = {
  meta:      { label: "Meta",      color: "#0866FF" },
  google:    { label: "Google",    color: "#4285F4" },
  tiktok:    { label: "TikTok",    color: "#111"    },
  linkedin:  { label: "LinkedIn",  color: "#0A66C2" },
  pinterest: { label: "Pinterest", color: "#E60023" },
  geral:     { label: "Geral",     color: "var(--ink-3)" },
  outro:     { label: "Outro",     color: "var(--ink-4)" },
};

export const TASK_TYPE: Record<TaskType, { label: string }> = {
  briefing:    { label: "Briefing" },
  criativo:    { label: "Criativo" },
  lancamento:  { label: "Lançamento" },
  otimizacao:  { label: "Otimização" },
  relatorio:   { label: "Relatório" },
  reuniao:     { label: "Reunião" },
  aprovacao:   { label: "Aprovação" },
  analise:     { label: "Análise" },
  outro:       { label: "Outro" },
};

export const FILE_CATEGORY: Record<FileCategory, { label: string; color: string }> = {
  briefing:   { label: "Briefing",   color: "oklch(0.52 0.08 235)" },
  id_visual:  { label: "ID Visual",  color: "oklch(0.55 0.15 150)" },
  fluxograma: { label: "Fluxograma", color: "oklch(0.56 0.22 265)" },
  relatorio:  { label: "Relatórios", color: "oklch(0.45 0.14 255)" },
  contrato:   { label: "Contratos",  color: "oklch(0.68 0.14 65)"  },
  outros:     { label: "Outros",     color: "var(--ink-4)" },
};
