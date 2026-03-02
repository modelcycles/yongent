# Music Downloader v2 — 에이전트 구축 지시사항

## 📌 프로젝트 개요

기존 `music-downloader` 에이전트를 **처음부터 다시 제작**한다.
아티스트명 + 곡명을 입력하면 곡 메타데이터를 수집하고, YouTube에서 음원을 다운로드해 브라우저에서 바로 받을 수 있는 웹앱이다.

> **기존 에이전트 파일은 참고만 하고, 코드는 새로 작성한다.**

---

## 1. 기술 스택 & 프로젝트 구조

### 기존 프로젝트 컨벤션 (반드시 따를 것)

| 영역 | 스택 |
| --- | --- |
| 백엔드 | Python FastAPI (backend/) |
| 프론트엔드 | Next.js + TypeScript + Tailwind CSS (frontend/) |
| API 통신 | REST, `http://localhost:8001` |
| 라우터 등록 | `backend/main.py`에서 `app.include_router(router, prefix="/music-downloader")` |
| 프론트 라우팅 | Next.js App Router → `frontend/app/music-downloader/page.tsx` |

### 파일 구조 (생성/수정 대상)

```
backend/
  agents/
    music_downloader/
      __init__.py
      router.py          # FastAPI 라우터 (메인 엔드포인트)
      downloader.py       # yt-dlp 기반 YouTube 검색 & 다운로드
      metadata.py         # 곡 메타데이터 수집 (MusicBrainz, Cover Art Archive, Deezer, Genius)
      schemas.py          # Pydantic 모델 정의
  main.py                 # 라우터 등록 (수정)
  requirements.txt        # 의존성 추가

frontend/
  app/
    music-downloader/
      page.tsx             # 메인 UI 페이지
```

> 기존에 있던 `exporter.py`, `trimmer.py`는 **제거**한다 (MD 내보내기, 60초 클립 기능 불필요).

---

## 2. 핵심 기능 요구사항

### 2-1. 입력

- 단일 텍스트 입력 필드: `아티스트명 - 곡명` 형식
- URL 직접 입력도 지원 (`https://youtu.be/...` 또는 `https://youtube.com/...`)
- YouTube cookies.txt 업로드 기능 (기존과 동일하게 유지)

### 2-2. 메타데이터 수집

아래 정보를 수집하여 프론트에 카드 형태로 표시한다:

| 항목 | 수집 소스 | 필수 |
| --- | --- | --- |
| 아티스트명 | MusicBrainz API | ✅ |
| 곡명 | MusicBrainz API | ✅ |
| 앨범명 | MusicBrainz API | ✅ |
| 발매일 | MusicBrainz API (YYYY.MM.DD) | ✅ |
| 앨범 커버 이미지 URL | Cover Art Archive → Deezer (폴백) | ✅ |
| 가사 | Genius API | ✅ |
| 작곡가 (composer) | MusicBrainz API (work relations) | ✅ |
| 작사가 (lyricist) | MusicBrainz API (work relations) | ✅ |

### API 역할 분담 & 폴백 전략

| 역할 | API | 이유 |
| --- | --- | --- |
| 곡 기본 정보 (아티스트, 곡명, 앨범, 발매일) | **MusicBrainz** | 가장 정확하고 상세한 메타데이터. API 키 불필요 |
| 앨범 커버 이미지 | **Cover Art Archive** (1순위) → **Deezer** (폴백) | CAA에 없으면 Deezer에서 가져옴. 둘 다 API 키 불필요 |
| 가사 | **Genius API** | 가사 전문 서비스, 가장 정확 |
| 작곡가/작사가 | **MusicBrainz** | work relations에서 크레딧 추출 |
| 음원 다운로드 | **yt-dlp** | 그대로 유지 |

**폴백 처리:**

1. **MusicBrainz** → 곡 기본 정보 + 작곡가/작사가. 못 찾으면 에러 반환하지 말고, 입력값 그대로 사용.
2. **Cover Art Archive** → MusicBrainz에서 받은 release MBID로 커버 아트 조회. 없으면 Deezer API로 폴백.
3. **Deezer** → `https://api.deezer.com/search?q=artist:"{artist}" track:"{title}"` 로 검색 → album.cover_xl 사용. 없으면 빈 이미지 표시.
4. **Genius API** → 가사. 못 찾으면 `"가사를 찾을 수 없습니다"` 표시.
5. **MusicBrainz work relations** → 작곡가/작사가. 못 찾으면 `"정보 없음"` 표시.

**API 키 관리:**

- `.env` 파일에서 환경변수로 관리:
    ```
    GENIUS_ACCESS_TOKEN=
    ```
- MusicBrainz, Cover Art Archive, Deezer는 **API 키 불필요** (User-Agent 헤더만 설정)
- 서버 시작 시 Genius 키 누락을 경고 로그로 출력하되, 서버는 정상 기동 (가사만 스킵)

