import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';

let verifyLogin = null;
function getVerifier(supabaseSecretKey) {
  if (!verifyLogin) {
    const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
    verifyLogin = createLoginVerifier({ config, supabaseSecretKey });
  }
  return verifyLogin;
}

async function parseBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  const buffers = [];
  for await (const chunk of request) {
    buffers.push(chunk);
  }
  const str = Buffer.concat(buffers).toString('utf8');
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

// 본문에 다른 소유자를 적어 보내면 거부합니다. 본인 ID를 그대로 적은 경우만 무해하게 통과합니다.
function triesToSetOwner(body, userId) {
  for (const key of ['owner_id', 'ownerId', 'owner']) {
    if (body && Object.prototype.hasOwnProperty.call(body, key) && body[key] !== userId) return true;
  }
  return false;
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

  // 소유자는 오직 검증된 토큰의 사용자 ID로만 정합니다. URL·본문의 owner_id는 믿지 않습니다.
  const userId = session.userId;

  let id = request.query?.id;
  if (!id && request.url) {
    const pathname = request.url.split('?')[0];
    const match = pathname.match(/\/notes\/([^/]+)$/);
    if (match) {
      id = decodeURIComponent(match[1]);
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const method = request.method;
  const toNote = (row) => ({ id: String(row.id), title: row.title, body: row.content ?? '' });

  try {
    if (id) {
      if (method === 'GET') {
        // 본인 소유 행만 찾습니다. 남의 메모는 존재 여부도 알리지 않고 404로 답합니다.
        const { data, error } = await supabase
          .from('notes')
          .select('id, title, content, owner_id')
          .eq('id', id)
          .eq('owner_id', userId)
          .maybeSingle();

        if (error || !data || data.owner_id !== userId) {
          return response.status(404).json({ error: 'NOT_FOUND' });
        }

        return response.status(200).json(toNote(data));
      }

      if (method === 'PUT') {
        const body = await parseBody(request);
        if (triesToSetOwner(body, userId)) {
          return response.status(403).json({ error: 'OWNER_CHANGE_FORBIDDEN' });
        }
        if (typeof body.title !== 'string' || typeof body.body !== 'string') {
          return response.status(400).json({ error: 'INVALID_BODY' });
        }

        // 1) 기존 행의 소유자가 본인인지 확인합니다.
        const { data: existing, error: findError } = await supabase
          .from('notes')
          .select('id, owner_id')
          .eq('id', id)
          .eq('owner_id', userId)
          .maybeSingle();

        if (findError || !existing || existing.owner_id !== userId) {
          return response.status(404).json({ error: 'NOT_FOUND' });
        }

        // 2) 제목·본문만 바꾸고 owner_id는 갱신 대상에 넣지 않습니다.
        const { data, error } = await supabase
          .from('notes')
          .update({ title: body.title, content: body.body })
          .eq('id', id)
          .eq('owner_id', userId)
          .select('id, title, content, owner_id')
          .maybeSingle();

        // 3) 수정된 새 행의 소유자도 여전히 본인인지 확인합니다.
        if (error || !data) {
          return response.status(404).json({ error: 'NOT_FOUND' });
        }
        if (data.owner_id !== userId) {
          return response.status(500).json({ error: 'OWNER_MISMATCH' });
        }

        return response.status(200).json(toNote(data));
      }

      if (method === 'DELETE') {
        // 본인 소유 행만 지웁니다. 지워진 행이 없으면 404입니다.
        const { data, error } = await supabase
          .from('notes')
          .delete()
          .eq('id', id)
          .eq('owner_id', userId)
          .select('id');

        if (error) {
          return response.status(500).json({ error: 'DATABASE_DELETE_ERROR' });
        }
        if (!Array.isArray(data) || data.length === 0) {
          return response.status(404).json({ error: 'NOT_FOUND' });
        }

        return response.status(200).json({ success: true, id: String(data[0].id) });
      }

      response.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }

    if (method === 'GET') {
      const { data, error } = await supabase
        .from('notes')
        .select('id, title, content')
        .eq('owner_id', userId)
        .order('id', { ascending: true });

      if (error) {
        return response.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
      }

      return response.status(200).json((data || []).map(toNote));
    }

    if (method === 'POST') {
      const body = await parseBody(request);
      if (triesToSetOwner(body, userId)) {
        return response.status(403).json({ error: 'OWNER_CHANGE_FORBIDDEN' });
      }
      const noteId = body.id || randomUUID();
      const title = body.title ?? '';
      const content = body.body ?? body.content ?? '';

      const { error } = await supabase
        .from('notes')
        .insert({
          id: noteId,
          title,
          content,
          owner_id: userId,
        });

      if (error) {
        return response.status(500).json({ error: 'DATABASE_INSERT_ERROR', details: error.message });
      }

      return response.status(200).json({ id: String(noteId) });
    }

    response.setHeader('Allow', ['GET', 'POST']);
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch {
    return response.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
}
