"""MusicBrainz / yt-dlp / 멜론 메타데이터 수집 및 보완."""
from __future__ import annotations
import re
import requests
from bs4 import BeautifulSoup
import musicbrainzngs

musicbrainzngs.set_useragent("yongent", "0.1", contact=None)

_MELON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.melon.com",
}


def _fetch_melon(artist: str, title: str) -> dict:
    """멜론 검색 → 곡 상세 페이지에서 작곡가, 작사가, 가사 수집."""
    try:
        query = f"{artist} {title}".strip()
        search_url = (
            "https://www.melon.com/search/song/index.htm"
            f"?q={requests.utils.quote(query)}"
        )
        resp = requests.get(search_url, headers=_MELON_HEADERS, timeout=10)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        # 첫 번째 검색 결과에서 song_id 추출
        song_id = None
        for row in soup.select("table tbody tr")[:5]:
            a_tag = row.select_one(".ellipsis.rank01 a") or row.select_one("td.t_left a")
            if not a_tag:
                continue
            href = a_tag.get("href", "")
            m = re.search(r"goSongDetail\('(\d+)'\)", href) or re.search(r"songId=(\d+)", href)
            if m:
                song_id = m.group(1)
                break

        if not song_id:
            return {}

        # 곡 상세 페이지
        detail_url = f"https://www.melon.com/song/detail.htm?songId={song_id}"
        resp2 = requests.get(detail_url, headers=_MELON_HEADERS, timeout=10)
        resp2.encoding = "utf-8"
        soup2 = BeautifulSoup(resp2.text, "html.parser")

        result: dict = {}

        # 작곡가, 작사가 파싱 (dl.list dt/dd 구조)
        for dl in soup2.select("dl.list"):
            dts = dl.select("dt")
            dds = dl.select("dd")
            for dt, dd in zip(dts, dds):
                label = dt.get_text(strip=True)
                value = dd.get_text(separator=", ", strip=True)
                if "작곡" in label and "composer" not in result:
                    result["composer"] = value
                elif "작사" in label and "lyricist" not in result:
                    result["lyricist"] = value

        # 가사 파싱
        lyrics_div = soup2.select_one("#d_video_summary") or soup2.select_one(".lyric_wrap")
        if lyrics_div:
            result["lyrics"] = lyrics_div.get_text(separator="\n", strip=True)

        return result
    except Exception:
        return {}


def _fetch_musicbrainz(artist: str, title: str) -> dict:
    try:
        result = musicbrainzngs.search_recordings(
            recording=title, artist=artist, limit=1
        )
        recordings = result.get("recording-list", [])
        if not recordings:
            return {}
        rec = recordings[0]
        release = (rec.get("release-list") or [{}])[0]
        return {
            "album": release.get("title", ""),
            "year": (release.get("date", "") or "")[:4],
        }
    except Exception:
        return {}


def merge_metadata(yt_info: dict, artist: str = "", title: str = "") -> dict:
    """yt-dlp info + 멜론 + MusicBrainz 보완 후 최종 메타데이터 dict 반환."""
    base = {
        "title": yt_info.get("title") or title or "확인 필요",
        "artist": yt_info.get("artist") or yt_info.get("uploader") or artist or "확인 필요",
        "album": yt_info.get("album") or "",
        "year": str(yt_info.get("release_year") or (yt_info.get("upload_date") or "")[:4] or ""),
        "composer": yt_info.get("composer") or "",
        "lyricist": yt_info.get("lyricist") or "",
        "lyrics": "",
        "youtube_url": yt_info.get("webpage_url") or "",
    }

    # 멜론에서 작곡가, 작사가, 가사 보완
    if artist or title:
        melon = _fetch_melon(artist or base["artist"], title or base["title"])
        base["composer"] = base["composer"] or melon.get("composer") or "확인 필요"
        base["lyricist"] = base["lyricist"] or melon.get("lyricist") or "확인 필요"
        base["lyrics"] = melon.get("lyrics") or ""
    else:
        base["composer"] = base["composer"] or "확인 필요"
        base["lyricist"] = base["lyricist"] or "확인 필요"

    # MusicBrainz로 앨범/연도 보완
    if not base["album"] or not base["year"]:
        mb = _fetch_musicbrainz(base["artist"], base["title"])
        base["album"] = base["album"] or mb.get("album") or "확인 필요"
        base["year"] = base["year"] or mb.get("year") or "확인 필요"

    return base
