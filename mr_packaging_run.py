"""
mr-packaging 일괄 처리 스크립트
- ffmpeg 2-pass loudnorm (-0.3dBTP) + 320kbps MP3 변환
- 60초 샘플 생성 (192kbps, 55-60s 페이드아웃)
- ID3v2: UTF-8 (mutagen, v1=0)
- ID3v1: CP949 128바이트 수동 기록
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# mutagen 가져오기
try:
    from mutagen.id3 import ID3, TIT2, TPE1, TCOP, WXXX, ID3NoHeaderError
except ImportError:
    print("[오류] mutagen이 설치되지 않았습니다. pip install mutagen 을 실행하세요.")
    sys.exit(1)

# ──────────────────────────────────────────────
# 설정 읽기
# ──────────────────────────────────────────────
CONFIG_PATH = Path(__file__).parent / "mr-packaging.config.json"

with open(CONFIG_PATH, encoding="utf-8") as f:
    config = json.load(f)

WATCH_DIR = Path(config["watch_dir"])
OUTPUT_DIR = Path(config["output_dir"])
COPYRIGHT = config.get("copyright", "미디어라운드(주)")
URL = config.get("url", "www.akbobada.com")
MP3_BITRATE = config.get("mp3_bitrate", "320k")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────
# 유틸리티
# ──────────────────────────────────────────────

def parse_filename(wav_path: Path):
    """
    파일명에서 아티스트와 제목 추출.
    - 공백 제거
    - 첫 번째 '-' 기준으로 분리
    """
    stem = wav_path.stem  # 확장자 제외
    if "-" not in stem:
        print(f"  [SKIP] {wav_path.name} - 파일명 형식 불일치. {{아티스트}}-{{제목}}.wav 형식이어야 합니다.")
        return None, None

    idx = stem.index("-")
    artist = stem[:idx].strip()
    title = stem[idx + 1:].strip()

    # CLAUDE.md: 파일명 공백 유지 (치환하지 않음)
    return artist, title


def run_ffmpeg_pass1(input_wav: Path) -> dict:
    """
    loudnorm 1-pass: 측정값 추출.
    stderr 에서 JSON 블록 파싱.
    """
    cmd = [
        "ffmpeg", "-y", "-i", str(input_wav),
        "-af", "loudnorm=I=-16:TP=-0.3:LRA=11:print_format=json",
        "-f", "null", "-"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    stderr = result.stderr

    # JSON 블록 추출
    match = re.search(r'\{[^{}]+\}', stderr, re.DOTALL)
    if not match:
        raise RuntimeError(f"loudnorm 측정 실패:\n{stderr[-2000:]}")

    return json.loads(match.group())


def run_ffmpeg_pass2(input_wav: Path, output_mp3: Path, measured: dict) -> None:
    """
    loudnorm 2-pass: 측정값 적용하여 MP3 변환.
    """
    af = (
        f"loudnorm=I=-16:TP=-0.3:LRA=11"
        f":measured_I={measured['input_i']}"
        f":measured_LRA={measured['input_lra']}"
        f":measured_TP={measured['input_tp']}"
        f":measured_thresh={measured['input_thresh']}"
        f":linear=true"
    )
    cmd = [
        "ffmpeg", "-y", "-i", str(input_wav),
        "-af", af,
        "-codec:a", "libmp3lame",
        "-b:a", MP3_BITRATE,
        "-id3v2_version", "3",
        str(output_mp3)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg pass2 실패:\n{result.stderr[-2000:]}")


def make_60s_sample(input_mp3: Path, output_sample: Path) -> None:
    """
    60초 샘플 생성: 0~60s, 55~60s 페이드아웃, 192kbps
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_mp3),
        "-ss", "0", "-t", "60",
        "-af", "afade=t=out:st=55:d=5",
        "-acodec", "libmp3lame",
        "-b:a", "192k",
        str(output_sample)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(f"샘플 생성 실패:\n{result.stderr[-2000:]}")


