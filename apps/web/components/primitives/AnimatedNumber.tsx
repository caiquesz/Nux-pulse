"use client";
import { animate, useMotionValue, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

interface Props {
  /** Valor numerico a animar. Quando muda, tweens do anterior pro novo. */
  value: number;
  /** Formatador final (R$, %, int, etc). Recebe o numero interpolado. */
  format: (v: number) => string;
  /** Duracao do tween em segundos. Default 0.6s — fast enough pra nao incomodar. */
  duration?: number;
  /** Pula a animacao no primeiro mount (passa value direto). Util quando quer
   *  que o numero JA apareca formatado e so anime em updates futuros. Default false:
   *  anima de 0 ate value no mount. */
  skipInitial?: boolean;
}

/**
 * AnimatedNumber — number tween com Motion. Conta de A pra B suavemente.
 *
 * Usado em KPI cards quando polling atualiza o valor — usuario ve o numero
 * "subir" / "descer" em vez de pular bruto. Sensacao de real-time.
 *
 * Performance: 1 motion value por instancia, useTransform deriva o display
 * formatado. Render via setState pra forcar React acompanhar (motion sozinho
 * nao re-renderiza children string).
 */
export function AnimatedNumber({ value, format, duration = 0.6, skipInitial = false }: Props) {
  const motionVal = useMotionValue(skipInitial ? value : 0);
  const formatted = useTransform(motionVal, (v) => format(v));
  const [display, setDisplay] = useState(format(skipInitial ? value : 0));
  const prevValue = useRef<number>(skipInitial ? value : 0);

  // Subscribe ao motion value pra forcar React render. useTransform sozinho
  // nao causa re-render se nao for usado num <motion.* />.
  useEffect(() => {
    const unsub = formatted.on("change", (v) => setDisplay(v));
    return unsub;
  }, [formatted]);

  useEffect(() => {
    if (prevValue.current === value) return;
    const controls = animate(motionVal, value, {
      duration,
      ease: [0.16, 1, 0.3, 1], // smooth cubic editorial — sem bounce
    });
    prevValue.current = value;
    return () => controls.stop();
  }, [value, duration, motionVal]);

  return <>{display}</>;
}
