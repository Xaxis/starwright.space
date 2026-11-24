/** Prose with {id} placeholders, filled from the model. */
import { format } from "./format.ts";
import type { Model } from "./model.ts";

export type Piece = { text: string } | { id: string; text: string };

/** The prose split into plain text and numbers, so a page can link each number to its ledger row. */
export function pieces(text: string, m: Model): Piece[] {
  const out: Piece[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{([a-z0-9-]+)\}/g)) {
    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    const id = match[1] as string;
    const q = m.q.get(id);
    if (!q) throw new Error(`{${id}} is not a model quantity`);
    out.push({ id, text: format(q.value, q.unit) });
    last = at + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The prose as plain text. */
export function fill(text: string, m: Model): string {
  return pieces(text, m)
    .map((p) => p.text)
    .join("");
}
