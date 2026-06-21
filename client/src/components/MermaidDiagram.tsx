import { useEffect, useId, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });

export function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const instanceId = useId().replace(/:/g, "");
  useEffect(() => {
    if (!code || !ref.current) return;
    let cancelled = false;
    const codeSuffix = Math.abs(code.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
    const id = "m" + instanceId + codeSuffix;
    mermaid.render(id, code)
      .then(({ svg }) => { if (!cancelled && ref.current) { ref.current.innerHTML = svg; setErr(null); } })
      .catch((e) => { if (!cancelled) setErr(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, [code]);
  if (err) return <pre className="text-xs text-destructive whitespace-pre-wrap">{code}</pre>;
  return <div ref={ref} className="overflow-auto" />;
}
