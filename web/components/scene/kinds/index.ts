/**
 * Every scene kind, loaded on demand so a page downloads only the kinds it shows. The names are
 * core's SCENE_KINDS (what data/ may ask for) plus the tower, which only its page uses.
 */
import type { SceneKind } from "@starwright/core";
import type { Kind } from "../types.ts";

export type KindName = SceneKind | "tower";

type Loader = () => Promise<{ default: Kind }>;

export const KINDS: Partial<Record<KindName, Loader>> & { ladder: Loader } = {
  ladder: () => import("./ladder.ts"),
};
