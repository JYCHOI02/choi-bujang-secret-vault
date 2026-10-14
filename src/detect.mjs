// 9단계에서 학생이 채우는 탐지 함수입니다. 이 기본값은 어떤 접속도 회수하지 않습니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.

// 계약(docs/DETECT_EVENTS.md)에 있는 세 값만 읽습니다: 가명 사용자(identity.sub), 요청
// 종류(method), 시각(at). 메모 내용·토큰·실명은 계약에 없는 값이라 애초에 읽지 않고
// 저장·출력하지 않습니다. 모양이 다른 사건은 추측해 채우지 않고 그대로 거부합니다.
function readEvent(event) {
  const identity = event?.identity;
  const valid = !!event && typeof event === 'object' && !Array.isArray(event)
    && Object.keys(event).sort().join(',') === 'at,identity,method'
    && typeof event.at === 'string' && !Number.isNaN(Date.parse(event.at))
    && typeof event.method === 'string' && event.method.length > 0
    && !!identity && typeof identity === 'object' && !Array.isArray(identity)
    && Object.keys(identity).join(',') === 'sub'
    && typeof identity.sub === 'string' && identity.sub.length > 0;
  if (!valid) throw new TypeError('invalid_detection_events');
  return { sub: identity.sub, method: event.method, at: event.at };
}

// docs/DETECT_EVENTS.md 기준: 같은 가명 사용자(sub)의 GET 사건이 어느 10분 구간에서든
// 120건을 넘을 때만 그 사용자를 회수 후보로 봅니다. 정확히 120건은 포함하지 않고,
// 다른 사용자의 사건을 합치거나 10분 밖의 사건을 같은 구간으로 세지 않습니다.
const BURST_WINDOW_MS = 10 * 60 * 1000;
const BURST_THRESHOLD = 120;

function burstReadSubjects(readable) {
  const bySub = new Map();
  for (const event of readable) {
    if (event.method !== 'GET') continue;
    const list = bySub.get(event.sub) ?? [];
    list.push(Date.parse(event.at));
    bySub.set(event.sub, list);
  }
  const triggered = [];
  for (const [sub, timesRaw] of bySub) {
    const times = [...timesRaw].sort((a, b) => a - b);
    let windowStart = 0;
    let maxInWindow = 0;
    for (let index = 0; index < times.length; index += 1) {
      while (times[index] - times[windowStart] >= BURST_WINDOW_MS) windowStart += 1;
      maxInWindow = Math.max(maxInWindow, index - windowStart + 1);
    }
    if (maxInWindow > BURST_THRESHOLD) triggered.push(sub);
  }
  return triggered;
}

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  const readable = events.map(readEvent);
  const triggered = burstReadSubjects(readable);
  if (triggered.length === 0) return { action: 'observe' };
  // 대상은 확인된 가상 사용자(기기) 한 개로 한정합니다. 실제 회수 집행·시각은
  // 심판이 처리하며, 이 함수는 제안만 돌려줍니다 — 회수 API를 직접 부르거나
  // 기기 권한을 여기서 바꾸지 않습니다.
  return { action: 'propose_revocation', reasonCode: 'burst_read', subject: triggered[0] };
}
