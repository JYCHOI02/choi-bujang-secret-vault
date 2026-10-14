import { createHash } from 'node:crypto';

function contentFingerprint(title, content) {
  return createHash('sha256').update(`${title}\u0000${content}`, 'utf8').digest('hex');
}

async function appendAudit(supabase, { noteId, action, reason }) {
  await supabase.from('restore_audit').insert({ note_id: noteId, action, reason: reason ?? null });
}

// 비공개 백업(notes_backup)에서 지정한 메모 한 건만 복원합니다. ID·소유자·내용 해시가
// 모두 사본과 같을 때만 쓰고, 다른 메모 행은 건드리지 않습니다(복원은 이 id로만
// upsert합니다). 성공·중단 모두 restore_audit에 한 줄만 더합니다 — 기존 감사 기록은
// 지우거나 고치지 않습니다. 요청 본문의 제목·내용은 쓰지 않습니다: 복원되는 내용은
// 오직 검증된 백업에서만 옵니다.
export async function restoreNote({ supabase, noteId, requesterId }) {
  const { data: backup, error: backupError } = await supabase
    .from('notes_backup')
    .select('note_id, owner_id, title, content, content_sha256')
    .eq('note_id', noteId)
    .maybeSingle();

  if (backupError || !backup || backup.note_id !== noteId) {
    await appendAudit(supabase, { noteId, action: 'aborted', reason: 'backup_not_found' });
    return { ok: false, status: 404, error: 'BACKUP_NOT_FOUND' };
  }

  // 남의 백업을 끌어와 복원할 수 없습니다. 존재 여부도 알리지 않고 404로 답합니다.
  if (backup.owner_id !== requesterId) {
    await appendAudit(supabase, { noteId, action: 'aborted', reason: 'owner_mismatch' });
    return { ok: false, status: 404, error: 'BACKUP_NOT_FOUND' };
  }

  const actualFingerprint = contentFingerprint(backup.title, backup.content);
  if (actualFingerprint !== backup.content_sha256) {
    await appendAudit(supabase, { noteId, action: 'aborted', reason: 'content_hash_mismatch' });
    return { ok: false, status: 409, error: 'BACKUP_VERIFICATION_FAILED' };
  }

  const { data: restored, error: writeError } = await supabase
    .from('notes')
    .upsert({ id: backup.note_id, title: backup.title, content: backup.content, owner_id: backup.owner_id },
      { onConflict: 'id' })
    .select('id, title, content, owner_id')
    .maybeSingle();

  if (writeError || !restored || restored.owner_id !== backup.owner_id) {
    await appendAudit(supabase, { noteId, action: 'aborted', reason: 'write_failed' });
    return { ok: false, status: 500, error: 'RESTORE_WRITE_FAILED' };
  }

  await appendAudit(supabase, { noteId, action: 'applied', reason: null });
  return {
    ok: true, status: 200,
    note: { id: String(restored.id), title: restored.title, body: restored.content ?? '' },
  };
}
