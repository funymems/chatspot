import { z } from "zod";
import { defaultNodeData } from "./defaults";
import { layout } from "./builder";
import { GRAPH_SCHEMA_VERSION, nodeConfigSchemas, nodeTypes, outputHandles, type AutomationGraph, type GraphEdge, type GraphNode, type NodeType } from "./schema";

/**
 * Loose shape accepted from an AI model (or any untrusted source). Node
 * configs arrive as JSON strings and are parsed + validated here — nothing
 * from the model is ever executed.
 */
export const draftGraphSchema = z.object({
  name: z.string().max(200).default("Сгенерированная автоматизация"),
  description: z.string().max(1000).default(""),
  nodes: z
    .array(
      z.object({
        id: z.string().max(64),
        type: z.string().max(40),
        label: z.string().max(200).optional(),
        config_json: z.string().max(20_000).default("{}"),
      }),
    )
    .max(60),
  edges: z.array(z.object({ source: z.string().max(64), target: z.string().max(64), handle: z.string().max(10).default("out") })).max(120),
});
export type DraftGraph = z.infer<typeof draftGraphSchema>;

export type RepairReport = { graph: AutomationGraph; fixes: string[] };

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48) || "node";

/**
 * Deterministically repairs a draft into a structurally sound graph:
 * valid types and configs, unique ids, one trigger, valid unique edges,
 * every required output connected (to an End node if needed).
 */
export function repairDraft(draft: DraftGraph): RepairReport {
  const fixes: string[] = [];
  const nodes: GraphNode[] = [];
  const idMap = new Map<string, string>();

  for (const raw of draft.nodes) {
    if (!(nodeTypes as string[]).includes(raw.type)) {
      fixes.push(`Удалён блок неизвестного типа «${raw.type}»`);
      continue;
    }
    const type = raw.type as NodeType;
    if (type === "note") continue;
    let id = safeId(raw.id);
    while (nodes.some((n) => n.id === id)) id = `${id}_x`;
    if (!idMap.has(raw.id)) idMap.set(raw.id, id);

    let config: unknown = {};
    try {
      config = JSON.parse(raw.config_json || "{}");
    } catch {
      fixes.push(`Сброшены настройки блока «${raw.label ?? raw.id}» (некорректный JSON)`);
    }
    const base = defaultNodeData(type);
    const cfg = config && typeof config === "object" && !Array.isArray(config) ? (config as Record<string, unknown>) : {};
    const actionCfg = (cfg.action && typeof cfg.action === "object" ? cfg.action : cfg) as Record<string, unknown>;
    const merged = type === "action" ? { action: { ...(base.action as Record<string, unknown>), ...actionCfg } } : { ...base, ...cfg };
    const parsed = nodeConfigSchemas[type].safeParse(merged);
    nodes.push({
      id,
      type,
      label: raw.label?.slice(0, 80) || undefined,
      position: { x: 0, y: 0 },
      // Keep the merged config even if invalid so the validator can point at the exact field.
      data: (parsed.success ? parsed.data : merged) as Record<string, unknown>,
    });
  }

  // One trigger, first one wins.
  const triggers = nodes.filter((n) => n.type === "trigger");
  if (triggers.length === 0) {
    nodes.unshift({ id: "trigger", type: "trigger", position: { x: 0, y: 0 }, data: { ...defaultNodeData("trigger"), kind: "manual" } });
    fixes.push("Добавлен ручной триггер, потому что генератор его не создал");
  } else if (triggers.length > 1) {
    for (const t of triggers.slice(1)) nodes.splice(nodes.indexOf(t), 1);
    fixes.push("Оставлен только первый триггер");
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = [];
  for (const e of draft.edges) {
    const source = byId.get(idMap.get(e.source) ?? e.source);
    const target = byId.get(idMap.get(e.target) ?? e.target);
    const handle = (["out", "true", "false"].includes(e.handle) ? e.handle : "out") as GraphEdge["sourceHandle"];
    if (!source || !target || source === target || target.type === "trigger" || !outputHandles[source.type].includes(handle)) {
      fixes.push("Удалена некорректная связь");
      continue;
    }
    if (edges.some((x) => x.source === source.id && x.sourceHandle === handle)) continue;
    edges.push({ id: `e_${source.id}_${handle}_${target.id}`, source: source.id, target: target.id, sourceHandle: handle });
  }

  // Connect any open output to an End node so every path terminates.
  let end: GraphNode | undefined;
  for (const n of [...nodes]) {
    for (const handle of outputHandles[n.type]) {
      if (edges.some((e) => e.source === n.id && e.sourceHandle === handle)) continue;
      if (!end) {
        end = { id: "end_auto", type: "end", position: { x: 0, y: 0 }, data: { outcome: "completed", label: "" } };
        nodes.push(end);
      }
      edges.push({ id: `e_${n.id}_${handle}_${end.id}`, source: n.id, target: end.id, sourceHandle: handle });
      fixes.push(`Свободный ${handle === "out" ? "выход" : `выход «${handle === "true" ? "Да" : handle === "false" ? "Нет" : handle}»`} блока «${n.label ?? n.type}» подключён к блоку «Конец»`);
    }
  }
  if (!nodes.some((n) => n.type === "end")) {
    nodes.push({ id: "end_auto", type: "end", position: { x: 0, y: 0 }, data: { outcome: "completed", label: "" } });
  }

  return {
    graph: { schemaVersion: GRAPH_SCHEMA_VERSION, nodes: layout(nodes, edges), edges, settings: { maxSteps: 100 } },
    fixes: [...new Set(fixes)],
  };
}
