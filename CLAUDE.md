# yongent

## 프로젝트 개요
다양한 에이전트와 소규모 프로젝트를 관리하는 모노레포.

## 폴더 구조
```
yongent/
├── CLAUDE.md
├── frontend/                  ← 통합 프론트엔드 (여기서만 yarn dev)
│   ├── package.json
│   ├── yarn.lock
│   └── app/
│       ├── page.tsx           ← 대시보드 홈 (에이전트 목록)
│       ├── music-downloader/
│       │   └── page.tsx
│       └── (에이전트 추가 시 폴더만 추가)
│
├── backend/                   ← 통합 백엔드 (여기서만 python main.py)
│   ├── main.py                ← 모든 에이전트 API 통합
│   ├── requirements.txt
│   └── agents/
│       ├── music_downloader/
│       │   ├── downloader.py
│       │   ├── metadata.py
│       │   ├── trimmer.py
│       │   └── exporter.py
│       └── (에이전트 추가 시 폴더만 추가)
│
├── agents/                    ← CLAUDE.md만 보관
│   ├── music-downloader/
│   │   └── CLAUDE.md
│   └── (에이전트 추가 시 폴더만 추가)
│
└── projects/                  ← 소규모 코드 뭉치
```

## 실행 방법
```bash
# 프론트엔드 — 터미널 1 (항상 동일)
cd frontend
yarn
yarn dev

# 백엔드 — 터미널 2 (항상 동일)
cd backend
pip install -r requirements.txt
python main.py
```

브라우저 접속: `http://localhost:3000`

## 에이전트 추가 규칙
1. `agents/` 안에 새 폴더 생성 + `CLAUDE.md` 추가
2. `backend/agents/` 안에 같은 이름으로 폴더 + 로직 파일 추가
3. `backend/main.py` 에 라우터 등록
4. `frontend/app/` 안에 같은 이름으로 폴더 + `page.tsx` 추가
5. 끝 — 터미널 2개로 모든 에이전트 동작

## 개발 원칙
- Claude API 등 유료 크레딧 사용 없이 동작
- Windows / macOS 크로스 플랫폼 호환 유지
- 프론트엔드는 루트에 하나만, 백엔드는 에이전트별로 독립
