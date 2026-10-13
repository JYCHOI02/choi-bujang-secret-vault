import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';

// notes(메모)와 다른 자원입니다. 소유자가 없는 공용 읽기 자료이며, 서버는 이 경로
// (/api/announcements)로 notes와 구별합니다. 로그인은 필요하지만 작성자 비교는 없습니다.
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

  // 화면 메뉴나 쿼리의 role·owner_id(강사 권한 주장)는 신뢰하지 않습니다. 공지는 소유자가
  // 없는 공용 읽기 자료이며, 접근 권한은 오직 검증된 로그인 여부로만 정합니다.
  if (Object.prototype.hasOwnProperty.call(request.query ?? {}, 'role')
      || Object.prototype.hasOwnProperty.call(request.query ?? {}, 'owner_id')) {
    return response.status(403).json({ error: 'ROLE_NOT_TRUSTED' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content')
      .order('id', { ascending: true });

    if (error) {
      return response.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
    }

    return response.status(200).json((data || []).map((row) => (
      { id: String(row.id), title: row.title, body: row.content ?? '' }
    )));
  } catch {
    return response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
