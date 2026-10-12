// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (![1, 2, 3, 4].includes(config.step)) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
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

  if (config.step === 4) {
    return [
      {
        attackId: 'anonymous_static_data_read',
        expected: '정적 파일(/data.json) 비로그인 요청 시 가상 메모가 노출되지 않음',
        observed: staticVisible
          ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임'
          : `정적 파일에서 가상 메모가 노출되지 않음 (HTTP ${staticResponse.status})`,
      },
      {
        attackId: 'anonymous_api_read',
        expected: '비로그인 API 요청(/api/notes) 시 가상 메모가 노출되지 않고 거부되어야 함',
        observed: apiVisible
          ? '비로그인 API 요청에서 가상 메모 목록이 반환됨 (HTTP 200)'
          : `비로그인 API 요청이 정상 거부됨 (HTTP ${apiResponse.status})`,
      },
      ...(await ownerChecks(app)),
    ];
  }

  if (config.step === 3) {
    return [
      {
        attackId: 'anonymous_static_data_read',
        expected: '정적 파일(/data.json) 비로그인 요청 시 가상 메모가 노출되지 않음',
        observed: staticVisible
          ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임'
          : `정적 파일에서 가상 메모가 노출되지 않음 (HTTP ${staticResponse.status})`,
      },
      {
        attackId: 'anonymous_api_read',
        expected: '비로그인 API 요청(/api/notes) 시 가상 메모가 노출되지 않고 거부되어야 함',
        observed: apiVisible
          ? '비로그인 API 요청에서 가상 메모 목록이 반환됨 (HTTP 200)'
          : `비로그인 API 요청이 정상 거부됨 (HTTP ${apiResponse.status})`,
      },
    ];
  }

  return [
    {
      attackId: 'anonymous_static_data_read',
      expected: '정적 파일(/data.json) 비로그인 요청 시 가상 메모가 노출되지 않음',
      observed: staticVisible
        ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임'
        : `정적 파일에서 가상 메모가 노출되지 않음 (HTTP ${staticResponse.status})`,
    },
    {
      attackId: 'anonymous_api_read',
      expected: '공개 서버 함수(/api/notes)를 통해 비로그인 상태로 가상 메모가 노출됨 (2단계 약점)',
      observed: apiVisible
        ? '비로그인 API 요청에서 가상 메모 목록이 반환됨 (HTTP 200)'
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
        ? `A ${listA.notes.length}건, B ${listB.notes.length}건, 서로 겹치는 메모 ${overlap ? '있음' : '없음'} (HTTP 200)`
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
