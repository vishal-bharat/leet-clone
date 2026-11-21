"use client";
import { useState } from "react";

/** Chip-style tag editor: type a tag and press Enter or comma; Backspace on an empty box removes the last one. */
export default function TagInput({ value, onChange, suggestions = [] }: { value: string[]; onChange: (tags: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState("");

  function add(raw: string) {
    const parts = raw.split(",").map((t) => t.trim().toLowerCase().replace(/\s+/g, " ")).filter(Boolean);
    const next = [...value];
    for (const t of parts) if (!next.includes(t)) next.push(t);
    onChange(next);
    setText("");
  }

  const unused = suggestions.filter((s) => !value.includes(s));

  return (
    <div>
      <div className="input flex flex-wrap items-center gap-1.5 !py-1.5" style={{ minHeight: "2.4rem" }}>
        {value.map((t) => (
          <span key={t} className="tag-chip">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="ml-1 opacity-60 hover:opacity-100">✕</button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm"
          list="known-tags"
          value={text}
          placeholder={value.length ? "" : "e.g. array, hashmap, stream, lambda"}
          onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && add(text)}
        />
      </div>
      <datalist id="known-tags">{unused.map((t) => <option key={t} value={t} />)}</datalist>
      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 items-center">
          <span className="text-xs mr-1" style={{ color: "var(--muted)" }}>Used before:</span>
          {unused.slice(0, 20).map((t) => (
            <button key={t} type="button" className="tag-chip tag-chip-ghost" onClick={() => add(t)}>+ {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}
