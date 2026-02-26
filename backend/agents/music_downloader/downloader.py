"""yt-dlp 기반 유튜브 검색 및 음원 다운로드."""
from __future__ import annotations
from pathlib import Path
import yt_dlp

# 쿠키를 읽을 브라우저 우선순위 (설치된 첫 번째 브라우저 사용)
_BROWSERS = ("chrome", "firefox", "edge", "chromium")


def _cookie_opt() -> dict:
    """설치된 브라우저에서 쿠키 로드. 모두 실패하면 빈 dict 반환."""
    for browser in _BROWSERS:
        try:
            with yt_dlp.YoutubeDL({"cookiesfrombrowser": (browser,), "quiet": True}):
                pass
            return {"cookiesfrombrowser": (browser,)}
        except Exception:
            continue
    return {}


def _base_opts() -> dict:
    """모든 yt-dlp 호출에 공통 적용할 옵션.

    player_client 'ios' — YouTube 봇 감지를 우회하는 가장 안정적인 클라이언트.
    'web'/'android'은 2024년 이후 봇 감지에 자주 걸림.
    """
    return {
        **_cookie_opt(),
        "extractor_args": {
            "youtube": {
                "player_client": ["ios"],
            }
        },
    }


def search_youtube(query: str) -> str | None:
    """쿼리로 유튜브 URL 검색. 공식 채널 > VEVO > official audio 우선."""
    ydl_opts = {
        **_base_opts(),
        "quiet": True,
        "skip_download": True,
        "noplaylist": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        results = ydl.extract_info(f"ytsearch5:{query}", download=False)
        if results and results.get("entries"):
            return results["entries"][0]["webpage_url"]
    return None


def download_audio(url: str, output_dir: Path) -> tuple[Path, dict]:
    """URL에서 audio.mp3 + 썸네일 다운로드. (mp3 경로, yt-dlp info dict) 반환."""
    output_dir.mkdir(parents=True, exist_ok=True)
    ydl_opts = {
        **_base_opts(),
        "format": "bestaudio/best",
        "outtmpl": str(output_dir / "audio.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            },
            {"key": "FFmpegMetadata"},
            {"key": "EmbedThumbnail"},
        ],
        "writethumbnail": True,
        "quiet": False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
    return output_dir / "audio.mp3", info
