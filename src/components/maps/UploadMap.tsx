"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Загрузка карты: JPG, PNG, WebP или PDF. Файл уходит потоком (как у книг), с индикатором прогресса. */
export function UploadMap() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Выберите файл карты");
      return;
    }
    setError(null);
    setProgress(0);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", "/api/maps/upload");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-title", encodeURIComponent(title));
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      if (xhr.status === 201) {
        const created = JSON.parse(xhr.responseText || "{}") as { id?: number };
        setTitle("");
        if (fileRef.current) fileRef.current.value = "";
        if (created.id) router.push(`/maps/${created.id}`);
        else router.refresh();
      } else {
        let message = `Ошибка ${xhr.status}`;
        try {
          message = JSON.parse(xhr.responseText || "{}").error ?? message;
        } catch {}
        setError(message);
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
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
        className="text-sm text-muted file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-panel-2 file:px-3 file:py-1.5 file:text-text"
      />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название (необязательно)" className="input flex-1" />
      <button className="btn btn-primary" onClick={upload} disabled={progress !== null}>
        {progress !== null ? `Загрузка ${progress}%` : "Загрузить карту"}
      </button>
      {error && <p className="w-full text-sm text-red-400">{error}</p>}
    </div>
  );
}
