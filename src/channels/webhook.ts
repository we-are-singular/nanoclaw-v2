import fs from 'fs';
import path from 'path';

import { WEBHOOK_WORKSPACES_DIR } from '../config.js';
import { log } from '../log.js';
import { registerNativeWebhookAdapter } from '../webhook-server.js';
import type { ChannelAdapter, ChannelSetup, OutboundMessage } from './adapter.js';
import { registerChannelAdapter } from './channel-registry.js';

const CHANNEL_TYPE = 'webhook';
const ADAPTER_NAME = 'webhook';
const WEBHOOK_PATH = `/webhook/${ADAPTER_NAME}`;

type WebhookInboundBody = {
  text?: unknown;
  data?: unknown;
  platformId?: unknown;
  threadId?: unknown;
  sender?: unknown;
  senderId?: unknown;
  isMention?: unknown;
  isGroup?: unknown;
};

const DEFAULT_PLATFORM_ID = 'webhook:default';

function createAdapter(): ChannelAdapter {
  let connected = false;

  const adapter: ChannelAdapter = {
    name: 'webhook',
    channelType: CHANNEL_TYPE,
    supportsThreads: true,

    async setup(config: ChannelSetup): Promise<void> {
      registerNativeWebhookAdapter(ADAPTER_NAME, async (request: Request) => {
        if (request.method !== 'POST') {
          return new Response('Method Not Allowed', {
            status: 405,
            headers: { Allow: 'POST' },
          });
        }

        let body: WebhookInboundBody;
        try {
          body = (await request.json()) as WebhookInboundBody;
        } catch {
          return jsonResponse({ ok: false, error: 'invalid_json' }, 400);
        }

        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!text) {
          return jsonResponse({ ok: false, error: 'text_required' }, 400);
        }

        const platformId =
          typeof body.platformId === 'string' && body.platformId.trim() ? body.platformId.trim() : DEFAULT_PLATFORM_ID;
        const threadId = typeof body.threadId === 'string' && body.threadId.trim() ? body.threadId.trim() : null;
        const sender = typeof body.sender === 'string' && body.sender.trim() ? body.sender.trim() : 'webhook';
        const senderId =
          typeof body.senderId === 'string' && body.senderId.trim()
            ? body.senderId.trim()
            : `${CHANNEL_TYPE}:${platformId}`;
        const data = body.data === undefined ? null : body.data;

        try {
          await config.onInbound(platformId, threadId, {
            id: `webhook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            kind: 'chat',
            timestamp: new Date().toISOString(),
            isMention: body.isMention === undefined ? true : body.isMention === true,
            isGroup: body.isGroup === undefined ? false : body.isGroup === true,
            content: {
              text,
              data,
              sender,
              senderId,
            },
          });
        } catch (err) {
          log.error('Webhook channel inbound handler failed', { err, platformId, threadId });
          return jsonResponse({ ok: false, error: 'route_failed' }, 500);
        }

        return jsonResponse({ ok: true, platformId, threadId }, 202);
      });

      connected = true;
      log.info('Webhook channel listening', { path: WEBHOOK_PATH });
    },

    async teardown(): Promise<void> {
      connected = false;
    },

    isConnected(): boolean {
      return connected;
    },

    async deliver(
      _platformId: string,
      _threadId: string | null,
      _message: OutboundMessage,
    ): Promise<string | undefined> {
      return undefined;
    },
  };

  return adapter;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

registerChannelAdapter('webhook', {
  factory: createAdapter,
  containerConfig: {
    session: {
      mounts(ctx) {
        if (!ctx.threadId || !WEBHOOK_WORKSPACES_DIR) {
          return [];
        }

        const workspacePath = path.resolve(WEBHOOK_WORKSPACES_DIR, ctx.threadId);
        if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
          return [];
        }

        return [
          {
            hostPath: workspacePath,
            containerPath: '/workspace/customer',
            readonly: false,
          },
        ];
      },
    },
  },
});