### 2-3. YouTube 음원 다운로드

- **yt-dlp** 사용하여 YouTube에서 MP3 다운로드
- 검색 쿼리: `{아티스트명} {곡명} official audio` (MusicBrainz에서 확보한 정확한 이름 사용)
- 포맷: MP3, best audio quality
- **MP3 메타데이터 태깅은 하지 않는다** (mutagen 불필요)
- 다운로드 완료 후 **브라우저에서 직접 다운로드** 가능하게 파일 서빙
    - FastAPI `FileResponse`로 MP3 파일을 스트리밍
    - 프론트에서 다운로드 버튼 클릭 시 `<a href="..." download>` 또는 `fetch` → `blob` → 다운로드
- 서버의 임시 파일은 다운로드 완료 후 또는 일정 시간 후 자동 정리 (선택적)

### 2-4. YouTube 쿠키 관리

기존 로직을 유지한다:

- `POST /music-downloader/cookies` — cookies.txt 업로드
- `GET /music-downloader/cookies/status` — 쿠키 존재 여부
- `DELETE /music-downloader/cookies` — 쿠키 삭제
- 쿠키 파일 위치: `backend/agents/music_downloader/cookies.txt`

---

## 3. API 엔드포인트 설계

```
GET  /music-downloader/health              → 상태 확인

POST /music-downloader/search              → 메타데이터만 수집 (다운로드 X)
  Body: { "query": "아이유 - 좋은날" }
  Response: {
    "artist": "아이유",
    "title": "좋은 날",
    "album": "Real+",
    "release_date": "2010.12.09",
    "cover_url": "https://coverartarchive.org/release/...",
    "lyrics": "...",
    "composer": "이민수",
    "lyricist": "이민수",
    "youtube_url": "https://youtube.com/watch?v=..."
  }

POST /music-downloader/download            → 음원 다운로드 (비동기 Job)
  Body: { "query": "아이유 - 좋은날" } 또는 { "url": "https://youtu.be/..." }
  Response: { "job_id": "abc123", "status": "queued" }

GET  /music-downloader/status/{job_id}     → Job 상태 폴링
  Response: { "job_id": "abc123", "status": "done", "step": "완료", "download_url": "/music-downloader/file/abc123" }

GET  /music-downloader/file/{job_id}       → MP3 파일 다운로드 (FileResponse)

GET  /music-downloader/cookies/status      → 쿠키 상태
POST /music-downloader/cookies             → 쿠키 업로드
DELETE /music-downloader/cookies           → 쿠키 삭제
```

**중요: 2단계 플로우**

1. 사용자가 검색 → `POST /search` → 메타데이터 카드 표시
2. 사용자가 카드에서 "다운로드" 클릭 → `POST /download` → Job 시작 → 폴링 → 완료 시 다운로드 링크 표시

이렇게 검색과 다운로드를 분리하면, 사용자가 곡 정보를 먼저 확인하고 맞는 곡인지 확인한 뒤 다운로드할 수 있다.

---

## 4. 프론트엔드 UI 요구사항

### 4-1. 레이아웃 & 스타일

- 기존 `layout.tsx` 유지 (다크 테마, `bg-gray-950`, `text-gray-100`)
- Tailwind CSS만 사용 (외부 CSS 라이브러리 X)
- 최대 너비: `max-w-2xl` (기존보다 살짝 넓게)
- 반응형: 모바일에서도 사용 가능하게

### 4-2. 페이지 구성 요소

**① 헤더 영역**

- 제목: "Music Downloader"
- 설명: "아티스트명 - 곡명을 입력하면 곡 정보와 음원을 가져옵니다."

**② YouTube 연결 패널**

- 기존 쿠키 업로드 UI 유지 (접히는 패널, 단계별 가이드, 드래그앤드롭)

**③ 검색 입력**

- 텍스트 입력 필드 + "검색" 버튼
- 플레이스홀더: `예: 아이유 - 좋은날`
- Enter 키로 검색 가능

**④ 결과 카드** ← 핵심 UI

- 검색 완료 후 카드 형태로 곡 정보 표시:

```
┌─────────────────────────────────────────────┐
│  [앨범 커버 이미지]     아이유                │
│   (정사각형 썸네일)     좋은 날               │
│                        앨범: Real+           │
│                        발매일: 2010.12.09     │
│                        작곡: 이민수           │
│                        작사: 이민수           │
├─────────────────────────────────────────────┤
│  📋 복사 1                          [복사]   │
│  아이유의 '좋은 날' (2010.12) 수록곡          │
├─────────────────────────────────────────────┤
│  📋 복사 2                          [복사]   │
│  이민수 작사                                 │
│  이민수 작곡                                 │
│  아이유 노래                                 │
├─────────────────────────────────────────────┤
│  🎵 가사                      [펼치기/접기]   │
│  (접힌 상태가 기본, 클릭하면 가사 전문 표시)    │
├─────────────────────────────────────────────┤
│       [⬇ MP3 다운로드]                       │
│  (다운로드 진행 중이면 프로그레스 + 단계 표시)   │
└─────────────────────────────────────────────┘
```

