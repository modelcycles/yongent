"""yt-dlp 기반 YouTube 검색 및 음원 다운로드."""
from __future__ import annotations

import re
from pathlib import Path

import yt_dlp

# cookies.txt 위치
COOKIES_FILE = Path(__file__).parent / "cookies.txt"


# ─── 유틸 ────────────────────────────────────────────────────────────────────


def _safe_filename(name: str) -> str:
    """파일명에 사용할 수 없는 특수문자·공백을 안전하게 처리."""
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    name = name.replace(" ", "")
    return name.strip("._") or "audio"


# ─── yt-dlp 공통 옵션 ────────────────────────────────────────────────────────


def _cookie_opt() -> dict:
    """cookies.txt가 있으면 사용, 없으면 빈 dict 반환."""
    if COOKIES_FILE.exists():
        return {"cookiefile": str(COOKIES_FILE)}
    return {}


def _base_opts() -> dict:
    """모든 yt-dlp 호출에 공통 적용할 옵션.

    ios/android 클라이언트는 앱 API를 사용하므로
    web 클라이언트의 봇 체크 문제("Only images are available")를 피할 수 있음.
    """
    return {
        **_cookie_opt(),
        "extractor_args": {
            "youtube": {
                "player_client": ["ios", "android", "tv_embedded"],
            }
        },
    }


# ─── 검색 점수 계산 ───────────────────────────────────────────────────────────


def _score_entry(entry: dict, artist: str, title: str) -> int:
    """검색 결과 적합도 점수 계산. 높을수록 적합."""
    score = 0
    vtitle = (entry.get("title") or "").lower()
    channel = (entry.get("channel") or entry.get("uploader") or "").lower()
    duration = entry.get("duration") or 0
    a = artist.lower()
    t = title.lower()

    if t and t in vtitle:
        score += 30
    if a and a in vtitle:
        score += 20
    if a and a in channel:
        score += 20

    for kw in ("official", "vevo", "topic"):
        if kw in channel:
            score += 15
            break

    # 2~7분 선호 (라이브·앨범 풀버전 제외)
    if 90 <= duration <= 420:
        score += 10
    elif duration > 420:
        score -= 10

    return score


# ─── 공개 API ────────────────────────────────────────────────────────────────


def search_youtube(query: str, artist: str = "", title: str = "") -> str | None:
    """YouTube 검색 → 적합도 점수가 가장 높은 URL 반환."""
    ydl_opts = {
        **_base_opts(),
        "quiet": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        results = ydl.extract_info(f"ytsearch10:{query}", download=False)
        entries = (results or {}).get("entries") or []
        if not entries:
            return None
        best = max(entries, key=lambda e: _score_entry(e, artist, title))
        return best.get("webpage_url")


def download_audio(url: str, output_dir: Path) -> Path:
    """URL에서 MP3 다운로드 → 저장된 파일 경로 반환.

    format 전략:
    - bestaudio: 오디오 전용 스트림 (DASH m4a/webm 등)
    - best: 오디오 전용이 없을 때 최고 화질 복합 스트림 → FFmpeg로 추출
    FFmpegExtractAudio가 항상 mp3로 변환하므로 출력은 항상 audio.mp3.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        **_base_opts(),
        "format": "bestaudio/best",
        "format_sort": ["abr", "asr", "ext:m4a:3"],
        "outtmpl": str(output_dir / "audio.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            },
        ],
        "quiet": False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.extract_info(url, download=True)

    return output_dir / "audio.mp3"
