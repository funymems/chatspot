import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema. Every tenant-owned table carries `workspace_id`; all reads and
 * writes go through repositories that receive an authorised WorkspaceContext
 * (see src/lib/server/auth/workspace.ts). When moving to Supabase, RLS policies
 * keyed on workspace_members are added on top of the same columns.
 */

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

// ─── Enums ──────────────────────────────────────────────────────────────────

export const memberRole = pgEnum("member_role", ["owner", "admin", "member"]);
export const automationStatus = pgEnum("automation_status", ["draft", "active", "inactive", "error"]);
export const versionSource = pgEnum("version_source", ["publish", "test", "snapshot"]);
export const executionMode = pgEnum("execution_mode", ["test", "live"]);
export const executionStatus = pgEnum("execution_status", [
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);
export const nodeLogStatus = pgEnum("node_log_status", ["success", "failed", "skipped", "waiting"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "done", "failed"]);
export const leadStatus = pgEnum("lead_status", ["new", "engaged", "qualified", "customer", "lost"]);
export const conversationStatus = pgEnum("conversation_status", ["open", "needs_human", "resolved"]);
export const messageKind = pgEnum("message_kind", [
  "inbound",
  "outbound",
  "generated_reply",
  "internal_note",
  "system",
]);
export const messageSource = pgEnum("message_source", ["contact", "automation", "agent", "human", "system"]);
export const deliveryStatus = pgEnum("delivery_status", ["simulated", "pending", "sent", "failed"]);
export const agentRole = pgEnum("agent_role", ["general", "support", "sales"]);
export const knowledgeSourceType = pgEnum("knowledge_source_type", ["text", "qa", "file"]);
export const knowledgeSourceStatus = pgEnum("knowledge_source_status", ["ready", "processing", "failed"]);
export const templateCategory = pgEnum("template_category", [
  "lead_generation",
  "faq_support",
  "product_recommendations",
  "course_sales",
  "booking",
  "welcome",
  "lead_qualification",
  "follow_up",
]);

// ─── Identity ───────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the opaque session token; the raw token only lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull().default(""),
  avatarUrl: text("avatar_url"),
  lastWorkspaceId: uuid("last_workspace_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  isDemo: boolean("is_demo").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("workspace_members_user_idx").on(t.userId)],
);

// ─── Automations ────────────────────────────────────────────────────────────

export const automations = pgTable(
  "automations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: automationStatus("status").notNull().default("draft"),
    /** Editable working copy of the graph (AutomationGraph JSON). */
    graph: jsonb("graph").notNull(),
    /** Incremented on each save; used for optimistic concurrency in the builder. */
    revision: integer("revision").notNull().default(1),
    /** Immutable version that live events execute against. */
    publishedVersionId: uuid("published_version_id"),
    /** Denormalised from the trigger node for fast event matching. */
    triggerType: text("trigger_type"),
    lastError: text("last_error"),
    origin: text("origin").notNull().default("scratch"), // scratch | template | ai | duplicate
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("automations_ws_status_idx").on(t.workspaceId, t.status),
    index("automations_ws_updated_idx").on(t.workspaceId, t.updatedAt),
  ],
);

export const automationVersions = pgTable(
  "automation_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    graph: jsonb("graph").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    contentHash: text("content_hash").notNull(),
    source: versionSource("source").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("automation_versions_automation_version_idx").on(t.automationId, t.version),
    index("automation_versions_hash_idx").on(t.automationId, t.contentHash),
  ],
);

// ─── Contacts & CRM ─────────────────────────────────────────────────────────

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    email: text("email"),
    phone: text("phone"),
    customFields: jsonb("custom_fields").$type<Record<string, string>>().notNull().default({}),
    source: text("source").notNull().default("manual"), // manual | mock | instagram | import
    /** Channel-specific user id (e.g. a future Instagram-scoped id). */
    channelUserId: text("channel_user_id"),
    leadStatus: leadStatus("lead_status").notNull().default("new"),
    notes: text("notes").notNull().default(""),
    lastInteractionAt: ts("last_interaction_at"),
    mergedIntoId: uuid("merged_into_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contacts_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("contacts_ws_status_idx").on(t.workspaceId, t.leadStatus),
    index("contacts_ws_email_idx").on(t.workspaceId, sql`lower(${t.email})`),
    index("contacts_ws_phone_idx").on(t.workspaceId, t.phone),
    index("contacts_ws_channel_user_idx").on(t.workspaceId, t.source, t.channelUserId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("violet"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_ws_name_idx").on(t.workspaceId, sql`lower(${t.name})`)],
);

export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: uuid("contact_id")
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.tagId] }), index("contact_tags_tag_idx").on(t.tagId)],
);

