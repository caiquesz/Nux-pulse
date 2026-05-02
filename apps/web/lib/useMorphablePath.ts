"use client";
import { interpolatePath } from "d3-interpolate-path";
import { animate, useMotionValue } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * useMorphablePath — anima suavemente uma string de path SVG (`d`) entre
 * valores. Usa d3-interpolate-path como interpolador customizado pra lidar
 * com paths de tamanhos/numero-de-pontos diferentes (ex: trocar 7d -> 30d).
 *
 * Sem isso, atualizar `d` direto no DOM gera snap visual ("pulo"). Motion
 * sozinho tambem nao morpha paths heterogeneos. d3-interpolate-path resolve.
 *
 * Uso:
 *
 *   const motionD = useMorphablePath(line, { duration: 1.0 });
 *   <motion.path d={motionD} ... />
 *
 * Primeira render: motion value comeca com targetPath direto (sem animar).
 * Mudanças subsequentes: tween 1s do path antigo pro novo via interpolator.
 */
export function useMorphablePath(
  targetPath: string,
  opts: { duration?: number; ease?: [number, number, number, number] } = {},
) {
  const { duration = 1.0, ease = [0.16, 1, 0.3, 1] } = opts;
  const motionVal = useMotionValue(targetPath);
  const prevPath = useRef(targetPath);
  const isFirst = useRef(true);

  useEffect(() => {
    // Primeira render: ja inicializado, sem animar
    if (isFirst.current) {
      isFirst.current = false;
      prevPath.current = targetPath;
      return;
    }
    // Mesmo path: skip
    if (prevPath.current === targetPath) return;

    const interpolator = interpolatePath(prevPath.current, targetPath);
    const controls = animate(0, 1, {
      duration,
      ease,
      onUpdate: (t) => motionVal.set(interpolator(t)),
    });
    prevPath.current = targetPath;
    return () => controls.stop();
  }, [targetPath, duration, ease, motionVal]);

  return motionVal;
}
