"use client";

import { useEffect, useState } from "react";
import { isStoredFile, isViewableFile, resolveFileUrl } from "@/lib/storage";

function useFileUrl(value?: string): string | undefined {
  const [resolved, setResolved] = useState<{ value: string; url?: string } | null>(null);

  useEffect(() => {
    if (!isStoredFile(value)) return;
    let cancelled = false;
    resolveFileUrl(value)
      .then((url) => {
        if (!cancelled) setResolved({ value, url });
      })
      .catch(() => {
        if (!cancelled) setResolved({ value, url: undefined });
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!value) return undefined;
  if (!isStoredFile(value)) return isViewableFile(value) ? value : undefined;
  return resolved?.value === value ? resolved.url : undefined;
}

export function StoredFileLink({ value, className, children }: { value?: string; className?: string; children: React.ReactNode }) {
  const url = useFileUrl(value);
  if (!url) return <span className="text-xs text-muted">{isStoredFile(value) ? "Opening link…" : "No file"}</span>;
  return <a href={url} target="_blank" rel="noreferrer" className={className}>{children}</a>;
}

export function StoredImage({ value, alt, className }: { value?: string; alt: string; className?: string }) {
  const url = useFileUrl(value);
  if (!url) return <div className={className} aria-label={alt} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
