"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function UploadBook() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setError(null);
    setProgress(0);

    // XHR вместо fetch — ради прогресса загрузки больших PDF.
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/books/upload");
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-title", encodeURIComponent(title));
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201) {
        setTitle("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setError(JSON.parse(xhr.responseText || "{}").error ?? `Ошибка ${xhr.status}`);
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Сеть недоступна");
    };
    xhr.send(file);
  }

  return (
    <div className="card mt-4 flex flex-wrap items-center gap-2 p-3">
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="text-sm text-muted file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-panel-2 file:px-3 file:py-1.5 file:text-text" />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название (необязательно)"
        className="input flex-1"
      />
      <button className="btn btn-primary" onClick={upload} disabled={progress !== null}>
        {progress !== null ? `Загрузка ${progress}%` : "Загрузить PDF"}
      </button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
    </div>
  );
}
