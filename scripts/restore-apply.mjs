import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkRestore } from './restore-check.mjs';

const AUDIT_SCHEMA = 'aleph.restore.audit.v1';

async function appendAudit(root, entry) {
  const dir = join(root, 'docs', 'policy-backup');
  await mkdir(dir, { recursive: true });
  const line = `${JSON.stringify({ schema: AUDIT_SCHEMA, at: new Date().toISOString(), ...entry })}\n`;
  // appendFile은 기존 줄을 지우지 않고 뒤에 더합니다 — 이전 복원 감사 이력을 보존합니다.
  await appendFile(join(dir, 'audit-log.jsonl'), line, 'utf8');
}

// 검증된 백업의 allowedRoutes로만 되돌립니다. aleph.config.json의 다른 항목
// (judgeIssuer, identityProvider, originalApiUrl, sampleMarker, step, repoUrl,
// publicAppUrl, restoreRoute)과 src/decider.mjs의 코드(RULE_IDS 포함)는 다른
// 서비스 규칙이므로 쓰지 않고 그대로 둡니다. 코드 규칙이 백업과 다르면 자동으로
// 고치지 않고 수동 검토가 필요하다고만 알립니다. 바뀔 항목이 없으면 아무것도
// 쓰지 않습니다. 호출자가 미리 본 백업 버전을 confirmVersion으로 정확히 다시
// 넣었을 때만 실제로 적용합니다 — 바뀔 항목을 보지 않고 바로 실행하는 것을 막습니다.
export async function applyRestore(root, { confirmVersion } = {}) {
  const result = await checkRestore(root);
  if (!result.ok) {
    await appendAudit(root, { action: 'aborted', reason: result.reason, message: result.message });
    return result;
  }
  if (!result.diff.changed) {
    return { ok: true, applied: false, version: result.version, capturedAt: result.capturedAt,
      diff: result.diff, message: '차이 없음 · 복원할 항목이 없습니다.' };
  }
  if (confirmVersion !== result.version) {
    const message = '바뀔 항목을 먼저 확인하세요: npm run restore:check 로 표시된 백업 버전을 '
      + '--confirm-version 값으로 정확히 다시 넣어야 적용됩니다.';
    await appendAudit(root, { action: 'aborted', reason: 'confirmation_mismatch',
      expectedVersion: result.version, givenVersion: confirmVersion ?? null, diff: result.diff });
    return { ok: false, applied: false, reason: 'confirmation_mismatch', message,
      version: result.version, capturedAt: result.capturedAt, diff: result.diff };
  }
  const configPath = join(root, 'aleph.config.json');
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  config.allowedRoutes = [...result.backup.allowedRoutes];
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  const rulesDiffer = result.diff.rules.added.length > 0 || result.diff.rules.removed.length > 0;
  await appendAudit(root, { action: 'applied', toVersion: result.version, diff: result.diff,
    rulesReviewNeeded: rulesDiffer });
  return { ok: true, applied: true, version: result.version, capturedAt: result.capturedAt,
    diff: result.diff, rulesReviewNeeded: rulesDiffer,
    message: '현재 정책(allowedRoutes)을 백업 버전으로 되돌렸습니다.' };
}

function parseArgs(argv) {
  let confirmVersion = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--confirm-version') { confirmVersion = argv[i + 1] ?? null; i += 1; }
  }
  return { confirmVersion };
}

function printDiff(diff) {
  for (const route of diff.routes.added) process.stdout.write(`+ route ${route}\n`);
  for (const route of diff.routes.removed) process.stdout.write(`- route ${route}\n`);
  for (const rule of diff.rules.added) process.stdout.write(`+ rule ${rule}\n`);
  for (const rule of diff.rules.removed) process.stdout.write(`- rule ${rule}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { confirmVersion } = parseArgs(process.argv.slice(2));
  try {
    const result = await applyRestore(root, { confirmVersion });
    if (!result.ok) {
      process.stderr.write(`중단 · ${result.message}\n`);
      if (result.diff) {
        process.stdout.write(`복원 대상 백업 버전: ${result.version} (캡처 시각: ${result.capturedAt})\n`);
        printDiff(result.diff);
      }
      process.exitCode = 1;
    } else if (!result.applied) {
      process.stdout.write(`${result.message}\n`);
    } else {
      process.stdout.write(`복원 대상 백업 버전: ${result.version} (캡처 시각: ${result.capturedAt})\n`);
      printDiff(result.diff);
      process.stdout.write(`${result.message}\n`);
      if (result.rulesReviewNeeded) {
        process.stdout.write('참고: src/decider.mjs의 RULE_IDS가 백업과 다릅니다. 코드는 자동으로 '
          + '고치지 않았으니 직접 검토하세요.\n');
      }
      process.stdout.write('감사 이력은 docs/policy-backup/audit-log.jsonl에 추가로 기록됩니다(기존 줄은 보존).\n');
    }
  } catch (error) {
    process.stderr.write(`정책 복원 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
