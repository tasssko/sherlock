# Relay API

Developer-facing documentation for the current Relay backend.

loop.study uses Relay only as an agent/runtime execution boundary. loop.study remains the product API and does not mirror Relay routes directly.

## Scope and status

- Base JSON API prefix: `/v1`
- Canonical work plan path uses hyphenation: `/v1/work-plans`
- Legacy aliases `/v1/workplans` and `/v1/workplans/:id` exist as redirects to the canonical paths
- Local/dev API currently has no production authentication boundary
- Do not expose this server publicly without auth, proxy, and network controls
- No dedicated `/health` or `/version` endpoint currently exists

## Runtime and configuration

Environment variables referenced by the current server/runtime:

- `PORT`: API listen port when running `src/app/api/server.ts` directly. Defaults to `3000`.
- `POWERTRAIN_ADMIN_DEV_URL`: if set, HTML workspace routes load the admin app from a Vite dev server instead of `/ui/admin.js` and `/ui/admin.css`.
- `POWERTRAIN_AGENT_RUNTIME_MODE`: `llm` enables LLM-backed agent runtime; any other value falls back to `noop`.
- `POWERTRAIN_INTENT_INFERENCE_MODE`: `llm` enables LLM-backed intent inference; any other value falls back to `static`.
- `OPENAI_API_KEY`: required for LLM runtime/model creation.
- `OPENAI_MODEL`: optional model override for both agent runtime and structured intent inference.
- `OPENAI_BASE_URL`: optional OpenAI-compatible base URL override.

Notes:

- If `POWERTRAIN_AGENT_RUNTIME_MODE=llm` is set without a usable model, server composition throws `runtime_not_available`.
- Intent inference falls back to static mode if LLM inference cannot be configured.
- The CLI, not the server, also reads `POWERTRAIN_API_URL`.

## Error model

Common error shapes:

```json
{
  "error": "invalid_request",
  "message": "Request validation failed.",
  "details": []
}
```

```json
{
  "error": "workspace_not_found",
  "message": "No workspace is configured for inbound address support@powertrain.local."
}
```

Rules:

- Zod validation failures return `400` with `error: "invalid_request"`.
- Engine/domain errors return `400` with engine-specific `error` codes.
- Route-local not-found cases return `404` with `*_not_found`.
- Duplicate workspace create returns `409` with `error: "workspace_exists"`.

## Data model highlights

Important request/response enums used repeatedly:

- `source`: `api | cli | webhook | chat | ci | system | email`
- message content `type`: `text | command | event | system`
- task `kind`: `agent_task | controller_task`
- task `state`: `created | queued | planning | waiting_for_context | running | waiting_for_approval | blocked | completed | failed | cancelled | expired`
- artifact `type`: `text | markdown | json | url | file | email_reply_draft`

Important metadata fields that appear in messages and events:

- message metadata routing: `routedToAgentHandle`, `routingReason`, `mentionedAgentHandles`
- response message metadata: `sourceMessageId`, `taskId`, `resultStatus`, `workPlanId`
- inbound email message metadata: `metadata.email.externalMessageId`, `metadata.email.externalThreadId`, `metadata.email.subject`, `metadata.email.receivedAt`, optional `attachments`
- email conversation metadata: `conversation.metadata.email.externalThreadId`, `subject`, `from`, `inboundAddress`

## Health and server entrypoints

### `GET /`

Purpose:
- Redirects to the local workspace UI.

Response:
- Redirect to `/workspaces`

Notes:
- This is an HTML entrypoint, not a JSON health route.

### `GET /ui/:asset`

Purpose:
- Serves built admin assets such as `admin.js` and `admin.css`.

Response:
- Asset bytes when present
- `404` with `ui_asset_not_found` if the built asset is missing

Notes:
- When `POWERTRAIN_ADMIN_DEV_URL` is set, workspace HTML pages reference the dev server instead of this asset route.

## Admin and frontend HTML entrypoints

These routes return the local workspace/admin shell HTML, not JSON:

- `/workspaces`
- `/workspaces/:id`
- `/workspaces/:id/agents`
- `/workspaces/:id/agents/:agentHandle`
- `/workspaces/:id/chat`
- `/workspaces/:id/conversations`
- `/workspaces/:id/conversations/:conversationId`
- `/workspaces/:id/messages/:messageId`
- `/workspaces/:id/tasks`
- `/workspaces/:id/tasks/:taskId`
- `/workspaces/:id/tasks/:taskId/taskgraph`
- `/workspaces/:id/tasks/:taskId/workplan`
- `/workspaces/:id/workplans`
- `/workspaces/:id/workplans/:workPlanId`
- `/workspaces/:id/artifacts`
- `/workspaces/:id/artifacts/:artifactId`
- `/workspaces/:id/events`
- `/workspaces/:id/settings`

