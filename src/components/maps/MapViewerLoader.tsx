"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type MapViewer from "./MapViewer";

// PDF.js работает только в браузере — отключаем SSR для вьюера.
const MapViewerNoSsr = dynamic(() => import("./MapViewer"), {
  ssr: false,
  loading: () => <p className="p-8 text-center text-muted">Загрузка карты…</p>,
});

export function MapViewerLoader(props: ComponentProps<typeof MapViewer>) {
  return <MapViewerNoSsr {...props} />;
}
