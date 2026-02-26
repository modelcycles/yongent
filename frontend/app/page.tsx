import Link from "next/link";

const agents = [
  {
    slug: "music-downloader",
    name: "Music Downloader",
    description: "유튜브 / 멜론 URL 또는 아티스트+곡명으로 음원·메타데이터 자동 수집",
  },
];

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">에이전트 목록</h1>
      <p className="text-gray-400 mb-8 text-sm">원하는 에이전트를 선택하세요.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {agents.map((agent) => (
          <Link
            key={agent.slug}
            href={`/${agent.slug}`}
            className="block rounded-xl border border-gray-700 bg-gray-900 p-5 hover:border-gray-500 hover:bg-gray-800 transition-colors"
          >
            <h2 className="font-semibold text-lg mb-1">{agent.name}</h2>
            <p className="text-gray-400 text-sm">{agent.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
