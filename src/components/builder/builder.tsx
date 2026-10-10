"use client";

import "@xyflow/react/dist/style.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { AlertTriangle, ArrowLeft, CheckCircle2, CircleAlert, Loader2, Play, Redo2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AutomationStatusBadge, type AutomationStatusValue } from "@/components/automations/status-badge";
import { flowNodeTypes, type FlowNode, type RunStatus } from "@/components/flow/flow-node";
import { edgeStyle } from "@/components/flow/to-react-flow";
import { nodeMeta } from "@/components/flow/node-meta";
import { saveAutomationGraphAction, setAutomationActiveAction } from "@/app/actions/automations";
import type { AutomationGraph, GraphEdge, NodeType } from "@/lib/domain/graph/schema";
import { nodeDisplayName, validateGraph, type GraphIssue } from "@/lib/domain/graph/validate";
import { cn } from "@/lib/utils";
import { NodeConfigPanel, type RefOption } from "./node-config-panel";
import { DRAG_MIME, NodePalette } from "./palette";
import {
  addNode,
  builderReducer,
  canConnect,
  connect,
  duplicateNode,
  initBuilder,
  removeEdges,
  removeNodes,
  updateNode,
} from "./state";

export type BuilderProps = {
  slug: string;
  automation: { id: string; name: string; status: AutomationStatusValue; revision: number; hasUnpublishedChanges: boolean };
  graph: AutomationGraph;
  agents: RefOption[];
  automations: RefOption[];
  /** Optional per-node run status overlay (used by the test runner). */
  runStatus?: Record<string, RunStatus>;
  /** Slot rendered in the toolbar (e.g. the test runner button). */
  toolbarExtra?: React.ReactNode;
};

const BASE_VARIABLES = ["contact.first_name", "contact.last_name", "contact.email", "contact.phone", "message.text"];

export function AutomationBuilder(props: BuilderProps) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}

