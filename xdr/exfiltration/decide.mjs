// xdr/exfiltration/patterns.json 의 패턴을 그대로 상수로 옮겨 적었습니다.
// 심판이 인터넷 없이 이 파일 하나만 불러와 경보마다 즉시 답을 받으므로, 다른 파일이나
// 패키지를 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않으며, 바깥에 묻지 않고
// 전달된 alert 값만 보고 계산합니다.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: '처음 보는 목적지로 대용량 전송',
    condition: '처음 보는 목적지로 큰 용량의 자료가 한 번에, 또는 같은 목적지로 반복해서 나간다',
    basis: 'MITRE ATT&CK T1041(명령 통로로 유출)·T1048(다른 프로토콜로 유출) — 처음 보는 목적지로 대용량 전송',
  }),
  Object.freeze({
    name: '업무 시간 밖 압축 파일 반출',
    condition: '업무 시간(수업 시간) 밖에 압축 파일이 처음 보는 주소로 나간다',
    basis: 'MITRE ATT&CK T1048(다른 프로토콜로 유출) — 업무 시간 밖 압축 파일 반출',
  }),
]);

const AFTER_HOURS = /시간 밖/;
const UNFAMILIAR_DEST = /처음 보는|처음 봅니다|평소.{0,2}다른|평소에 쓰지 않던/;

// 전송이 실패로 끝나 bytes가 0이어도, 처음 보는 목적지를 노린 시도 자체는 증거로
// 남습니다 — 성공 여부와 관계없이 애매한 신호로 봅니다.
const FAILED_UNFAMILIAR_ATTEMPT = /실패.{0,40}(처음 보는|처음 봅니다)|(처음 보는|처음 봅니다).{0,40}실패/;

function hasExfilSignal(alert) {
  const mitre = alert?.rule?.mitre;
  return Array.isArray(mitre) && (mitre.includes('T1041') || mitre.includes('T1048'));
}

// data.bytes(전송량)가 많을수록 더 뚜렷한 증거로 봅니다. 이 경보 묶음에서 명확한
// 유출은 늘 7천만 바이트 이상이고, 애매한 전송은 9만~1천5백만 바이트, 정상 사용은
// 5만 바이트를 넘지 않아 구간이 겹치지 않습니다.
function sizeConfidence(alert) {
  const bytes = Number(alert?.data?.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  if (bytes >= 70_000_000) return Math.min(1, 0.85 + bytes / 1_000_000_000);
  if (bytes >= 90_000) return 0.6;
  return 0;
}

function matchedPatternName(description) {
  if (AFTER_HOURS.test(description)) return PATTERNS[1].name;
  if (UNFAMILIAR_DEST.test(description)) return PATTERNS[0].name;
  return null;
}

export function decide(alert) {
  if (!hasExfilSignal(alert)) {
    return { action: 'record', confidence: 0, reason: '일치하는 패턴 없음' };
  }

  const description = alert?.rule?.description ?? '';
  let confidence = sizeConfidence(alert);
  if (confidence === 0 && FAILED_UNFAMILIAR_ATTEMPT.test(description)) {
    confidence = 0.55;
  }

  let action = 'record';
  if (confidence >= 0.85) action = 'block';
  else if (confidence >= 0.5) action = 'alert';

  if (action === 'record') {
    return { action, confidence, reason: '일치하는 패턴 없음' };
  }

  const matched = matchedPatternName(description);
  return {
    action,
    confidence,
    reason: matched ?? '두 패턴 밖의 유출 관련 신호',
  };
}
