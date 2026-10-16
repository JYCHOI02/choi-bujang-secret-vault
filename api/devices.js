import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { getDeviceApprovalStatus, requestDeviceApproval } from '../src/device-approval.mjs';

// 기기 승인 상태를 확인(GET)하거나 승인을 요청(POST)합니다. 승인 자체는 이 핸들러가
// 내리지 않습니다 — POST는 대기 행만 만들고, 승인 여부는 항상 DB를 다시 읽어 돌려줍니다.
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

  // 승인 단위는 오직 검증된 토큰의 사용자 ID입니다. 요청 본문·쿼리의 값은 보지 않습니다.
  const ownerId = session.userId;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (request.method === 'GET') {
      const result = await getDeviceApprovalStatus({ supabase, ownerId });
      if (!result.ok) return response.status(result.status).json({ error: result.error });
      return response.status(200).json({ requested: result.requested, approved: result.approved });
    }

    if (request.method === 'POST') {
      const result = await requestDeviceApproval({ supabase, ownerId });
      if (!result.ok) return response.status(result.status).json({ error: result.error });
      return response.status(200).json({ requested: result.requested, approved: result.approved });
    }

    response.setHeader('Allow', ['GET', 'POST']);
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch {
    return response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
