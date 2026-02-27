"""ffmpeg 기반 60초 클립 생성 (55-60초 구간 페이드아웃)."""
from __future__ import annotations
from pathlib import Path
import ffmpeg


def make_60s_clip(input_path: Path, output_dir: Path, stem: str = "") -> Path:
    """input_path mp3에서 앞 60초 클립 생성.

    55-60초 구간에 페이드아웃 적용.
    stem이 주어지면 '{stem}(60s).mp3', 아니면 'audio_60s.mp3'로 저장.
    """
    filename = f"s{stem}.mp3" if stem else "saudio.mp3"
    output_path = output_dir / filename

    audio = (
        ffmpeg
        .input(str(input_path), ss=0, t=60)
        .audio
        .filter("afade", t="out", st=55, d=5)
    )
    (
        ffmpeg
        .output(audio, str(output_path), acodec="libmp3lame", audio_bitrate="192k")
        .overwrite_output()
        .run(quiet=True)
    )
    return output_path
