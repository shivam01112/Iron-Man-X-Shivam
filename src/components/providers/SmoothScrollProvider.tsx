"use client";

import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

type Props = { children: React.ReactNode };

export function SmoothScrollProvider({ children }: Props) {
  return (
    <ReactLenis
      root
      options={{
        lerp: 0.16,
        smoothWheel: true,
        syncTouch: false,
        touchMultiplier: 1,
        wheelMultiplier: 0.9,
        autoRaf: true,
      }}
    >
      {children}
    </ReactLenis>
  );
}
