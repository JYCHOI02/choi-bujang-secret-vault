// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze([
  'device_registered', 'resource_zone_verified', 'signals_verified',
  'step_up_required', 'write_zone_step_up', 'network_burst_suspected',
]);

// request.route는 엔진이 정규화한 모양(예: 'GET /notes/:id')이며 /api 접두사가 없습니다.
// service는 route와 따로 오는 계약 값이라, route 모양만 맞고 service가 다른 자원을
// 가리키는 "구역이 섞인" 요청(예: route는 메모인데 service는 공지)을 route만으로는
// 잡아내지 못합니다 — 그래서 각 route가 속한 service도 함께 적어 둡니다.
// 메모 전체 목록(GET /notes, :id 없음)은 일부러 넣지 않습니다 — 판정기는 자원 한 건의
// 소유자를 알 방법이 없어서, 여러 사람의 자료를 한꺼번에 여는 모양의 경로는 애초에
// 허용 목록에 두지 않습니다. 자원 한 건(:id 있음)만 API의 소유자 검사와 함께 허용합니다.
// aleph.config.json.allowedRoutes(/api 접두사 있음, 실제 배포 경로)와는 더 이상 1:1로
// 같지 않습니다 — 그 목록은 배포된 API 자체의 경로이고, 이 목록은 판정기가 추가로
// 더 좁혀 허용하는 구역입니다.
const ZONE_BY_ROUTE = Object.freeze({
  'GET /notes/:id': { zone: 'read', service: 'notes' },
  'POST /notes': { zone: 'write', service: 'notes' },
  'PUT /notes/:id': { zone: 'write', service: 'notes' },
  'DELETE /notes/:id': { zone: 'write', service: 'notes' },
  // 강사 공지(announcements)는 메모(notes)와 다른 자원입니다. 소유자가 없는
  // 공용 읽기 자료라 조회 구역과 같은 문턱을 쓰지만, route·service로 메모와 구별됩니다.
  'GET /announcements': { zone: 'read', service: 'announcements' },
  // 10단계: 백업에서 메모 한 건을 되살리는 복원 경로도 다른 쓰기(추가·수정·삭제)와
  // 같은 쓰기 구역·문턱을 씁니다. 실제 복원 자격(백업의 소유자·지문 대조)은
  // src/note-restore.mjs가 확인하며, 이 표는 구역 분류만 담당합니다.
  'POST /notes/:id/restore': { zone: 'write', service: 'notes' },
});

const DEVICE_ID_SHAPE = /^[0-9a-f]{16}$/u;

// 자원 경로가 구역 목록에 정확히(부분일치 없이) 있는지, 메서드가 그 경로와 맞는지,
// service가 그 경로의 실제 자원과 일치하는지, 기기·주체 ID의 모양이 올바른지를 봅니다.
// 목록에 없는 경로나 service가 섞인 요청은 구역이 없는 것으로 취급해 거부합니다.
function zoneForRoute(request) {
  const entry = ZONE_BY_ROUTE[request.route];
  if (!entry || request.method !== request.route.split(' ')[0]) return null;
  if (request.service !== entry.service) return null;
  if (typeof request.deviceId !== 'string' || !DEVICE_ID_SHAPE.test(request.deviceId)) return null;
  if (typeof request.subjectId !== 'string' || request.subjectId.length === 0) return null;
  return entry.zone;
}

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

// 평소와 다른 시각(밤 10시~아침 6시), 처음 보는 네트워크('unusual'), 짧은 시간 안에 많은
// 자료를 읽은 사건(최근 사건 중 하나라도 5분 이내 10건 이상) — 이 세 신호 중 몇 개가
// 겹치는지 셉니다(0~3). 지역(region) 하나만으로는 이 판정에 쓰지 않습니다.
function anomalyCount(signals, recentEvents) {
  const unusualHour = signals.hour >= 22 || signals.hour < 6;
  const unfamiliarNetwork = signals.network === 'unusual';
  const suddenHeavyRead = recentEvents.some((event) => event.count >= 10 && event.ageSeconds <= 300);
  return [unusualHour, unfamiliarNetwork, suddenHeavyRead].filter(Boolean).length;
}

// 처음 보는 네트워크('unusual')와 갑작스러운 다량 조회(최근 사건 중 하나라도 5분 이내
// 10건 이상)가 함께 나타날 때만 의심으로 봅니다. 시각은 보지 않고, 지역(region) 하나만
// 으로는 판단하지 않습니다. 둘 중 하나만 있으면 이 규칙은 걸리지 않고 정상 사건 그대로
// 둡니다.
function hasNetworkBurstSuspicion(signals, recentEvents) {
  const unfamiliarNetwork = signals.network === 'unusual';
  const suddenHeavyRead = recentEvents.some((event) => event.count >= 10 && event.ageSeconds <= 300);
  return unfamiliarNetwork && suddenHeavyRead;
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
  const zone = zoneForRoute(request);
  if (!zone) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'route_not_allowlisted',
      ruleIds: ['resource_zone_verified'],
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
  // 쓰기 구역(자료 추가·수정·삭제)은 조회보다 낮은 문턱(신호 2개)에서 재확인을 요구합니다.
  const anomalies = anomalyCount(request.signals, request.recentEvents);
  const zoneStepUp = anomalies >= (zone === 'write' ? 2 : 3);
  const networkBurst = hasNetworkBurstSuspicion(request.signals, request.recentEvents);
  if ((zoneStepUp || networkBurst) && !hasFreshStepUp(request.stepUp)) {
    if (zoneStepUp) {
      return zone === 'write'
        ? {
          schema: 'aleph.decision.v1',
          requestId: request.requestId,
          decision: 'step_up',
          reasonCode: 'write_zone_step_up_required',
          ruleIds: ['write_zone_step_up'],
        }
        : {
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
      decision: 'step_up',
      reasonCode: 'network_burst_suspected',
      ruleIds: ['network_burst_suspected'],
    };
  }
  const ruleIds = ['device_registered', 'resource_zone_verified', 'signals_verified'];
  if (zoneStepUp) ruleIds.push(zone === 'write' ? 'write_zone_step_up' : 'step_up_required');
  if (networkBurst) ruleIds.push('network_burst_suspected');
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds,
  };
}