function BuilderInner({ slug, automation, graph: initialGraph, agents, automations, runStatus, toolbarExtra }: BuilderProps) {
  const router = useRouter();
  const rf = useReactFlow();
  const [state, dispatch] = useReducer(builderReducer, initialGraph, initBuilder);
  const [revision, setRevision] = useState(automation.revision);
  const [status, setStatus] = useState(automation.status);
  const [unpublished, setUnpublished] = useState(automation.hasUnpublishedChanges);
  const [saving, startSaving] = useTransition();
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());
  const wrapper = useRef<HTMLDivElement>(null);

  const { graph, selectedId } = state;
  const dirty = graph !== state.saved;

  const refCtx = useMemo(
    () => ({
      agentIds: new Set(agents.map((a) => a.id)),
      automationIds: new Set([...automations.map((a) => a.id), automation.id]),
      selfAutomationId: automation.id,
    }),
    [agents, automations, automation.id],
  );
  const validation = useMemo(() => validateGraph(graph, refCtx), [graph, refCtx]);
  const errors = validation.issues.filter((i) => i.severity === "error");
  const warnings = validation.issues.filter((i) => i.severity === "warning");

  const variables = useMemo(() => {
    const saved = graph.nodes
      .map((n) => (n.type === "message" || n.type === "ai_response" ? String((n.data as { saveReplyAs?: string }).saveReplyAs ?? "") : ""))
      .filter(Boolean);
    return [...BASE_VARIABLES, ...new Set(saved)];
  }, [graph.nodes]);

  // ── React Flow view model ──
  const rfNodes: FlowNode[] = useMemo(() => {
    const errorsByNode = new Map<string, number>();
    for (const i of errors) if (i.nodeId) errorsByNode.set(i.nodeId, (errorsByNode.get(i.nodeId) ?? 0) + 1);
    return graph.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      selected: n.id === selectedId,
      measured: measured[n.id],
      data: { node: n, errorCount: errorsByNode.get(n.id) ?? 0, isStart: n.type === "trigger", runStatus: runStatus?.[n.id] },
    }));
  }, [graph.nodes, selectedId, measured, errors, runStatus]);

  const rfEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        selected: selectedEdges.has(e.id),
        animated: Boolean(runStatus?.[e.source] === "success" && runStatus?.[e.target]),
        ...edgeStyle(e.sourceHandle),
      })),
    [graph.edges, selectedEdges, runStatus],
  );

  const commit = useCallback(
    (next: AutomationGraph, opts: { select?: string | null; key?: string } = {}) =>
      dispatch({ type: "commit", graph: next, select: opts.select, key: opts.key, at: performance.now() }),
    [],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      let next = graph;
      const removed = new Set<string>();
      let dragEnded = false;
      let dragging = false;
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          next = updateNode(next, c.id, { position: c.position });
          if (c.dragging) dragging = true;
          else dragEnded = true;
        } else if (c.type === "position" && c.dragging === false) {
          dragEnded = true;
        } else if (c.type === "select") {
          if (c.selected) dispatch({ type: "select", id: c.id });
          else if (c.id === selectedId) dispatch({ type: "select", id: null });
        } else if (c.type === "remove") {
          removed.add(c.id);
        } else if (c.type === "dimensions" && c.dimensions) {
          const dims = c.dimensions;
          setMeasured((m) => (m[c.id]?.width === dims.width && m[c.id]?.height === dims.height ? m : { ...m, [c.id]: dims }));
        }
      }
      if (removed.size) commit(removeNodes(next, removed), { select: removed.has(selectedId ?? "") ? null : undefined });
      else if (next !== graph) dispatch({ type: "drag", graph: next });
      if (dragEnded && !dragging) dispatch({ type: "dragEnd" });
    },
    [graph, selectedId, commit],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const removed = new Set<string>();
      for (const c of changes) {
        if (c.type === "remove") removed.add(c.id);
        if (c.type === "select")
          setSelectedEdges((s) => {
            const n = new Set(s);
            if (c.selected) n.add(c.id);
            else n.delete(c.id);
            return n;
          });
      }
      if (removed.size) commit(removeEdges(graph, removed));
    },
    [graph, commit],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || !canConnect(graph, c.source, c.target)) return;
      commit(connect(graph, c.source, (c.sourceHandle ?? "out") as GraphEdge["sourceHandle"], c.target));
    },
    [graph, commit],
  );

  const addAt = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      if (type === "trigger" && graph.nodes.some((n) => n.type === "trigger")) {
        toast.error("В сценарии может быть только один триггер");
        return;
      }
      let pos = position;
      if (!pos) {
        const rect = wrapper.current?.getBoundingClientRect();
        pos = rect
          ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
          : { x: 0, y: 0 };
        pos = { x: pos.x - 128, y: pos.y - 40 };
      }
      const { graph: next, id } = addNode(graph, type, pos);
      commit(next, { select: id });
    },
    [graph, commit, rf],
  );

  const selected = graph.nodes.find((n) => n.id === selectedId) ?? null;

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    commit(removeNodes(graph, new Set([selectedId])), { select: null });
  }, [graph, selectedId, commit]);

  const duplicateSelected = useCallback(() => {
    if (!selectedId) return;
    const res = duplicateNode(graph, selectedId);
    if (res) commit(res.graph, { select: res.id });
    else toast.error("Триггер нельзя скопировать");
  }, [graph, selectedId, commit]);

  // ── Saving / publishing ──
  const save = useCallback(
    (then?: () => void) =>
      startSaving(async () => {
        const snapshot = graph;
        const res = await saveAutomationGraphAction(slug, automation.id, snapshot, revision);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        dispatch({ type: "saved", graph: snapshot });
        setRevision(res.data.revision);
        setStatus(res.data.status as AutomationStatusValue);
        setUnpublished(res.data.hasUnpublishedChanges);
        if (!then) toast.success(res.message ?? "Сохранено");
        then?.();
      }),
    [graph, revision, slug, automation.id],
  );

  const publish = useCallback(() => {
    const doPublish = () =>
      startSaving(async () => {
        const res = await setAutomationActiveAction(slug, automation.id, true);
        if (!res.ok) toast.error(res.error);
        else {
          toast.success(res.message);
          setStatus("active");
          setUnpublished(false);
        }
      });
    if (dirty) save(doPublish);
    else doPublish();
  }, [dirty, save, slug, automation.id]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = e.target instanceof HTMLElement && (e.target.closest("input, textarea, [contenteditable=true]") !== null);
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) save();
        return;
      }
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === "Escape") {
        dispatch({ type: "select", id: null });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, saving, save, duplicateSelected]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const focusIssue = (issue: GraphIssue) => {
    if (!issue.nodeId) return;
    const node = graph.nodes.find((n) => n.id === issue.nodeId);
    if (!node) return;
    dispatch({ type: "select", id: node.id });
    rf.setCenter(node.position.x + 128, node.position.y + 50, { zoom: 1, duration: 300 });
  };

  const leave = (href: string) => {
    if (dirty && !window.confirm("Есть несохранённые изменения. Уйти без сохранения?")) return;
    router.push(href);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Toolbar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3">
        <Button variant="ghost" size="icon-sm" onClick={() => leave(`/w/${slug}/automations/${automation.id}`)} aria-label="Назад к автоматизации">
          <ArrowLeft />
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold">{automation.name}</h1>
          <AutomationStatusBadge status={status} />
        </div>
        <span className="ml-1 hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
          {saving ? "Сохраняем…" : dirty ? "Есть несохранённые изменения" : status === "active" && unpublished ? "Сохранено · не опубликовано" : "Все изменения сохранены"}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => dispatch({ type: "undo" })} disabled={state.past.length === 0} aria-label="Отменить">
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Отменить (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => dispatch({ type: "redo" })} disabled={state.future.length === 0} aria-label="Повторить">
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Повторить (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>

          <IssuesButton errors={errors} warnings={warnings} graph={graph} onSelect={focusIssue} />
          {toolbarExtra}
          <Button variant="outline" size="sm" onClick={() => save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Save aria-hidden />} Сохранить
          </Button>
          {(status !== "active" || unpublished || dirty) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={errors.length ? 0 : -1}>
                  <Button size="sm" onClick={publish} disabled={saving || errors.length > 0}>
                    <Play aria-hidden /> {status === "active" ? "Опубликовать изменения" : "Включить"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{errors.length ? "Сначала исправьте ошибки" : "Сохранить и запустить эту версию"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r bg-card md:block">
          <NodePalette onAdd={(t) => addAt(t)} hasTrigger={graph.nodes.some((n) => n.type === "trigger")} />
        </aside>

        <div
          ref={wrapper}
          className="relative min-w-0 flex-1"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_MIME)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(e) => {
            const type = e.dataTransfer.getData(DRAG_MIME) as NodeType;
            if (!type || !(type in nodeMeta)) return;
            e.preventDefault();
            const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
            addAt(type, { x: p.x - 128, y: p.y - 30 });
          }}
        >
          <ReactFlow<FlowNode>
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={flowNodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={(c) => Boolean(c.source && c.target && canConnect(graph, c.source, c.target))}
            onPaneClick={() => dispatch({ type: "select", id: null })}
            deleteKeyCode={["Delete", "Backspace"]}
            fitView
            fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
            minZoom={0.15}
            maxZoom={2}
            snapToGrid
            snapGrid={[10, 10]}
            defaultEdgeOptions={{ type: "smoothstep" }}
            proOptions={{ hideAttribution: true }}
            aria-label="Холст сценария"
          >
            <Background gap={20} size={1} />
            <Controls position="bottom-left" />
            <MiniMap pannable zoomable position="bottom-right" className="!hidden lg:!block" nodeColor={(n) => minimapColor(n.type as NodeType)} />
          </ReactFlow>
          {graph.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                Перетащите <span className="font-medium text-foreground">Триггер</span> из панели слева, чтобы начать сценарий.
              </p>
            </div>
          )}
        </div>

        <aside className={cn("w-[340px] shrink-0 border-l bg-card", selected ? "block" : "hidden xl:block")} aria-label="Настройки блока">
          {selected ? (
            <NodeConfigPanel
              key={selected.id}
              node={selected}
              issues={validation.issues}
              variables={variables}
              agents={agents}
              automations={automations}
              onChange={(data, field) => commit(updateNode(graph, selected.id, { data }), { key: `${selected.id}:${field}` })}
              onLabel={(label) => commit(updateNode(graph, selected.id, { label: label || undefined }), { key: `${selected.id}:label` })}
              onDelete={deleteSelected}
              onDuplicate={duplicateSelected}
              onClose={() => dispatch({ type: "select", id: null })}
            />
          ) : (
            <FlowOverview errors={errors} warnings={warnings} graph={graph} onSelect={focusIssue} />
          )}
        </aside>
      </div>
    </div>
  );
}

