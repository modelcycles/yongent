# Music Downloader Agent

## 개요
유튜브 URL, 멜론 URL, 또는 아티스트+곡명 텍스트 입력으로
음원 파일과 관련 메타데이터를 자동으로 수집하는 에이전트.

## 폴더 구조
```
agents/music-downloader/
└── CLAUDE.md                  ← 이 에이전트 전용 컨텍스트

# 실제 코드 위치
backend/agents/music_downloader/
├── downloader.py              ← yt-dlp 음원 다운로드 + 검색
├── metadata.py                ← 메타데이터 수집 및 보완
├── trimmer.py                 ← ffmpeg 60초 클립 생성
└── exporter.py                ← MD 파일 생성 + 폴더 정리

# 프론트엔드 위치
frontend/app/music-downloader/
└── page.tsx
```

## 기능 요구사항

### 입력 방식 2가지
- 아티스트 + 곡명 텍스트 (예: `아이유 - 좋은날`)
- 유튜브 URL 또는 멜론 URL 직접 붙여넣기

### 유튜브 검색 우선순위
1. 아티스트 공식 채널 업로드
2. VEVO 채널
3. `official audio` 키워드 포함 영상
4. 그 외 (라이브, 뮤직비디오 등은 후순위)

### 출력 파일 4가지
- `audio.mp3` — 원본 음원
- `audio_60s.mp3` — 60초 클립
- `cover.jpg` — 앨범 커버 이미지
- `info.md` — 곡 정보

### info.md 포맷
```markdown
# 곡명

- **아티스트**: 
- **앨범**: 
- **발매년도**: 
- **작곡가**: 
- **작사가**: 
- **유튜브 링크**: 
- **다운로드 일시**: 
```

### 메타데이터 폴백 전략
1. yt-dlp 메타데이터
2. MusicBrainz API (무료, API 키 불필요)
3. 멜론 스크래핑
4. 없으면 `확인 필요` 표시

### 공식 음원 없는 경우
- 커버곡, 라이브도 그대로 다운로드
- info.md에 `원곡 아티스트: OOO / 커버: OOO` 형태로 구분

## 백엔드 라이브러리
```
yt-dlp
ffmpeg-python
pydub
musicbrainzngs
requests
beautifulsoup4
fastapi
uvicorn
```

## 실행 방법
```bash
# 루트에서 실행 (터미널 2개)
cd frontend && yarn dev
cd backend && python main.py
```

# 파이프라인
### 키워드 입력 시 작업 순서서
1. 멜론 검색 후 메타데이터 추출 (모두 합쳐 md파일로 export)
    1. 곡명
    2. 아티스트명
    3. 작곡가
    4. 작사가
    5. 가사
2. 유튜브 검색 후 다운로드
    1. 원본 음원 mp3 형식
    2. 처음부터 60초 까지 분량의 편집 음원 (55-60구간은 페이드 아웃) mp3 형식

### 파일명 규칙
- 메타데이터 : `아티스트명-곡명(Meta).md`
- 원본 음원 : `아티스트명-곡명.mp3`
- 편집 음원 : `아티스트명-곡명.mp3`

### 다운로드 위치
- 프론트에서 다운로드 버튼으로로
- 파일 구조:
    - 아티스트명-곡명/
        └ 아티스트명-곡명(Meta).md
        └ 아티스트명-곡명.mp3
        └ 아티스트명-곡명.mp3
        