Notes:

- No Sherlock-specific backend route exists today. The admin UI and any Sherlock frontend should consume the same `/v1/*` JSON API and `/v1/workspaces/:id/events` WebSocket stream.

## Workspaces

### `GET /v1/workspaces`

Purpose:
- Lists all persisted workspaces.

Response:
- `Workspace[]`

Example response:

```json
[
  {
    "id": "workspace_demo",
    "name": "Demo Workspace",
    "slug": "demo-workspace",
    "status": "active",
    "defaultControllerId": "controller.supervisor_workplan",
    "context": {
      "defaultSupervisorAgentHandle": "supervisor",
      "availableAgentHandles": ["supervisor", "writer", "security"]
    },
    "defaultPolicy": {
      "requireApprovalForSideEffects": [],
      "allowTaskCreationFromConversation": true,
      "allowMessageOnlyResponses": true,
      "allowSupervisorDelegation": true,
      "allowAgentToAgentDelegation": false
    },
    "createdAt": "2026-05-28T00:00:00.000Z",
    "updatedAt": "2026-05-28T00:00:00.000Z"
  }
]
```

### `POST /v1/workspaces`

Purpose:
- Creates a workspace from the full `workspaceSchema`.

Request body:
- Full `Workspace`

Response:
- `201` with the created `Workspace`
- `409` if the workspace id already exists

Example request:

```http
POST /v1/workspaces
content-type: application/json

{
  "id": "workspace_created_via_api",
  "name": "Created Via API",
  "slug": "created-via-api",
  "status": "active",
  "context": {
    "operatingInstructions": [],
    "defaultSupervisorAgentHandle": "supervisor",
    "availableAgentHandles": ["supervisor"]
  },
  "defaultPolicy": {
    "requireApprovalForSideEffects": [],
    "allowTaskCreationFromConversation": true,
    "allowMessageOnlyResponses": true,
    "allowSupervisorDelegation": true,
    "allowAgentToAgentDelegation": false
  },
  "createdAt": "2026-05-28T00:00:00.000Z",
  "updatedAt": "2026-05-28T00:00:00.000Z"
}
```

### `GET /v1/workspaces/:id`

Purpose:
- Fetches one workspace by id.

Response:
- `Workspace`

### `PUT /v1/workspaces/:id`

Purpose:
- Replaces a workspace using the full `workspaceSchema`.

Request body:
- Full `Workspace`

Response:
- Updated `Workspace`

Notes:
- The body `id` must match the route `:id`, or the route returns `400 workspace_id_mismatch`.

### `GET /v1/workspaces/:id/status`

Purpose:
- Returns workspace status plus discovered agent/controller/skill/tool ids and persistence mode.

Response shape:

```json
{
  "workspace": {},
  "defaultControllerId": "controller.supervisor_workplan",
  "agentHandles": ["@supervisor", "@writer"],
  "controllerIds": ["controller.supervisor_workplan"],
  "skillIds": ["write_markdown_summary"],
  "toolIds": ["artifact.markdown.create"],
  "persistenceMode": "in_memory"
}
```

Notes:

- This is the closest thing to a server-capabilities/status endpoint in the current API.

### `POST /v1/workspaces/:id/reset-demo`

Purpose:
- Reseeds the demo workspace.

Response:
- `{ workspace, agents }`

Notes:

- This is demo/admin-only behavior.
- It only supports the seeded demo workspace id returned by `resetDemoWorkspace()`.

## Agents

### `GET /v1/workspaces/:id/agents`

Purpose:
- Lists agents attached to one workspace.

Response:
- `AgentProfile[]`

### `GET /v1/workspaces/:id/agents/:handle`

Purpose:
- Fetches one workspace agent by handle.

Response:
- `AgentProfile`

### `GET /v1/agents?workspace_id=:workspaceId`

Purpose:
- Lists agents through the management API.

Query params:
- `workspace_id` required

Response:
- `AgentProfile[]`

### `POST /v1/agents`

Purpose:
- Creates an agent from the normalized create schema.

Request body highlights:
- `workspaceId`, `handle`, `displayName`, `role`, `instructions`
- optional `skillIds`, `toolIds`, `domains`, `taskTypes`, `responsibilities`, `successCriteria`
- optional `contextAccess`, `permissions`

Response:
- `201` with a full `AgentProfile`

Notes:

- Handles may be submitted with `@`; the created profile is normalized to the bare handle form in tests.

### `GET /v1/agents/:idOrHandle?workspace_id=:workspaceId`

