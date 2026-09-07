"""메타데이터 수집 — Melon 스크래핑, Deezer 폴백, Genius 가사."""
from __future__ import annotations

import asyncio
import logging
import os
import re
import unicodedata
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_DEEZER_BASE = "https://api.deezer.com"
_GENIUS_BASE = "https://api.genius.com"
_MELON_BASE = "https://www.melon.com"

GENIUS_ACCESS_TOKEN = os.getenv("GENIUS_ACCESS_TOKEN", "")
if not GENIUS_ACCESS_TOKEN:
    logger.warning(
        "[Genius] GENIUS_ACCESS_TOKEN이 설정되지 않았습니다. 가사 수집이 비활성화됩니다."
    )


# ─── Melon 공통 헤더 ─────────────────────────────────────────────────────────


def _melon_headers() -> dict:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.melon.com",
    }


# ─── 텍스트 정규화 ───────────────────────────────────────────────────────────


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s or "").replace(" ", " ").strip()


# ─── Melon 검색: 다중 후보 ───────────────────────────────────────────────────


async def search_melon_candidates(query: str, limit: int = 5) -> list[dict]:
    """Melon 검색 페이지 파싱 → 상위 N개 후보(가벼운 메타데이터) 반환."""
    headers = _melon_headers()
    try:
        async with httpx.AsyncClient(headers=headers, timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                f"{_MELON_BASE}/search/song/index.htm",
                params={"q": query},
            )
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        logger.exception("[Melon] 검색 요청 실패: %s", e)
        return []

    soup = BeautifulSoup(html, "lxml")
    candidates: list[dict] = []

    for tr in soup.select("table tbody tr"):
        chk = tr.select_one("input[name=input_check]")
        if not chk or not chk.get("value"):
            continue
        song_id = chk["value"]

        cells = tr.select("td.t_left")
        if len(cells) < 3:
            continue
        song_cell, artist_cell, album_cell = cells[0], cells[1], cells[2]

        # 곡명 — 재생 가능 행은 a.fc_gray, 비활성 행은 span[title] (둘 다 title 속성에 깔끔한 곡명)
        title_el = song_cell.select_one("a.fc_gray[title]") or song_cell.select_one(
            "div.ellipsis > span[title]"
        )
        title = title_el.get("title", "").strip() if title_el else ""

        # 아티스트 — #artistName에서 숨김 중복 span 제거 후 텍스트
        artist = ""
        artist_el = artist_cell.select_one("#artistName")
        if artist_el:
            for hidden in artist_el.select(".checkEllipsisSongdefaultList"):
                hidden.decompose()
            artist = artist_el.get_text(strip=True)

        # 앨범 — goAlbumDetail 링크
        album_el = album_cell.select_one("a[href*=goAlbumDetail]")
        album = album_el.get_text(strip=True) if album_el else ""

        candidates.append(
            {
                "song_id": song_id,
                "title": _nfc(title),
                "artist": _nfc(artist),
                "album": _nfc(album),
                "cover_url": "",  # 검색 결과 행에는 썸네일 없음 — 상세 조회 시 채움
            }
        )
        if len(candidates) >= limit:
            break

    return candidates


# ─── Melon 스크래핑 ──────────────────────────────────────────────────────────


async def fetch_melon_metadata(artist: str, title: str) -> dict:
    """Melon 검색 후 첫 후보의 상세 메타데이터 반환 (song_id 미지정 경로)."""
    candidates = await search_melon_candidates(f"{artist} {title}", limit=1)
    if not candidates:
        logger.warning("[Melon] song_id 추출 실패: %s - %s", artist, title)
        return {}
    return await fetch_melon_detail(candidates[0]["song_id"], artist, title)


