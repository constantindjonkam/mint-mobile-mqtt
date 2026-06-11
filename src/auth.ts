// Authentication and token caching helper
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'mint_data');
const cacheFile = path.join(dataDir, 'tokens.json');

export interface Session {
  token: string;
  refreshToken?: string;
  userId: string;
  expiresAt: number;
}

function decodeJwt(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT format');
  const base64Url = parts[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
  return JSON.parse(jsonPayload);
}

export function loadSession(): Session | null {
  try {
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (data && data.token && data.userId && data.expiresAt) {
        return data as Session;
      }
    }
  } catch (e) {
    console.warn('[auth] Error reading cached session:', e);
  }
  return null;
}

export function saveSession(session: Session) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(cacheFile, JSON.stringify(session, null, 2), 'utf8');
    console.log('[auth] Saved session token to cache.');
  } catch (e) {
    console.error('[auth] Failed to save session token:', e);
  }
}

export async function getValidSession(phone: string, password: string): Promise<Session> {
  const cached = loadSession();
  const nowSec = Math.floor(Date.now() / 1000);

  // 1. If we have a cached token and it's still valid, reuse it
  if (cached && cached.expiresAt > nowSec + 60) {
    console.log(`[auth] Reusing cached session token (expires in ${cached.expiresAt - nowSec}s).`);
    return cached;
  }

  // 2. If token is expired but we have a refresh token, try refreshing it
  if (cached && cached.refreshToken) {
    console.log('[auth] Session token expired. Attempting to refresh token...');
    try {
      const refreshUrl = 'https://mint-gateway.mintmobile.com/v1/mint/refresh';
      const staticAppToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1MDc3NjY4MjQsIm5iZiI6MTUwNzc2NjgyNCwiZXhwIjoxNTk0MDgwNDI0LCJhdWQiOiJNaW50QXBwIiwiaXNzIjoiVUxUUkEifQ.r909IZmcavEhqvZO0td_-Ts_q27BBk4cCbFRXpDBQUM';

      const refreshRes = await fetch(refreshUrl, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${staticAppToken}`,
          'kaena-channel': 'ktrz9qhy92a4nx6',
          'user-agent': 'MintMobile | 2026.5.27 (9076) | arm64 | dce80f5e-5d5c-4c67-bd93-4e4e19f2db8f | Android',
        },
        body: JSON.stringify({
          id: cached.userId,
          refreshToken: cached.refreshToken,
        }),
      });

      if (refreshRes.ok) {
        const refreshData = (await refreshRes.json()) as any;
        const newToken = refreshData.token;
        const newRefreshToken = refreshData.refreshToken;

        if (newToken && newRefreshToken) {
          const payload = decodeJwt(newToken);
          const session: Session = {
            token: newToken,
            refreshToken: newRefreshToken,
            userId: cached.userId,
            expiresAt: payload.exp || nowSec + 900,
          };
          saveSession(session);
          console.log('[auth] Successfully refreshed session token.');
          return session;
        }
      }
      console.warn(
        `[auth] Token refresh request failed with status: ${refreshRes.status}. Falling back to full login.`,
      );
    } catch (e: any) {
      console.warn('[auth] Error during token refresh, falling back to full login:', e.message || e);
    }
  }

  // 3. Fallback to full login
  console.log(`[auth] Re-authenticating with phone: ...${phone.slice(-4)}...`);
  const loginUrl = 'https://mint-gateway.mintmobile.com/v1/mint/login';
  const staticAppToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1MDc3NjY4MjQsIm5iZiI6MTUwNzc2NjgyNCwiZXhwIjoxNTk0MDgwNDI0LCJhdWQiOiJNaW50QXBwIiwiaXNzIjoiVUxUUkEifQ.r909IZmcavEhqvZO0td_-Ts_q27BBk4cCbFRXpDBQUM';
  const loginBody = {
    msisdn: phone,
    password: password,
    subscriberType: 'PHONE',
  };

  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${staticAppToken}`,
      'kaena-channel': 'ktrz9qhy92a4nx6',
      'user-agent': 'MintMobile | 2026.5.27 (9076) | arm64 | dce80f5e-5d5c-4c67-bd93-4e4e19f2db8f | Android',
    },
    body: JSON.stringify(loginBody),
  });

  if (!loginRes.ok) {
    const errorText = await loginRes.text();
    throw new Error(`[auth] Mint login failed with status ${loginRes.status}: ${errorText}`);
  }

  const loginData = (await loginRes.json()) as any;
  const token = loginData.token || loginData.accessToken;
  const refreshToken = loginData.refreshToken;
  if (!token) {
    throw new Error('[auth] Could not find token in login response.');
  }

  const payload = decodeJwt(token);
  const userId = payload.sub || payload.userId || loginData.userId;
  if (!userId) {
    throw new Error('[auth] Could not determine userId from JWT payload or login response.');
  }

  const session: Session = {
    token,
    refreshToken,
    userId: String(userId),
    expiresAt: payload.exp || nowSec + 900, // Default to 15m if exp not found
  };

  saveSession(session);
  return session;
}
