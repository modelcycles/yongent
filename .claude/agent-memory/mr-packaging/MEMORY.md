# mr-packaging 에이전트 메모리

## 설정
- [mr-packaging 설정](project_config.md) — watch_dir, output_dir 등 현재 설정값

## ID3 태그 작성
- [ID3 태그 버그 수정](feedback_id3_tagging.md) — WXXX 프레임 사용, v1=2로 항상 ID3v1 작성, tags.delete() 사용법

## 파일명 패턴
- [파일명 패턴 사례](project_filename_patterns.md) — [악보바다MR] 접두사, (Guide)/(조옮김) 접미사 처리 방식

## 샘플 생성 정책
- [60초 샘플 생성 중단](feedback_no_sample.md) — 2026-06-11부터 샘플 파일 생성 안 함, 메인 MP3만 출력

## 실행 환경 주의사항
- [콘솔 출력 인코딩 깨짐](feedback_console_encoding.md) — Git Bash에서 한글 로그/태그 mojibake, 검증은 파일 경유 필수
- [서브에이전트 결과 독립검증 필수](feedback_verify_subagent_output.md) — mr-packaging 서브에이전트 보고는 그대로 신뢰하지 말고 output_dir 파일시스템/ID3 태그를 직접 재확인할 것
