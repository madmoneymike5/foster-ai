import {
  NODE_COLORS,
  SHAPE_SIZES,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeColor,
  type CanvasNodeShape,
} from "@/types/canvas";

/**
 * A prebuilt starter diagram that can be imported onto the canvas.
 *
 * Templates are static canvas snapshots: nodes and edges use the same
 * schema as user-created content, so importing one is just clearing the
 * current canvas and adding this data through the normal state flow.
 */
export interface CanvasTemplate {
  /** Stable template identifier, used for keying the import command. */
  id: string;
  name: string;
  description: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** How a template import lands on a canvas that may already have content. */
export type CanvasImportMode = "ask" | "replace" | "add";

/**
 * A one-shot command to import a starter template onto the canvas.
 *
 * `requestId` is unique per selection, so re-importing the same template
 * works and a double-invoked effect (e.g. React strict mode) can only
 * consume the request once.
 *
 * `mode` resolves the conflict when the canvas is not empty:
 * - `ask` — import directly when the canvas is empty; otherwise report a
 *   conflict so the user can choose replace, add, or a new project.
 * - `replace` — clear the current canvas, then add the template.
 * - `add` — keep the current canvas, remap the template's ids, and place it
 *   beside the existing content.
 */
export interface CanvasImportRequest {
  requestId: string;
  template: CanvasTemplate;
  mode: CanvasImportMode;
}

/** Named aliases over the shared node palette, so template data reads clearly. */
const NEUTRAL = NODE_COLORS[0];
const BLUE = NODE_COLORS[1];
const PURPLE = NODE_COLORS[2];
const ORANGE = NODE_COLORS[3];
const RED = NODE_COLORS[4];
const YELLOW = NODE_COLORS[5];
const GREEN = NODE_COLORS[6];
const TEAL = NODE_COLORS[7];

/**
 * Builds a canvas node for template data using the shape's default size.
 *
 * Each call returns fresh nested objects (position, style, data, color), so
 * the template module never shares mutable references between templates.
 */
function templateNode(
  id: string,
  label: string,
  shape: CanvasNodeShape,
  x: number,
  y: number,
  color: CanvasNodeColor,
): CanvasNode {
  const size = SHAPE_SIZES[shape];
  return {
    id,
    type: "canvasNode",
    position: { x, y },
    style: {
      width: `${size.width}px`,
      height: `${size.height}px`,
    },
    data: {
      label,
      shape,
      color: { ...color },
    },
  };
}

/** Builds a canvas edge for template data, with an optional label. */
function templateEdge(
  id: string,
  source: string,
  target: string,
  label = "",
): CanvasEdge {
  return {
    id,
    source,
    target,
    type: "canvasEdge",
    data: { label },
  };
}

/**
 * Returns a deep copy of a template so the caller (React Flow / Liveblocks)
 * can mutate the copies without ever touching the static module data.
 */
export function cloneTemplate(template: CanvasTemplate): CanvasTemplate {
  return {
    ...template,
    nodes: template.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      style: { ...node.style },
      data: { ...node.data, color: { ...node.data.color } },
    })),
    edges: template.edges.map((edge) => ({
      ...edge,
      // `Edge.data` is optional on the React Flow type, so the spread alone
      // would widen `label` to `string | undefined`; restore it explicitly.
      data: { ...edge.data, label: edge.data?.label ?? "" },
    })),
  };
}

/** A gateway fans out to stateful services, each backed by its own database. */
const MICROSERVICES: CanvasTemplate = {
  id: "microservices",
  name: "Microservices",
  description:
    "A client sends traffic through an API gateway that routes to stateful services, each with its own database.",
  nodes: [
    templateNode("web-client", "Web Client", "pill", 0, 208, BLUE),
    templateNode("api-gateway", "API Gateway", "hexagon", 250, 185, TEAL),
    templateNode("auth-service", "Auth Service", "rectangle", 540, 40, PURPLE),
    templateNode("orders-service", "Orders Service", "rectangle", 540, 240, ORANGE),
    templateNode("users-service", "Users Service", "rectangle", 540, 440, GREEN),
    templateNode("auth-db", "Auth DB", "cylinder", 820, 40, NEUTRAL),
    templateNode("orders-db", "Orders DB", "cylinder", 820, 240, NEUTRAL),
    templateNode("users-db", "Users DB", "cylinder", 820, 440, NEUTRAL),
  ],
  edges: [
    templateEdge("client-gateway", "web-client", "api-gateway", "HTTPS"),
    templateEdge("gateway-auth", "api-gateway", "auth-service", "REST"),
    templateEdge("gateway-orders", "api-gateway", "orders-service", "REST"),
    templateEdge("gateway-users", "api-gateway", "users-service", "REST"),
    templateEdge("auth-auth-db", "auth-service", "auth-db", "SQL"),
    templateEdge("orders-orders-db", "orders-service", "orders-db", "SQL"),
    templateEdge("users-users-db", "users-service", "users-db", "SQL"),
  ],
};

