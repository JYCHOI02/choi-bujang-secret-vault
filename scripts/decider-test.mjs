import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureRequests } from './fixture-7.mjs';

const RESPONSE_KEYS = 'decision,reasonCode,requestId,ruleIds,schema';

function validResponse(request, response, ruleIds) {
  return response && typeof response === 'object' && !Array.isArray(response)
    && Object.keys(response).sort().join(',') === RESPONSE_KEYS
    && response.schema === 'aleph.decision.v1'
    && response.requestId === request.requestId
    && ['allow', 'deny', 'step_up'].includes(response.decision)
    && typeof response.reasonCode === 'string'
    && /^[a-z][a-z0-9_]{0,63}$/u.test(response.reasonCode)
    && Array.isArray(response.ruleIds) && response.ruleIds.length > 0
    && response.ruleIds.every(id => ruleIds.includes(id));
}

// Local practice only. The class engine and the server judge validate live requests separately.
export async function checkDecider({ decide, ruleIds }) {
  if (typeof decide !== 'function' || !Array.isArray(ruleIds)
      || !ruleIds.includes('device_registered')) {
    throw new Error('6단계 device_registered 규칙을 먼저 구현하고 RULE_IDS에 적어 주세요.');
  }
  const { normal, suspicious, writeAnomaly, networkBurst, networkOnly } = fixtureRequests();
  const checks = [
    { name: '등록 기기의 정상 요청', request: normal, decision: 'allow' },
    { name: '미등록 기기의 가상 요청', request: { ...normal, requestId: randomUUID(),
      deviceRegistered: false }, decision: 'deny', reasonCode: 'device_not_registered' },
  ];
  if (ruleIds.includes('resource_zone_verified')) {
    checks.push(
      { name: '등록되지 않은 경로', request: { ...normal, requestId: randomUUID(),
        route: 'GET /admin', path: '/admin' }, decision: 'deny', reasonCode: 'route_not_allowlisted' },
      { name: '구역이 섞인 요청(route는 메모, service는 공지)', request: { ...normal,
        requestId: randomUUID(), service: 'announcements' },
      decision: 'deny', reasonCode: 'route_not_allowlisted' },
      { name: '메모 전체 목록 경로(여러 사람의 자료를 한꺼번에 여는 모양)', request: { ...normal,
        requestId: randomUUID(), method: 'GET', path: '/notes', route: 'GET /notes' },
      decision: 'deny', reasonCode: 'route_not_allowlisted' },
    );
  }
  if (ruleIds.includes('step_up_required')) {
    checks.push(
      { name: '복합 이상 접속', request: suspicious, decision: 'step_up',
        reasonCode: 'step_up_required' },
      { name: '다시 확인한 복합 이상 접속', request: { ...suspicious,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'allow' },
    );
  }
  if (ruleIds.includes('write_zone_step_up')) {
    checks.push(
      { name: '쓰기 구역의 약한 이상 접속', request: writeAnomaly, decision: 'step_up',
        reasonCode: 'write_zone_step_up_required' },
      { name: '다시 확인한 쓰기 구역 접속', request: { ...writeAnomaly,
        requestId: randomUUID(), stepUp: { verified: true, authAgeSeconds: 60 } },
      decision: 'allow' },
    );
  }
  if (ruleIds.includes('network_burst_suspected')) {
    checks.push(
      { name: '네트워크+다량 조회 복합 의심(시각은 정상)', request: networkBurst, decision: 'step_up',
        reasonCode: 'network_burst_suspected' },
      { name: '네트워크만 다른 정상 사건', request: networkOnly, decision: 'allow' },
    );
  }
  const results = [];
  for (const item of checks) {
    const response = await decide(item.request);
    const valid = validResponse(item.request, response, ruleIds)
      && response.decision === item.decision
      && (!item.reasonCode || response.reasonCode === item.reasonCode);
    // requestId는 item.request에 실제로 들어있던 값(가상 연습용으로 만든 진짜 UUID)을
    // 그대로 돌려줍니다 — 꾸며 만들지 않습니다. 기대/관측 값도 탈환 작전실 같은 보고
    // 화면이 "미실행"과 실제로 실행해 본 결과를 구분할 수 있게 그대로 남깁니다.
    results.push({
      name: item.name, passed: valid, requestId: item.request.requestId,
      expectedDecision: item.decision, expectedReasonCode: item.reasonCode ?? null,
      observedDecision: response?.decision ?? null, observedReasonCode: response?.reasonCode ?? null,
    });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { decide, RULE_IDS } = await import('../src/decider.mjs');
    const results = await checkDecider({ decide, ruleIds: RULE_IDS });
    for (const item of results) process.stdout.write(`${item.passed ? '통과' : '확인 필요'} · ${item.name}\n`);
    process.stdout.write('이 명령은 가상 요청으로 연습하며 심판 통과 증거가 아닙니다.\n');
    if (results.some(item => !item.passed)) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`판정기 연습 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
