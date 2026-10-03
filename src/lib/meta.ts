import type { Metadata } from "next";

/**
 * Заголовок и значок вкладки браузера для страницы. Когда вкладок много, они сужаются до одного значка,
 * поэтому у каждого раздела свой эмодзи-значок, а в заголовке — название страницы (или открытой записи).
 */
export function pageMeta(title: string, emoji: string): Metadata {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
  return { title, icons: { icon: `data:image/svg+xml,${encodeURIComponent(svg)}` } };
}
