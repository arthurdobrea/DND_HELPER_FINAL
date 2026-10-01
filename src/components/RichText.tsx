import { Fragment, type ReactNode } from "react";

/** Минимальный рендер markdown из Open5e: **жирный**, _курсив_, абзацы. */
function inline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if ((p.startsWith("_") && p.endsWith("_")) || (p.startsWith("*") && p.endsWith("*") && p.length > 2))
      return <em key={i}>{p.slice(1, -1)}</em>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function RichText({ text, className }: { text?: string | null; className?: string }) {
  if (!text) return null;
  // В данных Open5e переводы строк часто приходят буквальным текстом «\n» — превращаем в настоящие.
  const paragraphs = text.replace(/\\n/g, "\n").split(/\n\s*\n|\n/).filter((p) => p.trim());
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-1.5 last:mb-0">
          {inline(p.replace(/^#+\s*/, ""))}
        </p>
      ))}
    </div>
  );
}
