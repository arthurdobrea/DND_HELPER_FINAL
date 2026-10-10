"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type ParserRunner from "./ParserRunner";

// PDF.js работает только в браузере — отключаем SSR.
const RunnerNoSsr = dynamic(() => import("./ParserRunner"), {
  ssr: false,
  loading: () => <div className="card p-3 text-sm text-muted">Загрузка…</div>,
});

export function ParserRunnerLoader(props: ComponentProps<typeof ParserRunner>) {
  return <RunnerNoSsr {...props} />;
}
