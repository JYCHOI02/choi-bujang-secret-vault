import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyRestore } from '../scripts/restore-apply.mjs';

const DECIDER_SRC = "export const RULE_IDS = Object.freeze(['device_registered', 'resource_zone_verified']);\n"
  + 'export async function decide() { return null; }\n';

async function makeFixtureRoot(allowedRoutes) {
  const root = await mkdtemp(join(tmpdir(), 'aleph-restore-apply-'));
  await mkdir(join(root, 'src'), { recursive: true });
  const config = {
    step: 9,
    judgeIssuer: 'https://aleph-judge-production.up.railway.app/defense/judge',
    identityProvider: { issuer: 'https://example.supabase.co/auth/v1', audience: 'authenticated' },
    sampleMarker: 'SAMPLE_NOTE_1',
    allowedRoutes,
    restoreRoute: null,
  };
  await writeFile(join(root, 'aleph.config.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
  await writeFile(join(root, 'src', 'decider.mjs'), DECIDER_SRC, 'utf8');
  return { root, config };
}

async function writeBackup(root, backupObject) {
  const dir = join(root, 'docs', 'policy-backup');
  await mkdir(dir, { recursive: true });
  const raw = JSON.stringify(backupObject);
  await writeFile(join(dir, 'policy.json'), raw, 'utf8');
  await writeFile(join(dir, 'policy.sha256'), createHash('sha256').update(raw, 'utf8').digest('hex'), 'utf8');
}

async function readAuditLines(root) {
  try {
    const raw = await readFile(join(root, 'docs', 'policy-backup', 'audit-log.jsonl'), 'utf8');
    return raw.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

test('백업이 없으면 적용하지 않고 감사 이력에 중단을 남긴다', async () => {
  const { root } = await makeFixtureRoot(['GET /api/notes/:id']);
  try {
    const before = await readFile(join(root, 'aleph.config.json'), 'utf8');
    const result = await applyRestore(root, { confirmVersion: 'anything' });
    const after = await readFile(join(root, 'aleph.config.json'), 'utf8');
    assert.equal(result.ok, false);
    assert.equal(after, before);
    const audit = await readAuditLines(root);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, 'aborted');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('확인용 버전을 넣지 않거나 틀리면 적용하지 않는다', async () => {
  const { root } = await makeFixtureRoot(['GET /api/notes/:id', 'GET /api/notes/export']);
  try {
    await writeBackup(root, {
      schema: 'aleph.policy.backup.v1', version: '85d3d3f', capturedAt: '2026-10-14T00:00:00.000Z',
      allowedRoutes: ['GET /api/notes/:id'], ruleIds: ['device_registered', 'resource_zone_verified'],
    });
    const before = await readFile(join(root, 'aleph.config.json'), 'utf8');
    const resultNoConfirm = await applyRestore(root, {});
    const resultWrongConfirm = await applyRestore(root, { confirmVersion: 'wrong-version' });
    const after = await readFile(join(root, 'aleph.config.json'), 'utf8');
    assert.equal(resultNoConfirm.ok, false);
    assert.equal(resultNoConfirm.reason, 'confirmation_mismatch');
    assert.equal(resultWrongConfirm.ok, false);
    assert.equal(after, before, '확인값이 없거나 틀리면 정책 파일을 바꾸면 안 됩니다');
    const audit = await readAuditLines(root);
    assert.equal(audit.length, 2);
    assert.ok(audit.every((entry) => entry.reason === 'confirmation_mismatch'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('확인된 복원: B가 쓰던 위험한 경로는 사라지고 A의 정상 경로는 남으며, 다른 설정은 보존된다', async () => {
  const { root, config: originalConfig } = await makeFixtureRoot([
    'GET /api/notes/:id', 'POST /api/notes', 'PUT /api/notes/:id', 'DELETE /api/notes/:id',
    'GET /api/notes/export',
  ]);
  try {
    await writeBackup(root, {
      schema: 'aleph.policy.backup.v1', version: '85d3d3f', capturedAt: '2026-10-14T00:00:00.000Z',
      allowedRoutes: ['GET /api/notes/:id', 'POST /api/notes', 'PUT /api/notes/:id', 'DELETE /api/notes/:id'],
      ruleIds: ['device_registered', 'resource_zone_verified'],
    });
    const result = await applyRestore(root, { confirmVersion: '85d3d3f' });
    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    const config = JSON.parse(await readFile(join(root, 'aleph.config.json'), 'utf8'));
    assert.ok(!config.allowedRoutes.includes('GET /api/notes/export'), 'B가 쓰던 전체/대량 접근 경로는 복원 후 다시 막혀야 합니다');
    assert.ok(config.allowedRoutes.includes('GET /api/notes/:id'), 'A의 정상 단건 요청 경로는 유지돼야 합니다');
    assert.equal(config.judgeIssuer, originalConfig.judgeIssuer, '다른 서비스 설정은 보존해야 합니다');
    assert.deepEqual(config.identityProvider, originalConfig.identityProvider, '다른 서비스 설정은 보존해야 합니다');
    assert.equal(config.step, originalConfig.step);
    const audit = await readAuditLines(root);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].action, 'applied');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('여러 번 실행해도 감사 이력은 지워지지 않고 쌓인다', async () => {
  const { root } = await makeFixtureRoot(['GET /api/notes/:id', 'GET /api/notes/export']);
  try {
    await writeBackup(root, {
      schema: 'aleph.policy.backup.v1', version: '85d3d3f', capturedAt: '2026-10-14T00:00:00.000Z',
      allowedRoutes: ['GET /api/notes/:id'], ruleIds: ['device_registered', 'resource_zone_verified'],
    });
    await applyRestore(root, { confirmVersion: 'wrong' });
    await applyRestore(root, { confirmVersion: '85d3d3f' });
    const audit = await readAuditLines(root);
    assert.equal(audit.length, 2);
    assert.equal(audit[0].reason, 'confirmation_mismatch');
    assert.equal(audit[1].action, 'applied');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('백업과 현재 정책이 같으면 아무것도 쓰지 않는다', async () => {
  const routes = ['GET /api/notes/:id', 'POST /api/notes'];
  const { root } = await makeFixtureRoot(routes);
  try {
    await writeBackup(root, {
      schema: 'aleph.policy.backup.v1', version: '85d3d3f', capturedAt: '2026-10-14T00:00:00.000Z',
      allowedRoutes: routes, ruleIds: ['device_registered', 'resource_zone_verified'],
    });
    const before = await readFile(join(root, 'aleph.config.json'), 'utf8');
    const result = await applyRestore(root, { confirmVersion: '85d3d3f' });
    const after = await readFile(join(root, 'aleph.config.json'), 'utf8');
    assert.equal(result.ok, true);
    assert.equal(result.applied, false);
    assert.equal(after, before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
