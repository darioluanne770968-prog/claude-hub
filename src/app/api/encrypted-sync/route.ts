import { NextResponse } from 'next/server';
import { getEncryptedSyncProgress, syncAllSessionsEncrypted } from '@/lib/encrypted-cloud-sync';
import { deriveEncryptionKey } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for large syncs

const AUTH_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} 超时（${Math.round(timeoutMs / 1000)} 秒）`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

class AuthFailure extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function extractAuthErrorMessage(payload: Record<string, unknown>): string | null {
  const candidates = ['msg', 'error_description', 'error', 'message'];
  for (const key of candidates) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function authenticateUser(
  supabaseUrl: string,
  supabaseAnonKey: string,
  email: string,
  password: string
): Promise<string> {
  const authResponse = await withTimeout(
    fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ email, password }),
    }),
    AUTH_TIMEOUT_MS,
    '账号登录'
  );

  const contentType = authResponse.headers.get('content-type') || '';
  const rawBody = await authResponse.text();

  if (!contentType.includes('application/json')) {
    const snippet = rawBody.replace(/\s+/g, ' ').slice(0, 120);
    throw new AuthFailure(
      `登录服务返回了非 JSON（HTTP ${authResponse.status}）。请检查网络/VPN/代理配置。响应片段: ${snippet}`,
      502
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    throw new AuthFailure(
      `登录服务返回了无法解析的 JSON（HTTP ${authResponse.status}）`,
      502
    );
  }

  if (!authResponse.ok) {
    const message = extractAuthErrorMessage(payload) || `登录失败（HTTP ${authResponse.status}）`;
    throw new AuthFailure(`登录失败: ${message}`, authResponse.status === 400 ? 401 : authResponse.status);
  }

  const user = payload.user as { id?: unknown } | undefined;
  if (!user || typeof user.id !== 'string' || !user.id) {
    throw new AuthFailure('登录成功但未返回用户信息', 502);
  }

  return user.id;
}

// GET - Get encrypted sync progress
export async function GET() {
  return NextResponse.json(getEncryptedSyncProgress());
}

// POST - Trigger encrypted sync with authentication
export async function POST(request: Request) {
  try {
    // 检查环境变量
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase config:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
        url: supabaseUrl?.substring(0, 30) + '...'
      });
      return NextResponse.json(
        {
          error: 'Supabase 配置缺失',
          details: `URL: ${supabaseUrl ? '已配置' : '缺失'}, Key: ${supabaseAnonKey ? '已配置' : '缺失'}`
        },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { email, password, encryptionPassword, salt } = body;

    if (!email || !password || !encryptionPassword || !salt) {
      return NextResponse.json(
        { error: '缺少必要参数：email, password, encryptionPassword, salt' },
        { status: 400 }
      );
    }

    // Authenticate user with Supabase Auth REST endpoint
    let userId: string;
    try {
      userId = await authenticateUser(supabaseUrl, supabaseAnonKey, email, password);
    } catch (authError) {
      const status = authError instanceof AuthFailure ? authError.status : 500;
      const message = authError instanceof Error ? authError.message : '登录失败';
      return NextResponse.json({ error: message }, { status });
    }

    const currentProgress = getEncryptedSyncProgress();
    if (currentProgress.running) {
      return NextResponse.json(
        { error: '已有同步任务在进行中，请稍候' },
        { status: 409 }
      );
    }

    // Derive encryption key from password
    const encryptionKey = deriveEncryptionKey(encryptionPassword, salt);

    // Start sync in background to avoid request timeout
    console.log(`Starting encrypted sync in background for user ${userId}...`);
    void syncAllSessionsEncrypted(userId, encryptionKey)
      .then((result) => {
        console.log('Encrypted sync completed:', result);
      })
      .catch((syncError) => {
        console.error('Encrypted sync background task failed:', syncError);
      });

    return NextResponse.json({
      success: true,
      message: '已开始加密同步，正在后台执行',
    });
  } catch (error) {
    console.error('Encrypted sync failed:', error);
    return NextResponse.json(
      { error: '同步失败', details: String(error) },
      { status: 500 }
    );
  }
}
