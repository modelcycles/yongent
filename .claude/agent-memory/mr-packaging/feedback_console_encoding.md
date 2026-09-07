---
name: 콘솔 출력 인코딩 깨짐 (검증 시 파일 경유 필요)
description: Git Bash에서 mr_packaging_run.py 실행 시 한글 로그/태그 출력이 깨짐 — 검증은 반드시 UTF-8 파일 기록 후 Read로 확인
type: project
---

Windows Git Bash 환경에서 `python mr_packaging_run.py`를 실행하면 스크립트의 한글 print 출력(진행 로그, 아티스트/제목 등)이 콘솔에서 모두 mojibake(깨진 문자)로 표시된다. mutagen으로 읽은 ID3 태그 값을 그대로 `print()`해도 동일하게 깨진다.

**Why:** Git Bash 터미널의 활성 코드페이지가 UTF-8과 맞지 않아 발생하는 것으로 보임(cp949/euc-kr 콘솔 vs UTF-8 파이썬 출력). 실제 파일(MP3, ID3 태그)에는 문제가 없고 표시상의 문제일 뿐.

**How to apply:** 처리 완료 후 성공/실패 여부나 태그 값을 검증할 때, bash에서 직접 print된 텍스트를 신뢰하지 말 것. 대신 Python으로 결과를 UTF-8 파일에 기록한 뒤 Read 도구로 읽어서 확인. (예: [[project_config]] 참고 — output_dir 하위 결과물의 TIT2/TPE1/TCOP/WXXX 및 ID3v1 CP949 필드를 별도 파일에 써서 검증)
