// xdr/web-injection/patterns.json 의 패턴을 그대로 상수로 옮겨 적었습니다.
// 심판이 인터넷 없이 이 파일 하나만 불러와 경보마다 즉시 답을 받으므로, 다른 파일이나
// 패키지를 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않으며, 바깥에 묻지 않고
// 전달된 alert 값만 보고 계산합니다.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'SQL 구문 삽입',
    condition: '요청 인자(URL 쿼리)나 경보 설명에 SQL 구문·키워드(SELECT·UNION·데이터베이스 조회 등) 흔적이 반복해서 나타난다',
    basis: 'MITRE ATT&CK T1190(외부 공개 앱 악용) — 요청 인자 안의 SQL 구문',
  }),
  Object.freeze({
    name: '스크립트 태그 삽입',
    condition: '요청 인자나 경보 설명에 스크립트 태그 삽입 표식이 반복해서 나타난다',
    basis: 'MITRE ATT&CK T1190(외부 공개 앱 악용) — 요청 인자 안의 스크립트 태그',
  }),
  Object.freeze({
    name: '경로 거슬러 올라가기 반복',
    condition: '요청 인자나 경보 설명에 경로를 거슬러 올라가는(../) 표식이 반복해서 나타난다',
    basis: 'MITRE ATT&CK T1190(외부 공개 앱 악용) — 경로 거슬러 올라가기(../) 반복',
  }),
]);

const SQL_MARKER = /\bsql\b|\bselect\b|\bunion\b|데이터베이스/i;
const SCRIPT_MARKER = /\bscript\b|스크립트/i;
const PATH_MARKER = /\.\.\/|\bup\b|경로|거슬러|이탈/i;

// 세 패턴의 조건은 모두 "반복해서 나타난다"입니다 — 어떤 구문인지보다 같은 주소에서
// 반복되는지가 핵심 신호입니다. data.count(반복 건수)가 없으면(정상 이벤트) 증거가
// 전혀 없는 것으로 보고, 있으면 그 값만으로 확신도를 매깁니다.
function repeatConfidence(alert) {
  const count = Number(alert?.data?.count);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(1, 0.5 + count * 0.05);
}

// 어떤 패턴인지는 요청 인자·설명의 표식으로 고릅니다. 반복 신호는 있지만 세 표식
// 중 어디에도 안 걸리면(예: SQL·스크립트·경로가 아닌 다른 주입 표기) 그래도 반복
// 자체는 근거이므로 block/alert 판정은 유지하고, 이름만 "세 패턴 밖"으로 남깁니다.
function matchedPatternName(alert) {
  const text = `${alert?.data?.url ?? ''} ${alert?.rule?.description ?? ''}`;
  if (SQL_MARKER.test(text)) return PATTERNS[0].name;
  if (SCRIPT_MARKER.test(text)) return PATTERNS[1].name;
  if (PATH_MARKER.test(text)) return PATTERNS[2].name;
  return null;
}

export function decide(alert) {
  const confidence = repeatConfidence(alert);

  let action = 'record';
  if (confidence >= 0.85) action = 'block';
  else if (confidence >= 0.5) action = 'alert';

  if (confidence === 0) {
    return { action, confidence, reason: '일치하는 패턴 없음' };
  }
  const matched = matchedPatternName(alert);
  return {
    action,
    confidence,
    reason: matched ?? '세 패턴 밖의 반복된 주입 신호',
  };
}