Purpose:
- Resolves an agent by id or handle.

### `PATCH /v1/agents/:idOrHandle?workspace_id=:workspaceId`

Purpose:
- Partial agent update.

Request body:
- `AgentUpdateRequest`

### `POST /v1/agents/:idOrHandle/disable?workspace_id=:workspaceId`

Purpose:
- Disables an agent.

### `POST /v1/workspaces/:id/agents`

Purpose:
- Saves a full `AgentProfile` directly under a workspace route.

Request body:
- Full `AgentProfile`

Notes:
- `workspaceId` in the body must match the route.

### `PUT /v1/workspaces/:id/agents/:handle`

Purpose:
- Replaces a full `AgentProfile` under the workspace route.

Notes:
- If `:handle` differs from the incoming profile handle, the old handle is removed first.

## Controllers

These endpoints exist today even though most user-facing flows route through workspace defaults and the supervisor controller.

### `GET /v1/controllers?workspace_id=:workspaceId`

Purpose:
- Lists controllers for one workspace.

### `POST /v1/controllers`

Purpose:
- Creates a controller.

Request body:
- `workspaceId`, `handle`, `displayName`, `instructions`
- optional `allowedAgentIds`, `allowedSkillIds`, `allowedToolIds`, `planningPolicy`, `definitionId`

### `GET /v1/controllers/:idOrHandle?workspace_id=:workspaceId`

Purpose:
- Fetches one controller by id or handle.

### `PATCH /v1/controllers/:idOrHandle?workspace_id=:workspaceId`

Purpose:
- Partially updates a controller.

### `POST /v1/controllers/:idOrHandle/disable?workspace_id=:workspaceId`

Purpose:
- Disables a controller.

## Conversations

### `GET /v1/workspaces/:id/conversations`

Purpose:
- Lists conversations for one workspace.

Response:
- `Conversation[]`

### `GET /v1/conversations?workspace_id=:workspaceId&limit=:n`

Purpose:
- Global conversation list endpoint with optional filtering.

Query params:
- `workspace_id` optional
- `limit` optional positive integer

Response:
- `Conversation[]`

### `GET /v1/conversations/:id`

Purpose:
- Fetches one conversation plus all messages in it.

Response shape:

```json
{
  "conversation": {
    "id": "conv_123",
    "workspaceId": "workspace_demo",
    "source": "chat",
    "participantIds": ["user:test"],
    "status": "active",
    "createdAt": "2026-05-28T10:00:00.000Z",
    "updatedAt": "2026-05-28T10:00:01.000Z"
  },
  "messages": [
    {
      "id": "msg_1",
      "workspaceId": "workspace_demo",
      "conversationId": "conv_123",
      "source": "chat",
      "senderId": "user:test",
      "content": {
        "type": "text",
        "text": "Create a one-page client summary for this delivery review."
      },
      "createdAt": "2026-05-28T10:00:00.000Z"
    },
    {
      "id": "msg_2",
      "workspaceId": "workspace_demo",
      "conversationId": "conv_123",
      "source": "system",
      "senderId": "agent:writer",
      "metadata": {
        "taskId": "task_123",
        "sourceMessageId": "msg_1",
        "resultStatus": "succeeded"
      },
      "content": {
        "type": "text",
        "text": "Generated runtime response."
      },
      "createdAt": "2026-05-28T10:00:01.000Z"
    }
  ]
}
```

### `GET /v1/conversations/:id/turns`

Purpose:
- Lists persisted `AgentTurn` records for conversation-only expert discussion flows.

Response:
- `AgentTurn[]`

Notes:
- This is separate from task/work-plan execution.
- In tests, a multi-expert discussion returns turns such as `strategy:expert`, `finance:expert`, `technical:expert`, then `crewchief:synthesiser`.

## Messages and chat

### `POST /v1/messages`

Purpose:
- Main chat/message entrypoint for conversation-first interaction.

Request body:

```json
{
  "workspaceId": "workspace_demo",
  "conversationId": "conv_existing_optional",
  "to": "@writer",
  "source": "chat",
  "senderId": "user:test",
  "content": {
    "type": "text",
    "text": "Draft a short launch note for Powertrain."
  },
  "metadata": {
    "requestedSkillId": "write_markdown_summary",
    "controllerId": "controller.demo_orchestrator"
  },
  "idempotencyKey": "chat-1"
}
```

Response shape:

```json
{
  "messageId": "msg_123",
  "responseMessageId": "msg_124",
  "conversationId": "conv_123",
  "intent": "create_task",
  "status": "accepted",
  "taskId": "task_123",
  "responseText": "Generated runtime response.",
  "approvalId": "approval_123",
  "workPlanId": "plan_123"
}
```

