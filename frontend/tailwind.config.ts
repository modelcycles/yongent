import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [
    plugin(function ({ addVariant }) {
      // 기본(프리픽스 없음) = 다크. `.light` 조상이 있으면 light 오버라이드 적용.
      addVariant("light", ".light &");
    }),
  ],
};
export default config;
