// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'signals_verified', 'step_up_required']);

// 계약(docs/DECIDER_REQUEST.md)에 명시된 출처만 신뢰합니다. 'none'은 엔진이 위치·네트워크를
// 아직 확인하지 못한 실제 경로, 'judge_fixture'는 심판의 로컬 연습 신호입니다. 둘 다 실제
// 위치 증거로 취급하지 않고, 목록에 없는 출처는 위조 가능성이 있어 신뢰하지 않습니다.
const KNOWN_SIGNAL_SOURCES = new Set(['none', 'judge_fixture']);

// 네 값 중 하나라도 없거나 모양이 다르면 거짓으로 돌려줍니다. 누락된 값을 'local'·'usual'
// 같은 정상처럼 보이는 기본값으로 채우지 않습니다 — 그런 보정은 위조되거나 빠진 값을
// 신뢰하는 접속 정보로 승격시킵니다.
function hasValidSignals(signals) {
  return !!signals && typeof signals === 'object' && !Array.isArray(signals)
    && Object.keys(signals).sort().join(',') === 'hour,network,region,source'
    && typeof signals.source === 'string' && KNOWN_SIGNAL_SOURCES.has(signals.source)
    && typeof signals.region === 'string' && signals.region.length > 0
    && typeof signals.network === 'string' && signals.network.length > 0
    && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23;
}

// 행동 이력(recentEvents)도 같은 이유로 엄격히 검사합니다. 빠졌거나 모양이 다르면
// "사건 없음"으로 간주하지 않고 검증 실패로 처리합니다.
function hasValidRecentEvents(recentEvents) {
  return Array.isArray(recentEvents) && recentEvents.length <= 12
    && recentEvents.every((event) => event && typeof event === 'object'
      && Object.keys(event).sort().join(',') === 'ageSeconds,count,kind'
      && typeof event.kind === 'string' && event.kind.length > 0
      && typeof event.ageSeconds === 'number' && event.ageSeconds >= 0
      && typeof event.count === 'number' && event.count >= 0);
}

// 재인증(stepUp) 값도 같은 이유로 모양을 엄격히 검사합니다. verified가 true일 때만
// authAgeSeconds(0~900초)를 보고, 모양이 다르면 재인증이 안 된 것으로 취급합니다 —
// 이 값만 보고 추가 확인을 건너뛰지 않습니다.
function hasFreshStepUp(stepUp) {
  if (!stepUp || typeof stepUp !== 'object' || Array.isArray(stepUp)) return false;
  if (Object.keys(stepUp).sort().join(',') !== 'authAgeSeconds,verified') return false;
  if (stepUp.verified !== true) return false;
  return Number.isInteger(stepUp.authAgeSeconds) && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}

// 평소와 다른 시각(밤 10시~아침 6시)과 처음 보는 네트워크('unusual')가 함께 나타나고,
// 짧은 시간 안에 많은 자료를 읽은 사건(최근 사건 중 하나라도 5분 이내 10건 이상)이
// 겹칠 때만 복합 이상 접속으로 봅니다. 지역(region) 하나만으로는 이 판정에 쓰지 않습니다.
function isCompoundAnomaly(signals, recentEvents) {
  const unusualHour = signals.hour >= 22 || signals.hour < 6;
  const unfamiliarNetwork = signals.network === 'unusual';
  const suddenHeavyRead = recentEvents.some((event) => event.count >= 10 && event.ageSeconds <= 300);
  return unusualHour && unfamiliarNetwork && suddenHeavyRead;
}

export async function decide(request) {
  if (request.deviceRegistered !== true) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: ['device_registered'],
    };
  }
  if (!hasValidSignals(request.signals) || !hasValidRecentEvents(request.recentEvents)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'signals_not_verified',
      ruleIds: ['signals_verified'],
    };
  }
  const anomaly = isCompoundAnomaly(request.signals, request.recentEvents);
  if (anomaly && !hasFreshStepUp(request.stepUp)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: ['step_up_required'],
    };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: anomaly
      ? ['device_registered', 'signals_verified', 'step_up_required']
      : ['device_registered', 'signals_verified'],
  };
}