async def fetch_melon_detail(song_id: str, artist: str, title: str) -> dict:
    """song_id 상세 페이지 스크래핑 → 전체 메타데이터 반환."""
    headers = _melon_headers()

    # ② 상세 페이지
    try:
        async with httpx.AsyncClient(headers=headers, timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                f"{_MELON_BASE}/song/detail.htm",
                params={"songId": song_id},
            )
            resp.raise_for_status()
            detail_html = resp.text
    except Exception as e:
        logger.exception("[Melon] 상세 페이지 요청 실패: %s", e)
        return {}

    soup = BeautifulSoup(detail_html, "lxml")

    # ③ 앨범 커버 (상세 페이지 상단 대표 이미지)
    cover_url = ""
    for selector in [".image_typeAll img", ".thumb_album img", ".wrap_thumb img"]:
        el = soup.select_one(selector)
        if el and el.get("src"):
            cover_url = el["src"]
            break

    # ④ 곡명 — class="none" 숨김 요소(strong/span 모두) 제거 후 텍스트 추출
    song_title = ""
    for selector in [".song_name", "#d_song_name", "h2.sub_title"]:
        el = soup.select_one(selector)
        if el:
            for hidden in el.find_all(class_="none"):
                hidden.decompose()
            text = el.get_text(strip=True)
            if text:
                song_title = text
                break

    # ⑤ 아티스트 — .wrap_info/.section_info 내부의 .artist 우선
    song_artist = ""
    for selector in [".wrap_info .artist", ".section_info .artist",
                     ".wrap_info .artist_name", "#d_artist_name a"]:
        el = soup.select_one(selector)
        if el:
            text = el.get_text(strip=True)
            if text:
                song_artist = text
                break

    # ⑥ 앨범·발매일·재생시간 — dl dt/dd 구조
    album = ""
    release_date = ""
    duration_sec = 0

    for dt in soup.find_all("dt"):
        label = dt.get_text(strip=True)
        dd = dt.find_next_sibling("dd")
        if not dd:
            continue
        value = dd.get_text(strip=True)
        if "앨범" in label:
            album = value
        elif "발매일" in label:
            release_date = _normalize_date(value)
        elif "재생 시간" in label or "재생시간" in label:
            duration_sec = _parse_duration(value)

    # ⑦ 작곡가/작사가 — ul.list_person > li 단위로 이름과 역할 1:1 매핑
    composer_names: list[str] = []
    lyricist_names: list[str] = []

    for li in soup.select("ul.list_person li"):
        name_el = li.select_one(".artist_name")
        role_el = li.select_one("span.type")
        if not name_el or not role_el:
            continue
        name = name_el.get_text(strip=True)
        role = role_el.get_text(strip=True)
        if "작곡" in role and name not in composer_names:
            composer_names.append(name)
        elif "작사" in role and name not in lyricist_names:
            lyricist_names.append(name)

    composer = ", ".join(composer_names)
    lyricist = ", ".join(lyricist_names)

    # ⑦ 가사 (인라인)
    lyrics = ""
    for selector in ["#d_video_summary", ".lyric_wrap", "#d_song_lyrics", ".wrap_lyric"]:
        el = soup.select_one(selector)
        if el:
            for br in el.find_all("br"):
                br.replace_with("\n")
            text = _clean_lyrics(el.get_text())
            if len(text) > 20:
                lyrics = text
                break

    # ⑧ 가사 AJAX 폴백
    if not lyrics and song_id:
        try:
            await asyncio.sleep(0.5)
            async with httpx.AsyncClient(headers=headers, timeout=10, follow_redirects=True) as client:
                resp = await client.get(
                    f"{_MELON_BASE}/song/lyrics.htm",
                    params={"songId": song_id},
                )
                resp.raise_for_status()
                lyrics_soup = BeautifulSoup(resp.text, "lxml")
                for br in lyrics_soup.find_all("br"):
                    br.replace_with("\n")
                raw = _clean_lyrics(lyrics_soup.get_text())
                if len(raw) > 20:
                    lyrics = raw
        except Exception as e:
            logger.warning("[Melon] 가사 AJAX 폴백 실패: %s", e)

    return {
        "artist": song_artist or artist,
        "title": song_title or title,
        "album": album,
        "release_date": release_date,
        "duration_sec": duration_sec,
        "cover_url": cover_url,
        "composer": composer,
        "lyricist": lyricist,
        "lyrics": lyrics,
    }


def _clean_lyrics(raw: str) -> str:
    """줄별 양끝 공백만 정리하고 문단 사이 빈 줄(<br><br>)은 보존한다."""
    lines = [line.strip() for line in raw.split("\n")]
    text = "\n".join(lines).strip()
    # 빈 줄이 3개 이상 연속되면 문단 구분용 1개(빈 줄)로 축소
    return re.sub(r"\n{3,}", "\n\n", text)


def _parse_duration(raw: str) -> int:
    """'04:01' / '1:02:03' 형태의 재생 시간 → 초. 파싱 불가 시 0."""
    parts = re.findall(r"\d+", raw or "")
    if not parts:
        return 0
    nums = [int(p) for p in parts]
    if len(nums) == 2:  # m:ss
        return nums[0] * 60 + nums[1]
    if len(nums) == 3:  # h:mm:ss
        return nums[0] * 3600 + nums[1] * 60 + nums[2]
    return 0


def _normalize_date(raw: str) -> str:
    """발매일 문자열 → YYYY.MM.DD 정규화 (이미 점 구분이면 그대로)."""
    if not raw:
        return ""
    # 이미 YYYY.MM.DD
    if re.match(r"\d{4}\.\d{2}\.\d{2}", raw):
        return raw[:10]
    # YYYY-MM-DD
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", raw)
    if m:
        return f"{m.group(1)}.{m.group(2)}.{m.group(3)}"
    # YYYY.MM
    m = re.match(r"(\d{4})\.(\d{2})", raw)
    if m:
        return f"{m.group(1)}.{m.group(2)}"
    # YYYY년 MM월 DD일 등
    m = re.search(r"(\d{4}).*?(\d{1,2}).*?(\d{1,2})", raw)
    if m:
        return f"{m.group(1)}.{m.group(2).zfill(2)}.{m.group(3).zfill(2)}"
    return raw.strip()