def write_id3v2_tags(filepath: str, artist: str, title: str) -> None:
    """
    ID3v2 태그를 UTF-8로 작성. ID3v1은 쓰지 않음 (v1=0).
    기존 태그 완전 교체.
    """
    try:
        tags = ID3(filepath)
        tags.delete(filepath)
        tags = ID3()
    except ID3NoHeaderError:
        tags = ID3()

    tags["TIT2"] = TIT2(encoding=3, text=title)
    tags["TPE1"] = TPE1(encoding=3, text=artist)
    tags["TCOP"] = TCOP(encoding=3, text=COPYRIGHT)
    tags["WXXX:URL"] = WXXX(encoding=3, url=URL, desc="URL")

    tags.save(filepath, v1=0, v2_version=3)


def write_id3v1_cp949(filepath: str, title: str, artist: str, comment: str = "") -> None:
    """
    ID3v1 태그를 CP949로 128바이트 수동 기록.
    """
    def encode_field(text: str, length: int) -> bytes:
        try:
            encoded = text.encode("cp949")
        except UnicodeEncodeError:
            encoded = text.encode("cp949", errors="replace")
        return encoded[:length].ljust(length, b"\x00")

    tag = b"TAG"
    tag += encode_field(title, 30)
    tag += encode_field(artist, 30)
    tag += encode_field("", 30)   # album
    tag += encode_field("", 4)    # year
    tag += encode_field(comment, 28)
    tag += b"\x00"   # track marker
    tag += b"\x00"   # track number
    tag += b"\xff"   # genre (255 = 없음)

    assert len(tag) == 128, f"ID3v1 태그 크기 오류: {len(tag)}"

    with open(filepath, "r+b") as f:
        f.seek(-128, 2)
        if f.read(3) == b"TAG":
            f.seek(-128, 2)
        else:
            f.seek(0, 2)
        f.write(tag)


# ──────────────────────────────────────────────
# 메인 처리 루프
# ──────────────────────────────────────────────

wav_files = sorted(WATCH_DIR.glob("*.wav"))

if not wav_files:
    print(f"[알림] {WATCH_DIR} 에 WAV 파일이 없습니다.")
    sys.exit(0)

print(f"처리 대상: {len(wav_files)}개 파일\n")

success_count = 0
fail_count = 0

for wav in wav_files:
    print(f"[처리중] {wav.name}")

    artist, title = parse_filename(wav)
    if artist is None:
        fail_count += 1
        continue

    output_mp3 = OUTPUT_DIR / f"{artist}-{title}.mp3"
    output_sample = OUTPUT_DIR / f"s{artist}-{title}.mp3"

    try:
        # Step 1: 2-pass loudnorm + MP3 변환
        print(f"  → Pass 1: loudnorm 측정 중...")
        measured = run_ffmpeg_pass1(wav)

        print(f"  → Pass 2: {MP3_BITRATE} MP3 변환 중...")
        run_ffmpeg_pass2(wav, output_mp3, measured)

        # Step 2: 60초 샘플
        print(f"  → 60초 샘플 생성 중...")
        make_60s_sample(output_mp3, output_sample)

        # Step 3: ID3 태그 (메인)
        write_id3v2_tags(str(output_mp3), artist, title)
        write_id3v1_cp949(str(output_mp3), title, artist)

        # Step 4: ID3 태그 (샘플)
        write_id3v2_tags(str(output_sample), artist, title)
        write_id3v1_cp949(str(output_sample), title, artist)

        print(f"  [OK] {wav.name}")
        print(f"    → 정규화: -0.3dBTP (loudnorm 2-pass)")
        print(f"    → 변환: {MP3_BITRATE} MP3")
        print(f"    → 샘플: 192kbps MP3 (0~60s, 55~60s 페이드아웃)")
        print(f"    → 태그: 아티스트={artist}, 제목={title}, 저작권={COPYRIGHT}, URL={URL}")
        print(f"    → 출력: {output_mp3}")
        print(f"    → 샘플 출력: {output_sample}")
        print()
        success_count += 1

    except Exception as e:
        print(f"  [오류] {wav.name}: {e}")
        print()
        fail_count += 1

print(f"── 완료: 성공 {success_count}개 / 실패 {fail_count}개 ──")
