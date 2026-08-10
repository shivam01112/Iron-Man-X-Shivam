"use client";

import { useLenis } from "lenis/react";
import { useEffect, useRef } from "react";

/**
 * Runs callback on every Lenis scroll tick — already synced with Lenis RAF,
 * so no extra requestAnimationFrame wrapper is needed.
 */
export function useLenisScroll(callback: () => void, deps: unknown[] = []) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useLenis(() => {
    callbackRef.current();
  });

  useEffect(() => {
    callbackRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
