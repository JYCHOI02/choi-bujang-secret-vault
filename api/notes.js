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

  try {
    if (id) {
      if (method === 'GET') {
        const { data, error } = await supabase
          .from('notes')
          .select('id, title, content')
          .eq('id', id)
          .maybeSingle();

        if (error || !data) {
          return response.status(404).json({ error: 'NOT_FOUND' });
        }

        return response.status(200).json({
          id: String(data.id),
          title: data.title,
          body: data.content ?? '',
        });
      }

      if (method === 'PUT') {
        const body = await parseBody(request);
        const title = body.title ?? '';
        const content = body.body ?? body.content ?? '';

        const { data, error } = await supabase
          .from('notes')
          .update({ title, content })
          .eq('id', id)
          .select('id, title, content')
          .maybeSingle();

        if (error || !data) {
          return response.status(404).json({ error: 'NOT_FOUND' });
        }

        return response.status(200).json({
          id: String(data.id),
          title: data.title,
          body: data.content ?? '',
        });
      }

      if (method === 'DELETE') {
        const { error } = await supabase
          .from('notes')
          .delete()
          .eq('id', id);

        if (error) {
          return response.status(500).json({ error: 'DATABASE_DELETE_ERROR' });
        }

        return response.status(200).json({ success: true, id });
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

      return response.status(200).json(
        (data || []).map(item => ({
          id: String(item.id),
          title: item.title,
          body: item.content ?? '',
        }))
      );
    }

    if (method === 'POST') {
      const body = await parseBody(request);
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
