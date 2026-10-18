// xdr/privilege/patterns.json 의 패턴을 그대로 상수로 옮겨 적었습니다.
// 심판이 인터넷 없이 이 파일 하나만 불러와 경보마다 즉시 답을 받으므로, 다른 파일이나
// 패키지를 불러오지 않고(import 없음), 파일을 읽거나 쓰지 않으며, 바깥에 묻지 않고
// 전달된 alert 값만 보고 계산합니다.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: '관리자 그룹 추가',
    condition: '평범한 계정이 관리자(administrators) 그룹에 새로 추가된다',
    basis: 'MITRE ATT&CK T1078(정상 계정 도용) — 관리자 그룹 추가',
  }),
  Object.freeze({
    name: '처음 보는 관리자 명령',
    condition: '처음 보는 주소나 계정에서 관리자 명령이 실행된다',
    basis: 'MITRE ATT&CK T1068(권한 상승 악용) — 처음 보는 관리자 명령',
  }),
  Object.freeze({
    name: '업무 시간 밖 권한 사용',
    condition: '업무 시간(수업 시간) 밖에 관리자 그룹 추가나 관리자 명령 실행 같은 권한 사용이 나타난다',
    basis: 'MITRE ATT&CK T1068(권한 상승 악용) — 업무 시간 밖 권한 사용',
  }),
]);

const ADMIN_GROUP = 'administrators';

// 실제로 상승된 권한이 쓰였다는 뚜렷한 문구입니다 — 상승 창이 떴다가 취소되거나
// 실패로 끝난 경우는 여기에 해당하지 않습니다.
const ADMIN_ACTION = /관리자 명령을 실행했습니다|권한 명령을 실행했습니다|권한으로 바뀌었고|명령 실행이 같이 있습니다/;

// 낯선 접속이나 다른 계정 권한 빌려쓰기, 막 받은 권한을 곧바로 쓰는 것처럼 뚜렷한
// "처음·낯섦" 신호입니다.
const UNFAMILIAR_OR_IMPERSONATION = /처음 보는|처음 봅니다|다른 계정의 권한으로|방금 관리자가 된/;

const AFTER_HOURS = /시간 밖|보이지 않는 시각/;

// 상승·명령이 취소·실패·무변화로 끝났다거나, 관리자 그룹이 아니라고 스스로 밝힌
// 경우입니다 — 반대 증거로 보고 확신도를 끌어올리지 않습니다.
const NEGATED = /취소됐습니다|변경은 없습니다|이어서 명령은 없습니다|실패 1건으로 끝났습니다|관리자 그룹은 아닙니다/;

function hasPrivilegeSignal(alert) {
  const mitre = alert?.rule?.mitre;
  return Array.isArray(mitre) && (mitre.includes('T1068') || mitre.includes('T1078'));
}

// data.group이 정확히 administrators면 뚜렷한 증거, 다른 그룹이면(명시적으로 관리자가
// 아님) 증거가 없는 것으로, 그룹 값이 없으면 이 패턴은 판단하지 않습니다(0).
function groupConfidence(alert) {
  const group = alert?.data?.group;
  if (typeof group !== 'string') return 0;
  return group === ADMIN_GROUP ? 0.9 : 0;
}

function actionConfidence(description) {
  const unfamiliar = UNFAMILIAR_OR_IMPERSONATION.test(description);
  const action = ADMIN_ACTION.test(description);
  if (unfamiliar && action) return 0.9;
  if (action) return 0.5;
  return 0;
}

function matchedPatternName(alert, groupConf, description) {
  if (groupConf > 0) return PATTERNS[0].name;
  if (AFTER_HOURS.test(description)) return PATTERNS[2].name;
  if (ADMIN_ACTION.test(description) || UNFAMILIAR_OR_IMPERSONATION.test(description)) return PATTERNS[1].name;
  return null;
}

export function decide(alert) {
  if (!hasPrivilegeSignal(alert)) {
    return { action: 'record', confidence: 0, reason: '일치하는 패턴 없음' };
  }

  const description = alert?.rule?.description ?? '';
  const groupConf = groupConfidence(alert);
  let confidence = Math.max(groupConf, actionConfidence(description));
  if (AFTER_HOURS.test(description) && confidence > 0) {
    confidence = Math.min(1, confidence + 0.05);
  }
  if (confidence === 0) {
    // T1068·T1078로 분류됐지만 그룹·명령 증거가 뚜렷하지 않은 애매한 경우의 기본값입니다.
    confidence = 0.55;
  }
  if (NEGATED.test(description)) {
    confidence = Math.min(confidence, 0.6);
  }

  let action = 'record';
  if (confidence >= 0.85) action = 'block';
  else if (confidence >= 0.5) action = 'alert';

  const matched = matchedPatternName(alert, groupConf, description);
  return {
    action,
    confidence,
    reason: matched ?? '세 패턴 밖의 권한 관련 신호',
  };
}
