// xdr/known-cve/patterns.json 의 패턴을 그대로 상수로 옮겨 적었습니다.
// 심판이 인터넷 없이 이 파일 하나만 불러와 경보마다 즉시 답을 받으므로, 다른 파일이나
// 패키지를 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않으며, 바깥에 묻지 않고
// 전달된 alert 값만 보고 계산합니다.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'CVE-2021-44228 형태 원격 조회 구문',
    condition: '요청 머리글(예: User-Agent)이나 인자에 ${jndi: 로 시작하는 원격 조회 구문이 들어 있다',
    basis: 'CVE-2021-44228 형태 요청 — MITRE ATT&CK T1190(외부 공개 앱 악용)의 원격 조회 구문 신호',
  }),
  Object.freeze({
    name: '알려진 취약점 점검 도구 흔적',
    condition: '요청 경로나 머리글에 알려진 취약점 점검 도구가 남기는 흔적이 있다',
    basis: 'MITRE ATT&CK T1190(외부 공개 앱 악용) — 알려진 취약점 점검 도구의 흔적',
  }),
]);

// 실제 CVE-2021-44228(Log4Shell) 요청은 ${jndi: 로 시작하는 원격 조회 구문이 머리글이나
// 요청 인자에 그대로 들어 있습니다 — 반복 여부와 관계없이 이 구문 자체가 뚜렷한 증거입니다.
const JNDI_LOOKUP = /\$\{jndi:/i;

// 알려진 점검 도구(예: nmap·nikto·sqlmap 계열)가 남기는 User-Agent·경로 흔적입니다.
// 이 경보 묶음에는 해당 흔적이 없어 전부 매칭되지 않지만, 실제 트래픽에는 나타날 수
// 있어 패턴으로 남겨 둡니다.
const TOOL_FINGERPRINT = /\b(nmap|nikto|sqlmap|zgrab|nuclei|masscan)\b/i;

function hasVulnSignal(alert) {
  return Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190');
}

function fieldText(alert) {
  return `${alert?.data?.url ?? ''} ${alert?.data?.useragent ?? ''}`;
}

export function decide(alert) {
  // mitre에 T1190 신호가 전혀 없으면(정상 이벤트) 두 패턴 모두 증거가 없는 것으로 봅니다.
  if (!hasVulnSignal(alert)) {
    return { action: 'record', confidence: 0, reason: '일치하는 패턴 없음' };
  }

  const text = fieldText(alert);
  if (JNDI_LOOKUP.test(text)) {
    return { action: 'block', confidence: 0.95, reason: PATTERNS[0].name };
  }
  if (TOOL_FINGERPRINT.test(text)) {
    return { action: 'block', confidence: 0.9, reason: PATTERNS[1].name };
  }

  // T1190 신호는 있지만(취약점 관련 경보로 분류됨) 두 패턴의 구체적 증거는 없는
  // 애매한 경우입니다 — 차단도, 무시도 하지 않고 재확인 대상(alert)으로 남깁니다.
  return { action: 'alert', confidence: 0.55, reason: '두 패턴 밖의 취약점 관련 신호' };
}
