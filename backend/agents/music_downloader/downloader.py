"""yt-dlp 기반 YouTube 검색 및 음원 다운로드."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

import yt_dlp

# cookies.txt 위치
COOKIES_FILE = Path(__file__).parent / "cookies.txt"


# ─── 유틸 ────────────────────────────────────────────────────────────────────


def _safe_filename(name: str) -> str:
    """파일명에 사용할 수 없는 특수문자·공백을 안전하게 처리."""
    name = re.sub(r'[\\/*?:"<>|]', "", name)
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

# 적합도가 이 값 미만이면 결과를 버림 (전부 미달이면 None 반환)
_MIN_SCORE = 0
# 점수가 무조건 버려지는 하한 (duration 큰 차이·아티스트 근거 없음)
_REJECT = -1000

# 곡 본편이 아닌 변형 버전을 가려내는 부정 키워드
_NEG_RE = re.compile(
    r"\b(cover|live|remix|slowed|sped\s*up|nightcore|8d|3d|instrumental|inst"
    r"|mr|karaoke|reaction|1\s*hour|loop|edit|mashup|teaser|preview)\b",
    re.I,
)


def _norm(s: str) -> str:
    """NFC 정규화 + 소문자 + 공백·구두점 제거 → 견고한 부분 일치 비교용."""
    s = unicodedata.normalize("NFC", s or "").lower()
    return re.sub(r"[\s\W_]+", "", s)


def _score_entry(entry: dict, artist: str, title: str, ref_duration: int = 0) -> int:
    """검색 결과 적합도 점수 계산. 높을수록 적합. _REJECT면 부적합."""
    score = 0
    vtitle_raw = (entry.get("title") or "")
    vtitle = _norm(vtitle_raw)
    channel = _norm(entry.get("channel") or entry.get("uploader") or "")
    duration = entry.get("duration") or 0
    a = _norm(artist)
    t = _norm(title)

    # ── 공식 채널 여부 (Topic/VEVO/Official Art Track = 라벨 공식 음원) ──
    is_official = any(kw in channel for kw in ("topic", "vevo", "official"))
    if is_official:
        score += 40

    # ── 제목·아티스트 일치 ──
    title_match = bool(t and t in vtitle)
    artist_match = bool(a and (a in vtitle or a in channel))
    if title_match:
        score += 30
    if a and a in vtitle:
        score += 20
    if a and a in channel:
        score += 20

    # ── 아티스트 근거가 전혀 없고 공식 채널도 아니면 사실상 탈락 ──
    if not artist_match and not is_official:
        score += _REJECT

    # ── 부정 키워드 ──
    if _NEG_RE.search(vtitle_raw):
        score -= 40

    # ── 재생시간 앵커 (가장 강력한 신호) ──
    if ref_duration > 0 and duration > 0:
        diff = abs(duration - ref_duration)
        if diff <= 2:
            score += 50
        elif diff <= 5:
            score += 30
        elif diff <= 10:
            score += 10
        elif diff <= 15:
            score -= 20
        else:
            score += _REJECT  # 명백히 다른 길이 → 버림
    else:
        # 참조 길이 없을 때만 기존 휴리스틱 (2~7분 선호)
        if 90 <= duration <= 420:
            score += 10
        elif duration > 420:
            score -= 10

    return score


# ─── 공개 API ────────────────────────────────────────────────────────────────


def search_youtube(
    query: str, artist: str = "", title: str = "", ref_duration: int = 0
) -> str | None:
    """YouTube 검색 → 적합도 점수가 가장 높은 URL 반환. 전부 미달이면 None."""
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
        best = max(entries, key=lambda e: _score_entry(e, artist, title, ref_duration))
        if _score_entry(best, artist, title, ref_duration) < _MIN_SCORE:
            return None
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
