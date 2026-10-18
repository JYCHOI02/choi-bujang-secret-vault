// xdr/brute-force/patterns.json 의 패턴을 그대로 상수로 옮겨 적었습니다.
// 심판이 인터넷 없이 이 파일 하나만 불러와 경보마다 즉시 답을 받으므로, 다른 파일이나
// 패키지를 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않으며, 바깥에 묻지 않고
// 전달된 alert 값만 보고 계산합니다.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: '단일 출발지 연속 로그인 실패',
    condition: '짧은 시간 안에 같은 출발 주소(srcip)에서 로그인 실패가 연속으로 쌓인다',
    basis: 'MITRE ATT&CK T1110(무차별 대입) — 짧은 시간 같은 주소의 로그인 실패 연속',
  }),
  Object.freeze({
    name: '여러 계정에 같은 비밀번호 대입',
    condition: '같은 출발 주소가 서로 다른 여러 계정에 같은 비밀번호로 로그인을 시도해 실패가 쌓인다',
    basis: 'MITRE ATT&CK T1110(무차별 대입) — 여러 계정에 같은 비밀번호 대입',
  }),
]);

// data.count(로그인 실패 건수)가 많을수록 "단일 출발지 연속 실패" 패턴에 더 뚜렷하게
// 맞습니다. 값이 없거나 0 이하이면 이 패턴의 증거가 없는 것으로 봅니다.
function singleSourceConfidence(alert) {
  const count = Number(alert?.data?.count);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(1, 0.35 + count * 0.05);
}

// data.accounts(쉼표로 구분한 계정 목록)가 있고 둘 이상일 때만 "여러 계정에 같은
// 비밀번호 대입" 패턴의 증거로 봅니다. 계정 수가 많을수록 확신도가 올라갑니다.
function passwordSprayConfidence(alert) {
  const raw = alert?.data?.accounts;
  if (typeof raw !== 'string' || raw.length === 0) return 0;
  const accounts = raw.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
  if (accounts.length < 2) return 0;
  return Math.min(1, 0.35 + accounts.length * 0.1);
}

export function decide(alert) {
  const scored = [
    { pattern: PATTERNS[0], confidence: singleSourceConfidence(alert) },
    { pattern: PATTERNS[1], confidence: passwordSprayConfidence(alert) },
  ];
  scored.sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];

  let action = 'record';
  if (best.confidence >= 0.85) action = 'block';
  else if (best.confidence >= 0.5) action = 'alert';

  return {
    action,
    confidence: best.confidence,
    reason: best.confidence > 0 ? best.pattern.name : '일치하는 패턴 없음',
  };
}
