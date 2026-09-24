"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type BookViewer from "./BookViewer";

// PDF.js работает только в браузере — отключаем SSR для вьюера.
const BookViewerNoSsr = dynamic(() => import("./BookViewer"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-muted">Загрузка вьюера…</p>,
});

export function BookViewerLoader(props: ComponentProps<typeof BookViewer>) {
  return <BookViewerNoSsr {...props} />;
}
