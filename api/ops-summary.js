import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { getOpsSummary } from '../src/ops-summary.mjs';

// 탈환 작전실 요약입니다. 메모 제목·내용은 읽지 않으며, 복구 집계만 실제 DB 기록으로
// 확인합니다. 판정기·탐지·회수 항목은 getOpsSummary가 항상 verified: 'not_live'로
// 돌려줍니다 — 이 핸들러가 그 값을 바꾸거나 덮어쓰지 않습니다.
let verifyLogin = null;
function getVerifier(supabaseSecretKey) {
  if (!verifyLogin) {
    const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
    verifyLogin = createLoginVerifier({ config, supabaseSecretKey });
  }
  return verifyLogin;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
  }

  const authorization = request.headers['authorization'] || request.headers.authorization;
  if (!authorization) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }

  let session = null;
  try {
    const verifier = getVerifier(supabaseKey);
    session = await verifier(authorization);
  } catch {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }

  if (!session) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', ['GET']);
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const result = await getOpsSummary({ supabase, ownerId: session.userId });
    if (!result.ok) return response.status(result.status).json({ error: result.error });
    const { ok, status, ...body } = result;
    return response.status(200).json(body);
  } catch {
    return response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