Notes:

- `conversationId` is optional. Omit it to start a new conversation; provide it to continue an existing conversation.
- `idempotencyKey` is required. Replays return `status: "duplicate"` and the original ids when the message was already accepted.
- `to` is optional. It supports direct routing such as `@writer`.
- `metadata.controllerId` can force controller execution.
- `metadata.requestedSkillId` can route a task through a named skill when supported by the agent.
- The route always returns `202`, even when execution completes immediately inside the same request in local/demo configurations.

Related events:

- `conversation.created` when a new conversation is opened
- `message.received`
- `intent.inferred`
- plus task/work-plan/result events depending on routing outcome

#### Example: start a new chat conversation

```http
POST /v1/messages
content-type: application/json

{
  "workspaceId": "workspace_demo",
  "source": "chat",
  "senderId": "user:test",
  "content": {
    "type": "text",
    "text": "Create a one-page client summary for this delivery review."
  },
  "idempotencyKey": "api-1"
}
```

Typical outcome:

- creates a new conversation
- infers `create_task`
- creates a task
- may return a `responseMessageId` if the task finishes inline

#### Example: continue an existing conversation

```http
POST /v1/messages
content-type: application/json

{
  "workspaceId": "workspace_demo",
  "conversationId": "conv_123",
  "source": "chat",
  "senderId": "user:test",
  "content": {
    "type": "text",
    "text": "Also mention rollout sequencing."
  },
  "idempotencyKey": "chat-continue-1"
}
```

#### Example: direct `@agent` routing

```http
POST /v1/messages
content-type: application/json

{
  "workspaceId": "workspace_demo",
  "source": "chat",
  "senderId": "user:test",
  "to": "@writer",
  "content": {
    "type": "text",
    "text": "Draft a short launch note for Powertrain."
  },
  "metadata": {
    "requestedSkillId": "write_markdown_summary"
  },
  "idempotencyKey": "direct-writer-1"
}
```

Observed behavior:

- message `recipientAgentHandle` is `writer`
- task `assignedAgentHandle` is `writer`
- related artifact list can contain a generated markdown artifact

#### Example: multi-agent handle routing

```http
POST /v1/messages
content-type: application/json

{
  "workspaceId": "workspace_demo",
  "source": "chat",
  "senderId": "user:test",
  "content": {
    "type": "text",
    "text": "Ask @tutor to create a study structure, then @writer to make it friendly."
  },
  "idempotencyKey": "multi-handle-1"
}
```

Observed behavior:

- the message records `metadata.routingReason = "multi_agent_handles"`
- `metadata.mentionedAgentHandles = ["tutor", "writer"]`
- routing falls back to the workspace supervisor/controller path rather than assigning directly to one agent

#### Example: supervisor work-plan creation

```http
POST /v1/messages
content-type: application/json

{
  "workspaceId": "workspace_demo",
  "source": "chat",
  "senderId": "user:test",
  "content": {
    "type": "text",
    "text": "Review this Terraform setup for security concerns and prepare a client-friendly summary."
  },
  "idempotencyKey": "plan-1"
}
```

Observed behavior in tests:

- response includes both `taskId` and `workPlanId`
- the task is a `controller_task`
- the initial work plan state is `draft`

### `GET /v1/messages/:id`

Purpose:
- Fetches one message.

Response:
- `Message`

### `GET /v1/messages?workspace_id=:workspaceId&conversation_id=:conversationId&limit=:n`

Purpose:
- Lists persisted messages.

Query params:
- `workspace_id` optional
- `conversation_id` optional
- `limit` optional positive integer

Response:
- `Message[]`

Notes:
- No cursor pagination exists yet.

## Message inspection

### `GET /v1/workspaces/:id/messages/:messageId/inspection`

Purpose:
- Workspace-scoped message inspection endpoint used by the admin UI.

### `GET /v1/messages/:id/inspection`

Purpose:
- Global message inspection endpoint used by CLI and tooling.

Response shape:

```json
{
  "message": {},
  "conversation": {},
  "task": {},
  "events": [],
  "intentEvent": {},
  "inferredIntent": "create_task",
  "workRequirementEvent": {},
  "supervisorDecisionEvent": {},
  "resultEvents": [],
  "responseText": "Drafted a plan proposal with 3 step(s)."
}
```

Notes:

- `workRequirementEvent` and `supervisorDecisionEvent` are only present when the message went through supervisor analysis.
- `responseText` is reconstructed from the message/result events and is useful for inspection UIs.

#### Example: inspect a message/task result

```http
GET /v1/messages/msg_123/inspection
```

Typical useful fields:

- `inferredIntent`
- `task.id`
- `resultEvents`
- `responseText`

## Tasks

### `POST /v1/tasks`

Purpose:
- Explicit task creation entrypoint for procedural callers that already know they want a task.

Request body:

```json
{
  "workspaceId": "workspace_demo",
  "source": "api",
  "createdBy": "user:test",
  "assignedAgentHandle": "writer",
  "message": "Create a one-page business case for Powertrain",
  "requestedSkillId": "write_markdown_summary",
  "metadata": {}
}
```

Response:
- `202` with the created `Task`

Notes:

- This route internally forwards into `POST /v1/messages`.

### `GET /v1/workspaces/:id/tasks`

Purpose:
- Lists tasks for one workspace.

Response:
- `Task[]`

### `GET /v1/tasks?workspace_id=:workspaceId&state=:taskState&limit=:n`

Purpose:
- Global task listing with optional filters.

### `GET /v1/tasks/:id`

Purpose:
- Fetches detailed task data for the admin UI.

Response shape:

```json
{
  "task": {},
  "taskInspection": {},
  "parentTask": {},
  "childTasks": [],
  "childTaskInspections": [],
  "taskGraph": {},
  "artifacts": [],
  "approvals": [],
  "workPlan": {},
  "resultEvent": {},
  "policyEvents": []
}
```

Notes:

- This route does not include the full raw `events` array; use `/inspection` or `/events` when you need event history.

### `GET /v1/tasks/:id/inspection`

Purpose:
- Richer task inspection response for CLI/diagnostics.

Response shape:

```json
{
  "task": {},
  "rootTask": {},
  "parentTask": {},
  "childTasks": [],
  "childTaskInspections": [],
  "taskInspection": {},
  "taskGraph": {},
  "artifacts": [],
  "approvals": [],
  "events": [],
  "workPlan": {},
  "resultEvent": {},
  "policyEvents": []
}
```

### `GET /v1/tasks/:id/events`

Purpose:
- Lists task-scoped events.

Response:

```json
{
  "taskId": "task_123",
  "events": []
}
```

### `GET /v1/tasks/:id/children`

Purpose:
- Returns controller child tasks.

Response:

```json
{
  "taskId": "task_123",
  "childTasks": []
}
```

### `GET /v1/tasks/:id/artifacts`

Purpose:
- Lists artifacts belonging to a task.

Response:

```json
{
  "taskId": "task_123",
  "artifacts": []
}
```

### `GET /v1/tasks/:id/taskgraph`

Purpose:
- Returns the materialized task graph for a controller task.

Response:

```json
{
  "taskId": "task_123",
  "taskGraph": {
    "rootTaskId": "task_123",
    "controllerId": "controller.demo_orchestrator",
    "nodes": [],
    "edges": []
  }
}
```

### `GET /v1/tasks/:id/workplan`

Purpose:
- Returns the `WorkPlanRecord` linked to a root task.

Response:
- `WorkPlanRecord`

### `POST /v1/tasks/:id/approve`

Purpose:
- Grants the current pending approval for a task.

Request body:

```json
{
  "actorId": "user:approver",
  "reason": "optional"
}
```

### `POST /v1/tasks/:id/reject`

Purpose:
- Rejects the current pending approval for a task.

Notes:

- Approval semantics are task-centric. If no pending approval exists, the engine returns an error.

## Work plans

### `GET /v1/work-plans/:id`

Purpose:
- Fetches one `WorkPlanRecord`.

### `GET /v1/work-plans/:id/inspection`

Purpose:
- Returns work-plan inspection data for admin/CLI consumers.

Response shape:

```json
{
  "workPlan": {},
  "rootTask": {},
  "rootTaskInspection": {},
  "proposalArtifact": {},
  "artifacts": [],
  "events": []
}
```

Notes:

- `proposalArtifact` is present for plan-proposal flows and is titled `Plan Proposal` in tests.

### `GET /v1/work-plans?workspace_id=:workspaceId&state=:state&limit=:n`

Purpose:
- Lists work plans with optional workspace/state filters.

### `GET /v1/workplans`
### `GET /v1/workplans/:id`
### `GET /v1/workplans/:id/inspection`

Purpose:
- Redirect aliases for the canonical `/v1/work-plans...` routes.

### `POST /v1/work-plans/:id/approve`

Purpose:
- Approves a draft work plan.

Request body:

```json
{
  "actorId": "user:approver",
  "reason": "optional"
}
```

Response:
- Updated `WorkPlanRecord` with `state: "approved"`

Related events:

- `work_plan.approved`

### `POST /v1/work-plans/:id/reject`

Purpose:
- Rejects a draft work plan.

