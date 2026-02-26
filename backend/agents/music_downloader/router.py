import asyncio
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from .downloader import search_youtube, download_audio
from .exporter import write_info_md, _safe_filename
from .metadata import merge_metadata
from .trimmer import make_60s_clip

router = APIRouter(tags=["music-downloader"])

DEFAULT_DOWNLOAD_DIR = Path(__file__).parent.parent.parent / "downloads"
jobs: dict[str, dict] = {}


def _parse_query(query: str) -> tuple[str, str]:
    """'아이유 - 좋은날' → ('아이유', '좋은날'). 파싱 불가 시 ('', query)."""
    if " - " in query:
        artist, title = query.split(" - ", 1)
        return artist.strip(), title.strip()
    return "", query.strip()


def _run_pipeline(
    job_id: str,
    url: str | None,
    query: str | None,
    output_dir: str | None,
):
    jobs[job_id]["status"] = "running"
    try:
        artist, title = _parse_query(query) if query else ("", "")

        # 1. URL 확보
        jobs[job_id]["step"] = "유튜브 검색 중"
        if not url:
            url = search_youtube(f"{artist} {title} official audio")
        if not url:
            raise ValueError("유튜브 검색 결과 없음")

        # 2. 음원 다운로드 (파일명 확정 전 임시 디렉터리)
        jobs[job_id]["step"] = "음원 다운로드 중"
        tmp_dir = (DEFAULT_DOWNLOAD_DIR / f"_tmp_{job_id}")
        tmp_dir.mkdir(parents=True, exist_ok=True)
        mp3_path, yt_info = download_audio(url, tmp_dir)

        # 3. 메타데이터 병합 (멜론 + MusicBrainz)
        jobs[job_id]["step"] = "메타데이터 수집 중 (멜론, MusicBrainz)"
        meta = merge_metadata(yt_info, artist=artist, title=title)

        # 4. 최종 폴더: {output_dir}/아티스트명-곡명/
        stem = f"{_safe_filename(meta['artist'])}-{_safe_filename(meta['title'])}"
        base = Path(output_dir) if output_dir else DEFAULT_DOWNLOAD_DIR
        song_dir = base / stem
        song_dir.mkdir(parents=True, exist_ok=True)

        # 5. 파일 이동 + 이름 변경
        final_mp3 = song_dir / f"{stem}.mp3"
        mp3_path.replace(final_mp3)
        tmp_dir.rmdir() if not any(tmp_dir.iterdir()) else None

        # 6. 60초 클립 (55-60초 페이드아웃)
        jobs[job_id]["step"] = "60초 클립 생성 중"
        make_60s_clip(final_mp3, song_dir, stem=stem)

        # 7. 메타데이터 MD 저장
        jobs[job_id]["step"] = "메타데이터 저장 중"
        write_info_md(meta, song_dir)

        jobs[job_id]["status"] = "done"
        jobs[job_id]["step"] = "완료"
        jobs[job_id]["result"] = {
            "title": meta["title"],
            "artist": meta["artist"],
            "album": meta["album"],
            "year": meta["year"],
            "composer": meta["composer"],
            "lyricist": meta["lyricist"],
            "youtube_url": meta["youtube_url"],
            "song_dir": str(song_dir),
            "files": {
                "audio": f"{stem}.mp3",
                "clip": f"{stem}(60s).mp3",
                "meta": f"{stem}(Meta).md",
            },
        }
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["step"] = "오류"
        jobs[job_id]["error"] = str(e)


@router.get("/pick-folder")
async def pick_folder():
    """네이티브 폴더 선택 다이얼로그를 열고 선택된 경로를 반환."""
    def _open_dialog() -> str | None:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.wm_attributes("-topmost", True)
        path = filedialog.askdirectory(title="저장 폴더 선택")
        root.destroy()
        return path or None

    loop = asyncio.get_event_loop()
    path = await loop.run_in_executor(None, _open_dialog)
    return {"path": path}


@router.post("/download")
async def download(request: Request, background_tasks: BackgroundTasks):
    try:
        body = await request.json()
    except Exception:
        body = {}

    query = body.get("query") or request.query_params.get("q")
    url = body.get("url") or request.query_params.get("u")
    output_dir = body.get("output_dir")

    if not query and not url:
        raise HTTPException(status_code=422, detail="query 또는 url 중 하나는 필수")

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "queued", "step": "대기 중"}
    background_tasks.add_task(_run_pipeline, job_id, url, query, output_dir)
    return {"job_id": job_id, "status": "queued"}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_id를 찾을 수 없음")
    return {"job_id": job_id, **job}
