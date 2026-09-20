import { useSyncExternalStore } from "react";
import type { PresetChange, PresetSource } from "../api/useAlgorithmConfig";
import { type ConfigTree, setIn } from "./algorithm";

/** A source the expert writes by hand. The same shape as a catalogue source, so Citation reads both. */
export interface CustomSource {
  publisher: string;
  title: string;
  url: string;
  quote: string;
  read: string;
}

/** The evidence of one value: the same three states as presets.yml (docs/PRESETS.md §2). */
export interface CustomMeta {
  status: PresetChange["status"];
  why: string;
  sources: CustomSource[];
}

export interface CustomPreset {
  id: string;
  name: string;
  /** What the expert wants to test with it. */
  note: string;
  /** The rows of the editor, in the order they were added. One row owns one value or one indicator. */
  paths: string[];
  /** The config in use with this preset's values on top. The tuning request sends its editable sections. */
  tree: ConfigTree;
  meta: Record<string, CustomMeta>;
}

/**
 * The custom presets of the Algorithm page, per entity, in memory (docs/CUSTOM_PRESETS.md).
 * They live while the tab lives: a reload empties them, and the page says so. Nothing reaches the server
 * except the what-if body of POST /api/entities/{id}/tuning, which writes nothing.
 */
const store = new Map<string, CustomPreset[]>();
const listeners = new Set<() => void>();
const EMPTY: CustomPreset[] = [];

function emit() {
  for (const listen of listeners) listen();
}

function write(entityId: string, next: CustomPreset[]) {
  store.set(entityId, next);
  emit();
}

export function useCustomPresets(entityId: string): CustomPreset[] {
  return useSyncExternalStore(
    (listen) => {
      listeners.add(listen);
      return () => {
        listeners.delete(listen);
      };
    },
    () => store.get(entityId) ?? EMPTY,
  );
}

let sequence = 0;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  sequence += 1;
  return `preset-${sequence}`;
}

export function emptyMeta(): CustomMeta {
  return { status: "placeholder", why: "", sources: [] };
}

export function emptySource(): CustomSource {
  return { publisher: "", title: "", url: "", quote: "", read: new Date().toISOString().slice(0, 10) };
}

/** A new preset over the config in use. Its name counts the presets of this entity. */
export function addPreset(entityId: string, base: ConfigTree, seed?: Partial<CustomPreset>): string {
  const current = store.get(entityId) ?? EMPTY;
  const preset: CustomPreset = {
    id: newId(),
    name: seed?.name ?? `Preset ${current.length + 1}`,
    note: seed?.note ?? "",
    paths: seed?.paths ?? [],
    tree: seed?.tree ?? base,
    meta: seed?.meta ?? {},
  };
  write(entityId, [...current, preset]);
  return preset.id;
}

export function updatePreset(entityId: string, presetId: string, change: (p: CustomPreset) => CustomPreset) {
  const current = store.get(entityId) ?? EMPTY;
  write(entityId, current.map((p) => (p.id === presetId ? change(p) : p)));
}

export function removePreset(entityId: string, presetId: string) {
  const current = store.get(entityId) ?? EMPTY;
  write(entityId, current.filter((p) => p.id !== presetId));
}

export function duplicatePreset(entityId: string, presetId: string): string | null {
  const current = store.get(entityId) ?? EMPTY;
  const source = current.find((p) => p.id === presetId);
  if (!source) return null;
  const copy: CustomPreset = { ...source, id: newId(), name: `${source.name} (copia)` };
  write(entityId, [...current, copy]);
  return copy.id;
}

/** The row that owns a config value: an indicator keeps its anchors and its weight in one row. */
export function ownerPath(dotted: string): string {
  const parts = dotted.split(".");
  return parts[0] === "indicators" ? parts.slice(0, 2).join(".") : dotted;
}

/** A preset seeded from a catalogue preset or a sector: same values, same evidence, now editable. */
export function seedFromChanges(
  base: ConfigTree,
  changes: PresetChange[],
  sources: Record<string, PresetSource>,
): Pick<CustomPreset, "paths" | "tree" | "meta"> {
  let tree = base;
  const paths: string[] = [];
  const meta: Record<string, CustomMeta> = {};
  for (const change of changes) {
    tree = setIn(tree, change.path.split("."), change.value);
    const owner = ownerPath(change.path);
    if (!paths.includes(owner)) paths.push(owner);
    meta[owner] = {
      status: change.status,
      why: change.why,
      sources: change.sources
        .map((id) => sources[id])
        .filter((s): s is PresetSource => Boolean(s))
        .map((s) => ({
          publisher: s.publisher,
          title: s.title,
          url: s.url,
          quote: s.quote ?? s.finding ?? "",
          read: s.read,
        })),
    };
  }
  return { paths, tree, meta };
}

/** Only the sections the server lets an expert change, so the what-if body carries nothing else. */
export function editableTree(tree: ConfigTree, sections: string[]): ConfigTree {
  const out: ConfigTree = {};
  for (const section of sections) {
    if (section in tree) out[section] = tree[section];
  }
  return out;
}