Request body:

```json
{
  "actorId": "user:approver",
  "reason": "Too broad"
}
```

Response:
- Updated `WorkPlanRecord` with `state: "rejected"` and `rejectionReason`

Related events:

- `work_plan.rejected`

## Task graphs

Task graph data is exposed through task endpoints rather than a standalone collection.

Primary routes:

- `GET /v1/tasks/:id`
- `GET /v1/tasks/:id/inspection`
- `GET /v1/tasks/:id/taskgraph`
- `GET /v1/tasks/:id/children`

Task graph node fields:

- `taskId`
- `workItemId`
- `title`
- `prompt`
- `assignedAgentHandle`
- `requestedSkillId`
- `state`
- `provider`
- `requiredCapability`
- `reason`

Task graph edge fields:

- `fromTaskId`
- `toTaskId`
- `kind: "depends_on"`

Notes:

- Task graphs are primarily emitted for controller tasks and work-plan execution.

## Artifacts

### `GET /v1/artifacts?workspace_id=:workspaceId&task_id=:taskId&conversation_id=:conversationId&limit=:n`

Purpose:
- Lists artifacts across the system with optional filters.

### `GET /v1/workspaces/:id/artifacts?limit=:n`

Purpose:
- Lists artifacts scoped to one workspace.

### `GET /v1/artifacts/:id`

Purpose:
- Fetches one artifact.

Response fields:

- `id`, `taskId`, `conversationId`, `workspaceId`
- `type`
- `title`
- `uri`
- `content`
- `metadata`
- `createdBy`, `createdAt`

Notes:

- `email_reply_draft` is a first-class artifact type.
- Artifacts must belong to either a task or a conversation.

## Events

### `GET /v1/workspaces/:id/events`

Purpose:
- Lists workspace events from the append-only event log.

Query params:

- `messageId` optional
- `conversationId` optional
- `type` optional; may be supplied once or repeated to filter by event type

Response:
- `TaskEvent[]`

Example response:

```json
[
  {
    "id": "evt_123",
    "taskId": "task_123",
    "workspaceId": "workspace_demo",
    "type": "result.delivered",
    "actor": "agent:writer",
    "timestamp": "2026-05-28T18:00:00.000Z",
    "data": {
      "conversationId": "conv_123",
      "messageId": "msg_1",
      "responseMessageId": "msg_2",
      "delivery": "inline_response"
    }
  }
]
```

Notes:

- There is no pagination on workspace events yet.
- Filtering is done in memory after loading the workspace event list.

## WebSocket live events

### `GET ws(s)://<host>/v1/workspaces/:workspaceId/events`

Purpose:
- Streams workspace events to live UIs.

Connection details:

- Standard WebSocket upgrade on the same path shape as the HTTP workspace events route
- No query params are required or currently interpreted
- The server rejects upgrades that do not match `/v1/workspaces/:workspaceId/events`

Envelope shape:

```json
{
  "type": "event",
  "workspaceId": "workspace_demo",
  "taskId": "task_123",
  "conversationId": "conv_123",
  "eventType": "result.delivered",
  "actor": "agent:tutor",
  "timestamp": "2026-05-28T18:00:00.000Z",
  "data": {
    "conversationId": "conv_123",
    "responseMessageId": "msg_456"
  }
}
```

Current transport behavior:

- The server sends heartbeat ping frames every 30 seconds.
- The server publishes only future events; there is no replay or resume token.
- There is no reconnect protocol, backfill cursor, or event ack.

How the admin UI uses it today:

- `ChatPage` opens one workspace socket
- it parses envelopes with `type === "event"`
- it uses `task.state_changed`, `agent_runtime.started`, `capability_gap.detected`, `result.created`, and `task.failed` to drive live pending-message state

Guidance for Admin UI or Sherlock:

- Treat the WebSocket as a live hint stream, not a source of truth
- On reconnect or missed frames, refetch canonical state through `/v1/conversations/:id`, `/v1/messages/:id/inspection`, `/v1/tasks/:id`, and `/v1/work-plans/:id/inspection`
- Because reconnect replay is not implemented, clients should assume they may need to refresh after disconnects

## Email inbound channel

### `POST /v1/email/inbound`

Purpose:
- Normalized local inbound email entrypoint.

Request body:

```json
{
  "externalMessageId": "email-thread-1-message-1",
  "externalThreadId": "email-thread-1",
  "from": {
    "address": "client@example.com",
    "name": "Client Contact"
  },
  "to": [
    {
      "address": "support@powertrain.local"
    }
  ],
  "cc": [],
  "subject": "Delivery review",
  "textBody": "Create a short delivery review update for the client.",
  "htmlBody": "<p>optional</p>",
  "inReplyTo": "optional-external-id",
  "attachments": [
    {
      "fileName": "optional.pdf",
      "contentType": "application/pdf",
      "sizeBytes": 1024,
      "contentBase64": "..."
    }
  ],
  "receivedAt": "2026-05-29T10:00:00.000Z"
}
```

