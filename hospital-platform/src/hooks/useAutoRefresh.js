import { useEffect, useRef } from "react";

export function useAutoRefresh(callback, delay) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        saved.current({ quiet: true });
      }
    }, delay);
    return () => clearInterval(id);
  }, [delay]);
}

