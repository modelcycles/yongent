---
name: ID3 태그 작성 버그 수정 사항
description: mutagen으로 ID3 태그 저장 시 올바른 파라미터와 프레임 선택
type: feedback
---

URL 태그는 WOAS가 아닌 WXXX 프레임으로 써야 한다.

**Why:** WOAS(Official Audio Source URL)는 많은 플레이어에서 인식하지 못함. WXXX는 사용자 정의 URL 프레임으로 범용적으로 지원됨.

**How to apply:** URL 태그 작성 시 항상 `WXXX(encoding=3, url=url, desc='URL')` 사용.

---

mutagen `tags.save()` 의 v1 파라미터 의미:

- `v1=0`: ID3v1 쓰지 않음
- `v1=1`: 기존 ID3v1이 있을 때만 업데이트 (없으면 생성 안 함)
- `v1=2`: 항상 ID3v1 작성 (기존 여부 무관)

**Why:** v1=1로 저장하면 기존 ID3v1이 없는 파일에 ID3v1이 생성되지 않아 호환성 문제 발생.

**How to apply:** ID3v1을 항상 보장하려면 `tags.save(filepath, v1=2, v2_version=3)` 사용.

---

기존 프레임 완전 교체가 필요할 때는 `tags.delete()` 호출 후 새 프레임 할당 후 저장.

**Why:** 이전 처리에서 WOAS 등 불필요한 프레임이 잔존할 수 있음.

**How to apply:** 태그 재작성 시 `tags.delete()` → 프레임 할당 → `tags.save()` 순서로 처리.