Response:

```json
{
  "messageId": "msg_123",
  "responseMessageId": "msg_124",
  "conversationId": "conv_123",
  "intent": "create_task",
  "status": "accepted",
  "taskId": "task_123",
  "draftArtifactIds": ["artifact_123"]
}
```

Mapping semantics implemented today:

- inbound recipient address is matched against `workspace.channels.email.inboundAddress`
- `externalThreadId` maps to `Conversation.externalThreadRef`
- `externalThreadId`, `subject`, `from`, and inbound address are also stored under `conversation.metadata.email`
- `externalMessageId` is stored under `message.metadata.email.externalMessageId`
- Powertrain uses `idempotencyKey = "email:" + externalMessageId`

Routing behavior:

- if `textBody` contains no explicit `@handle`, Powertrain routes to the configured `defaultRecipientAgentHandle`
- if `textBody` contains one explicit `@handle`, the message routes directly to that agent
- if `textBody` contains multiple handles, the message metadata records `routingReason: "multi_agent_handles"` and `mentionedAgentHandles`, then the supervisor/controller path takes over

Observed examples from tests:

- `Ask @tutor to explain fractions.` routes the task to `tutor`
- `Ask @tutor ... then @writer ...` records `mentionedAgentHandles: ["tutor", "writer"]` and uses supervisor routing

Related events and artifacts:

- `email.reply_draft_created`
- `artifact.created` for the email draft artifact
- `email_reply_draft` artifact type

Draft-only outbound behavior:

- outbound sending is not implemented
- reply generation creates a draft artifact only
- tests explicitly assert `email.reply_sent` is not emitted
- workspace email config hard-codes `outboundMode: "draft_only"` and `autoSendReplies: false`

Limitations:

- attachments are accepted and preserved in metadata only
- no attachment OCR, parsing, storage fan-out, or send pipeline is implemented
- no inbound provider integrations are implemented beyond the normalized manual inject route

## Email reply drafts

Email reply drafts are not created by a standalone endpoint. They are created as a side effect when:

- the conversation source is `email`
- a response message is created
- the source inbound email metadata is present
- the workspace email channel is enabled with `autoDraftReplies: true`

Artifact shape:

```json
{
  "id": "artifact_123",
  "taskId": "task_123",
  "conversationId": "conv_123",
  "workspaceId": "workspace_demo",
  "type": "email_reply_draft",
  "title": "Email reply draft: Delivery review",
  "content": "Generated runtime response.",
  "metadata": {
    "provider": "local",
    "externalThreadId": "email-thread-1",
    "externalMessageId": "email-thread-1-message-1",
    "inReplyTo": "email-thread-1-message-1",
    "from": {
      "address": "support@powertrain.local"
    },
    "to": [
      {
        "address": "client@example.com",
        "name": "Client Contact"
      }
    ],
    "cc": [],
    "subject": "Re: Delivery review",
    "draftMode": "reply",
    "responseMessageId": "msg_124",
    "sourceMessageId": "msg_123"
  },
  "createdBy": "agent:writer",
  "createdAt": "2026-05-29T10:00:01.000Z"
}
```

Notes:

- Conversation-only email responses can also produce an `email_reply_draft` with no `taskId`.
- Non-email chat conversations do not produce email draft artifacts.

## Event reference

All events share the `TaskEvent` envelope:

- `id`
- `taskId` optional
- `workspaceId`
- `type`
- `actor`
- `timestamp`
- `data` object

### Conversation and message

- `conversation.created`: new conversation record created. Typical `data`: `conversationId`, optional `externalThreadRef`.
- `message.received`: inbound message accepted. Typical `data`: `messageId`, `conversationId`, optional `routedToAgentHandle`, `routingReason`.
- `message.created`: response/system message created. Typical `data`: `messageId`, `conversationId`, `sourceMessageId`, optional `taskId`, `resultStatus`, `workPlanId`.
- `agent_turn.created`: expert discussion turn persisted. Typical `data`: `turnId`, `messageId`, `conversationId`, `agentHandle`, `role`.

### Routing and intent

- `intent.inferred`: intent inference completed. Typical `data`: `messageId`, `conversationId`, `intent`, optional `routedToAgentHandle`, `routingReason`, `workPlanId`.
- `work_requirement.inferred`: supervisor inferred a structured work requirement. Typical `data`: `messageId`, `conversationId`, `workRequirement`.
- `supervisor.decision_made`: supervisor decided how to handle the message. Typical `data`: `messageId`, `conversationId`, `decision`.

