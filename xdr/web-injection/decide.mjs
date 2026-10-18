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

// data.count(반복 건수)가 있고 많을수록 그 패턴에 더 뚜렷하게 맞습니다. 마커가 없으면
// 이 패턴의 증거가 전혀 없는 것으로 봅니다 — 반복 건수만으로는 어떤 패턴인지 알 수
// 없기 때문입니다.
function markerConfidence(alert, marker) {
  const text = `${alert?.data?.url ?? ''} ${alert?.rule?.description ?? ''}`;
  if (!marker.test(text)) return 0;
  const count = Number(alert?.data?.count);
  const repeats = Number.isFinite(count) && count > 0 ? count : 0;
  return Math.min(1, 0.5 + repeats * 0.05);
}

export function decide(alert) {
  const scored = [
    { pattern: PATTERNS[0], confidence: markerConfidence(alert, SQL_MARKER) },
    { pattern: PATTERNS[1], confidence: markerConfidence(alert, SCRIPT_MARKER) },
    { pattern: PATTERNS[2], confidence: markerConfidence(alert, PATH_MARKER) },
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
