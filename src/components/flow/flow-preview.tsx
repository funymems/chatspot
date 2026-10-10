"use client";

import "@xyflow/react/dist/style.css";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider } from "@xyflow/react";
import { useMemo } from "react";
import type { AutomationGraph } from "@/lib/domain/graph/schema";
import type { GraphIssue } from "@/lib/domain/graph/validate";
import { cn } from "@/lib/utils";
import { flowNodeTypes } from "./flow-node";
import { toReactFlow } from "./to-react-flow";

/** Read-only canvas used for automation overviews, template and AI previews. */
export function FlowPreview({
  graph,
  issues,
  className,
  showMiniMap = false,
}: {
  graph: AutomationGraph;
  issues?: GraphIssue[];
  className?: string;
  showMiniMap?: boolean;
}) {
  const { nodes, edges } = useMemo(() => toReactFlow(graph, issues), [graph, issues]);
  return (
    <div className={cn("h-[420px] w-full overflow-hidden rounded-lg border bg-muted/30", className)}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={flowNodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          proOptions={{ hideAttribution: true }}
          aria-label="Flow preview"
        >
          <Background gap={20} size={1} />
          <Controls showInteractive={false} />
          {showMiniMap && <MiniMap pannable zoomable />}
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
