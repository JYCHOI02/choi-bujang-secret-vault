import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { restoreNote } from '../src/note-restore.mjs';

const TEST_ACCOUNT_B = '22222222-2222-4222-8222-222222222222';

function fingerprint(title, content) {
  return createHash('sha256').update(`${title}\u0000${content}`, 'utf8').digest('hex');
}

// src/note-restore.mjs가 실제로 쓰는 부분만 흉내 낸 최소 가짜 Supabase 클라이언트입니다.
// 실제 네트워크나 계정 없이, id·owner_id로 걸러지는 동작과 append-only 감사 기록을
// 검증하는 데만 씁니다.
function makeFakeSupabase({ notes = [], notesBackup = [], restoreAudit = [] } = {}) {
  const state = { notes, notesBackup, restoreAudit };
  return {
    state,
    from(table) {
      if (table === 'notes_backup') {
        return {
          _filters: {},
          select() { return this; },
          eq(col, val) { this._filters[col] = val; return this; },
          async maybeSingle() {
            const row = state.notesBackup.find((r) => r.note_id === this._filters.note_id);
            return { data: row ?? null, error: null };
          },
        };
      }
      if (table === 'notes') {
        return {
          upsert(obj) { this._obj = obj; return this; },
          select() { return this; },
          async maybeSingle() {
            const idx = state.notes.findIndex((r) => r.id === this._obj.id);
            if (idx >= 0) state.notes[idx] = { ...this._obj };
            else state.notes.push({ ...this._obj });
            return { data: state.notes.find((r) => r.id === this._obj.id), error: null };
          },
        };
      }
      if (table === 'restore_audit') {
        return { async insert(obj) { state.restoreAudit.push(obj); return { data: null, error: null }; } };
      }
      throw new Error(`예상치 못한 테이블: ${table}`);
    },
  };
}

test('백업 사본이 없으면 복원하지 않고 중단을 기록한다', async () => {
  const supabase = makeFakeSupabase();
  const result = await restoreNote({ supabase, noteId: 'b-note-1', requesterId: TEST_ACCOUNT_B });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.error, 'BACKUP_NOT_FOUND');
  assert.equal(supabase.state.restoreAudit.length, 1);
  assert.equal(supabase.state.restoreAudit[0].reason, 'backup_not_found');
});

test('백업의 소유자가 다르면 존재 여부를 알리지 않고 중단한다', async () => {
  const supabase = makeFakeSupabase({
    notesBackup: [{ note_id: 'b-note-1', owner_id: 'other-owner', title: 't', content: 'c',
      content_sha256: fingerprint('t', 'c') }],
  });
  const result = await restoreNote({ supabase, noteId: 'b-note-1', requesterId: TEST_ACCOUNT_B });
  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
  assert.equal(result.error, 'BACKUP_NOT_FOUND');
  assert.equal(supabase.state.restoreAudit[0].reason, 'owner_mismatch');
});

test('내용 지문이 사본과 다르면 복원하지 않는다', async () => {
  const supabase = makeFakeSupabase({
    notesBackup: [{ note_id: 'b-note-1', owner_id: TEST_ACCOUNT_B, title: 't', content: 'c',
      content_sha256: '0'.repeat(64) }],
    notes: [{ id: 'b-note-1', title: 'tampered', content: 'tampered', owner_id: TEST_ACCOUNT_B }],
  });
  const result = await restoreNote({ supabase, noteId: 'b-note-1', requesterId: TEST_ACCOUNT_B });
  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.equal(result.error, 'BACKUP_VERIFICATION_FAILED');
  assert.deepEqual(supabase.state.notes[0], { id: 'b-note-1', title: 'tampered', content: 'tampered', owner_id: TEST_ACCOUNT_B });
});

test('검증된 복원: 시험 계정 B의 지정한 메모 한 건만 되돌리고, 다른 메모와 기존 감사 기록은 보존된다', async () => {
  const backupTitle = '[실습용 가상] 복원된 제목';
  const backupContent = '[실습용 가상] 침해 전 복원된 내용';
  const supabase = makeFakeSupabase({
    notesBackup: [{ note_id: 'b-note-1', owner_id: TEST_ACCOUNT_B, title: backupTitle, content: backupContent,
      content_sha256: fingerprint(backupTitle, backupContent) }],
    notes: [
      { id: 'b-note-1', title: '침해로 바뀐 제목', content: '침해로 바뀐 내용', owner_id: TEST_ACCOUNT_B },
      { id: 'b-note-2', title: '다른 메모', content: '손대면 안 됨', owner_id: TEST_ACCOUNT_B },
    ],
    restoreAudit: [{ note_id: 'unrelated-note', action: 'applied', reason: null }],
  });

  const result = await restoreNote({ supabase, noteId: 'b-note-1', requesterId: TEST_ACCOUNT_B });

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.note, { id: 'b-note-1', title: backupTitle, body: backupContent });

  // 확인: 복구 대상 한 건의 ID·소유자·내용 해시가 사본과 같아야 합니다.
  const restoredRow = supabase.state.notes.find((row) => row.id === 'b-note-1');
  assert.equal(restoredRow.id, 'b-note-1');
  assert.equal(restoredRow.owner_id, TEST_ACCOUNT_B);
  assert.equal(fingerprint(restoredRow.title, restoredRow.content), fingerprint(backupTitle, backupContent));

  // 다른 메모는 보존됩니다.
  const otherRow = supabase.state.notes.find((row) => row.id === 'b-note-2');
  assert.deepEqual(otherRow, { id: 'b-note-2', title: '다른 메모', content: '손대면 안 됨', owner_id: TEST_ACCOUNT_B });

  // 감사 기록은 지워지지 않고 뒤에 추가됩니다.
  assert.equal(supabase.state.restoreAudit.length, 2);
  assert.deepEqual(supabase.state.restoreAudit[0], { note_id: 'unrelated-note', action: 'applied', reason: null });
  assert.equal(supabase.state.restoreAudit[1].note_id, 'b-note-1');
  assert.equal(supabase.state.restoreAudit[1].action, 'applied');
});
