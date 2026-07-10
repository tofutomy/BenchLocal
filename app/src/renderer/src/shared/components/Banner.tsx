import type { ReactNode } from "react";

export type BannerTone = "success" | "danger" | "neutral" | "warning";

export function Banner({ tone, children }: { tone: BannerTone; children: ReactNode }) {
  const toneClass =
    tone === "success"
      ? "banner-success"
      : tone === "danger"
        ? "banner-danger"
        : tone === "warning"
          ? "banner-warning"
          : "banner-neutral";

  return <div className={`banner ${toneClass}`}>{children}</div>;
}
