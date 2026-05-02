"use client";
import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { useMorphablePath } from "@/lib/useMorphablePath";

type Props = Omit<ComponentProps<typeof motion.path>, "d"> & {
  d: string;
  duration?: number;
};

/**
 * MorphablePath — wrapper sobre `<motion.path>` que aceita `d` como string
 * normal e anima suavemente entre valores via d3-interpolate-path.
 *
 * Hook nao pode ser chamado em loop (ex: extras[].map), entao extraimos pra
 * componente: cada instancia tem seu proprio useMorphablePath dedicado, e
 * todas as instancias morpham em paralelo quando seus `d` mudam.
 *
 * Quando NAO usar: paths estaticos que nunca mudam (overhead desnecessario).
 * Use motion.path direto ou <path> normal.
 */
export function MorphablePath({ d, duration = 1.0, ...props }: Props) {
  const animatedD = useMorphablePath(d, { duration });
  return <motion.path d={animatedD} {...props} />;
}
