import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOpsSummary } from '../src/ops-summary.mjs';
import { RULE_IDS } from '../src/decider.mjs';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

// src/ops-summary.mjs가 실제로 쓰는 부분만 흉내 낸 최소 가짜 Supabase 클라이언트입니다.
function makeFakeSupabase({ notesBackup = [], restoreAudit = [] } = {}) {
  return {
    from(table) {
      if (table === 'notes_backup') {
        return {
          _filters: {},
          select() { return this; },
          eq(col, val) { this._filters[col] = val; return this; },
          then(resolve) {
            const data = notesBackup.filter((row) => row.owner_id === this._filters.owner_id);
            return resolve({ data, error: null });
          },
        };
      }
      if (table === 'restore_audit') {
        return {
          _in: [],
          select() { return this; },
          in(col, vals) { this._in = vals; return this; },
          order() { return this; },
          then(resolve) {
            const data = restoreAudit.filter((row) => this._in.includes(row.note_id));
            return resolve({ data, error: null });
          },
        };
      }
      throw new Error(`예상치 못한 테이블: ${table}`);
    },
  };
}

test('판정기·탐지·회수는 항상 미실행(not_live)으로 표시한다', async () => {
  const supabase = makeFakeSupabase();
  const result = await getOpsSummary({ supabase, ownerId: OWNER_A });
  assert.equal(result.ok, true);
  assert.equal(result.decider.verified, 'not_live');
  assert.deepEqual(result.decider.implementedRules, [...RULE_IDS]);
  assert.equal(result.detect.verified, 'not_live');
  assert.equal(result.revocation.verified, 'not_live');
});

test('가상 메모 본문을 전혀 담지 않는다', async () => {
  const supabase = makeFakeSupabase();
  const result = await getOpsSummary({ supabase, ownerId: OWNER_A });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /title|body|content/iu);
});

test('내 메모 백업이 없으면 복구 집계는 0이고 확인됨으로 표시한다', async () => {
  const supabase = makeFakeSupabase();
  const result = await getOpsSummary({ supabase, ownerId: OWNER_A });
  assert.deepEqual(result.restore, {
    verified: 'confirmed', appliedCount: 0, abortedCount: 0, lastAction: null, lastAt: null,
  });
});

test('내 메모의 복구 기록만 세고, 다른 계정의 기록은 섞지 않는다', async () => {
  const supabase = makeFakeSupabase({
    notesBackup: [
      { note_id: 'a-note-1', owner_id: OWNER_A },
      { note_id: 'b-note-1', owner_id: OWNER_B },
    ],
    restoreAudit: [
      { note_id: 'a-note-1', action: 'aborted', at: '2026-01-01T00:00:00Z' },
      { note_id: 'a-note-1', action: 'applied', at: '2026-01-02T00:00:00Z' },
      { note_id: 'b-note-1', action: 'applied', at: '2026-01-03T00:00:00Z' },
    ],
  });
  const result = await getOpsSummary({ supabase, ownerId: OWNER_A });
  assert.equal(result.restore.verified, 'confirmed');
  assert.equal(result.restore.appliedCount, 1);
  assert.equal(result.restore.abortedCount, 1);
});
