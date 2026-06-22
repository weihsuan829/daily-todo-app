import { useEffect, useId, useRef, useState } from "react";
import { useTheme } from "../contexts/ThemeContext";

export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const instanceId = useId().replace(/:/g, "");
  const { theme } = useTheme();

  useEffect(() => {
    if (!code || !ref.current) return;
    let cancelled = false;
    const codeSuffix = Math.abs(code.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
    const id = "m" + instanceId + codeSuffix + (theme === "dark" ? "d" : "l");
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        if (cancelled) return;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
          securityLevel: "antiscript",
        });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          const el = ref.current.querySelector("svg");
          if (el) {
            el.style.maxWidth = "none";
            el.style.width = "100%";
            el.style.height = "auto";
          }
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(String((e as { message?: string })?.message ?? e));
      }
    })();
    return () => { cancelled = true; };
  }, [code, theme, instanceId]);

  if (err) return <pre className="text-xs text-destructive whitespace-pre-wrap">{code}</pre>;
  return <div ref={ref} className="overflow-auto" />;
}
