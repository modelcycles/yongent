"""MusicBrainz / yt-dlp / 멜론 메타데이터 수집 및 보완."""
from __future__ import annotations
import re
import logging
import requests
from bs4 import BeautifulSoup
import musicbrainzngs

logger = logging.getLogger(__name__)

musicbrainzngs.set_useragent("yongent", "0.1", contact=None)

_MELON_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Referer": "https://www.melon.com",
}


def _fetch_melon(artist: str, title: str) -> dict:
    """멜론 검색 → 곡 상세 페이지에서 전체 메타데이터 수집.

    반환 키: title, artist, album, release_date, year,
             composer, lyricist, lyrics, melon_url, album_image_url
    """
    try:
        query = f"{artist} {title}".strip()
        search_url = (
            "https://www.melon.com/search/song/index.htm"
            f"?q={requests.utils.quote(query)}"
        )
        resp = requests.get(search_url, headers=_MELON_HEADERS, timeout=10)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")

        # song_id 추출 — href/onclick 모두 탐색
        song_id = None
        for row in soup.select("table tbody tr")[:5]:
            for a in row.select("a"):
                text = (a.get("href") or "") + (a.get("onclick") or "")
                m = re.search(r"goSongDetail\('(\d+)'\)", text) or re.search(r"songId=(\d+)", text)
                if m:
                    song_id = m.group(1)
                    break
            if song_id:
                break

        if not song_id:
            logger.warning("[Melon] song_id 찾기 실패. query=%s", query)
            logger.debug("[Melon] 검색 HTML 일부:\n%s", soup.prettify()[:2000])
            return {}

        # 곡 상세 페이지
        detail_url = f"https://www.melon.com/song/detail.htm?songId={song_id}"
        resp2 = requests.get(detail_url, headers=_MELON_HEADERS, timeout=10)
        resp2.encoding = "utf-8"
        soup2 = BeautifulSoup(resp2.text, "html.parser")

        result: dict = {"melon_url": detail_url}

        # 앨범 이미지 URL
        for sel in [".image_typeAll img", ".thumb_album img", ".wrap_thumb img"]:
            el = soup2.select_one(sel)
            if el and el.get("src"):
                result["album_image_url"] = el["src"]
                break

        # 곡명
        for sel in [".song_name", "#d_song_name", "h2.sub_title"]:
            el = soup2.select_one(sel)
            if el:
                result["title"] = el.get_text(strip=True)
                break

        # 아티스트명
        for sel in [".artist_name a", ".artist a", "#d_artist_name a"]:
            el = soup2.select_one(sel)
            if el:
                result["artist"] = el.get_text(strip=True)
                break

        # 앨범명·발매일·작곡가·작사가 (dl.list dt/dd 구조)
        for dl in soup2.select("dl.list"):
            for dt, dd in zip(dl.select("dt"), dl.select("dd")):
                label = dt.get_text(strip=True)
                value = dd.get_text(separator=", ", strip=True)
                if "작곡" in label:
                    result.setdefault("composer", value)
                elif "작사" in label:
                    result.setdefault("lyricist", value)
                elif "앨범" in label:
                    result.setdefault("album", value)
                elif "발매일" in label:
                    result.setdefault("release_date", value)
                    m = re.search(r"(\d{4})", value)
                    if m:
                        result.setdefault("year", m.group(1))

        # 가사 — 정적 파싱
        for sel in ["#d_video_summary", ".lyric_wrap", "#d_song_lyrics", ".wrap_lyric"]:
            el = soup2.select_one(sel)
            if el and el.get_text(strip=True):
                result["lyrics"] = el.get_text(separator="\n", strip=True)
                break

        # 가사 — AJAX 폴백
        if "lyrics" not in result:
            try:
                r3 = requests.get(
                    f"https://www.melon.com/song/lyrics.htm?songId={song_id}",
                    headers=_MELON_HEADERS,
                    timeout=10,
                )
                r3.encoding = "utf-8"
                soup3 = BeautifulSoup(r3.text, "html.parser")
                for sel in ["#d_video_summary", ".lyric_wrap", "#lyric"]:
                    el = soup3.select_one(sel)
                    if el and el.get_text(strip=True):
                        result["lyrics"] = el.get_text(separator="\n", strip=True)
                        break
            except Exception:
                pass

        logger.info("[Melon] 수집 완료: %s", result)
        return result
    except Exception as e:
        logger.exception("[Melon] 예외 발생: %s", e)
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
    """멜론(1순위) + yt-dlp + MusicBrainz 보완 후 최종 메타데이터 dict 반환."""
    # 멜론을 1순위 소스로
    melon = _fetch_melon(
        artist or yt_info.get("artist") or yt_info.get("uploader") or "",
        title or yt_info.get("title") or "",
    )

    base = {
        "title":        melon.get("title") or yt_info.get("title") or title or "확인 필요",
        "artist":       melon.get("artist") or yt_info.get("artist") or yt_info.get("uploader") or artist or "확인 필요",
        "album":        melon.get("album") or yt_info.get("album") or "",
        "release_date": melon.get("release_date") or "",
        "year":         melon.get("year") or str(yt_info.get("release_year") or (yt_info.get("upload_date") or "")[:4] or ""),
        "composer":     melon.get("composer") or yt_info.get("composer") or "확인 필요",
        "lyricist":     melon.get("lyricist") or yt_info.get("lyricist") or "확인 필요",
        "lyrics":       melon.get("lyrics") or "",
        "melon_url":    melon.get("melon_url") or "",
        "album_image_url": melon.get("album_image_url") or "",
        "youtube_url":  yt_info.get("webpage_url") or "",
    }

    # MusicBrainz로 앨범/연도 보완 (멜론에 없을 때만)
    if not base["album"] or not base["year"]:
        mb = _fetch_musicbrainz(base["artist"], base["title"])
        base["album"] = base["album"] or mb.get("album") or "확인 필요"
        base["year"] = base["year"] or mb.get("year") or "확인 필요"

    return base
