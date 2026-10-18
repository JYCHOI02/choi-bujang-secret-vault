// decide.mjs의 판단 중 block(차단 후보)만 골라 ZTNA 판정기가 참고할 거부 규칙
// 초안(xdr/persistence/deny-rules.json)을 만듭니다.
//
// src/decider.mjs의 기존 규칙(RULE_IDS·ZONE_BY_ROUTE 등)과 decide(request) 계약은
// 전혀 고치지 않습니다 — docs/DECIDER_REQUEST.md 계약에는 출발 주소(IP) 값이 아직
// 없어서, decide(request)가 이 규칙을 직접 읽어 쓰도록 연결하지 않았습니다. 여기서
// 만드는 규칙은 9단계 detect()의 propose_revocation처럼 "제안"만 담은 별도 파일이며,
// 실제 반 엔진이 이 제안을 받아 적용하는 경로가 생기면 그때 연결합니다.
//
// block이 아닌 alert·record 등급은 규칙을 만들지 않습니다 — 정상 사용자(또는 애매한
// 사건)를 막는 규칙을 섞지 않기 위해서입니다. decide.mjs 자신은 여기서 판단 결과만
// 돌려받아 쓰며, 파일을 읽거나 쓰지 않고 판정기에 직접 연결하지도 않습니다(그대로 둠).
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide } from './decide.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const FIXTURE_PATH = join(ROOT, 'xdr', 'fixtures', 'persistence.json');
const DENY_RULES_PATH = join(__dirname, 'deny-rules.json');
const ALERTS_LOG_PATH = join(ROOT, 'xdr', 'alerts.log');

// 계약에 차단 기간이 정해져 있지 않아 학생이 고른 값입니다 — 영구 차단이 아니라
// 짧게 끊고 다시 판단하도록 1시간만 막습니다.
const BLOCK_TTL_MS = 60 * 60 * 1000;

function buildDenyRule(alert, decision, nowIso) {
  if (decision.action !== 'block') return null;
  return {
    ruleId: `xdr_persistence_${alert.id}`,
    type: 'deny',
    source: alert?.data?.srcip ?? null,
    alertId: alert.id,
    reasonCode: 'xdr_persistence_block',
    basis: decision.reason,
    confidence: decision.confidence,
    createdAt: nowIso,
    expiresAt: new Date(new Date(nowIso).getTime() + BLOCK_TTL_MS).toISOString(),
  };
}

async function loadDenyRules() {
  try {
    const raw = await readFile(DENY_RULES_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.rules) ? parsed.rules : [];
  } catch {
    return [];
  }
}

async function saveDenyRules(rules) {
  const body = { schema: 'aleph.xdr.denylist.v1', moduleKey: 'persistence', rules };
  await writeFile(DENY_RULES_PATH, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

async function logNotification(entry) {
  await appendFile(ALERTS_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function respond({ fixturePath = FIXTURE_PATH, now = new Date().toISOString() } = {}) {
  const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
  const alerts = Array.isArray(fixture.alerts) ? fixture.alerts : [];

  const byAlertId = new Map((await loadDenyRules()).map((rule) => [rule.alertId, rule]));
  const results = [];

  for (const alert of alerts) {
    const decision = await decide(alert);
    const rule = buildDenyRule(alert, decision, now);
    if (rule) {
      byAlertId.set(rule.alertId, rule);
      await logNotification({
        at: now,
        alertId: alert.id,
        action: decision.action,
        reason: decision.reason,
        source: alert?.data?.srcip ?? null,
        expiresAt: rule.expiresAt,
      });
    }
    results.push({ alertId: alert.id, action: decision.action });
  }

  const rules = [...byAlertId.values()];
  await saveDenyRules(rules);
  return { rules, results };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const { rules, results } = await respond();
  const blocked = results.filter((r) => r.action === 'block').length;
  const passed = results.length - blocked;
  console.log(`처리한 경보 ${results.length}건 · block ${blocked}건 → 거부 규칙 ${rules.length}건 · 그 외(통과) ${passed}건`);
}
