import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BACKUP_SCHEMA = 'aleph.policy.backup.v1';

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0
    && value.every((item) => typeof item === 'string' && item.length > 0);
}

function isValidBackupShape(backup) {
  return Boolean(backup) && typeof backup === 'object' && !Array.isArray(backup)
    && backup.schema === BACKUP_SCHEMA
    && typeof backup.version === 'string' && backup.version.length > 0
    && typeof backup.capturedAt === 'string' && backup.capturedAt.length > 0
    && isNonEmptyStringArray(backup.allowedRoutes)
    && isNonEmptyStringArray(backup.ruleIds);
}

// 백업 폴더에는 정책 사본(policy.json)과, 사본을 침해 전에 안전하다고 확인했을 때
// 함께 기록해 둔 지문(policy.sha256)이 있어야 합니다. 사본이 없거나, 지문이 지금
// 사본의 내용과 다르면(침해 이후 바뀌었을 수 있으므로) 차이를 절대 보여주지 않고
// 그 자리에서 중단합니다. "검증 실패"를 정상값으로 승격시키지 않습니다.
export async function loadVerifiedBackup(root) {
  const dir = join(root, 'docs', 'policy-backup');
  let raw;
  try {
    raw = await readFile(join(dir, 'policy.json'), 'utf8');
  } catch {
    return { ok: false, reason: 'backup_missing',
      message: '검증된 정책 백업 사본(docs/policy-backup/policy.json)이 없습니다.' };
  }
  let fingerprint;
  try {
    fingerprint = (await readFile(join(dir, 'policy.sha256'), 'utf8')).trim();
  } catch {
    return { ok: false, reason: 'backup_missing',
      message: '백업 지문 파일(docs/policy-backup/policy.sha256)이 없습니다.' };
  }
  const actualFingerprint = createHash('sha256').update(raw, 'utf8').digest('hex');
  if (!/^[0-9a-f]{64}$/u.test(fingerprint) || fingerprint !== actualFingerprint) {
    return { ok: false, reason: 'backup_verification_failed',
      message: '백업 사본의 지문이 기록된 값과 다릅니다. 침해 뒤 바뀌었을 수 있어 중단합니다.' };
  }
  let backup;
  try {
    backup = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'backup_verification_failed',
      message: '백업 사본이 올바른 JSON 형식이 아닙니다.' };
  }
  if (!isValidBackupShape(backup)) {
    return { ok: false, reason: 'backup_verification_failed',
      message: '백업 사본의 형식이 올바르지 않습니다.' };
  }
  return { ok: true, backup };
}

// 현재 "시험 정책"은 읽기만 합니다 — aleph.config.json과 src/decider.mjs를 고치지
// 않습니다. 이 함수는 실제 운영 정책을 건드리는 어떤 쓰기도 하지 않습니다.
export async function currentPolicySnapshot(root) {
  const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
  const decider = await import(pathToFileURL(join(root, 'src', 'decider.mjs')).href);
  return {
    allowedRoutes: isNonEmptyStringArray(config.allowedRoutes) ? [...config.allowedRoutes] : [],
    ruleIds: isNonEmptyStringArray(decider.RULE_IDS) ? [...decider.RULE_IDS] : [],
  };
}

function diffList(baselineList, currentList) {
  const baselineSet = new Set(baselineList);
  const currentSet = new Set(currentList);
  return {
    added: [...new Set(currentList)].filter((item) => !baselineSet.has(item)).sort(),
    removed: [...new Set(baselineList)].filter((item) => !currentSet.has(item)).sort(),
  };
}

// 전체 정책을 나란히 보여주지 않고 차이(추가·삭제)만 돌려줍니다.
export function diffPolicies(backup, current) {
  const routes = diffList(backup.allowedRoutes, current.allowedRoutes);
  const rules = diffList(backup.ruleIds, current.ruleIds);
  const changed = routes.added.length > 0 || routes.removed.length > 0
    || rules.added.length > 0 || rules.removed.length > 0;
  return { routes, rules, changed };
}

// 저장점 규칙 참고: 이 함수는 비교 결과만 돌려줍니다. 실제 복원(정책 되돌리기)은
// 별도 단계에서 구현하며, 여기서는 아무 파일도 쓰지 않습니다.
export async function checkRestore(root) {
  const verified = await loadVerifiedBackup(root);
  if (!verified.ok) return verified;
  const current = await currentPolicySnapshot(root);
  const diff = diffPolicies(verified.backup, current);
  return {
    ok: true, version: verified.backup.version, capturedAt: verified.backup.capturedAt, diff,
    backup: verified.backup, current,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const result = await checkRestore(root);
    if (!result.ok) {
      process.stderr.write(`중단 · ${result.message}\n`);
      process.stderr.write('실제 운영 정책은 바꾸지 않았습니다.\n');
      process.exitCode = 1;
    } else {
      process.stdout.write(`복원 대상 백업 버전: ${result.version} (캡처 시각: ${result.capturedAt})\n`);
      if (!result.diff.changed) {
        process.stdout.write('차이 없음 · 현재 정책이 백업과 같습니다.\n');
      } else {
        for (const route of result.diff.routes.added) process.stdout.write(`+ route ${route}\n`);
        for (const route of result.diff.routes.removed) process.stdout.write(`- route ${route}\n`);
        for (const rule of result.diff.rules.added) process.stdout.write(`+ rule ${rule}\n`);
        for (const rule of result.diff.rules.removed) process.stdout.write(`- rule ${rule}\n`);
      }
      process.stdout.write('이 명령은 차이만 보여주며 실제 정책을 변경하지 않습니다. 복원 실행은 아직 하지 않았습니다.\n');
    }
  } catch (error) {
    process.stderr.write(`정책 비교 첫 오류: ${error.message}\n`);
    process.exitCode = 1;
  }
}