function minimapColor(type: NodeType) {
  return { trigger: "#7c3aed", message: "#0284c7", condition: "#f59e0b", action: "#059669", ai_response: "#c026d3", note: "#facc15", end: "#3f3f46" }[type];
}

function IssueList({ issues, graph, onSelect }: { issues: GraphIssue[]; graph: AutomationGraph; onSelect: (i: GraphIssue) => void }) {
  return (
    <ul className="divide-y">
      {issues.map((issue, k) => {
        const node = issue.nodeId ? graph.nodes.find((n) => n.id === issue.nodeId) : undefined;
        return (
          <li key={k}>
            <button
              type="button"
              disabled={!node}
              onClick={() => onSelect(issue)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
            >
              {issue.severity === "error" ? (
                <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" aria-label="Ошибка" />
              ) : (
                <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-600" aria-label="Предупреждение" />
              )}
              <span>
                {issue.message}
                {node && <span className="ml-1 text-muted-foreground">· {nodeDisplayName(node)}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function IssuesButton({
  errors,
  warnings,
  graph,
  onSelect,
}: {
  errors: GraphIssue[];
  warnings: GraphIssue[];
  graph: AutomationGraph;
  onSelect: (i: GraphIssue) => void;
}) {
  const total = errors.length + warnings.length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className={cn(errors.length ? "text-destructive" : "text-success")} aria-label="Результаты проверки">
          {errors.length ? <CircleAlert aria-hidden /> : <CheckCircle2 aria-hidden />}
          {errors.length ? `Ошибок: ${errors.length}` : "Без ошибок"}
          {warnings.length > 0 && <span className="text-amber-600">· {warnings.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">{total === 0 ? "Ошибок не найдено" : "Проверка"}</div>
        {total > 0 ? (
          <div className="max-h-80 overflow-y-auto">
            <IssueList issues={[...errors, ...warnings]} graph={graph} onSelect={onSelect} />
          </div>
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">Этот сценарий можно включить.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}

function FlowOverview({
  errors,
  warnings,
  graph,
  onSelect,
}: {
  errors: GraphIssue[];
  warnings: GraphIssue[];
  graph: AutomationGraph;
  onSelect: (i: GraphIssue) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <p className="text-sm font-semibold">Сценарий</p>
        <p className="text-xs text-muted-foreground">
          Блоков: {graph.nodes.length} · связей: {graph.edges.length}. Выберите блок, чтобы настроить его.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {errors.length + warnings.length > 0 ? (
          <IssueList issues={[...errors, ...warnings]} graph={graph} onSelect={onSelect} />
        ) : (
          <p className="flex items-center gap-2 px-4 py-3 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden /> Ошибок не найдено
          </p>
        )}
      </div>
      <div className="space-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Горячие клавиши</p>
        <p>Ctrl+S — сохранить · Ctrl+Z — отменить · Ctrl+Shift+Z — повторить</p>
        <p>Ctrl+D — копировать · Del — удалить · Esc — снять выделение</p>
      </div>
    </div>
  );
}

