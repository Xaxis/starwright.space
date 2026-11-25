import { sceneProblems } from "@starwright/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "../../../components/Header";
import type { KindName } from "../../../components/scene/kinds/index";
import { Scene3D } from "../../../components/scene/Scene3D";
import type { Params } from "../../../components/scene/types";
import { val } from "../../../lib/data";
import { LAB_DEFAULTS, LAB_KINDS, STORIES } from "../../../lib/lab";
import { towerData } from "../../../lib/tower";

export const metadata: Metadata = { title: "Scene lab", robots: { index: false } };

/**
 * One scene kind, big, with its story. Query: params (JSON, merged over the kind's defaults),
 * story (invention | capability), colour (hex without #).
 *   /lab/reactor?params={"type":"stellarator"}&story=capability&colour=6fd0ff
 */
export default async function Lab({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { kind } = await params;
  const q = await searchParams;
  if (!LAB_KINDS.includes(kind as KindName)) notFound();
  const k = kind as KindName;
  let extra: Params = {};
  try {
    extra = q.params ? (JSON.parse(q.params) as Params) : {};
  } catch {
    extra = {};
  }
  const p: Params = { ...(LAB_DEFAULTS[k] ?? {}), ...extra };
  const problems = k === "tower" ? [] : sceneProblems(k, p);
  const story = q.story === "capability" ? STORIES.capability : STORIES.invention;
  const colour = `#${/^[0-9a-f]{6}$/i.test(q.colour ?? "") ? q.colour : "f3c463"}`;
  const data =
    k === "ladder"
      ? { beats: story, swarmAu: val("swarm-radius") }
      : k === "tower"
        ? (towerData() as unknown as Record<string, unknown>)
        : { beats: story };
  return (
    <>
      <Header />
      <main id="content" className="section">
        <p className="eyebrow">
          Scene lab ·{" "}
          {LAB_KINDS.map((x) => (
            <a
              key={x}
              href={`/lab/${x}`}
              style={{ marginRight: "0.6rem", fontWeight: x === k ? 700 : 400 }}
            >
              {x}
            </a>
          ))}
        </p>
        <h1>{k}</h1>
        <p>
          <code>{JSON.stringify(p)}</code>
          {problems.length > 0 ? <strong> Params problems: {problems.join("; ")}</strong> : null}
        </p>
        <Scene3D
          kind={k}
          params={p}
          data={data}
          colour={colour}
          title={`The ${k} scene`}
          alt={`The ${k} scene.`}
        />
      </main>
    </>
  );
}