**⑤ 복사 버튼 동작**

복사 버튼 1 — 클립보드에 복사할 텍스트:

```
{아티스트명}의 '{곡명}' ({발매년}.{발매월}) 수록곡
```

예시: `아이유의 '좋은 날' (2010.12) 수록곡`

복사 버튼 2 — 클립보드에 복사할 텍스트 (**줄바꿈 포함**):

```
{작사가명} 작사
{작곡가명} 작곡
{아티스트명} 노래
```

예시:

```
이민수 작사
이민수 작곡
아이유 노래
```

- 복사 성공 시 버튼 텍스트가 잠깐 "복사됨 ✓"으로 바뀌었다가 원래대로 돌아옴

**⑥ 다운로드 버튼**

- "MP3 다운로드" 버튼 클릭 → `POST /download` → Job 생성
- 다운로드 진행 중: 스피너 + 현재 단계 텍스트 (예: "유튜브 검색 중", "음원 다운로드 중")
- 완료 시: 브라우저 다운로드 트리거 (자동) + "다시 다운로드" 버튼

**⑦ 에러 처리**

- API 연결 실패, 검색 결과 없음, 다운로드 실패 등 → 빨간색 에러 메시지

### 4-3. UX 디테일

- 검색 중 로딩 스피너 표시
- 카드가 나타날 때 부드러운 fade-in 애니메이션
- 앨범 커버 이미지에 `rounded-lg` + `shadow` 적용
- 가사 영역은 기본 접힘, 토글 가능, 최대 높이 제한 + 스크롤

---

## 5. 백엔드 구현 세부사항

### 5-1. metadata.py — 메타데이터 수집

```python
# 각 API를 독립 함수로 분리

async def fetch_musicbrainz_metadata(artist: str, title: str) -> dict:
    """MusicBrainz API로 곡 검색 → 기본 정보 (아티스트, 곡명, 앨범, 발매일, MBID) 반환"""
    # GET https://musicbrainz.org/ws/2/recording?query=recording:"{title}" AND artist:"{artist}"&fmt=json&limit=5
    # 검색 결과에서 가장 적합한 recording 선택
    # recording → releases[0] 에서 앨범명, 발매일 추출
    # release MBID를 함께 반환 (커버 아트 조회에 필요)
    # User-Agent 헤더 필수: "MusicDownloader/2.0 (contact@example.com)"

async def fetch_musicbrainz_credits(recording_mbid: str) -> dict:
    """MusicBrainz API로 작곡가/작사가 크레딧 조회"""
    # GET https://musicbrainz.org/ws/2/recording/{recording_mbid}?inc=work-rels+artist-rels&fmt=json
    # recording → work relations → work MBID 추출
    # GET https://musicbrainz.org/ws/2/work/{work_mbid}?inc=artist-rels&fmt=json
    # work → artist relations에서 type="composer" / type="lyricist" 추출
    # MusicBrainz rate limit: 1 request/second 준수

async def fetch_cover_art(release_mbid: str, artist: str, title: str) -> str:
    """앨범 커버 이미지 URL 조회 — CAA 1순위, Deezer 폴백"""
    # 1순위: Cover Art Archive
    #   GET https://coverartarchive.org/release/{release_mbid}
    #   응답에서 images[0].thumbnails.large 또는 images[0].image 사용
    #   (CAA는 MusicBrainz release MBID로 조회)
    #
    # 2순위 (CAA 실패 시): Deezer API
    #   GET https://api.deezer.com/search?q=artist:"{artist}" track:"{title}"
    #   응답에서 data[0].album.cover_xl 사용 (가장 큰 해상도)
    #
    # 둘 다 실패 시: 빈 문자열 반환

async def fetch_genius_lyrics(artist: str, title: str) -> str | None:
    """Genius API로 가사 검색 → 가사 텍스트 반환"""
    # GET https://api.genius.com/search?q={artist} {title}
    # 검색 결과에서 URL 추출 → 해당 페이지 스크래핑으로 가사 텍스트 추출
    # GENIUS_ACCESS_TOKEN 없으면 None 반환

async def collect_all_metadata(artist: str, title: str) -> dict:
    """모든 소스에서 메타데이터를 수집하여 병합"""
    # 1단계: MusicBrainz 기본 정보 (먼저 호출 — MBID가 필요하므로)
    # 2단계: asyncio.gather로 병렬 호출
    #   - fetch_musicbrainz_credits(recording_mbid)
    #   - fetch_cover_art(release_mbid, artist, title)
    #   - fetch_genius_lyrics(artist, title)
    # 3단계: 결과 병합하여 반환
```

