import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getDeviceApprovalStatus, requestDeviceApproval } from '../src/device-approval.mjs';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

// src/device-approval.mjs가 실제로 쓰는 부분만 흉내 낸 최소 가짜 Supabase 클라이언트입니다.
function makeFakeSupabase({ deviceApprovals = [] } = {}) {
  const state = { deviceApprovals };
  return {
    state,
    from(table) {
      if (table !== 'device_approvals') throw new Error(`예상치 못한 테이블: ${table}`);
      return {
        _filters: {},
        select() { return this; },
        eq(col, val) { this._filters[col] = val; return this; },
        async maybeSingle() {
          const row = state.deviceApprovals.find((r) => r.owner_id === this._filters.owner_id);
          return { data: row ?? null, error: null };
        },
        async upsert(obj, { ignoreDuplicates } = {}) {
          const existing = state.deviceApprovals.find((r) => r.owner_id === obj.owner_id);
          if (existing) {
            if (!ignoreDuplicates) Object.assign(existing, obj);
          } else {
            state.deviceApprovals.push({ approved: false, ...obj });
          }
          return { data: null, error: null };
        },
      };
    },
  };
}

test('승인 요청 기록이 없으면 미요청·미승인으로 본다', async () => {
  const supabase = makeFakeSupabase();
  const result = await getDeviceApprovalStatus({ supabase, ownerId: OWNER_A });
  assert.equal(result.ok, true);
  assert.equal(result.requested, false);
  assert.equal(result.approved, false);
});

test('요청만 있고 아직 승인되지 않은 행은 대기 상태로 본다', async () => {
  const supabase = makeFakeSupabase({ deviceApprovals: [{ owner_id: OWNER_A, approved: false }] });
  const result = await getDeviceApprovalStatus({ supabase, ownerId: OWNER_A });
  assert.equal(result.requested, true);
  assert.equal(result.approved, false);
});

test('승인된 행만 승인됨으로 본다', async () => {
  const supabase = makeFakeSupabase({ deviceApprovals: [{ owner_id: OWNER_A, approved: true }] });
  const result = await getDeviceApprovalStatus({ supabase, ownerId: OWNER_A });
  assert.equal(result.requested, true);
  assert.equal(result.approved, true);
});

test('다른 계정의 승인 행은 보지 않는다', async () => {
  const supabase = makeFakeSupabase({ deviceApprovals: [{ owner_id: OWNER_B, approved: true }] });
  const result = await getDeviceApprovalStatus({ supabase, ownerId: OWNER_A });
  assert.equal(result.requested, false);
  assert.equal(result.approved, false);
});

test('승인 요청은 대기 행만 만들고 스스로 승인하지 않는다', async () => {
  const supabase = makeFakeSupabase();
  const result = await requestDeviceApproval({ supabase, ownerId: OWNER_A });
  assert.equal(result.requested, true);
  assert.equal(result.approved, false);
  assert.deepEqual(supabase.state.deviceApprovals, [{ owner_id: OWNER_A, approved: false }]);
});

test('이미 승인된 뒤 재요청해도 승인 상태를 되돌리지 않는다', async () => {
  const supabase = makeFakeSupabase({ deviceApprovals: [{ owner_id: OWNER_A, approved: true }] });
  const result = await requestDeviceApproval({ supabase, ownerId: OWNER_A });
  assert.equal(result.approved, true);
  assert.deepEqual(supabase.state.deviceApprovals, [{ owner_id: OWNER_A, approved: true }]);
});
