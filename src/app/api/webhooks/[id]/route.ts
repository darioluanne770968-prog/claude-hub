import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { WEBHOOK_EVENTS, WebhookEvent } from '../route';

// GET - Get webhook details with logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const webhook = DatabaseService.getWebhook(id);
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const logs = DatabaseService.getWebhookLogs(id, 20);

    return NextResponse.json({ webhook, logs });
  } catch (error) {
    console.error('Failed to get webhook:', error);
    return NextResponse.json({ error: 'Failed to get webhook' }, { status: 500 });
  }
}

// PUT - Update webhook
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const webhook = DatabaseService.getWebhook(id);
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    const body = await request.json();
    const { name, url, events, enabled, secret } = body;

    // Validate URL if provided
    if (url) {
      try {
        new URL(url);
      } catch {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
      }
    }

    // Validate events if provided
    let validEvents: string[] | undefined;
    if (events && Array.isArray(events)) {
      validEvents = events.filter((e: string) => WEBHOOK_EVENTS.includes(e as WebhookEvent));
      if (validEvents.length === 0) {
        return NextResponse.json(
          { error: 'At least one valid event is required' },
          { status: 400 }
        );
      }
    }

    DatabaseService.updateWebhook(id, {
      name,
      url,
      events: validEvents,
      enabled,
      secret,
    });

    const updatedWebhook = DatabaseService.getWebhook(id);
    return NextResponse.json({ success: true, webhook: updatedWebhook });
  } catch (error) {
    console.error('Failed to update webhook:', error);
    return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
  }
}

// DELETE - Delete webhook
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const webhook = DatabaseService.getWebhook(id);
    if (!webhook) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }

    DatabaseService.deleteWebhook(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete webhook:', error);
    return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
  }
}
