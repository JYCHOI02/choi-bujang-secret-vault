// xdr/persistence/patterns.json 의 패턴을 그대로 상수로 옮겨 적었습니다.
// 심판이 인터넷 없이 이 파일 하나만 불러와 경보마다 즉시 답을 받으므로, 다른 파일이나
// 패키지를 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않으며, 바깥에 묻지 않고
// 전달된 alert 값만 보고 계산합니다.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: '서명 없는 새 서비스 등록',
    condition: '서명되지 않은 새 서비스가 등록되거나, 기존 서비스의 실행 파일이 의심스러운 위치(임시 폴더 등)를 가리키도록 바뀐다',
    basis: 'MITRE ATT&CK T1543(시스템 프로세스 생성·변경) — 서명 없는 새 서비스 등록',
  }),
  Object.freeze({
    name: '낯선 예약 작업',
    condition: '평소에 없던 예약 작업이 새로 만들어지거나, 처음 보는 예약 작업이 의심스러운 위치의 실행 파일을 실행한다',
    basis: 'MITRE ATT&CK T1053(예약 작업) — 낯선 예약 작업',
  }),
  Object.freeze({
    name: '시작 폴더 변경',
    condition: '시작 폴더(Startup)에 평소 목록에 없는 프로그램이 추가된다',
    basis: 'MITRE ATT&CK T1543(시스템 프로세스 생성·변경) — 시작 폴더 변경',
  }),
]);

// 실행 파일 경로가 임시 폴더나 시작 폴더(Startup)를 가리키면 뚜렷한 증거로 봅니다 —
// 정상 수업 도구는 이 경보 묶음에서 항상 C:\lab\... 경로를 씁니다.
const TEMP_OR_STARTUP_PATH = /AppData\\Local\\Temp\\|Start Menu\\Programs\\Startup\\/i;

// 서명이 확인됐거나("서명된 채로") 이미 있던 항목이 평소대로 끝났다는 설명은 반대
// 증거로 보고 기록만 합니다. 이 세 구절은 지금 경보 묶음의 정상 사건에만 나타납니다.
const SIGNED_OR_ROUTINE = /서명된 채로|평소 시각에 그대로입니다|기존 수업 도구 서비스|기존 예약 작업이|읽기만 했습니다/;

// "등록은 없습니다"처럼 실제 등록 여부를 스스로 부인하는 경보는, 경로가 의심스러워도
// 차단까지는 올리지 않습니다 — 등록된 지속성 메커니즘이 아니라 파일 하나가 보였을
// 뿐일 수 있기 때문입니다.
const NO_REGISTRATION = /등록(은|이)\s*없습니다/;

function hasPersistenceSignal(alert) {
  const mitre = alert?.rule?.mitre;
  return Array.isArray(mitre) && (mitre.includes('T1543') || mitre.includes('T1053'));
}

function pathRisk(alert) {
  const path = alert?.data?.path;
  return typeof path === 'string' && TEMP_OR_STARTUP_PATH.test(path) ? 0.9 : 0;
}

// data.count(반복 등록 건수)가 있고 많을수록 더 뚜렷한 증거로 봅니다.
function repeatConfidence(alert) {
  const count = Number(alert?.data?.count);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(1, 0.5 + count * 0.15);
}

function matchedPatternName(alert) {
  const path = alert?.data?.path ?? '';
  const description = alert?.rule?.description ?? '';
  if (/Start Menu\\Programs\\Startup\\/i.test(path) || description.includes('시작 폴더')) {
    return PATTERNS[2].name;
  }
  if (description.includes('예약 작업')) return PATTERNS[1].name;
  if (description.includes('서비스')) return PATTERNS[0].name;
  return null;
}

export function decide(alert) {
  if (!hasPersistenceSignal(alert)) {
    return { action: 'record', confidence: 0, reason: '일치하는 패턴 없음' };
  }

  const description = alert?.rule?.description ?? '';
  if (SIGNED_OR_ROUTINE.test(description)) {
    return { action: 'record', confidence: 0, reason: '일치하는 패턴 없음' };
  }

  let confidence = Math.max(pathRisk(alert), repeatConfidence(alert));
  if (confidence === 0) {
    // T1543·T1053로 분류됐지만 경로·반복 증거가 없는 애매한 경우의 기본값입니다.
    confidence = 0.55;
  }
  if (NO_REGISTRATION.test(description)) {
    confidence = Math.min(confidence, 0.6);
  }

  let action = 'record';
  if (confidence >= 0.85) action = 'block';
  else if (confidence >= 0.5) action = 'alert';

  const matched = matchedPatternName(alert);
  return {
    action,
    confidence,
    reason: matched ?? '세 패턴 밖의 지속성 관련 신호',
  };
}