### 5-2. downloader.py — YouTube 다운로드

```python
def search_youtube(query: str, artist: str = "", title: str = "") -> str | None:
    """yt-dlp로 YouTube 검색 → 가장 적합한 URL 반환"""
    # ytsearch5:{query} 로 검색 후 제목 매칭으로 최적 결과 선택

def download_audio(url: str, output_dir: Path) -> Path:
    """yt-dlp로 MP3 다운로드 → 파일 경로 반환"""
    # format: bestaudio, postprocessor: FFmpegExtractAudio (mp3)
    # cookies.txt 있으면 사용
```

### 5-3. router.py — API 라우터

- `POST /search`: 메타데이터 수집 후 즉시 응답 (보통 2-5초)
- `POST /download`: BackgroundTasks로 비동기 다운로드 Job 생성
- `GET /status/{job_id}`: Job 상태 폴링
- `GET /file/{job_id}`: `FileResponse`로 MP3 파일 서빙 (Content-Disposition: attachment)

### 5-4. schemas.py — Pydantic 모델

```python
from pydantic import BaseModel

class SearchRequest(BaseModel):
    query: str  # "아티스트 - 곡명" 형식

class SearchResponse(BaseModel):
    artist: str
    title: str
    album: str
    release_date: str  # "YYYY.MM.DD"
    cover_url: str
    lyrics: str
    composer: str
    lyricist: str
    youtube_url: str

class DownloadRequest(BaseModel):
    query: str | None = None
    url: str | None = None

class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued | running | done | error
    step: str | None = None
    download_url: str | None = None
    error: str | None = None
```

---

## 6. 의존성

### backend/requirements.txt 추가 항목

```
fastapi
uvicorn
python-dotenv
httpx           # async HTTP 클라이언트 (MusicBrainz, CAA, Deezer, Genius API 호출)
yt-dlp          # YouTube 다운로드
beautifulsoup4  # Genius 가사 스크래핑
lxml            # BS4 파서
```

### 시스템 의존성

- `ffmpeg` (yt-dlp의 오디오 변환에 필요)

---

## 7. 주의사항 & 규칙

1. **기존 코드를 수정하지 말 것**: `layout.tsx`, `main.py`(라우터 등록 부분만 수정), `globals.css` 등은 건드리지 않는다.
2. **`main.py` 수정 범위**: `music_router` import와 `include_router` 라인만 새 코드에 맞게 업데이트.
3. **에러가 나도 서버가 죽지 않게**: 모든 외부 API 호출에 try/except, 타임아웃 설정.
4. **환경변수 없이도 기본 동작**: Genius API 키 없으면 가사만 "정보 없음"으로 표시, 나머지는 정상 동작. MusicBrainz, CAA, Deezer는 API 키 불필요.
5. **한국어 곡 지원 우선**: MusicBrainz에서 한국어 곡 검색이 잘 되도록 쿼리를 구성할 것.
6. **파일명 안전 처리**: 특수문자, 공백 등을 안전하게 처리하는 `_safe_filename()` 유틸 필요.
7. **프론트 API URL**: `const API = "http://localhost:8001"` 고정. 환경변수화는 나중에.
8. **폴더 선택 기능 제거**: 기존의 `pick-folder` (tkinter 다이얼로그)는 삭제. 브라우저 다운로드로 대체.
9. **저장 위치 선택 UI 제거**: 서버 로컬 저장 경로 지정 UI 불필요.
10. **MusicBrainz Rate Limit**: 1 request/second 제한 준수. 연속 호출 시 `asyncio.sleep(1)` 삽입.

---

## 8. 구현 순서 (권장)

1. `schemas.py` — 데이터 모델 정의
2. `metadata.py` — MusicBrainz (기본정보 + 크레딧) → Cover Art Archive/Deezer (커버) → Genius (가사) 순으로 하나씩 구현 & 테스트
3. `downloader.py` — yt-dlp 검색 & 다운로드
4. `router.py` — 엔드포인트 조립
5. `main.py` 수정 — 라우터 등록
6. `page.tsx` — 프론트엔드 UI
7. 통합 테스트

---

## 9. .env.example

프로젝트 루트에 생성:

```
# Genius API (https://genius.com/api-clients)
GENIUS_ACCESS_TOKEN=

# MusicBrainz, Cover Art Archive, Deezer — API 키 불필요
```

---

## 10. 테스트 케이스

구현 후 아래 쿼리로 테스트:

- `아이유 - 좋은날` (한국어 곡)
- `BTS - Dynamite` (영어 곡)
- `NewJeans - Ditto` (최신 곡)
- `https://youtu.be/jeqdYqsrsA0` (URL 직접 입력)