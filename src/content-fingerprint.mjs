import { createHash } from 'node:crypto';

// 메모 복원(src/note-restore.mjs)과 자동 백업 저장(api/notes.js)이 같은 방식으로
// 해시를 계산하도록 공유합니다. 제목과 내용 사이에 NUL 바이트를 넣어 구분합니다.
export function contentFingerprint(title, content) {
  return createHash('sha256').update(`${title}\u0000${content}`, 'utf8').digest('hex');
}
