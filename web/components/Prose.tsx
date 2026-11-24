import { type Model, pieces } from "@starwright/core";

/** Text from data/ with every {id} shown as the model's number, linked to its row in the ledger. */
export function Prose({ text, model }: { text: string; model: Model }) {
  return (
    <>
      {pieces(text, model).map((p, i) =>
        "id" in p ? (
          <a key={i} className="num" href={`/numbers#${p.id}`}>
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}
