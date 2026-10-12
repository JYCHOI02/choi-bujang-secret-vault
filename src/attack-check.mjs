// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2 && config.step !== 3) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
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