### Task lifecycle

- `task.created`: new task created from a message. Typical `data`: `taskId`, `messageId`, `kind`.
- `task.queued`: task entered the queued state. Typical `data`: `{}`.
- `task.state_changed`: state transition recorded. Typical `data`: `from`, `to`.
- `task.completed`: task reached completed state. Typical `data`: `{}`.
- `task.failed`: task failed. Typical `data`: `error`.
- `child_task.created`: controller child task materialized. Typical `data`: `childTaskId`, optional `workItemId`, `agentHandle`.
- `child_task.completed`: controller child task completed. Typical `data`: `childTaskId`.

### Agent runtime and capability resolution

- `agent.resolved`: agent selected for a task. Typical `data`: `agentId`, `handle`.
- `context.built`: runtime context assembled. Typical `data`: execution-context object.
- `agent_runtime.started`: agent runtime execution started. Typical `data`: `{}`.
- `agent_runtime.completed`: agent runtime execution completed. Typical `data`: `{}`.
- `skill.resolved`: requested skill resolved. Typical `data`: `skillId`.
- `skill.started`: skill execution started. Typical `data`: `skillId`.
- `skill.completed`: skill execution completed. Typical `data`: `skillId`.
- `skill.failed`: skill execution failed. Typical `data`: `skillId`, `error`.
- `capability_gap.detected`: task was blocked because required capability was unavailable. Typical `data`: `phase`, `agent`, `missingCapabilities`, `reason`.

### Work plans, task graphs, and merge

- `work_plan.created`: durable work-plan record created. Typical `data`: `workPlanId`, `controllerId`, `stepCount`.
- `work_plan.approved`: work plan approved. Typical `data`: `workPlanId`, optional `reason`.
- `work_plan.rejected`: work plan rejected. Typical `data`: `workPlanId`, optional `reason`.
- `workplan.created`: controller planning/task-graph creation event. Typical `data`: `controllerId`, `stepCount`, optional `proposalOnly`.
- `taskgraph.created`: declared in event contracts but not emitted by the current backend code.
- `merge.started`: child-result merge began. Typical `data`: `childTaskIds`.
- `merge.completed`: child-result merge finished. Typical `data`: `childTaskIds`.
- `execution.blocked`: declared in event contracts but not emitted by the current backend code.

### Results and artifacts

- `artifact.created`: artifact persisted. Typical `data`: `artifactId`, optional `title`, `taskId`, `conversationId`, `type`.
- `result.created`: result payload prepared. Typical `data`: task-scoped or conversation-scoped `messageId`, `responseMessageId`, `responseText`, status/data fields, optional `artifactIds`.
- `result.delivered`: result routed back into the conversation. Typical `data`: `conversationId`, `messageId`, `responseMessageId`, `delivery: "inline_response"`.

### Tools and approvals

- `tool.requested`: skill asked to invoke a tool. Typical `data`: `toolId`, `skillId`.
- `tool.policy_checked`: policy check outcome for a tool invocation. Typical `data`: `toolId`, `decision`.
- `tool.approval_required`: tool invocation paused for approval. Typical `data`: `toolId`, `approvalId`.
- `tool.started`: runtime began executing the tool. Typical `data`: `toolId`, `runtimeId`.
- `tool.completed`: tool finished successfully. Typical `data`: `toolId`, `runtimeId`, `artifactIds`.
- `tool.failed`: tool execution failed. Typical `data`: `toolId`, `runtimeId`, `error`.
- `approval.requested`: approval record created. Typical `data`: `approvalId`, `toolId`.
- `approval.granted`: approval granted. Typical `data`: `approvalId`.
- `approval.rejected`: approval rejected. Typical `data`: `approvalId`.

### Email

- `email.reply_draft_created`: reply draft artifact created for an email conversation. Typical `data`: `artifactId`, `conversationId`, `responseMessageId`, `externalThreadId`, `inReplyTo`.

## Current limitations and caveats

- No dedicated authentication or authorization layer on HTTP or WebSocket routes
- No `/health` endpoint
- No automatic email sending; email is draft-only
- No email attachment OCR or processing pipeline
- No pagination beyond `limit`
- Workspace event filtering is in-memory and unpaged
- WebSocket reconnect replay is not implemented
- Demo-specific routes and fixture paths still exist, including `/v1/workspaces/:id/reset-demo`
- `taskgraph.created` and `execution.blocked` are present in the event contract list but are not emitted by the current backend implementation
