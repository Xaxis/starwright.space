import type { Source } from "@starwright/core";

/** What already exists, each fact with the link it came from. */
export function Sources({ items }: { items: Source[] }) {
  return (
    <ul className="sources">
      {items.map((s) => (
        <li key={s.url + s.text}>
          {s.text}{" "}
          <a href={s.url} rel="noopener">
            {new URL(s.url).hostname.replace(/^www\./, "")}
            {s.year ? `, ${s.year}` : ""}
          </a>
        </li>
      ))}
    </ul>
  );
}
