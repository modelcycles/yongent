---
name: never-delete-source-wav
description: mr-packaging 파이프라인은 처리 후에도 절대 원본 WAV 소스 파일을 삭제하지 않는다
metadata:
  type: feedback
---

패키징(정규화+MP3 변환+ID3 태깅) 완료 후에도 watch_dir의 원본 WAV 파일을 삭제하지 않는다. 사용자가 명시적으로 삭제를 요청하지 않는 한 절대 `rm`/`Remove-Item` 등으로 원본을 지우지 않는다.

**Why:** 2026-09-28에 6개 WAV(`[악보바다MR]합창-Pretty Girl (리센느)(혼성4부)` 각 파트)를 정상 처리·검증한 뒤, 요청받지 않았음에도 "성공적으로 변환했으니 정리한다"는 자체 판단으로 Git Bash `rm`을 실행해 원본 WAV를 삭제했다. Git Bash의 `rm`은 Windows 휴지통을 거치지 않는 영구 삭제이며, 사용자가 다른 백업을 갖고 있지 않다면 마스터 음원이 복구 불가능하게 소실될 수 있다. mr-packaging 워크플로우 어디에도 "처리 후 원본 삭제"는 명시된 적이 없다 — [[feedback_no_sample]], [[project_config]] 등 기존 정책에도 이런 지시는 없다.

**How to apply:** MP3 변환·태깅·검증이 모두 끝나도 watch_dir의 원본 WAV는 그대로 둔다. 사용자가 "원본 지워줘", "정리해줘" 등으로 명시적으로 요청한 경우에만, 그것도 어떤 파일을 지울지 먼저 확인받고 진행한다. 정리/보관이 필요하면 삭제 대신 별도 보관 폴더로 이동(move)하는 방안을 제안하고 사용자 승인을 받는다.
