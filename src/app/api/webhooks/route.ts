import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { v4 as uuidv4 } from 'uuid';

// Webhook event types
export const WEBHOOK_EVENTS = [
  'session.created',
  'session.updated',
  'session.deleted',
  'session.favorited',
  'session.archived',
  'tag.added',
  'tag.removed',
] as const;

export type WebhookEvent = typeof WEBHOOK_EVENTS[number];

// GET - List all webhooks
export async function GET() {
  try {
    const webhooks = DatabaseService.getAllWebhooks();
    return NextResponse.json({ webhooks });
  } catch (error) {
    console.error('Failed to get webhooks:', error);
    return NextResponse.json({ error: 'Failed to get webhooks' }, { status: 500 });
  }
}

// POST - Create webhook
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, url, events, secret } = body;

    if (!name || !url || !events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Missing required fields: name, url, events' },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // Validate events
    const validEvents = events.filter((e: string) => WEBHOOK_EVENTS.includes(e as WebhookEvent));
    if (validEvents.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid event is required' },
        { status: 400 }
      );
    }

    const id = uuidv4();
    DatabaseService.createWebhook({
      id,
      name,
      url,
      events: validEvents,
      enabled: true,
      secret: secret || undefined,
    });

    const webhook = DatabaseService.getWebhook(id);
    return NextResponse.json({ success: true, webhook });
  } catch (error) {
    console.error('Failed to create webhook:', error);
    return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
  }
}

// Trigger webhook function (used by other APIs)
export async function triggerWebhooks(event: WebhookEvent, payload: unknown) {
  const webhooks = DatabaseService.getActiveWebhooksForEvent(event);

  for (const webhook of webhooks) {
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          ...(webhook.secret ? { 'X-Webhook-Secret': webhook.secret } : {}),
        },
        body: JSON.stringify({
          event,
          timestamp: new Date().toISOString(),
          data: payload,
        }),
      });

      const responseBody = await response.text().catch(() => '');

      DatabaseService.logWebhook({
        webhookId: webhook.id,
        event,
        payload,
        responseStatus: response.status,
        responseBody: responseBody.slice(0, 1000),
        success: response.ok,
      });
    } catch (error) {
      console.error(`Webhook ${webhook.id} failed:`, error);
      DatabaseService.logWebhook({
        webhookId: webhook.id,
        event,
        payload,
        success: false,
        responseBody: String(error),
      });
    }
  }
}
