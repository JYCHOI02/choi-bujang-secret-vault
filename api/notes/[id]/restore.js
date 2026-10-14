import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../../../src/verify-login.mjs';
import { restoreNote } from '../../../src/note-restore.mjs';

let verifyLogin = null;
function getVerifier(supabaseSecretKey) {
  if (!verifyLogin) {
    const config = JSON.parse(readFileSync(new URL('../../../aleph.config.json', import.meta.url), 'utf8'));
    verifyLogin = createLoginVerifier({ config, supabaseSecretKey });
  }
  return verifyLogin;
}

// POST /api/notes/:id/restore — 비공개 백업(notes_backup)에서 이 메모 한 건만
// 되살립니다. 요청 본문의 제목·내용은 읽지 않습니다: 복원 내용은 오직 검증된
// 백업에서만 가져오며, 다른 메모와 감사 기록(restore_audit)은 건드리지 않습니다.
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

  if (request.method !== 'POST') {
    response.setHeader('Allow', ['POST']);
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  let id = request.query?.id;
  if (!id && request.url) {
    const pathname = request.url.split('?')[0];
    const match = pathname.match(/\/notes\/([^/]+)\/restore$/);
    if (match) id = decodeURIComponent(match[1]);
  }
  if (!id) {
    return response.status(404).json({ error: 'NOT_FOUND' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 소유자는 오직 검증된 토큰의 사용자 ID로만 정합니다.
    const result = await restoreNote({ supabase, noteId: id, requesterId: session.userId });
    if (!result.ok) {
      return response.status(result.status).json({ error: result.error });
    }
    return response.status(200).json(result.note);
  } catch {
    return response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
