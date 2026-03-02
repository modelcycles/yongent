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


class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # queued | running | done | error
    step: str | None = None
    download_url: str | None = None
    error: str | None = None
