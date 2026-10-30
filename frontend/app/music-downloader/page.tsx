"use client";

import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8001";

interface SearchResult {
  artist: string;
  title: string;
  album: string;
  release_date: string;
  cover_url: string;
  lyrics: string;
  composer: string;
  lyricist: string;
  youtube_url: string;
  youtube_candidates: YoutubeCandidate[];
}

interface YoutubeCandidate {
  video_id: string;
  url: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
  score: number;
  duration_diff: number | null;
  recommended: boolean;
}

interface SearchCandidate {
  song_id: string;
  title: string;
  artist: string;
  album: string;
  cover_url: string;
}

type SearchStatus = "idle" | "loading" | "list" | "done" | "url" | "error";
type DownloadStatus = "idle" | "queued" | "running" | "done" | "error";

function formatDateShort(dateStr: string): string {
  const parts = dateStr.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return parts[0] || "";
}

function formatDuration(sec: number): string {
  if (!sec) return "--:--";
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

/** YouTube URL → 11자리 video id. 인식 불가 시 null. */
function extractVideoId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ─── 유튜브 영상 선택 섹션 ─────────────────────────────────────────────────

interface YoutubePickerProps {
  candidates: YoutubeCandidate[];
  selectedId: string | null;
  setSelectedId: (id: string) => void;
  useCustom: boolean;
  setUseCustom: (v: boolean) => void;
  customUrl: string;
  setCustomUrl: (v: string) => void;
  disabled: boolean;
}

function YoutubePicker({
  candidates,
  selectedId,
  setSelectedId,
  useCustom,
  setUseCustom,
  customUrl,
  setCustomUrl,
  disabled,
}: YoutubePickerProps) {
  const customId = extractVideoId(customUrl);
  const previewId = useCustom ? customId : selectedId;
  const customInvalid = useCustom && customUrl.trim() !== "" && !customId;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">▶ 유튜브 영상 선택</p>

      {candidates.length === 0 && (
        <p className="text-sm text-yellow-500 light:text-yellow-600">
          유튜브 검색 결과가 없습니다 — 아래에 링크를 직접 입력하세요.
        </p>
      )}

      {candidates.length > 0 && (
        <ul className="max-h-80 overflow-y-auto rounded-lg border border-gray-800 light:border-gray-200">
          {candidates.map((c) => {
            const checked = !useCustom && selectedId === c.video_id;
            return (
              <li key={c.video_id}>
                <label
                  className={`flex items-center gap-3 px-3 py-2 border-b border-gray-800 light:border-gray-200 last:border-b-0 cursor-pointer transition-colors ${
                    checked
                      ? "bg-indigo-950 light:bg-indigo-50"
                      : "hover:bg-gray-800 light:hover:bg-gray-50"
                  } ${c.score < 0 && !checked ? "opacity-50" : ""}`}
                >
                  <input
                    type="radio"
                    name="youtube-video"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => {
                      setUseCustom(false);
                      setSelectedId(c.video_id);
                    }}
                    className="shrink-0 accent-indigo-500"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.thumbnail}
                    alt=""
                    className="w-20 aspect-video rounded object-cover shrink-0 bg-gray-800 light:bg-gray-100"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-200 light:text-gray-800 truncate" title={c.title}>
                      {c.recommended && (
                        <span className="mr-1.5 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white align-middle">
                          추천
                        </span>
                      )}
                      {c.title}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {c.channel} · {formatDuration(c.duration)}
                      {c.duration_diff !== null && (
                        <span
                          className={
                            Math.abs(c.duration_diff) <= 5
                              ? "text-green-500 light:text-green-600"
                              : ""
                          }
                        >
                          {" "}
                          (멜론 대비 {c.duration_diff > 0 ? "+" : c.duration_diff < 0 ? "−" : "±"}
                          {Math.abs(c.duration_diff)}초)
                        </span>
                      )}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* 직접 입력 */}
      <div className="flex items-center gap-3">
        <input
          type="radio"
          name="youtube-video"
          checked={useCustom}
          disabled={disabled}
          onChange={() => setUseCustom(true)}
          className="shrink-0 accent-indigo-500"
          aria-label="링크 직접 입력"
        />
        <input
          type="text"
          placeholder="목록에 없으면 유튜브 링크 직접 입력 (https://youtu.be/...)"
          value={customUrl}
          disabled={disabled}
          autoFocus={candidates.length === 0}
          onFocus={() => setUseCustom(true)}
          onChange={(e) => {
            setUseCustom(true);
            setCustomUrl(e.target.value);
          }}
          className={`flex-1 min-w-0 rounded-lg bg-gray-800 border light:bg-gray-100 px-3 py-2 text-sm placeholder-gray-600 light:placeholder-gray-400 focus:outline-none font-mono ${
            customInvalid
              ? "border-red-600 light:border-red-400"
              : "border-gray-700 light:border-gray-300 focus:border-gray-500"
          }`}
        />
      </div>
      {customInvalid && (
        <p className="text-xs text-red-400 light:text-red-600">올바른 유튜브 링크가 아닙니다.</p>
      )}

      {/* 미리듣기 */}
      {previewId && (
        <div className="space-y-1">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              key={previewId}
              src={`https://www.youtube.com/embed/${previewId}`}
              title="미리듣기"
              allow="encrypted-media; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
          <p className="text-xs text-gray-500">
            재생이 막힌 영상은{" "}
            <a
              href={`https://www.youtube.com/watch?v=${previewId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 hover:underline"
            >
              유튜브에서 열기 ↗
            </a>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── 다운로드 버튼 섹션 ────────────────────────────────────────────────────

interface DownloadSectionProps {
  status: DownloadStatus;
  step: string;
  error: string;
  savePath: string;
  setSavePath: (v: string) => void;
  onDownload: (kind: "full" | "sample") => void;
  onSampleDownload: (() => void) | null;
  disabled?: boolean;
}

function DownloadSection({
  status,
  step,
  error,
  savePath,
  setSavePath,
  onDownload,
  onSampleDownload,
  disabled = false,
}: DownloadSectionProps) {
  if (status === "queued" || status === "running") {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-300 light:text-gray-700">
        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
        {step || "처리 중…"}
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="space-y-2">
        <span className="text-sm text-green-400 light:text-green-600">다운로드 완료</span>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => onDownload("full")}
            className="rounded-lg bg-gray-800 hover:bg-gray-700 light:bg-gray-100 light:hover:bg-gray-200 px-4 py-2 text-sm font-medium transition-colors"
          >
            원본 다시 받기
          </button>
          {onSampleDownload && (
            <button
              onClick={onSampleDownload}
              className="rounded-lg bg-gray-800 hover:bg-gray-700 light:bg-gray-100 light:hover:bg-gray-200 px-4 py-2 text-sm font-medium transition-colors"
            >
              60초 샘플 다시 받기
            </button>
          )}
        </div>
      </div>
    );
  }
  // 오류 시에도 입력 폼을 그대로 보여줘 저장 경로를 고쳐 다시 시도할 수 있게 함
  return (
    <div className="space-y-3">
      {status === "error" && (
        <p className="text-sm text-red-400 light:text-red-600 break-all">
          {error}
        </p>
      )}
      <div>
        <label className="text-xs text-gray-500 block mb-1">저장 폴더 경로</label>
        <input
          type="text"
          placeholder="예: /Users/이름/Music  (비워두면 브라우저 다운로드만)"
          value={savePath}
          onChange={(e) => setSavePath(e.target.value)}
          className="w-full rounded-lg bg-gray-800 border border-gray-700 light:bg-gray-100 light:border-gray-300 px-3 py-2 text-sm placeholder-gray-600 light:placeholder-gray-400 focus:outline-none focus:border-gray-500 font-mono"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onDownload("full")}
          disabled={disabled}
          className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          ⬇ 원본 다운로드
        </button>
        <button
          onClick={() => onDownload("sample")}
          disabled={disabled}
          className="flex-1 rounded-lg bg-gray-800 hover:bg-gray-700 light:bg-gray-100 light:hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold transition-colors"
        >
          ⬇ 60초 샘플 다운로드
        </button>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────

export default function MusicDownloaderPage() {
  // 입력
  const [query, setQuery] = useState("");

  // 검색
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] = useState<SearchCandidate[]>([]);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [cardVisible, setCardVisible] = useState(false);

  // 결과 카드 UI
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [copied1, setCopied1] = useState(false);
  const [copied2, setCopied2] = useState(false);
  const [copiedArtist, setCopiedArtist] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [copiedAlbum, setCopiedAlbum] = useState(false);
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [copiedComposer, setCopiedComposer] = useState(false);
  const [copiedLyricist, setCopiedLyricist] = useState(false);

  // 유튜브 영상 선택
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [customUrl, setCustomUrl] = useState("");

  // 다운로드
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [downloadStep, setDownloadStep] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [savePath, setSavePath] = useState("");
  const [sampleDownloadUrl, setSampleDownloadUrl] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchResultRef = useRef<SearchResult | null>(null);
  const downloadKindRef = useRef<"full" | "sample">("full");

  // 쿠키
  const [cookieActive, setCookieActive] = useState<boolean | null>(null);
  const [cookiePath, setCookiePath] = useState("");
  const [cookieGuideOpen, setCookieGuideOpen] = useState(false);
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieDragOver, setCookieDragOver] = useState(false);
  const [cookieError, setCookieError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 마운트 시 쿠키 상태 확인
  useEffect(() => {
    fetch(`${API}/music-downloader/cookies/status`)
      .then((r) => r.json())
      .then((d) => {
        setCookieActive(d.active);
        if (d.path) setCookiePath(d.path);
      })
      .catch(() => setCookieActive(false));
  }, []);

  // searchResult → ref 동기화 (폴링 클로저에서 최신값 참조)
  useEffect(() => {
    searchResultRef.current = searchResult;
  }, [searchResult]);

  // 카드 fade-in
  useEffect(() => {
    if (searchStatus === "done" || searchStatus === "url") {
      setCardVisible(false);
      const t = setTimeout(() => setCardVisible(true), 50);
      return () => clearTimeout(t);
    }
  }, [searchStatus]);

  // 다운로드 폴링
  useEffect(() => {
    if (
      !jobId ||
      downloadStatus === "done" ||
      downloadStatus === "error" ||
      downloadStatus === "idle"
    ) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/music-downloader/status/${jobId}`);
        const data = await res.json();
        setDownloadStep(data.step || "");

        if (data.status === "done") {
          clearInterval(pollRef.current!);
          setDownloadStatus("done");
          setSampleDownloadUrl(data.sample_download_url || null);
          if (downloadKindRef.current === "sample") {
            if (data.sample_download_url) {
              triggerBrowserDownload(`${API}${data.sample_download_url}`, true);
            }
          } else {
            triggerBrowserDownload(`${API}${data.download_url}`, false);
          }
        } else if (data.status === "error") {
          clearInterval(pollRef.current!);
          setDownloadStatus("error");
          setDownloadError(data.error || "다운로드 실패");
        } else {
          setDownloadStatus(data.status);
        }
      } catch {
        // 네트워크 오류 무시
      }
    }, 1500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, downloadStatus]);

  async function triggerBrowserDownload(url: string, isSample: boolean) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      const result = searchResultRef.current;
      if (result) {
        const artist = result.artist;
        const title = result.title;
        a.download = isSample ? `s${artist}-${title}.mp3` : `${artist}-${title}.mp3`;
      } else {
        a.download = isSample ? "audio_sample.mp3" : "audio.mp3";
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      setDownloadError("파일 다운로드에 실패했습니다");
    }
  }

  // ─── 쿠키 관리 ──────────────────────────────────────────────────────────

  async function uploadCookieFile(file: File) {
    setCookieUploading(true);
    setCookieError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/music-downloader/cookies`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setCookieError(data.detail ?? "업로드 실패");
        return;
      }
      setCookieActive(true);
      setCookiePath(data.path ?? "");
      setCookieGuideOpen(false);
    } catch {
      setCookieError("서버에 연결할 수 없습니다.");
    } finally {
      setCookieUploading(false);
    }
  }

  async function deleteCookies() {
    await fetch(`${API}/music-downloader/cookies`, { method: "DELETE" });
    setCookieActive(false);
  }

  // ─── 검색 ───────────────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setSearchResult(null);
    setSearchResults([]);
    setSearchError("");
    setDownloadStatus("idle");
    setSampleDownloadUrl(null);
    setLyricsOpen(false);
    resetVideoPick();

    // URL 직접 입력
    if (q.startsWith("http")) {
      setSearchStatus("url");
      return;
    }

    // 쿼리 검색 → 후보 목록
    setSearchStatus("loading");
    try {
      const res = await fetch(`${API}/music-downloader/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "검색 실패");
      const results: SearchCandidate[] = data.results ?? [];
      if (results.length === 0) {
        setSearchError("검색 결과가 없습니다. 다른 검색어로 시도해보세요.");
        setSearchStatus("error");
        return;
      }
      setSearchResults(results);
      setSearchStatus("list");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "알 수 없는 오류");
      setSearchStatus("error");
    }
  }

  // ─── 후보 선택 → 상세 조회 ────────────────────────────────────────────────

  async function handleSelect(candidate: SearchCandidate) {
    setDetailLoading(true);
    setSearchError("");
    setDownloadStatus("idle");
    setSampleDownloadUrl(null);
    setLyricsOpen(false);
    try {
      const res = await fetch(`${API}/music-downloader/details`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song_id: candidate.song_id,
          artist: candidate.artist,
          title: candidate.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "상세 정보 조회 실패");
      const candidates: YoutubeCandidate[] = data.youtube_candidates ?? [];
      // 적합도 1위 자동 선택, 후보가 없으면 링크 직접 입력 모드
      setSelectedVideoId(candidates[0]?.video_id ?? null);
      setUseCustomUrl(candidates.length === 0);
      setCustomUrl("");
      setSearchResult(data);
      setSearchStatus("done");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "알 수 없는 오류");
      setSearchStatus("error");
    } finally {
      setDetailLoading(false);
    }
  }

  function backToList() {
    setSearchResult(null);
    setDownloadStatus("idle");
    setSampleDownloadUrl(null);
    setLyricsOpen(false);
    resetVideoPick();
    setSearchStatus("list");
  }

  function resetVideoPick() {
    setSelectedVideoId(null);
    setUseCustomUrl(false);
    setCustomUrl("");
  }

  /** 현재 선택된 영상 URL (직접 입력 링크가 올바르지 않으면 null). */
  function selectedVideoUrl(): string | null {
    const id = useCustomUrl ? extractVideoId(customUrl) : selectedVideoId;
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }

  // ─── 다운로드 시작 ──────────────────────────────────────────────────────

  async function handleDownload(kind: "full" | "sample") {
    // 저장 경로에 URL을 넣는 실수는 서버에 보내기 전에 바로 알려줌
    if (/^\s*[a-z][a-z0-9+.-]*:\/\//i.test(savePath)) {
      setDownloadStatus("error");
      setDownloadError("저장 폴더 경로에 URL이 입력되었습니다. 폴더 경로(예: C:\\Users\\이름\\Music)를 입력해주세요.");
      return;
    }

    downloadKindRef.current = kind;
    setDownloadStatus("queued");
    setDownloadStep("대기 중");
    setDownloadError("");
    setJobId(null);

    try {
      const q = query.trim();
      const isUrl = q.startsWith("http");
      const saveDir = savePath.trim() || null;
      // 다운로드는 입력창 원본이 아니라 "선택한 곡" 기준으로 진행
      const body = isUrl
        ? { url: q, save_dir: saveDir }
        : {
            query: searchResult
              ? `${searchResult.artist} - ${searchResult.title}`
              : q,
            // 사용자가 고른 영상 (백엔드 재검색 방지)
            youtube_url: selectedVideoUrl(),
            save_dir: saveDir,
          };

      const res = await fetch(`${API}/music-downloader/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "서버 오류");
      setJobId(data.job_id);
    } catch (err) {
      setDownloadStatus("error");
      setDownloadError(err instanceof Error ? err.message : "알 수 없는 오류");
    }
  }

  // ─── 복사 ───────────────────────────────────────────────────────────────

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isSearching = searchStatus === "loading";
  const showCard = searchStatus === "done" || searchStatus === "url";

  return (
    <div className="max-w-2xl">
      {/* 헤더 */}
      <h1 className="text-2xl font-bold mb-1">Music Downloader</h1>
      <p className="text-gray-400 light:text-gray-600 text-sm mb-6">
        아티스트명 - 곡명을 입력하면 곡 정보와 음원을 가져옵니다.
      </p>

      {/* YouTube 연결 패널 */}
      <div className="rounded-lg border border-gray-700 bg-gray-900 light:border-gray-200 light:bg-white mb-6 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm font-medium text-gray-200 light:text-gray-800">YouTube 연결</span>
          {cookieActive === null ? (
            <span className="text-xs text-gray-500">확인 중…</span>
          ) : cookieActive ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-green-400 light:text-green-600">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                연결됨
              </span>
              {cookiePath && (
                <span
                  className="text-xs text-gray-600 light:text-gray-400 font-mono truncate max-w-[200px]"
                  title={cookiePath}
                >
                  {cookiePath.split(/[/\\]/).slice(-3).join("/")}
                </span>
              )}
              <button
                onClick={deleteCookies}
                className="ml-auto text-xs text-gray-500 hover:text-red-400 transition-colors"
              >
                해제
              </button>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-xs text-yellow-500 light:text-yellow-600">
                <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
                미연결
              </span>
              <button
                onClick={() => setCookieGuideOpen((v) => !v)}
                className="ml-auto text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {cookieGuideOpen ? "닫기 ▲" : "설정하기 ▼"}
              </button>
            </>
          )}
        </div>

        {!cookieActive && cookieGuideOpen && (
          <div className="border-t border-gray-700 light:border-gray-200 px-4 py-4 space-y-4">
            <ol className="space-y-3 text-sm">
              {[
                <>
                  <span className="text-white light:text-gray-900 font-medium">YouTube에 로그인</span>하세요.
                  <br />
                  <span className="text-gray-500 text-xs">Chrome / Edge / Firefox 아무거나 OK</span>
                </>,
                <>
                  <span className="text-white light:text-gray-900 font-medium">확장 프로그램을 설치</span>하세요.
                  <br />
                  <a
                    href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Chrome / Edge → Get cookies.txt LOCALLY
                  </a>
                  <br />
                  <a
                    href="https://addons.mozilla.org/ko/firefox/addon/cookies-txt/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Firefox → cookies.txt for yt-dlp
                  </a>
                </>,
                <>
                  <span className="text-white light:text-gray-900 font-medium">youtube.com</span>에서 확장 아이콘을
                  클릭하고 <span className="text-white light:text-gray-900 font-medium">Export</span>를 누르면{" "}
                  <code className="text-xs bg-gray-800 light:bg-gray-200 px-1 rounded">cookies.txt</code> 파일이
                  저장됩니다.
                </>,
                <>저장된 파일을 아래에 업로드하세요.</>,
              ].map((content, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  <span className="text-gray-300 light:text-gray-700">{content}</span>
                </li>
              ))}
            </ol>

            {cookieError && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-800 light:text-red-600 light:bg-red-50 light:border-red-200 rounded px-3 py-2">
                {cookieError}
              </p>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setCookieDragOver(true);
              }}
              onDragLeave={() => setCookieDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setCookieDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) uploadCookieFile(file);
              }}
              className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                cookieDragOver
                  ? "border-indigo-400 bg-indigo-950 light:bg-indigo-50"
                  : "border-gray-600 hover:border-gray-500 light:border-gray-300 light:hover:border-gray-400"
              }`}
            >
              {cookieUploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400 light:text-gray-600">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  업로드 중…
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-300 light:text-gray-700">
                    <span className="text-indigo-400 font-medium">cookies.txt</span> 파일을 여기에
                    끌어다 놓거나
                  </p>
                  <p className="text-xs text-gray-500 mt-1">클릭해서 선택</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadCookieFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}
      </div>

      {/* 검색 입력 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          className="flex-1 rounded-lg bg-gray-800 border border-gray-700 light:bg-gray-100 light:border-gray-300 px-4 py-2 text-sm placeholder-gray-500 light:placeholder-gray-400 focus:outline-none focus:border-gray-500"
          placeholder="예: 아이유 - 좋은날  또는  https://youtu.be/..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          disabled={isSearching}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium transition-colors"
        >
          {isSearching ? "검색 중…" : "검색"}
        </button>
      </form>

      {/* 검색 중 스피너 */}
      {isSearching && (
        <div className="flex items-center gap-3 text-sm text-gray-400 light:text-gray-600 mb-4">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
          곡 정보 수집 중…
        </div>
      )}

      {/* 검색 오류 */}
      {searchStatus === "error" && (
        <div className="rounded-lg bg-red-950 border border-red-800 light:bg-red-50 light:border-red-200 p-4 text-sm text-red-300 light:text-red-700 mb-4">
          {searchError}
        </div>
      )}

      {/* 검색 결과 목록 */}
      {searchStatus === "list" && (
        <div className="rounded-xl border border-gray-700 bg-gray-900 light:border-gray-200 light:bg-white overflow-hidden mb-4">
          <p className="px-4 py-3 text-xs text-gray-500 border-b border-gray-800 light:border-gray-200">
            검색 결과 {searchResults.length}건 — 곡을 선택하세요
          </p>
          <ul>
            {searchResults.map((c) => (
              <li key={c.song_id}>
                <button
                  onClick={() => handleSelect(c)}
                  disabled={detailLoading}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-800 light:border-gray-200 last:border-b-0 hover:bg-gray-800 light:hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <div className="w-11 h-11 rounded-md bg-gray-800 light:bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-xl text-gray-600 light:text-gray-400">♪</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-200 light:text-gray-800 truncate">{c.title}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {c.artist} · {c.album || "—"}
                    </p>
                  </div>
                  <span className="text-xs text-gray-600 light:text-gray-400 shrink-0">선택 →</span>
                </button>
              </li>
            ))}
          </ul>
          {detailLoading && (
            <div className="flex items-center gap-3 px-4 py-3 text-sm text-gray-400 light:text-gray-600 border-t border-gray-800 light:border-gray-200">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
              곡 정보 수집 중…
            </div>
          )}
        </div>
      )}

      {/* 결과 카드 */}
      {showCard && (
        <div
          className="rounded-xl border border-gray-700 bg-gray-900 light:border-gray-200 light:bg-white overflow-hidden transition-opacity duration-300"
          style={{ opacity: cardVisible ? 1 : 0 }}
        >
          {/* URL 모드 */}
          {searchStatus === "url" && (
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">YouTube URL</p>
                <p className="text-sm font-mono text-indigo-300 light:text-indigo-600 break-all">{query}</p>
              </div>
              <DownloadSection
                status={downloadStatus}
                step={downloadStep}
                error={downloadError}
                savePath={savePath}
                setSavePath={setSavePath}
                onDownload={handleDownload}
                onSampleDownload={
                  sampleDownloadUrl
                    ? () => triggerBrowserDownload(`${API}${sampleDownloadUrl}`, true)
                    : null
                }
              />
            </div>
          )}

          {/* 검색 결과 카드 */}
          {searchStatus === "done" && searchResult && (
            <>
              {/* 목록으로 */}
              <button
                onClick={backToList}
                className="px-5 py-3 text-xs text-gray-400 hover:text-gray-200 light:text-gray-600 light:hover:text-gray-900 border-b border-gray-800 light:border-gray-200 w-full text-left transition-colors"
              >
                ← 검색 결과로 돌아가기
              </button>

              {/* 상단: 커버 + 기본 정보 */}
              <div className="flex gap-4 p-5">
                {searchResult.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={searchResult.cover_url}
                    alt="앨범 커버"
                    className="w-24 h-24 rounded-lg shadow-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-lg bg-gray-800 light:bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-3xl text-gray-600 light:text-gray-400">♪</span>
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <p className="font-bold text-lg leading-tight">{searchResult.artist}</p>
                  <p className="text-gray-200 light:text-gray-800 text-base leading-tight">{searchResult.title}</p>
                  <p className="text-gray-500 text-xs">앨범: {searchResult.album || "—"}</p>
                  <p className="text-gray-500 text-xs">발매일: {searchResult.release_date || "—"}</p>
                  <p className="text-gray-500 text-xs">작곡: {searchResult.composer}</p>
                  <p className="text-gray-500 text-xs">작사: {searchResult.lyricist}</p>
                </div>
              </div>

              <div className="border-t border-gray-800 light:border-gray-200" />

              {/* 복사 1 */}
              <div className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">📋 곡 정보</p>
                  <p className="text-sm text-gray-300 light:text-gray-700 truncate">
                    {searchResult.artist}의 &apos;{searchResult.album}&apos; (
                    {formatDateShort(searchResult.release_date)}) 수록곡
                  </p>
                </div>
                <button
                  onClick={() =>
                    copyText(
                      `${searchResult.artist}의 '${searchResult.album}' (${formatDateShort(searchResult.release_date)}) 수록곡`,
                      setCopied1
                    )
                  }
                  className="shrink-0 rounded bg-gray-800 hover:bg-gray-700 light:bg-gray-100 light:hover:bg-gray-200 px-3 py-1.5 text-xs font-medium transition-colors min-w-[62px] text-center"
                >
                  {copied1 ? "복사됨 ✓" : "복사"}
                </button>
              </div>

              <div className="border-t border-gray-800 light:border-gray-200" />

              {/* 복사 2 */}
              <div className="flex items-start justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">📋 제작 정보</p>
                  <p className="text-sm text-gray-300 light:text-gray-700 whitespace-pre-line leading-relaxed">
                    {`${searchResult.lyricist} 작사\n${searchResult.composer} 작곡\n${searchResult.artist} 노래`}
                  </p>
                </div>
                <button
                  onClick={() =>
                    copyText(
                      `${searchResult.lyricist} 작사\n${searchResult.composer} 작곡\n${searchResult.artist} 노래`,
                      setCopied2
                    )
                  }
                  className="shrink-0 rounded bg-gray-800 hover:bg-gray-700 light:bg-gray-100 light:hover:bg-gray-200 px-3 py-1.5 text-xs font-medium transition-colors min-w-[62px] text-center"
                >
                  {copied2 ? "복사됨 ✓" : "복사"}
                </button>
              </div>

              <div className="border-t border-gray-800 light:border-gray-200" />

              {/* 메타데이터 복사 */}
              <div className="px-5 py-3">
                <p className="text-xs text-gray-500 mb-2">🏷 메타데이터</p>
                <div className="space-y-1.5">
                  {(
                    [
                      { label: "아티스트명", value: searchResult.artist, copied: copiedArtist, setCopied: setCopiedArtist },
                      { label: "앨범명", value: searchResult.album, copied: copiedAlbum, setCopied: setCopiedAlbum },
                      { label: "곡명", value: searchResult.title, copied: copiedTitle, setCopied: setCopiedTitle },
                      { label: "작사가", value: searchResult.lyricist, copied: copiedLyricist, setCopied: setCopiedLyricist },
                      { label: "작곡가", value: searchResult.composer, copied: copiedComposer, setCopied: setCopiedComposer },
                    ] as { label: string; value: string; copied: boolean; setCopied: (v: boolean) => void }[]
                  ).map(({ label, value, copied, setCopied }) => (
                    <div key={label} className="flex items-center gap-3 py-0.5">
                      <span className="text-xs text-gray-600 light:text-gray-500 w-16 shrink-0">{label}</span>
                      <span className="text-sm text-gray-300 light:text-gray-700 flex-1 truncate min-w-0">{value || "—"}</span>
                      <button
                        onClick={() => value && copyText(value, setCopied)}
                        disabled={!value}
                        className="shrink-0 rounded bg-gray-800 hover:bg-gray-700 light:bg-gray-100 light:hover:bg-gray-200 disabled:opacity-40 px-2.5 py-1 text-xs font-medium transition-colors min-w-[52px] text-center"
                      >
                        {copied ? "복사됨 ✓" : "복사"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-800 light:border-gray-200" />

              {/* 가사 */}
              <div className="px-5 py-3">
                <div className="flex items-center justify-between w-full">
                  <button
                    onClick={() => setLyricsOpen((v) => !v)}
                    className="flex items-center gap-2 text-left"
                  >
                    <span className="text-sm text-gray-400 light:text-gray-600">🎵 가사</span>
                    <span className="text-xs text-gray-500">{lyricsOpen ? "접기 ▲" : "펼치기 ▼"}</span>
                  </button>
                  <button
                    onClick={() => searchResult.lyrics && copyText(searchResult.lyrics, setCopiedLyrics)}
                    disabled={!searchResult.lyrics}
                    className="shrink-0 rounded bg-gray-800 hover:bg-gray-700 light:bg-gray-100 light:hover:bg-gray-200 disabled:opacity-40 px-2.5 py-1 text-xs font-medium transition-colors min-w-[52px] text-center"
                  >
                    {copiedLyrics ? "복사됨 ✓" : "복사"}
                  </button>
                </div>
                {lyricsOpen && (
                  <div className="mt-3 max-h-64 overflow-y-auto pr-1 text-sm text-gray-300 light:text-gray-700 whitespace-pre-line leading-relaxed">
                    {searchResult.lyrics}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800 light:border-gray-200" />

              {/* 유튜브 영상 선택 */}
              <div className="px-5 py-4">
                <YoutubePicker
                  candidates={searchResult.youtube_candidates ?? []}
                  selectedId={selectedVideoId}
                  setSelectedId={setSelectedVideoId}
                  useCustom={useCustomUrl}
                  setUseCustom={setUseCustomUrl}
                  customUrl={customUrl}
                  setCustomUrl={setCustomUrl}
                  disabled={downloadStatus === "queued" || downloadStatus === "running"}
                />
              </div>

              <div className="border-t border-gray-800 light:border-gray-200" />

              {/* 다운로드 */}
              <div className="px-5 py-4">
                <DownloadSection
                  disabled={!selectedVideoUrl()}
                  status={downloadStatus}
                  step={downloadStep}
                  error={downloadError}
                  savePath={savePath}
                  setSavePath={setSavePath}
                  onDownload={handleDownload}
                  onSampleDownload={
                    sampleDownloadUrl
                      ? () => triggerBrowserDownload(`${API}${sampleDownloadUrl}`, true)
                      : null
                  }
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
