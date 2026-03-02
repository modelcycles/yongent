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
}

type SearchStatus = "idle" | "loading" | "done" | "url" | "error";
type DownloadStatus = "idle" | "queued" | "running" | "done" | "error";

function formatDateShort(dateStr: string): string {
  const parts = dateStr.split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return parts[0] || "";
}

// ─── 다운로드 버튼 섹션 ────────────────────────────────────────────────────

interface DownloadSectionProps {
  status: DownloadStatus;
  step: string;
  error: string;
  onDownload: () => void;
}

function DownloadSection({ status, step, error, onDownload }: DownloadSectionProps) {
  if (status === "queued" || status === "running") {
    return (
      <div className="flex items-center gap-3 text-sm text-gray-300">
        <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
        {step || "처리 중…"}
      </div>
    );
  }
  if (status === "done") {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-green-400">다운로드 완료</span>
        <button
          onClick={onDownload}
          className="rounded-lg bg-gray-800 hover:bg-gray-700 px-4 py-2 text-sm font-medium transition-colors"
        >
          다시 다운로드
        </button>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={onDownload}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-medium transition-colors"
        >
          ⬇ 다시 시도
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={onDownload}
      className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold transition-colors"
    >
      ⬇ MP3 다운로드
    </button>
  );
}

// ─── 메인 페이지 ───────────────────────────────────────────────────────────