/** Source changes flow through continuous integration to a running service. */
const CICD_PIPELINE: CanvasTemplate = {
  id: "cicd-pipeline",
  name: "CI/CD Pipeline",
  description:
    "A code push triggers a CI runner that builds, tests, and publishes an artifact used to deploy to production.",
  nodes: [
    templateNode("code-commit", "Code Commit", "circle", 0, 180, BLUE),
    templateNode("ci-runner", "CI Runner", "hexagon", 210, 185, PURPLE),
    templateNode("build", "Build", "rectangle", 490, 60, ORANGE),
    templateNode("tests", "Tests", "rectangle", 490, 320, YELLOW),
    templateNode("registry", "Artifact Registry", "cylinder", 760, 190, TEAL),
    templateNode("deploy", "Deploy", "rectangle", 980, 60, GREEN),
    templateNode("production", "Production", "circle", 1240, 180, RED),
  ],
  edges: [
    templateEdge("commit-ci", "code-commit", "ci-runner", "Push"),
    templateEdge("ci-build", "ci-runner", "build", "Trigger"),
    templateEdge("build-tests", "build", "tests", "Artifacts"),
    templateEdge("build-registry", "build", "registry", "Publish"),
    templateEdge("tests-registry", "tests", "registry", "Gate"),
    templateEdge("registry-deploy", "registry", "deploy", "Pull"),
    templateEdge("deploy-production", "deploy", "production", "Release"),
  ],
};

/** Services publish domain events to a broker and decoupled consumers react. */
const EVENT_DRIVEN: CanvasTemplate = {
  id: "event-driven",
  name: "Event-Driven System",
  description:
    "Domain services publish events to a broker; independent consumers subscribe and react without calling each other directly.",
  nodes: [
    templateNode("order-service", "Order Service", "rectangle", 0, 40, ORANGE),
    templateNode("payment-service", "Payment Service", "rectangle", 0, 360, PURPLE),
    templateNode("event-broker", "Event Broker", "hexagon", 280, 185, TEAL),
    templateNode("inventory-service", "Inventory Service", "rectangle", 560, 20, GREEN),
    templateNode("notification-service", "Notification Service", "rectangle", 560, 190, BLUE),
    templateNode("analytics-service", "Analytics Service", "rectangle", 560, 360, YELLOW),
    templateNode("event-store", "Event Store", "cylinder", 830, 190, NEUTRAL),
  ],
  edges: [
    templateEdge("orders-broker", "order-service", "event-broker", "orders.*"),
    templateEdge("payments-broker", "payment-service", "event-broker", "payments.*"),
    templateEdge("broker-inventory", "event-broker", "inventory-service", "Subscribe"),
    templateEdge("broker-notification", "event-broker", "notification-service", "Subscribe"),
    templateEdge("broker-analytics", "event-broker", "analytics-service", "Subscribe"),
    templateEdge("analytics-store", "analytics-service", "event-store", "Persist"),
  ],
};

/** The curated starter template library. */
export const CANVAS_TEMPLATES: readonly CanvasTemplate[] = [
  MICROSERVICES,
  CICD_PIPELINE,
  EVENT_DRIVEN,
];

/** Look up a template by id (e.g. for a pending import carried in the URL). */
export function getTemplateById(id: string): CanvasTemplate | null {
  return CANVAS_TEMPLATES.find((template) => template.id === id) ?? null;
}

/**
 * Deterministically remap a template's node/edge ids for an "add to project"
 * import. The `tpl-<requestId prefix>-<original id>` scheme is unique per
 * import request (requestIds are fresh per selection) and cannot collide
 * with user content (random UUIDs) or other template imports. Deterministic
 * ids let the parent pre-compute the imported node ids without the canvas
 * layer having to report them back through state.
 */
export function withRemappedIds(
  requestId: string,
  template: CanvasTemplate,
): { nodes: CanvasNode[]; edges: CanvasEdge[]; nodeIds: string[] } {
  const prefix = `tpl-${requestId}-`;
  const idMap = new Map<string, string>();
  for (const node of template.nodes) {
    idMap.set(node.id, `${prefix}${node.id}`);
  }
  const nodes: CanvasNode[] = template.nodes.map((node) => ({
    ...node,
    id: idMap.get(node.id) as string,
  }));
  const edges: CanvasEdge[] = template.edges.map((edge) => ({
    ...edge,
    id: `${prefix}${edge.id}`,
    source: idMap.get(edge.source) as string,
    target: idMap.get(edge.target) as string,
  }));
  return { nodes, edges, nodeIds: nodes.map((node) => node.id) };
}
