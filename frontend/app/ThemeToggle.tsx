"use client";

import { useEffect, useState } from "react";
import { BsMoonFill, BsSunFill } from "react-icons/bs";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLight(document.documentElement.classList.contains("light"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !light;
    setLight(next);
    const root = document.documentElement;
    if (next) {
      root.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      root.classList.remove("light");
      localStorage.setItem("theme", "dark");
    }
  }

  return (
    <button
      onClick={toggle}
      role="switch"
      aria-checked={light}
      aria-label="라이트/다크 모드 전환"
      title={light ? "다크 모드로 전환" : "라이트 모드로 전환"}
      className="relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors bg-gray-800 border-gray-700 light:bg-gray-200 light:border-gray-300"
    >
      {/* 트랙 양끝 아이콘 */}
      <BsMoonFill className="absolute left-1.5 text-[11px] text-indigo-300" />
      <BsSunFill className="absolute right-1.5 text-[11px] text-yellow-300" />
      {/* 슬라이딩 노브 */}
      <span
        className={`relative z-10 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          mounted && light ? "translate-x-8" : "translate-x-1"
        }`}
      />
    </button>
  );
}
