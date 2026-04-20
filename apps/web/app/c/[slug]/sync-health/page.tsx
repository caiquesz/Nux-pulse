import { Placeholder } from "@/components/screens/Placeholder";

export default function Page() {
  return (
    <Placeholder
      sectionNum="14 — SYNC HEALTH"
      title="Saúde da sincronização"
      subtitle="Último sync por conta · erros · divergências"
      icon="health"
      description="Status de cada job (backfill/diário/horário), erros, rate limits, divergências entre plataformas e Analytics."
      plannedFor="FASE 2"
    />
  );
}
