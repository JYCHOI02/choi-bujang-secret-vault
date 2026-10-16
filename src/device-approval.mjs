// 기기 승인 상태는 오직 이 서버 함수가 DB(device_approvals)를 읽어서만 정합니다.
// 브라우저가 보낸 값(헤더·본문·저장소)은 보지 않고, 검증된 로그인 사용자 ID(ownerId)로만
// 행을 찾습니다. 기기별 키는 따로 발급·저장하지 않습니다 — 이 계정으로 들어오는 접속
// 전체를 하나의 승인 단위로 다룹니다.

export async function getDeviceApprovalStatus({ supabase, ownerId }) {
  const { data, error } = await supabase
    .from('device_approvals')
    .select('owner_id, approved')
    .eq('owner_id', ownerId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: 'DATABASE_QUERY_ERROR' };
  if (!data || data.owner_id !== ownerId) return { ok: true, status: 200, requested: false, approved: false };
  return { ok: true, status: 200, requested: true, approved: data.approved === true };
}

// 요청(POST)은 대기 행을 만들 뿐, approved를 스스로 true로 바꾸지 않습니다. 이미 있는
// 행은 ignoreDuplicates로 그대로 둡니다 — 재요청 한 번으로 이미 정해진 승인·대기 상태를
// 덮어쓰거나 되돌리지 않기 위함입니다. 실제 승인은 이 함수 밖(서버 운영자의 별도 조치)
// 에서만 이루어집니다.
export async function requestDeviceApproval({ supabase, ownerId }) {
  const { error } = await supabase
    .from('device_approvals')
    .upsert({ owner_id: ownerId }, { onConflict: 'owner_id', ignoreDuplicates: true });

  if (error) return { ok: false, status: 500, error: 'DATABASE_INSERT_ERROR' };
  return getDeviceApprovalStatus({ supabase, ownerId });
}