// ─── AI agents & knowledge ──────────────────────────────────────────────────

export type EscalationRules = {
  keywords: string[];
  onNoAnswer: boolean;
  onExplicitRequest: boolean;
};

export const aiAgents = pgTable(
  "ai_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: agentRole("role").notNull().default("general"),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    tone: text("tone").notNull().default("friendly"),
    /** "match_user" answers in the user's language; "fixed" always uses `language`. */
    languageMode: text("language_mode").notNull().default("match_user"),
    language: text("language").notNull().default("en"),
    businessInfo: text("business_info").notNull().default(""),
    fallbackResponse: text("fallback_response").notNull().default(""),
    escalationRules: jsonb("escalation_rules")
      .$type<EscalationRules>()
      .notNull()
      .default({ keywords: [], onNoAnswer: false, onExplicitRequest: true }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_agents_ws_idx").on(t.workspaceId)],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aiAgents.id, { onDelete: "cascade" }),
    type: knowledgeSourceType("type").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    question: text("question"),
    answer: text("answer"),
    filePath: text("file_path"),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    status: knowledgeSourceStatus("status").notNull().default("ready"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("knowledge_sources_agent_idx").on(t.agentId)],
);

export const knowledgeEntries = pgTable(
  "knowledge_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aiAgents.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    /** 'simple' config: language-agnostic tokenisation (works for EN, RU, …). */
    search: tsvector("search")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('simple', content)`),
    createdAt: createdAt(),
  },
  (t) => [
    index("knowledge_entries_agent_idx").on(t.agentId),
    index("knowledge_entries_search_idx").using("gin", t.search),
  ],
);

// ─── Conversations ──────────────────────────────────────────────────────────

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("mock"),
    status: conversationStatus("status").notNull().default("open"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    /** Agent playground / builder test sessions; hidden from the inbox. */
    isTest: boolean("is_test").notNull().default(false),
    agentId: uuid("agent_id").references(() => aiAgents.id, { onDelete: "set null" }),
    lastMessageAt: ts("last_message_at"),
    lastMessagePreview: text("last_message_preview").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("conversations_ws_status_idx").on(t.workspaceId, t.status, t.lastMessageAt),
    index("conversations_contact_idx").on(t.contactId),
  ],
);

export const automationExecutions = pgTable(
  "automation_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    automationId: uuid("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    versionId: uuid("version_id")
      .notNull()
      .references(() => automationVersions.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    inboundEventId: uuid("inbound_event_id"),
    mode: executionMode("mode").notNull().default("test"),
    status: executionStatus("status").notNull().default("queued"),
    currentNodeId: text("current_node_id"),
    /** Interpreter state (variables, cursor, pending resume info). */
    state: jsonb("state").notNull().default({}),
    stepCount: integer("step_count").notNull().default(0),
    input: jsonb("input").notNull().default({}),
    result: jsonb("result"),
    error: text("error"),
    errorNodeId: text("error_node_id"),
    attempt: integer("attempt").notNull().default(1),
    retryOf: uuid("retry_of"),
    startedAt: ts("started_at"),
    finishedAt: ts("finished_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("executions_ws_created_idx").on(t.workspaceId, t.createdAt),
    index("executions_automation_idx").on(t.automationId, t.createdAt),
    index("executions_contact_idx").on(t.contactId),
    index("executions_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

export const nodeExecutionLogs = pgTable(
  "node_execution_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => automationExecutions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    nodeId: text("node_id").notNull(),
    nodeType: text("node_type").notNull(),
    status: nodeLogStatus("status").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    branch: text("branch"),
    error: text("error"),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    durationMs: integer("duration_ms"),
  },
  (t) => [
    index("node_logs_execution_idx").on(t.executionId, t.seq),
    index("node_logs_ws_status_idx").on(t.workspaceId, t.status),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    kind: messageKind("kind").notNull(),
    source: messageSource("source").notNull(),
    /** Only set for outbound messages; "simulated" until a real provider confirms delivery. */
    deliveryStatus: deliveryStatus("delivery_status"),
    body: text("body").notNull().default(""),
    /** Quick replies, link buttons, used knowledge sources, etc. */
    payload: jsonb("payload").notNull().default({}),
    executionId: uuid("execution_id").references(() => automationExecutions.id, { onDelete: "set null" }),
    agentId: uuid("agent_id").references(() => aiAgents.id, { onDelete: "set null" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const unansweredQuestions = pgTable(
  "unanswered_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => aiAgents.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    resolvedAt: ts("resolved_at"),
    createdAt: createdAt(),
  },
  (t) => [index("unanswered_agent_idx").on(t.agentId, t.createdAt)],
);

// ─── Events, jobs, templates, activity ──────────────────────────────────────

export const inboundEvents = pgTable(
  "inbound_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    externalEventId: text("external_event_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    processedAt: ts("processed_at"),
  },
  (t) => [uniqueIndex("inbound_events_dedupe_idx").on(t.workspaceId, t.channel, t.externalEventId)],
);

export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull().default({}),
    runAt: ts("run_at").notNull(),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    lastError: text("last_error"),
    lockedAt: ts("locked_at"),
    /** Optional idempotency key so the same job is never enqueued twice. */
    dedupeKey: text("dedupe_key").unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("scheduled_jobs_due_idx").on(t.runAt).where(sql`status = 'queued'`)],
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = built-in template available to every workspace. */
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: templateCategory("category").notNull(),
    graph: jsonb("graph").notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("templates_system_slug_idx").on(t.slug).where(sql`workspace_id is null`),
    index("templates_ws_idx").on(t.workspaceId),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("activity_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** null = visible to every member of the workspace. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_ws_created_idx").on(t.workspaceId, t.createdAt)],
);

// ─── Channel integrations ───────────────────────────────────────────────────

export const connectionStatus = pgEnum("connection_status", ["active", "token_expired", "error", "disconnected"]);

/**
 * An external messaging account connected to a workspace (Instagram first).
 * The access token is stored encrypted (AES-256-GCM, key from
 * TOKEN_ENCRYPTION_KEY) and is never selected into client-facing queries.
 */
export const channelConnections = pgTable(
  "channel_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // "instagram"
    /** Professional account id used as `entry[].id` in webhooks. */
    providerAccountId: text("provider_account_id").notNull(),
    /** App-scoped user id returned by the token exchange (may equal the account id). */
    providerUserId: text("provider_user_id"),
    username: text("username").notNull().default(""),
    status: connectionStatus("status").notNull().default("active"),
    accessTokenEncrypted: text("access_token_encrypted"),
    tokenExpiresAt: ts("token_expires_at"),
    tokenRefreshedAt: ts("token_refreshed_at"),
    grantedScopes: jsonb("granted_scopes").$type<string[]>().notNull().default([]),
    /** Set only when Meta confirmed the subscribed_apps call. */
    webhookSubscribedAt: ts("webhook_subscribed_at"),
    lastWebhookAt: ts("last_webhook_at"),
    lastError: text("last_error"),
    /** Explicit opt-in: run automations on incoming messages and reply through the channel. */
    autoReplyEnabled: boolean("auto_reply_enabled").notNull().default(false),
    connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // An external account can belong to only one workspace (unambiguous webhook routing).
    uniqueIndex("channel_connections_provider_account_idx").on(t.provider, t.providerAccountId),
    index("channel_connections_ws_idx").on(t.workspaceId, t.provider),
  ],
);

/** Single-use OAuth `state` values (stored hashed), bound to the user and workspace that started the flow. */
export const oauthStates = pgTable(
  "oauth_states",
  {
    id: text("id").primaryKey(), // sha256(state)
    provider: text("provider").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("oauth_states_expires_idx").on(t.expiresAt)],
);

/**
 * Diagnostics for incoming webhook requests (no message content): lets the
 * workspace see whether Meta's deliveries arrive and why one was rejected.
 */
export const webhookReceipts = pgTable(
  "webhook_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
    httpStatus: integer("http_status").notNull(),
    /** accepted | bad_signature | invalid_json | invalid_payload | ignored_object | unknown_account | not_configured */
    outcome: text("outcome").notNull(),
    /** entry[].id values claimed by the payload (unverified when the signature failed). */
    accountIds: jsonb("account_ids").$type<string[]>().notNull().default([]),
    eventCount: integer("event_count").notNull().default(0),
    eventKinds: jsonb("event_kinds").$type<string[]>().notNull().default([]),
  },
  (t) => [index("webhook_receipts_provider_time_idx").on(t.provider, t.receivedAt)],
);
