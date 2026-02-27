"use client";

import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8001";

type JobStatus = "idle" | "queued" | "running" | "done" | "error";

interface JobFiles {
  audio: string;
  clip: string;
  meta: string;
}

interface JobResult {
  title?: string;
  artist?: string;
  album?: string;
  year?: string;
  composer?: string;
  lyricist?: string;
  youtube_url?: string;
  song_dir?: string;
  files?: JobFiles;
}

interface JobState {
  status: JobStatus;
  step?: string;
  result?: JobResult;
  error?: string;
}

export default function MusicDownloaderPage() {
  const [input, setInput] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState>({ status: "idle" });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 쿠키 상태
  const [cookieActive, setCookieActive] = useState<boolean | null>(null);
  const [cookiePath, setCookiePath] = useState<string>("");
  const [cookieGuideOpen, setCookieGuideOpen] = useState(false);
  const [cookieUploading, setCookieUploading] = useState(false);
  const [cookieDragOver, setCookieDragOver] = useState(false);
  const [cookieError, setCookieError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 마운트 시 쿠키 상태 확인
  useEffect(() => {
    fetch(`${API}/music-downloader/cookies/status`)
      .then((r) => r.json())
      .then((d) => { setCookieActive(d.active); if (d.path) setCookiePath(d.path); })
      .catch(() => setCookieActive(false));
  }, []);

  async function uploadCookieFile(file: File) {
    setCookieUploading(true);
    setCookieError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/music-downloader/cookies`, { method: "POST", body: form });
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

  // 1.5초마다 상태 polling
  useEffect(() => {
    if (!jobId || job.status === "done" || job.status === "error" || job.status === "idle") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API}/music-downloader/status/${jobId}`);
        const data = await res.json();
        setJob({
          status: data.status,
          step: data.step,
          result: data.result,
          error: data.error,
        });
        if (data.status === "done" || data.status === "error") {
          clearInterval(pollRef.current!);
        }
      } catch {
        // 네트워크 오류 무시
      }
    }, 1500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, job.status]);

  async function pickFolder() {
    try {
      const res = await fetch(`${API}/music-downloader/pick-folder`);
      const data = await res.json();
      if (data.path) setOutputDir(data.path);
    } catch {
      // 다이얼로그 실패 시 무시
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    const isUrl = input.startsWith("http");
    const body: Record<string, string> = isUrl ? { url: input } : { query: input };
    if (outputDir) body.output_dir = outputDir;

    setJob({ status: "queued", step: "대기 중" });
    setJobId(null);

    try {
      const res = await fetch(`${API}/music-downloader/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail ?? "서버 오류");
      setJobId(data.job_id);
    } catch (err) {
      setJob({
        status: "error",
        error: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }

  const isRunning = job.status === "queued" || job.status === "running";

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Music Downloader</h1>
      <p className="text-gray-400 text-sm mb-6">
        아티스트 + 곡명 또는 유튜브 / 멜론 URL을 입력하세요.
      </p>

      {/* YouTube 연결 패널 */}
      <div className="rounded-lg border border-gray-700 bg-gray-900 mb-6 overflow-hidden">
        {/* 헤더 행 */}
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
                <span className="text-xs text-gray-600 font-mono truncate max-w-[200px]" title={cookiePath}>
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

        {/* 가이드 패널 (미연결 + 열렸을 때만) */}
        {!cookieActive && cookieGuideOpen && (
          <div className="border-t border-gray-700 px-4 py-4 space-y-4">
            {/* 단계 설명 */}
            <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                <span className="text-gray-300">
                  <span className="text-white font-medium">YouTube에 로그인</span>하세요.
                  <br />
                  <span className="text-gray-500 text-xs">Chrome / Edge / Firefox 아무거나 OK</span>
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                <span className="text-gray-300">
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
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                <span className="text-gray-300">
                  <span className="text-white font-medium">youtube.com</span>에서 확장 아이콘을 클릭하고{" "}
                  <span className="text-white font-medium">Export</span>를 누르면 <code className="text-xs bg-gray-800 px-1 rounded">cookies.txt</code> 파일이 저장됩니다.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                <span className="text-gray-300">
                  저장된 파일을 아래에 업로드하세요.
                </span>
              </li>
            </ol>

            {/* 에러 메시지 */}
            {cookieError && (
              <p className="text-xs text-red-400 bg-red-950 border border-red-800 rounded px-3 py-2">
                {cookieError}
              </p>
            )}

            {/* 업로드 영역 */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setCookieDragOver(true); }}
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
                    <span className="text-indigo-400 font-medium">cookies.txt</span> 파일을 여기에 끌어다 놓거나
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

      <form onSubmit={handleSubmit} className="space-y-3 mb-6">
        {/* 검색 입력 + 다운로드 버튼 */}
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-4 py-2 text-sm placeholder-gray-500 focus:outline-none focus:border-gray-500"
            placeholder="예: 아이유 - 좋은날  또는  https://youtu.be/..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            type="submit"
            disabled={isRunning}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium transition-colors"
          >
            {isRunning ? "처리 중…" : "다운로드"}
          </button>
        </div>

        {/* 저장 위치 선택 */}
        <div className="flex items-center gap-2 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2">
          <span className="flex-1 text-sm truncate min-w-0">
            {outputDir
              ? <span className="text-gray-200">{outputDir}</span>
              : <span className="text-gray-500">저장 위치 (기본: backend/downloads/)</span>
            }
          </span>
          <button
            type="button"
            onClick={pickFolder}
            disabled={isRunning}
            className="shrink-0 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-3 py-1 text-xs font-medium transition-colors"
          >
            폴더 선택
          </button>
        </div>
        {outputDir && (
          <p className="text-xs text-gray-500 pl-1">
            저장 위치: <span className="font-mono">{outputDir}/아티스트명-곡명/</span>
          </p>
        )}
      </form>

      {/* 진행 상태 스피너 */}
      {isRunning && (
        <div className="rounded-lg bg-gray-900 border border-gray-700 p-4 mb-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-sm text-gray-300">{job.step ?? "처리 중…"}</span>
        </div>
      )}

      {/* 완료 카드 */}
      {job.status === "done" && job.result && (
        <div className="rounded-lg bg-gray-900 border border-gray-700 p-5 space-y-4 text-sm">
          <p className="font-semibold text-green-400">다운로드 완료</p>

          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <span className="text-gray-400">곡명</span>
            <span>{job.result.title}</span>
            <span className="text-gray-400">아티스트</span>
            <span>{job.result.artist}</span>
            <span className="text-gray-400">앨범</span>
            <span>{job.result.album}</span>
            <span className="text-gray-400">발매연도</span>
            <span>{job.result.year}</span>
            <span className="text-gray-400">작곡가</span>
            <span>{job.result.composer}</span>
            <span className="text-gray-400">작사가</span>
            <span>{job.result.lyricist}</span>
          </div>

          {job.result.files && job.result.song_dir && (
            <div className="pt-3 border-t border-gray-700">
              <p className="text-gray-400 text-xs mb-2">저장된 파일</p>
              <p className="text-xs text-gray-300 font-mono">{job.result.song_dir}/</p>
              {Object.values(job.result.files).map((name) => (
                <p key={name} className="text-xs text-gray-500 font-mono pl-3">
                  └ {name}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 오류 */}
      {job.status === "error" && (
        <div className="rounded-lg bg-red-950 border border-red-800 p-4 text-sm text-red-300">
          오류: {job.error}
        </div>
      )}
    </div>
  );
}
