import { RULE_IDS } from './decider.mjs';

// 탈환 작전실 요약은 메모 제목·내용을 전혀 읽지 않습니다 — 복구 집계만 note_id·action·
// 시각을 봅니다. 판정기(decider.mjs)·탐지(detect.mjs) 규칙은 실제 코드에 구현돼 있지만
// 이 배포의 실제 요청 흐름과 연결되어 있지 않으므로, 둘 다 verified: 'not_live'로
// 표시합니다. 'confirmed'는 이번 요청에서 서버가 실제로 DB를 읽어 확인한 값에만 씁니다.
const NOT_LIVE_DECIDER = '이 이름들은 src/decider.mjs에 구현만 되어 있고, npm run decider:test의 가상 요청 연습으로만 확인됩니다. 이 배포의 실제 /api 요청은 아직 decide()를 거치지 않습니다.';
const NOT_LIVE_DETECT = 'burst_read 규칙은 src/detect.mjs에 구현만 되어 있고, npm run detect:test의 가상 사건으로만 확인됩니다. 운영 반 엔진의 실제 사건 전달과는 연결되어 있지 않습니다.';
const NOT_LIVE_REVOCATION = '이 배포에는 접속을 실제로 회수·집행하는 서버 기능이 없습니다. detect()의 propose_revocation은 제안일 뿐이며, 실제 집행은 심판이 확인합니다.';

async function restoreSummary({ supabase, ownerId }) {
  const { data: backups, error: backupError } = await supabase
    .from('notes_backup')
    .select('note_id')
    .eq('owner_id', ownerId);
  if (backupError) return { error: 'DATABASE_QUERY_ERROR' };

  const noteIds = (backups ?? []).map((row) => row.note_id);
  if (noteIds.length === 0) {
    return { verified: 'confirmed', appliedCount: 0, abortedCount: 0, lastAction: null, lastAt: null };
  }

  const { data: audit, error: auditError } = await supabase
    .from('restore_audit')
    .select('action, at')
    .in('note_id', noteIds)
    .order('at', { ascending: false });
  if (auditError) return { error: 'DATABASE_QUERY_ERROR' };

  const rows = audit ?? [];
  const last = rows[0] ?? null;
  return {
    verified: 'confirmed',
    appliedCount: rows.filter((row) => row.action === 'applied').length,
    abortedCount: rows.filter((row) => row.action === 'aborted').length,
    lastAction: last?.action ?? null,
    lastAt: last?.at ?? null,
  };
}

export async function getOpsSummary({ supabase, ownerId }) {
  const restore = await restoreSummary({ supabase, ownerId });
  if (restore.error) return { ok: false, status: 500, error: restore.error };

  return {
    ok: true,
    status: 200,
    decider: { verified: 'not_live', implementedRules: [...RULE_IDS], note: NOT_LIVE_DECIDER },
    detect: { verified: 'not_live', implementedRule: 'burst_read', note: NOT_LIVE_DETECT },
    revocation: { verified: 'not_live', note: NOT_LIVE_REVOCATION },
    restore,
  };
}
