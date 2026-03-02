"""Music Downloader v2 — FastAPI 라우터."""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from .downloader import COOKIES_FILE, _safe_filename, download_audio, search_youtube
from .metadata import collect_all_metadata
from .schemas import DownloadRequest, JobStatusResponse, SearchRequest, SearchResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["music-downloader"])

_TEMP_DIR = Path(__file__).parent / "_downloads"

# 인메모리 Job 저장소
jobs: dict[str, dict] = {}


# ─── 유틸 ────────────────────────────────────────────────────────────────────


def _youtube_thumbnail(url: str) -> str:
    """YouTube URL → maxresdefault 썸네일 URL."""
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    if m:
        return f"https://img.youtube.com/vi/{m.group(1)}/maxresdefault.jpg"
    return ""


def _parse_query(query: str) -> tuple[str, str]:
    """'아이유 - 좋은날' → ('아이유', '좋은날'). 파싱 불가 시 ('', query)."""
    if " - " in query:
        artist, title = query.split(" - ", 1)
        return artist.strip(), title.strip()
    return "", query.strip()


# ─── 백그라운드 다운로드 작업 ────────────────────────────────────────────────


def _run_download_job(job_id: str, url: str | None, query: str | None) -> None:
    """BackgroundTasks로 실행되는 동기 다운로드 파이프라인."""
    jobs[job_id]["status"] = "running"
    try:
        artist, title = _parse_query(query) if query else ("", "")

        # URL 없으면 YouTube 검색
        if not url:
            jobs[job_id]["step"] = "유튜브 검색 중"
            search_q = f"{artist} {title} official audio" if artist else query or ""
            url = search_youtube(search_q, artist=artist, title=title)
            if not url:
                raise ValueError("유튜브 검색 결과를 찾을 수 없습니다")

        # MP3 다운로드
        jobs[job_id]["step"] = "음원 다운로드 중"
        output_dir = _TEMP_DIR / job_id
        mp3_path = download_audio(url, output_dir)

        # 파일명: artist-title.mp3 또는 audio.mp3
        if artist and title:
            filename = f"{_safe_filename(artist)}-{_safe_filename(title)}.mp3"
        else:
            filename = "audio.mp3"

        jobs[job_id].update(
            status="done",
            step="완료",
            file_path=str(mp3_path),
            filename=filename,
            download_url=f"/music-downloader/file/{job_id}",
        )

    except Exception as e:
        logger.exception("[Download] 작업 실패 job_id=%s", job_id)
        jobs[job_id].update(status="error", step="오류", error=str(e))


# ─── 엔드포인트 ──────────────────────────────────────────────────────────────


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/search", response_model=SearchResponse)
async def search(req: SearchRequest):
    """메타데이터 수집 (다운로드 없음). 보통 2~5초 소요."""
    artist, title = _parse_query(req.query)
    if not title:
        raise HTTPException(status_code=422, detail="곡명을 입력해주세요 (예: 아이유 - 좋은날)")

    # 메타데이터 수집 (async)
    meta = await collect_all_metadata(artist, title)

    # YouTube 검색 — blocking 이므로 thread pool에서 실행
    search_q = f"{meta['artist']} {meta['title']} official audio"
    youtube_url = await asyncio.to_thread(
        lambda: search_youtube(search_q, artist=meta["artist"], title=meta["title"])
    ) or ""

    # 커버 아트 폴백: CAA/Deezer 모두 실패 시 YouTube 썸네일 사용
    cover_url = meta["cover_url"] or (
        _youtube_thumbnail(youtube_url) if youtube_url else ""
    )

    return SearchResponse(
        artist=meta["artist"],
        title=meta["title"],
        album=meta["album"],
        release_date=meta["release_date"],
        cover_url=cover_url,
        lyrics=meta["lyrics"],
        composer=meta["composer"],
        lyricist=meta["lyricist"],
        youtube_url=youtube_url,
    )


@router.post("/download", response_model=JobStatusResponse)
async def download(req: DownloadRequest, background_tasks: BackgroundTasks):
    """비동기 다운로드 Job 생성. job_id로 상태 폴링."""
    if not req.query and not req.url:
        raise HTTPException(status_code=422, detail="query 또는 url 중 하나는 필수입니다")

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "queued", "step": "대기 중"}
    background_tasks.add_task(_run_download_job, job_id, req.url, req.query)
    return JobStatusResponse(job_id=job_id, status="queued", step="대기 중")


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_status(job_id: str):
    """Job 상태 폴링."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id를 찾을 수 없습니다")
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        step=job.get("step"),
        download_url=job.get("download_url"),
        error=job.get("error"),
    )


@router.get("/file/{job_id}")
async def get_file(job_id: str):
    """완료된 Job의 MP3 파일을 FileResponse로 서빙."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id를 찾을 수 없습니다")
    if job["status"] != "done":
        raise HTTPException(status_code=409, detail=f"아직 완료되지 않았습니다: {job['status']}")

    file_path = Path(job.get("file_path", ""))
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")

    filename = job.get("filename", "audio.mp3")
    return FileResponse(
        path=str(file_path),
        media_type="audio/mpeg",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── 쿠키 관리 ───────────────────────────────────────────────────────────────


@router.get("/cookies/status")
async def cookies_status():
    return {"active": COOKIES_FILE.exists(), "path": str(COOKIES_FILE.resolve())}


@router.post("/cookies")
async def upload_cookies(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="빈 파일입니다")
    try:
        COOKIES_FILE.write_bytes(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"파일 저장 실패: {e}")
    return {"ok": True, "path": str(COOKIES_FILE.resolve()), "size": len(content)}


@router.delete("/cookies")
async def delete_cookies():
    if COOKIES_FILE.exists():
        COOKIES_FILE.unlink()
    return {"ok": True}
