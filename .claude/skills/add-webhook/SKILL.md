---
name: add-webhook
description: Add a minimal generic webhook channel. One HTTP POST becomes one inbound message routed through NanoClaw like any other channel.
---

# Add Webhook Channel

Adds a minimal native `webhook` channel. This is the bare path only:

- one HTTP request in
- one inbound message routed through NanoClaw
- same router/session path as any other channel

No product-specific parsing belongs here.

## Install

This is a native channel module, not a Chat SDK adapter.

### Pre-flight

Skip to **Wiring** if all of these are already true:

- `src/channels/webhook.ts` exists
- `src/channels/index.ts` contains `import './webhook.js';`
- `src/webhook-server.ts` supports native webhook handlers

Otherwise continue.

### 1. Create the channel module

Add `src/channels/webhook.ts`.

Behavior:

- listen on `POST /webhook/webhook`
- expect JSON body
- require `text` as a non-empty string
- optional `data` object for structured payload
- optional `platformId`, default `webhook:default`
- optional `threadId`, default `null`
- optional `sender`, default `webhook`
- optional `senderId`, default `webhook:<platformId>`
- optional `isMention`, default `true`
- optional `isGroup`, default `false`
- call `setup.onInbound(platformId, threadId, message)`

### 2. Register the channel

Append to `src/channels/index.ts` if missing:

```typescript
import './webhook.js';
```

### 3. Extend the shared webhook server

Add native adapter support to `src/webhook-server.ts` so non-Chat-SDK channels can reuse the same `/webhook/{adapterName}` ingress path as the Chat SDK adapters.

### 4. Build

```bash
pnpm run build
```

## Test

Start NanoClaw, then send a request:

```bash
curl -X POST http://localhost:3011/webhook/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "Build the website for this place using the latest CRM context.",
    "data": {
      "taskType": "BUILD_WEBSITE"
    },
    "platformId": "crm",
    "threadId": "thread-id-123",
    "sender": "Cafe Central",
    "senderId": "crm:thread-id-123"
  }'
```

Expected response:

```json
{"ok":true,"platformId":"crm","threadId":"thread-id-123"}
```

## Wiring

Wire it like any other channel.

Example:

```sql
INSERT INTO messaging_groups (id, channel_type, platform_id, name, is_group, unknown_sender_policy, created_at)
VALUES ('mg-webhook-crm', 'webhook', 'crm', 'CRM', 0, 'public', datetime('now'));

INSERT INTO messaging_group_agents (id, messaging_group_id, agent_group_id, engage_mode, sender_scope, ignored_message_policy, session_mode, priority, created_at)
VALUES ('mga-webhook-crm', 'mg-webhook-crm', '<your-agent-group-id>', 'mention', 'all', 'drop', 'per-thread', 10, datetime('now'));
```

Recommended first pass:

- use `platformId` to identify the source system (e.g. `"crm"`)
- use `threadId` as the stable identity for this entity/thread
- keep the actual task/request text in `text`
- put additional structured context in `data`
- if `WEBHOOK_WORKSPACES_DIR` is set and a directory `$WEBHOOK_WORKSPACES_DIR/<threadId>` exists, it is automatically mounted at `/workspace/customer` in the agent container

## Channel Info

- **type**: `webhook`
- **endpoint**: `/webhook/webhook`
- **supports-threads**: yes
- **typical-use**: generic ingress for external systems that can POST JSON
- **default-isolation**: `per-thread` when the caller supplies a thread id; otherwise shared behavior applies
