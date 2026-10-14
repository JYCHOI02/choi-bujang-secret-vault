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

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  // 판정 로직은 아직 없습니다 — 이번 단계는 입력을 안전하게 읽는 부분만 채웁니다.
  events.forEach(readEvent);
  return { action: 'observe' };
}
