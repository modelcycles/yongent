from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str  # "아티스트 - 곡명" 형식


class SearchResponse(BaseModel):
    artist: str
    title: str
    album: str
    release_date: str  # "YYYY.MM.DD"
    cover_url: str
    lyrics: str
    composer: str
    lyricist: str
    youtube_url: str


class DownloadRequest(BaseModel):
    query: str | None = None
    url: str | None = None
    save_dir: str | None = None  # 로컬 저장 경로 (선택)


class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued | running | done | error
    step: str | None = None
    download_url: str | None = None
    sample_download_url: str | None = None  # 60초 샘플 다운로드 URL
    error: str | None = None
