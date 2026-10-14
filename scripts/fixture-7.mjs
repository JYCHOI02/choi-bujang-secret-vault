import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Local practice requests use the engine's public input shape. The judge sends and times its own events.
const request = (signals, recentEvents) => ({
  schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
  projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16),
  service: 'notes', method: 'GET', path: '/notes/demo', route: 'GET /notes/:id',
  queryLength: 0, querySha256: createHash('sha256').update('').digest('hex'),
  at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
  stepUp: { verified: false, authAgeSeconds: null }, recentEvents, signals,
});
// 8단계: 쓰기 구역(POST /notes) 가상 요청. writeAnomaly는 이상 신호 2개(시각+네트워크)만
// 겹치고 다량 읽기 사건은 없어, 조회 구역이라면 재확인이 필요 없는 수준입니다.
const writeRequest = (signals) => ({ ...request(signals, []), method: 'POST', path: '/notes', route: 'POST /notes' });

export function fixtureRequests() {
  return {
    normal: request({ source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 }, []),
    suspicious: request({ source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 },
      [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }]),
    writeNormal: writeRequest({ source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 }),
    writeAnomaly: writeRequest({ source: 'judge_fixture', region: 'foreign', network: 'unusual', hour: 3 }),
    // 9단계: 평소와 다른 네트워크 + 갑작스런 다량 조회만 겹치는 조회 요청(시각은 정상).
    // 시각까지 포함해야 걸리는 7단계 문턱(3/3)은 넘지 않지만, 네트워크+조회량 둘만 보는
    // 새 규칙에는 걸려야 합니다.
    networkBurst: request({ source: 'judge_fixture', region: 'local', network: 'unusual', hour: 14 },
      [{ kind: 'risk_signal', ageSeconds: 60, count: 20 }]),
    // 네트워크만 다르고 조회량은 정상 — 단일 신호라 정상 사건으로 그대로 남아야 합니다.
    networkOnly: request({ source: 'judge_fixture', region: 'local', network: 'unusual', hour: 14 }, []),
  };
}
const check = (input, output) => output && typeof output === 'object'
  && Object.keys(output).sort().join(',') === 'decision,reasonCode,requestId,ruleIds,schema'
  && output.schema === 'aleph.decision.v1' && output.requestId === input.requestId
  && ['allow', 'deny', 'step_up'].includes(output.decision)
  && typeof output.reasonCode === 'string' && Array.isArray(output.ruleIds);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { normal, suspicious } = fixtureRequests();
    const { decide } = await import('../src/decider.mjs');
    if (typeof decide !== 'function') throw new Error('src/decider.mjs에서 decide 함수를 내보내야 합니다.');
    const ordinary = await decide(normal);
    const unusual = await decide(suspicious);
    if (!check(normal, ordinary) || !check(suspicious, unusual)) throw new Error('판정기 응답 형식이 맞지 않습니다.');
    process.stdout.write(`정상 사건: ${ordinary.decision}\n복합 이상 사건: ${unusual.decision}\n`);
    if (ordinary.decision !== 'allow' || unusual.decision !== 'step_up') {
      throw new Error('정상 사건은 allow, 복합 이상 사건은 step_up이어야 합니다.');
    }
  } catch (error) {
    process.stderr.write(`가상 사건 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
