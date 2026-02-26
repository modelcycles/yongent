"""메타데이터 MD 파일 생성 (아티스트-곡명(Meta).md)."""
from __future__ import annotations
import re
from pathlib import Path
from datetime import datetime

_TEMPLATE = """\
# {title}

- **아티스트**: {artist}
- **앨범**: {album}
- **발매년도**: {year}
- **작곡가**: {composer}
- **작사가**: {lyricist}
- **유튜브 링크**: {youtube_url}
- **다운로드 일시**: {downloaded_at}

## 가사

{lyrics}
"""


def _safe_filename(name: str) -> str:
    """파일명에 사용할 수 없는 문자 제거."""
    return re.sub(r'[\\/*?:"<>|]', "", name).strip()


def write_info_md(metadata: dict, output_dir: Path) -> Path:
    artist = _safe_filename(metadata.get("artist", "unknown"))
    title = _safe_filename(metadata.get("title", "unknown"))
    filename = f"{artist}-{title}(Meta).md"

    content = _TEMPLATE.format(
        title=metadata.get("title", "확인 필요"),
        artist=metadata.get("artist", "확인 필요"),
        album=metadata.get("album", "확인 필요"),
        year=metadata.get("year", "확인 필요"),
        composer=metadata.get("composer", "확인 필요"),
        lyricist=metadata.get("lyricist", "확인 필요"),
        youtube_url=metadata.get("youtube_url", ""),
        lyrics=metadata.get("lyrics") or "확인 필요",
        downloaded_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    )

    path = output_dir / filename
    path.write_text(content, encoding="utf-8")
    return path
