// Authentication and token caching helper
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'mint_data');
const cacheFile = path.join(dataDir, 'tokens.json');

export interface Session {
  token: string;
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

  // If we have a cached token and it has at least 60 seconds of validity left, use it
  if (cached && cached.expiresAt > nowSec + 60) {
    console.log(`[auth] Reusing cached session token (expires in ${cached.expiresAt - nowSec}s).`);
    return cached;
  }

  console.log(`[auth] Session token expired or missing. Re-authenticating with phone: ${phone}...`);
  const loginUrl = 'https://mint-gateway.mintmobile.com/v2/mint/login';
  const loginBody = {
    msisdn: phone,
    password: password,
    subscriberType: 'PHONE',
  };

  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': 'Bearer null',
      'channel': 'web-am',
      'content-type': 'application/json',
      'origin': 'https://my.mintmobile.com',
      'referer': 'https://my.mintmobile.com/',
      'sec-ch-ua': '"Microsoft Edge";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',
    },
    body: JSON.stringify(loginBody),
  });

  if (!loginRes.ok) {
    const errorText = await loginRes.text();
    throw new Error(`[auth] Mint login failed with status ${loginRes.status}: ${errorText}`);
  }

  const loginData = await loginRes.json() as any;
  const token = loginData.token || loginData.accessToken;
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
    userId: String(userId),
    expiresAt: payload.exp || (nowSec + 900), // Default to 15m if exp not found
  };

  saveSession(session);
  return session;
}