# ─── Deezer 커버 폴백 ────────────────────────────────────────────────────────


async def fetch_deezer_info(artist: str, title: str) -> dict:
    """Deezer 검색 → 첫 트랙의 커버·재생시간 반환. 실패 시 빈 값."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{_DEEZER_BASE}/search",
                params={"q": f"{artist} {title}"},
            )
            resp.raise_for_status()
            items = resp.json().get("data", [])
            if items:
                item = items[0]
                return {
                    "cover": item.get("album", {}).get("cover_xl", ""),
                    "duration": int(item.get("duration") or 0),
                }
    except Exception as e:
        logger.warning("[Deezer] 정보 폴백 실패: %s", e)

    return {"cover": "", "duration": 0}


# ─── Genius: 가사 ────────────────────────────────────────────────────────────

_SCRAPE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}


async def fetch_genius_lyrics(artist: str, title: str) -> Optional[str]:
    """Genius API 검색 → 페이지 스크래핑으로 가사 반환."""
    if not GENIUS_ACCESS_TOKEN:
        return None

    try:
        genius_headers = {
            **_SCRAPE_HEADERS,
            "Authorization": f"Bearer {GENIUS_ACCESS_TOKEN}",
        }
        async with httpx.AsyncClient(headers=genius_headers, timeout=10) as client:
            resp = await client.get(
                f"{_GENIUS_BASE}/search",
                params={"q": f"{artist} {title}"},
            )
            resp.raise_for_status()
            hits = resp.json().get("response", {}).get("hits", [])

        if not hits:
            logger.warning("[Genius] 검색 결과 없음: %s - %s", artist, title)
            return None

        song_url = hits[0].get("result", {}).get("url", "")
        if not song_url:
            return None

        async with httpx.AsyncClient(
            headers=_SCRAPE_HEADERS, timeout=15, follow_redirects=True
        ) as client:
            resp = await client.get(song_url)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        # 최신 Genius 구조: data-lyrics-container="true"
        containers = soup.find_all("div", attrs={"data-lyrics-container": "true"})
        if containers:
            lines = []
            for container in containers:
                for br in container.find_all("br"):
                    br.replace_with("\n")
                lines.append(container.get_text())
            return "\n".join(lines).strip()

        # 폴백: class 이름에 "Lyrics" 포함하는 div
        for div in soup.find_all("div", class_=re.compile(r"Lyrics")):
            for br in div.find_all("br"):
                br.replace_with("\n")
            text = _clean_lyrics(div.get_text())
            if len(text) > 100:
                return text

        logger.warning("[Genius] 가사 파싱 실패: %s", song_url)
        return None

    except Exception as e:
        logger.exception("[Genius] 가사 수집 실패: %s", e)
        return None


# ─── 통합 수집 ───────────────────────────────────────────────────────────────


async def collect_all_metadata(artist: str, title: str, song_id: str | None = None) -> dict:
    """Melon → Genius(폴백) 순으로 메타데이터를 수집하여 병합한 최종 dict 반환."""
    # 1단계: Melon에서 한 번에 모든 메타데이터 수집
    if song_id:
        melon = await fetch_melon_detail(song_id, artist, title)
    else:
        melon = await fetch_melon_metadata(artist, title)

    resolved_artist = melon.get("artist") or artist
    resolved_title = melon.get("title") or title

    # 2단계: 커버·재생시간 중 하나라도 비면 Deezer 1회 폴백
    cover_url = melon.get("cover_url", "")
    duration_sec = melon.get("duration_sec", 0)
    if not cover_url or not duration_sec:
        deezer = await fetch_deezer_info(resolved_artist, resolved_title)
        cover_url = cover_url or deezer["cover"]
        duration_sec = duration_sec or deezer["duration"]

    # 3단계: 가사가 없을 때만 Genius 폴백
    lyrics = melon.get("lyrics", "")
    if not lyrics:
        lyrics = (
            await fetch_genius_lyrics(resolved_artist, resolved_title)
            or "가사를 찾을 수 없습니다"
        )

    return {
        "artist": _nfc(resolved_artist),
        "title": _nfc(resolved_title),
        "album": _nfc(melon.get("album", "")),
        "release_date": melon.get("release_date", ""),
        "duration_sec": duration_sec,
        "cover_url": cover_url,
        "lyrics": _nfc(lyrics),
        "composer": _nfc(melon.get("composer") or "정보 없음"),
        "lyricist": _nfc(melon.get("lyricist") or "정보 없음"),
    }
