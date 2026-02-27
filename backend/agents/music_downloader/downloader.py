"""yt-dlp 기반 유튜브 검색 및 음원 다운로드."""
from __future__ import annotations
from pathlib import Path
import yt_dlp

# 사용자가 수동으로 내보낸 cookies.txt 경로
COOKIES_FILE = Path(__file__).parent / "cookies.txt"

# 쿠키를 읽을 브라우저 우선순위 (cookies.txt 없을 때 폴백)
_BROWSERS = ("chrome", "firefox", "edge", "chromium")


def _cookie_opt() -> dict:
    """쿠키 옵션 반환. cookies.txt 우선, 없으면 브라우저 쿠키 시도."""
    if COOKIES_FILE.exists():
        return {"cookiefile": str(COOKIES_FILE)}
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

    web 클라이언트는 쿠키가 있어도 봇 체크 페이지를 반환하여
    "Only images are available" 오류를 유발함.
    ios/android 클라이언트는 앱 API를 사용하므로 이 문제를 피함.
    """
    return {
        **_cookie_opt(),
        "extractor_args": {
            "youtube": {
                "player_client": ["ios", "android", "tv_embedded"],
            }
        },
    }


def _score_entry(entry: dict, artist: str, title: str) -> int:
    """검색 결과 적합도 점수 계산. 높을수록 좋음."""
    score = 0
    vtitle = (entry.get("title") or "").lower()
    channel = (entry.get("channel") or entry.get("uploader") or "").lower()
    duration = entry.get("duration") or 0
    a = artist.lower()
    t = title.lower()

    # 곡명·아티스트명 포함 여부
    if t and t in vtitle:
        score += 30
    if a and a in vtitle:
        score += 20
    if a and a in channel:
        score += 20

    # 공식 채널 키워드
    for kw in ("official", "vevo", "topic"):
        if kw in channel:
            score += 15
            break

    # 재생 시간: 2~7분 선호 (너무 짧거나 긴 건 앨범/라이브 등)
    if 90 <= duration <= 420:
        score += 10
    elif duration > 420:
        score -= 10

    return score


def search_youtube(query: str, artist: str = "", title: str = "") -> str | None:
    """쿼리로 유튜브 URL 검색. 아티스트·곡명 매칭 점수가 가장 높은 결과 반환."""
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
        return best["webpage_url"]


def download_audio(url: str, output_dir: Path) -> tuple[Path, dict]:
    """URL에서 audio.mp3 다운로드. (mp3 경로, yt-dlp info dict) 반환.

    format 선택 전략:
    - bestaudio: 오디오 전용 스트림 (DASH m4a/webm 등)
    - best: 오디오 전용이 없을 때 최고 화질 복합 스트림 → FFmpeg로 오디오 추출
    어떤 포맷이 내려받히더라도 FFmpegExtractAudio가 mp3로 변환하므로 항상 mp3 출력.
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
            {"key": "FFmpegMetadata"},
        ],
        "quiet": False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
    return output_dir / "audio.mp3", info
