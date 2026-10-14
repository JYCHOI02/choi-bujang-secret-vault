import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkRestore } from '../scripts/restore-check.mjs';

const CONFIG = { allowedRoutes: ['GET /api/notes', 'POST /api/notes', 'GET /api/announcements'] };
const DECIDER_SRC = "export const RULE_IDS = Object.freeze(['device_registered', 'resource_zone_verified']);\n"
  + 'export async function decide() { return null; }\n';

async function makeFixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), 'aleph-restore-check-'));
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'aleph.config.json'), JSON.stringify(CONFIG), 'utf8');
  await writeFile(join(root, 'src', 'decider.mjs'), DECIDER_SRC, 'utf8');
  return root;
}

async function writeBackup(root, backupObject, { fingerprint } = {}) {
  const dir = join(root, 'docs', 'policy-backup');
  await mkdir(dir, { recursive: true });
  const raw = JSON.stringify(backupObject);
  await writeFile(join(dir, 'policy.json'), raw, 'utf8');
  const realFingerprint = createHash('sha256').update(raw, 'utf8').digest('hex');
  await writeFile(join(dir, 'policy.sha256'), fingerprint ?? realFingerprint, 'utf8');
}

test('백업 사본이 없으면 차이를 보여주지 않고 중단한다', async () => {
  const root = await makeFixtureRoot();
  try {
    const result = await checkRestore(root);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'backup_missing');
    assert.equal('diff' in result, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('지문이 사본 내용과 다르면 중단한다', async () => {
  const root = await makeFixtureRoot();
  try {
    await writeBackup(root, {
      schema: 'aleph.policy.backup.v1',
      version: '85d3d3f',
      capturedAt: '2026-10-14T00:00:00.000Z',
      allowedRoutes: CONFIG.allowedRoutes,
      ruleIds: ['device_registered', 'resource_zone_verified'],
    }, { fingerprint: '0'.repeat(64) });
    const result = await checkRestore(root);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'backup_verification_failed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('형식이 다른 사본도 중단한다(지문은 맞아도)', async () => {
  const root = await makeFixtureRoot();
  try {
    await writeBackup(root, { schema: 'aleph.policy.backup.v1', version: '', capturedAt: '', allowedRoutes: [], ruleIds: [] });
    const result = await checkRestore(root);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'backup_verification_failed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('검증된 백업과 현재 정책의 차이만 보여준다', async () => {
  const root = await makeFixtureRoot();
  try {
    await writeBackup(root, {
      schema: 'aleph.policy.backup.v1',
      version: '85d3d3f',
      capturedAt: '2026-10-14T00:00:00.000Z',
      allowedRoutes: ['GET /api/notes', 'POST /api/notes'],
      ruleIds: ['device_registered'],
    });
    const before = await readFile(join(root, 'aleph.config.json'), 'utf8');
    const result = await checkRestore(root);
    const after = await readFile(join(root, 'aleph.config.json'), 'utf8');
    assert.equal(after, before, '현재 정책 파일을 바꾸면 안 됩니다');
    assert.equal(result.ok, true);
    assert.equal(result.version, '85d3d3f');
    assert.equal(result.diff.changed, true);
    assert.deepEqual(result.diff.routes.added, ['GET /api/announcements']);
    assert.deepEqual(result.diff.routes.removed, []);
    assert.deepEqual(result.diff.rules.added, ['resource_zone_verified']);
    assert.deepEqual(result.diff.rules.removed, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('백업과 현재 정책이 같으면 차이 없음을 보여준다', async () => {
  const root = await makeFixtureRoot();
  try {
    await writeBackup(root, {
      schema: 'aleph.policy.backup.v1',
      version: '85d3d3f',
      capturedAt: '2026-10-14T00:00:00.000Z',
      allowedRoutes: CONFIG.allowedRoutes,
      ruleIds: ['device_registered', 'resource_zone_verified'],
    });
    const result = await checkRestore(root);
    assert.equal(result.ok, true);
    assert.equal(result.diff.changed, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
