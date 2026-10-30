from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str  # "아티스트 - 곡명" 형식


class SearchCandidate(BaseModel):
    song_id: str
    title: str
    artist: str
    album: str
    cover_url: str  # 검색 목록에서는 비어있음 (상세 조회 시 채움)


class SearchListResponse(BaseModel):
    results: list[SearchCandidate]


class DetailRequest(BaseModel):
    song_id: str
    artist: str
    title: str


class YoutubeCandidate(BaseModel):
    video_id: str
    url: str
    title: str
    channel: str
    duration: int  # 초 (알 수 없으면 0)
    thumbnail: str
    score: int  # 적합도 점수 (0 미만 = 자동 선택 기준 탈락)
    duration_diff: int | None = None  # 멜론 곡 길이 대비 차이(초)
    recommended: bool = False


class SearchResponse(BaseModel):
    artist: str
    title: str
    album: str
    release_date: str  # "YYYY.MM.DD"
    cover_url: str
    lyrics: str
    composer: str
    lyricist: str
    youtube_url: str  # 1순위 후보 URL (기본 선택값)
    youtube_candidates: list[YoutubeCandidate] = []


class DownloadRequest(BaseModel):
    query: str | None = None
    url: str | None = None
    youtube_url: str | None = None  # /details에서 이미 찾은 영상 URL (재검색 방지)
    save_dir: str | None = None  # 로컬 저장 경로 (선택)


class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued | running | done | error
    step: str | None = None
    download_url: str | None = None
    sample_download_url: str | None = None  # 60초 샘플 다운로드 URL
    error: str | None = None
