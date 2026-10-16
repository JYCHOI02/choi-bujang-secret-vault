// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');

  if (config.step === 1) {
    const response = await fetch(new URL('/data.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let visible = false;
    if (response.ok) {
      try {
        const data = await response.json();
        visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
          && data.notes.length > 0;
      } catch {
        // A non-JSON response is a failed check, not a successful deployment.
      }
    }
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible
        ? `비로그인 요청에서 공개 가상 메모 확인 표시가 보임 (HTTP ${response.status})`
        : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }

  // 2단계 공격 점검
  const staticResponse = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let staticVisible = false;
  if (staticResponse.ok) {
    try {
      const data = await staticResponse.json();
      staticVisible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {}
  }

  const apiResponse = await fetch(new URL('/api/notes', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let apiVisible = false;
  if (apiResponse.ok) {
    try {
      const data = await apiResponse.json();
      const notes = Array.isArray(data) ? data : (data?.notes || []);
      apiVisible = notes.length > 0;
    } catch {}
  }

  if (config.step === 4 || config.step === 5 || config.step === 6 || config.step === 7
      || config.step === 8 || config.step === 9 || config.step === 10 || config.step === 11
      || config.step === 12) {
    return [
      {
        attackId: 'anonymous_static_data_read',
        expected: '정적 파일(/data.json) 비로그인 요청 시 가상 메모가 노출되지 않음',
        observed: staticVisible
          ? `비로그인 요청에서 공개 가상 메모 확인 표시가 보임 (HTTP ${staticResponse.status})`
          : `정적 파일에서 가상 메모가 노출되지 않음 (HTTP ${staticResponse.status})`,
      },
      {
        attackId: 'anonymous_api_read',
        expected: '비로그인 API 요청(/api/notes) 시 가상 메모가 노출되지 않고 거부되어야 함',
        observed: apiVisible
          ? `비로그인 API 요청에서 가상 메모 목록이 반환됨 (HTTP ${apiResponse.status})`
          : `비로그인 API 요청이 정상 거부됨 (HTTP ${apiResponse.status})`,
      },
      ...(await ownerChecks(app)),
      ...(config.step === 5 || config.step === 6 || config.step === 7 || config.step === 8 || config.step === 9
          || config.step === 10 || config.step === 11 || config.step === 12
        ? [await originalApiCheck(config)] : []),
      ...(config.step === 6 || config.step === 7 || config.step === 8 || config.step === 9 || config.step === 10
          || config.step === 11 || config.step === 12 ? [{
        attackId: 'device_not_registered',
        expected: '미등록 기기의 접근 거부는 ALEPH SDP 엔진(릴레이)이 decide() 호출 전에 처리함',
        observed: '미실행: 이 배포 서버 함수는 기기 등록을 자체 검사하지 않으며, 심판이 릴레이를 통해 직접 확인함',
      }] : []),
      ...(config.step === 7 || config.step === 8 || config.step === 9 || config.step === 10
          || config.step === 11 || config.step === 12 ? [{
        attackId: 'step_up_required',
        expected: '평소와 다른 시각·처음 보는 네트워크·갑작스런 다량 읽기가 겹치면 재확인(step_up)을 요구함',
        observed: '미실행: 이 배포 서버 함수는 decide()의 판정을 아직 적용하지 않으며, 심판이 반 엔진을 통해 직접 확인함',
      }] : []),
      ...(config.step === 8 || config.step === 9 || config.step === 10 || config.step === 11
          || config.step === 12 ? [{
        attackId: 'write_zone_step_up',
        expected: '쓰기 구역(POST/PUT/DELETE)은 조회보다 낮은 이상 신호 문턱에서 재확인(step_up)을 요구함',
        observed: '미실행: 이 배포 서버 함수는 decide()의 구역 판정을 아직 적용하지 않으며, 심판이 반 엔진을 통해 직접 확인함',
      }] : []),
      ...(config.step === 8 || config.step === 9 || config.step === 10 || config.step === 11
          || config.step === 12
        ? [await anonymousAnnouncementsCheck(app)] : []),
      ...(config.step === 9 || config.step === 10 || config.step === 11 || config.step === 12 ? [{
        attackId: 'network_burst_suspected',
        expected: '처음 보는 네트워크와 갑작스런 다량 조회가 함께 나타나면 재확인(step_up)을 요구함',
        observed: '미실행: 이 배포 서버 함수는 decide()의 판정을 아직 적용하지 않으며, 심판이 반 엔진을 통해 직접 확인함',
      }, {
        attackId: 'burst_read',
        expected: '같은 가명 사용자의 10분 내 121건 초과 조회는 회수 제안(propose_revocation)으로 이어짐',
        observed: '미실행: detect()는 로컬 연습 함수일 뿐 운영 반 엔진의 사건 전달·접속 회수와 연결돼 있지 않으며, 심판이 직접 확인함',
      }] : []),
      ...(config.step === 10 || config.step === 11 || config.step === 12 ? [await anonymousRestoreCheck()] : []),
      ...(config.step === 11 || config.step === 12
        ? [await anonymousDevicesCheck(app), await deviceApprovalCheck(app)] : []),
      ...(config.step === 12 ? [await anonymousOpsSummaryCheck(app)] : []),
    ];
  }

  if (config.step === 3) {
    return [
      {
        attackId: 'anonymous_static_data_read',
        expected: '정적 파일(/data.json) 비로그인 요청 시 가상 메모가 노출되지 않음',
        observed: staticVisible
          ? `비로그인 요청에서 공개 가상 메모 확인 표시가 보임 (HTTP ${staticResponse.status})`
          : `정적 파일에서 가상 메모가 노출되지 않음 (HTTP ${staticResponse.status})`,
      },
      {
        attackId: 'anonymous_api_read',
        expected: '비로그인 API 요청(/api/notes) 시 가상 메모가 노출되지 않고 거부되어야 함',
        observed: apiVisible
          ? `비로그인 API 요청에서 가상 메모 목록이 반환됨 (HTTP ${apiResponse.status})`
          : `비로그인 API 요청이 정상 거부됨 (HTTP ${apiResponse.status})`,
      },
    ];
  }

  return [
    {
      attackId: 'anonymous_static_data_read',
      expected: '정적 파일(/data.json) 비로그인 요청 시 가상 메모가 노출되지 않음',
      observed: staticVisible
        ? `비로그인 요청에서 공개 가상 메모 확인 표시가 보임 (HTTP ${staticResponse.status})`
        : `정적 파일에서 가상 메모가 노출되지 않음 (HTTP ${staticResponse.status})`,
    },
    {
      attackId: 'anonymous_api_read',
      expected: '공개 서버 함수(/api/notes)를 통해 비로그인 상태로 가상 메모가 노출됨 (2단계 약점)',
      observed: apiVisible
        ? `비로그인 API 요청에서 가상 메모 목록이 반환됨 (HTTP ${apiResponse.status})`
        : `비로그인 API 요청에서 가상 메모를 읽을 수 없음 (HTTP ${apiResponse.status})`,
    },
  ];
}

// 4단계: 소유자 검사. 토큰은 저장소에 두지 않고, 실행하는 터미널의 환경변수
// ALEPH_CHECK_TOKEN_A / ALEPH_CHECK_TOKEN_B로만 받습니다. 토큰·메모 ID·본문은 결과에 넣지 않습니다.
// 상대 메모는 읽기(GET)만 시도합니다. 수정·삭제 시도는 취약한 배포에서 B 메모를 실제로 바꿀 수 있어 자동 실행하지 않습니다.
async function ownerChecks(app) {
  const tokenA = process.env.ALEPH_CHECK_TOKEN_A;
  const tokenB = process.env.ALEPH_CHECK_TOKEN_B;
  const send = (path, token) => fetch(new URL(path, app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const listOf = async (token) => {
    const response = await send('/api/notes', token);
    let notes = [];
    if (response.ok) {
      try { const data = await response.json(); notes = Array.isArray(data) ? data : []; } catch {}
    }
    return { status: response.status, notes };
  };

  const results = [];
  const probe = await send('/api/notes/00000000-0000-4000-8000-000000000000');
  results.push({
    attackId: 'anonymous_api_item_read',
    expected: '비로그인 단건 요청(/api/notes/:id)은 401로 거부되어야 함',
    observed: probe.status === 401
      ? '비로그인 단건 요청이 정상 거부됨 (HTTP 401)'
      : `비로그인 단건 요청이 401이 아님 (HTTP ${probe.status})`,
  });

  if (!tokenA || !tokenB) {
    const skipped = '미실행: ALEPH_CHECK_TOKEN_A/B 환경변수가 없어 로그인 요청을 보내지 않음';
    results.push(
      { attackId: 'own_notes_read', expected: 'A·B는 각자 자기 메모 목록만 받아야 함', observed: skipped },
      { attackId: 'cross_owner_read', expected: 'A가 B 메모 ID로 단건 조회하면 404로 거부되어야 함', observed: skipped },
    );
  } else {
    const listA = await listOf(tokenA);
    const listB = await listOf(tokenB);
    const idsA = new Set(listA.notes.map((note) => String(note.id)));
    const overlap = listB.notes.some((note) => idsA.has(String(note.id)));
    results.push({
      attackId: 'own_notes_read',
      expected: 'A·B는 각자 자기 메모 목록만 받아야 함',
      observed: listA.status === 200 && listB.status === 200
        ? `A ${listA.notes.length}건, B ${listB.notes.length}건, 서로 겹치는 메모 ${overlap ? '있음' : '없음'} (A HTTP ${listA.status}, B HTTP ${listB.status})`
        : `목록 요청 실패 (A HTTP ${listA.status}, B HTTP ${listB.status})`,
    });
    const target = listB.notes.find((note) => !idsA.has(String(note.id)));
    if (!target) {
      results.push({ attackId: 'cross_owner_read', expected: 'A가 B 메모 ID로 단건 조회하면 404로 거부되어야 함',
        observed: '미실행: B 목록에서 A와 겹치지 않는 메모를 찾지 못함' });
    } else {
      const cross = await send(`/api/notes/${encodeURIComponent(String(target.id))}`, tokenA);
      results.push({
        attackId: 'cross_owner_read',
        expected: 'A가 B 메모 ID로 단건 조회하면 404로 거부되어야 함',
        observed: cross.status === 404
          ? 'A의 B 메모 단건 조회가 정상 거부됨 (HTTP 404)'
          : `A의 B 메모 단건 조회가 거부되지 않음 (HTTP ${cross.status})`,
      });
    }
  }
  results.push({
    attackId: 'cross_owner_write',
    expected: 'A가 B 메모를 수정·삭제하거나 소유자를 바꾸면 404·403으로 거부되어야 함',
    observed: '미실행: B 메모를 실제로 바꿀 수 있어 자동 점검에서 제외함 (브라우저 수동 시험 대상)',
  });
  return results;
}

// 8단계: 강사 공지(announcements)는 메모와 다른 자원·경로입니다. 비로그인 요청이
// 거부되는지만 확인합니다(소유자 개념이 없어 교차 소유자 점검은 해당 없음).
async function anonymousAnnouncementsCheck(app) {
  const expected = '비로그인 API 요청(/api/announcements) 시 가상 공지가 노출되지 않고 거부되어야 함';
  const response = await fetch(new URL('/api/announcements', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = Array.isArray(data) && data.length > 0;
    } catch {}
  }
  return {
    attackId: 'anonymous_announcements_read', expected,
    observed: visible
      ? `비로그인 API 요청에서 가상 공지 목록이 반환됨 (HTTP ${response.status})`
      : `비로그인 API 요청이 정상 거부됨 (HTTP ${response.status})`,
  };
}

// 10단계: 메모 복원(POST /api/notes/:id/restore)도 로그인이 필요합니다. 복원 경로는
// 쓰기 요청(POST)이라 심판 채점 환경(격리 환경)에서는 아예 보내지 않습니다 — 그 환경은
// 공개 HTTPS 주소로 GET·HEAD만 허용합니다. 비로그인 거부 확인은 README 10단계의 curl로
// 직접 합니다(실제 복원 실행도 로그인 토큰과 사본이 필요해 자동 점검에서 제외).
async function anonymousRestoreCheck() {
  return {
    attackId: 'anonymous_restore_attempt',
    expected: '비로그인 요청으로 메모 복원(POST /api/notes/:id/restore)을 호출하면 401로 거부되어야 함',
    observed: 'not_run: 쓰기 요청(POST)이라 격리 환경에서 보내지 않음 — README 10단계의 curl로 직접 확인',
  };
}

// 11단계: 기기 승인 상태(/api/devices)도 로그인이 필요합니다. 비로그인 요청이 401로
// 거부되는지만 자동으로 확인합니다.
async function anonymousDevicesCheck(app) {
  const expected = '비로그인 요청으로 기기 승인 상태(/api/devices)를 조회하면 401로 거부되어야 함';
  const response = await fetch(new URL('/api/devices', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  return {
    attackId: 'anonymous_devices_read', expected,
    observed: response.status === 401
      ? '비로그인 승인 상태 조회가 정상 거부됨 (HTTP 401)'
      : `비로그인 승인 상태 조회가 401이 아님 (HTTP ${response.status})`,
  };
}

// 12단계: 탈환 작전실 요약(/api/ops-summary)도 로그인이 필요합니다. 비로그인 요청이
// 401로 거부되는지만 자동으로 확인합니다. 응답 본문에 가상 메모 제목·내용이 없다는
// 점은 src/ops-summary.mjs 쪽 단위 시험(test/ops-summary.test.mjs)이 이미 확인합니다.
async function anonymousOpsSummaryCheck(app) {
  const expected = '비로그인 요청으로 탈환 작전실 요약(/api/ops-summary)을 조회하면 401로 거부되어야 함';
  const response = await fetch(new URL('/api/ops-summary', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  return {
    attackId: 'anonymous_ops_summary_read', expected,
    observed: response.status === 401
      ? '비로그인 작전실 요약 조회가 정상 거부됨 (HTTP 401)'
      : `비로그인 작전실 요약 조회가 401이 아님 (HTTP ${response.status})`,
  };
}

// 11단계: 로그인했어도 기기(계정)가 승인되지 않으면 /api/notes가 403으로 거부해야
// 합니다. 토큰은 저장소에 두지 않고 ALEPH_CHECK_TOKEN_A로만 받습니다. 이 계정이 이미
// 승인된 상태라면(학생이 직접 승인 처리한 뒤) 관찰값이 승인됨으로 나올 수 있습니다 —
// 그 경우도 그대로 기록하며 심판 판정으로 바꿔 쓰지 않습니다.
async function deviceApprovalCheck(app) {
  const expected = '기기가 승인되지 않은 계정의 /api/notes 요청은 403 DEVICE_NOT_APPROVED로 거부되어야 함';
  const token = process.env.ALEPH_CHECK_TOKEN_A;
  if (!token) {
    return { attackId: 'device_not_approved', expected,
      observed: '미실행: ALEPH_CHECK_TOKEN_A 환경변수가 없어 로그인 요청을 보내지 않음' };
  }
  const response = await fetch(new URL('/api/notes', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${token}` },
  });
  let code = '';
  try { code = (await response.json())?.error ?? ''; } catch {}
  return {
    attackId: 'device_not_approved', expected,
    observed: response.status === 403 && code === 'DEVICE_NOT_APPROVED'
      ? '승인되지 않은 계정의 요청이 정상 거부됨 (HTTP 403, DEVICE_NOT_APPROVED)'
      : `관찰된 응답: HTTP ${response.status}${code ? `, ${code}` : ''}`,
  };
}

// 5단계: 원본 자료 API(Supabase REST)를 브라우저 공개 키(anon)로 직접 요청합니다.
// 공개 키는 이미 public/index.html에 공개된 값이며, 키·메모 본문은 결과에 넣지 않습니다.
async function originalApiCheck(config) {
  const expected = '원본 자료 API(originalApiUrl)를 공개 키로 직접 요청하면 권한 없음으로 거부되어야 함';
  let url;
  try { url = new URL(config.originalApiUrl); } catch { url = null; }
  if (!url || url.protocol !== 'https:' || url.search || url.hash) {
    return { attackId: 'original_api_anon_read', expected, observed: '미실행: originalApiUrl이 쿼리 없는 HTTPS 주소가 아님' };
  }
  let anonKey = '';
  try {
    const { readFile } = await import('node:fs/promises');
    const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
    anonKey = /['"](sb_publishable_[A-Za-z0-9_-]+)['"]/u.exec(html)?.[1] ?? '';
  } catch {}
  if (!anonKey) {
    return { attackId: 'original_api_anon_read', expected, observed: '미실행: public/index.html에서 공개 키를 찾지 못함' };
  }
  const response = await fetch(url, {
    redirect: 'error', signal: AbortSignal.timeout(10000), headers: { apikey: anonKey },
  });
  let rows = null;
  let code = '';
  try {
    const data = await response.json();
    if (Array.isArray(data)) rows = data.length;
    else if (typeof data?.code === 'string') code = data.code;
  } catch {}
  return {
    attackId: 'original_api_anon_read', expected,
    observed: response.ok
      ? `공개 키 직접 요청이 허용됨 (HTTP ${response.status}, ${rows ?? 0}건)`
      : `공개 키 직접 요청이 거부됨 (HTTP ${response.status}${code ? `, ${code}` : ''})`,
  };
}