export default function MusicDownloaderPage() {
  // 입력
  const [query, setQuery] = useState("");

  // 검색
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState("");
  const [cardVisible, setCardVisible] = useState(false);

  // 결과 카드 UI
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [copied1, setCopied1] = useState(false);
  const [copied2, setCopied2] = useState(false);

  // 다운로드
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>("idle");
  const [downloadStep, setDownloadStep] = useState("");
  const [downloadError, setDownloadError] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchResultRef = useRef<SearchResult | null>(null);

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
          triggerBrowserDownload(`${API}${data.download_url}`);
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

  async function triggerBrowserDownload(url: string) {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      const result = searchResultRef.current;
      a.download = result ? `${result.artist} - ${result.title}.mp3` : "audio.mp3";
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
    setSearchError("");
    setDownloadStatus("idle");
    setLyricsOpen(false);

    // URL 직접 입력
    if (q.startsWith("http")) {
      setSearchStatus("url");
      return;
    }

    // 쿼리 검색
    setSearchStatus("loading");
    try {
      const res = await fetch(`${API}/music-downloader/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "검색 실패");
      setSearchResult(data);
      setSearchStatus("done");
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "알 수 없는 오류");
      setSearchStatus("error");
    }
  }

  // ─── 다운로드 시작 ──────────────────────────────────────────────────────

  async function handleDownload() {
    setDownloadStatus("queued");
    setDownloadStep("대기 중");
    setDownloadError("");
    setJobId(null);

    try {
      const q = query.trim();
      const isUrl = q.startsWith("http");
      const body = isUrl ? { url: q } : { query: q };

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
      <p className="text-gray-400 text-sm mb-6">
        아티스트명 - 곡명을 입력하면 곡 정보와 음원을 가져옵니다.
      </p>

      {/* YouTube 연결 패널 */}
      <div className="rounded-lg border border-gray-700 bg-gray-900 mb-6 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="text-sm font-medium text-gray-200">YouTube 연결</span>
          {cookieActive === null ? (
            <span className="text-xs text-gray-500">확인 중…</span>
          ) : cookieActive ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                연결됨
              </span>
              {cookiePath && (
                <span
                  className="text-xs text-gray-600 font-mono truncate max-w-[200px]"
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
              <span className="flex items-center gap-1.5 text-xs text-yellow-500">
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
          <div className="border-t border-gray-700 px-4 py-4 space-y-4">
            <ol className="space-y-3 text-sm">
              {[
                <>
                  <span className="text-white font-medium">YouTube에 로그인</span>하세요.
                  <br />
                  <span className="text-gray-500 text-xs">Chrome / Edge / Firefox 아무거나 OK</span>
                </>,
                <>
                  <span className="text-white font-medium">확장 프로그램을 설치</span>하세요.
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
                  <span className="text-white font-medium">youtube.com</span>에서 확장 아이콘을
                  클릭하고 <span className="text-white font-medium">Export</span>를 누르면{" "}
                  <code className="text-xs bg-gray-800 px-1 rounded">cookies.txt</code> 파일이
                  저장됩니다.
                </>,
                <>저장된 파일을 아래에 업로드하세요.</>,
              ].map((content, i) => (
                <li key={i} className="flex gap-3">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  <span className="text-gray-300">{content}</span>
                </li>
              ))}
            </ol>

            {cookieError && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
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
                  ? "border-indigo-400 bg-indigo-950"
                  : "border-gray-600 hover:border-gray-500"
              }`}
            >
              {cookieUploading ? (
                <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  업로드 중…
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-300">
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
          className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
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
        <div className="flex items-center gap-3 text-sm text-gray-400 mb-4">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
          곡 정보 수집 중…
        </div>
      )}

      {/* 검색 오류 */}
      {searchStatus === "error" && (
        <div className="rounded-lg bg-red-950 border border-red-800 p-4 text-sm text-red-300 mb-4">
          {searchError}
        </div>
      )}

      {/* 결과 카드 */}
      {showCard && (
        <div
          className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden transition-opacity duration-300"
          style={{ opacity: cardVisible ? 1 : 0 }}
        >
          {/* URL 모드 */}
          {searchStatus === "url" && (
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">YouTube URL</p>
                <p className="text-sm font-mono text-indigo-300 break-all">{query}</p>
              </div>
              <DownloadSection
                status={downloadStatus}
                step={downloadStep}
                error={downloadError}
                onDownload={handleDownload}
              />
            </div>
          )}

          {/* 검색 결과 카드 */}
          {searchStatus === "done" && searchResult && (
            <>
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
                  <div className="w-24 h-24 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                    <span className="text-3xl text-gray-600">♪</span>
                  </div>
                )}
                <div className="min-w-0 space-y-1">
                  <p className="font-bold text-lg leading-tight">{searchResult.artist}</p>
                  <p className="text-gray-200 text-base leading-tight">{searchResult.title}</p>
                  <p className="text-gray-500 text-xs">앨범: {searchResult.album || "—"}</p>
                  <p className="text-gray-500 text-xs">발매일: {searchResult.release_date || "—"}</p>
                  <p className="text-gray-500 text-xs">작곡: {searchResult.composer}</p>
                  <p className="text-gray-500 text-xs">작사: {searchResult.lyricist}</p>
                </div>
              </div>

              <div className="border-t border-gray-800" />

              {/* 복사 1 */}
              <div className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">📋 복사 1</p>
                  <p className="text-sm text-gray-300 truncate">
                    {searchResult.artist}의 &apos;{searchResult.title}&apos; (
                    {formatDateShort(searchResult.release_date)}) 수록곡
                  </p>
                </div>
                <button
                  onClick={() =>
                    copyText(
                      `${searchResult.artist}의 '${searchResult.title}' (${formatDateShort(searchResult.release_date)}) 수록곡`,
                      setCopied1
                    )
                  }
                  className="shrink-0 rounded bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs font-medium transition-colors min-w-[62px] text-center"
                >
                  {copied1 ? "복사됨 ✓" : "복사"}
                </button>
              </div>

              <div className="border-t border-gray-800" />

              {/* 복사 2 */}
              <div className="flex items-start justify-between px-5 py-3 gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-0.5">📋 복사 2</p>
                  <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
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
                  className="shrink-0 rounded bg-gray-800 hover:bg-gray-700 px-3 py-1.5 text-xs font-medium transition-colors min-w-[62px] text-center"
                >
                  {copied2 ? "복사됨 ✓" : "복사"}
                </button>
              </div>

              <div className="border-t border-gray-800" />

              {/* 가사 */}
              <div className="px-5 py-3">
                <button
                  onClick={() => setLyricsOpen((v) => !v)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-sm text-gray-400">🎵 가사</span>
                  <span className="text-xs text-gray-500">{lyricsOpen ? "접기 ▲" : "펼치기 ▼"}</span>
                </button>
                {lyricsOpen && (
                  <div className="mt-3 max-h-64 overflow-y-auto pr-1 text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                    {searchResult.lyrics}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-800" />

              {/* 다운로드 */}
              <div className="px-5 py-4">
                <DownloadSection
                  status={downloadStatus}
                  step={downloadStep}
                  error={downloadError}
                  onDownload={handleDownload}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
