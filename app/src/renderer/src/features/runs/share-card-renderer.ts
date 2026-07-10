import benchlocalIconOutline from "../../../../../assets/benchlocal-icon-outline.png";
import shareCardDisplayFontUrl from "../../assets/fonts/InterVariable.woff2";
import shareCardMonoFontUrl from "../../assets/fonts/JetBrainsMonoVariable.woff2";
import type { ResultShareCardData } from "./ResultShareCardModal";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;
const SHARE_CARD_EXPORT_SCALE = 2;
export const SHARE_CARD_PIXEL_WIDTH = SHARE_CARD_WIDTH * SHARE_CARD_EXPORT_SCALE;
export const SHARE_CARD_PIXEL_HEIGHT = SHARE_CARD_HEIGHT * SHARE_CARD_EXPORT_SCALE;
const SHARE_CARD_DISPLAY_FONT_FAMILY = "BenchLocal Share Inter";
const SHARE_CARD_MONO_FONT_FAMILY = "BenchLocal Share JetBrains Mono";
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string
): void {
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = color;
  ctx.fill();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  color: string,
  lineWidth = 1
): void {
  drawRoundedRect(ctx, x, y, width, height, radius);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

let shareCardLogoImagePromise: Promise<HTMLImageElement | null> | null = null;
let shareCardFontsPromise: Promise<void> | null = null;

function loadShareCardLogoImage(): Promise<HTMLImageElement | null> {
  shareCardLogoImagePromise ??= new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = benchlocalIconOutline;

    if (image.complete && image.naturalWidth > 0) {
      finish(image);
    }
  });

  return shareCardLogoImagePromise;
}

function loadShareCardFonts(): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.resolve();
  }

  shareCardFontsPromise ??= Promise.all([
    {
      family: SHARE_CARD_DISPLAY_FONT_FAMILY,
      url: shareCardDisplayFontUrl
    },
    {
      family: SHARE_CARD_MONO_FONT_FAMILY,
      url: shareCardMonoFontUrl
    }
  ].map(async ({ family, url }) => {
    if (document.fonts.check(`16px "${family}"`)) {
      return;
    }

    const font = new FontFace(family, `url("${url}") format("woff2")`, {
      display: "block",
      style: "normal",
      weight: "100 900"
    });
    (document.fonts as FontFaceSet & { add(font: FontFace): void }).add(await font.load());
  })).then(() => document.fonts.ready).then(() => undefined);

  return shareCardFontsPromise;
}

function drawShareCardLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  logoImage?: HTMLImageElement | null
): void {
  fillRoundedRect(ctx, x, y, size, size, 12, "#0f2a3d");

  if (logoImage) {
    ctx.save();
    drawRoundedRect(ctx, x, y, size, size, 12);
    ctx.clip();
    ctx.drawImage(logoImage, x, y, size, size);
    ctx.restore();
  } else {
    strokeRoundedRect(ctx, x + 13, y + 13, size - 26, 7, 3, "#40a9ff", 2.5);
    strokeRoundedRect(ctx, x + 13, y + 27, size - 26, 7, 3, "#40a9ff", 2.5);
  }

  strokeRoundedRect(ctx, x, y, size, size, 12, "rgba(255, 211, 106, 0.22)", 1);
}

function truncateCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const suffix = "...";
  let next = text;

  while (next.length > 0 && ctx.measureText(`${next}${suffix}`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return next ? `${next}${suffix}` : suffix;
}

function getWrappedCanvasTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const lines: string[] = [];
  let remaining = text.trim().replace(/\s+/gu, " ");

  while (remaining && lines.length < maxLines) {
    if (ctx.measureText(remaining).width <= maxWidth) {
      lines.push(remaining);
      break;
    }

    if (lines.length === maxLines - 1) {
      lines.push(truncateCanvasText(ctx, remaining, maxWidth));
      break;
    }

    let low = 1;
    let high = remaining.length;
    let fit = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = remaining.slice(0, mid);

      if (ctx.measureText(candidate).width <= maxWidth) {
        fit = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const slice = remaining.slice(0, fit);
    const breakMatches = [...slice.matchAll(/[ /_\-:.]/gu)];
    const lastBreak = breakMatches.at(-1)?.index;
    const breakIndex = lastBreak !== undefined && lastBreak > fit * 0.42 ? lastBreak + 1 : fit;
    lines.push(remaining.slice(0, breakIndex).trimEnd());
    remaining = remaining.slice(breakIndex).trimStart();
  }

  return lines;
}

function drawWrappedCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
): number {
  const visibleLines = getWrappedCanvasTextLines(ctx, text, maxWidth, maxLines);

  visibleLines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });

  return y + visibleLines.length * lineHeight;
}

function drawShareCardCanvas(
  canvas: HTMLCanvasElement,
  data: ResultShareCardData,
  logoImage?: HTMLImageElement | null
): void {
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    return;
  }

  canvas.width = SHARE_CARD_PIXEL_WIDTH;
  canvas.height = SHARE_CARD_PIXEL_HEIGHT;
  ctx.setTransform(SHARE_CARD_EXPORT_SCALE, 0, 0, SHARE_CARD_EXPORT_SCALE, 0, 0);

  const displayFont = `"${SHARE_CARD_DISPLAY_FONT_FAMILY}", sans-serif`;
  const monoFont = `"${SHARE_CARD_MONO_FONT_FAMILY}", monospace`;
  const palette = {
    bg: "#030303",
    panel: "#101010",
    panelStrong: "#171717",
    border: "#333333",
    text: "#f7f7f3",
    muted: "#b8b8ae",
    faint: "#77776f",
    accent: "#f4f4ec",
    accentStrong: "#ffffff",
    pass: "#47d16c",
    partial: "#cfcfc7",
    fail: "#ef6262"
  };

  const backgroundGradient = ctx.createRadialGradient(940, 70, 18, 610, 280, 820);
  backgroundGradient.addColorStop(0, "#6a6a6a");
  backgroundGradient.addColorStop(0.16, "#343434");
  backgroundGradient.addColorStop(0.42, "#111111");
  backgroundGradient.addColorStop(1, palette.bg);
  ctx.fillStyle = backgroundGradient;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  const upperGlow = ctx.createRadialGradient(846, 88, 8, 846, 88, 410);
  upperGlow.addColorStop(0, "rgba(255, 255, 255, 0.18)");
  upperGlow.addColorStop(0.36, "rgba(255, 255, 255, 0.055)");
  upperGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = upperGlow;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);
  const lowerGlow = ctx.createRadialGradient(278, 542, 18, 278, 542, 540);
  lowerGlow.addColorStop(0, "rgba(255, 255, 255, 0.10)");
  lowerGlow.addColorStop(0.46, "rgba(255, 255, 255, 0.024)");
  lowerGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

  const panelX = 36;
  const panelY = 36;
  const panelWidth = SHARE_CARD_WIDTH - 72;
  const panelHeight = SHARE_CARD_HEIGHT - 72;
  ctx.save();
  drawRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 34);
  ctx.clip();
  const panelGradient = ctx.createRadialGradient(880, 76, 80, 540, 324, 760);
  panelGradient.addColorStop(0, "#3a3a3a");
  panelGradient.addColorStop(0.22, "#1f1f1f");
  panelGradient.addColorStop(0.52, palette.panel);
  panelGradient.addColorStop(1, "#070707");
  ctx.fillStyle = panelGradient;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
  ctx.lineWidth = 1;
  for (let x = panelX + 58; x < panelX + panelWidth; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, panelY);
    ctx.lineTo(x, panelY + panelHeight);
    ctx.stroke();
  }
  for (let y = panelY + 58; y < panelY + panelHeight; y += 64) {
    ctx.beginPath();
    ctx.moveTo(panelX, y);
    ctx.lineTo(panelX + panelWidth, y);
    ctx.stroke();
  }
  ctx.restore();
  strokeRoundedRect(ctx, panelX, panelY, panelWidth, panelHeight, 34, "rgba(255, 255, 255, 0.26)", 1.5);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(36, 146, 7, 400);
  ctx.beginPath();
  ctx.moveTo(36, 546);
  ctx.lineTo(SHARE_CARD_WIDTH - 36, 546);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.lineWidth = 0.55;
  ctx.stroke();

  drawShareCardLogo(ctx, 78, 65, 44, logoImage);

  ctx.font = `800 34px ${displayFont}`;
  ctx.fillStyle = palette.text;
  ctx.textBaseline = "middle";
  ctx.fillText("BenchLocal", 136, 87);
  ctx.textBaseline = "alphabetic";

  ctx.font = `900 22px ${monoFont}`;
  const packLabel = truncateCanvasText(ctx, data.benchPackName.toUpperCase(), 360);
  const packWidth = Math.max(190, ctx.measureText(packLabel).width + 58);
  const packX = SHARE_CARD_WIDTH - 78 - packWidth;
  fillRoundedRect(ctx, packX, 62, packWidth, 48, 24, palette.panelStrong);
  strokeRoundedRect(ctx, packX, 62, packWidth, 48, 24, palette.border, 1);
  ctx.fillStyle = palette.accentStrong;
  ctx.textAlign = "center";
  ctx.fillText(packLabel, packX + packWidth / 2, 94);
  ctx.textAlign = "left";

  ctx.font = `900 70px ${displayFont}`;
  ctx.fillStyle = palette.text;
  drawWrappedCanvasText(ctx, data.modelLabel, 78, 205, 970, 76, 2);

  fillRoundedRect(ctx, 78, 356, 350, 164, 26, palette.panelStrong);
  strokeRoundedRect(ctx, 78, 356, 350, 164, 26, "rgba(255, 255, 255, 0.18)", 1.5);
  ctx.font = `800 18px ${monoFont}`;
  ctx.fillStyle = palette.accentStrong;
  ctx.fillText("SCORE", 110, 394);
  ctx.font = `760 24px ${displayFont}`;
  ctx.fillStyle = palette.muted;
  ctx.fillText(`${data.completedCount}/${data.scenarioCount}`, 110, 430);
  const scorePanelTop = 356;
  const scorePanelHeight = 164;
  const scoreTextMaxWidth = 188;
  let scoreFontSize = 142;
  let scoreMetrics: TextMetrics;
  let scoreTextAscent = 0;
  let scoreTextDescent = 0;
  do {
    ctx.font = `900 ${scoreFontSize}px ${displayFont}`;
    scoreMetrics = ctx.measureText(data.scoreValue);
    scoreTextAscent = scoreMetrics.actualBoundingBoxAscent || scoreFontSize * 0.72;
    scoreTextDescent = scoreMetrics.actualBoundingBoxDescent || scoreFontSize * 0.22;
    if (scoreMetrics.width <= scoreTextMaxWidth && scoreTextAscent + scoreTextDescent <= scorePanelHeight - 26) {
      break;
    }
    scoreFontSize -= 2;
  } while (scoreFontSize > 90);
  const scoreTextCenterY = scorePanelTop + scorePanelHeight / 2;
  const scoreBaselineY = scoreTextCenterY + (scoreTextAscent - scoreTextDescent) / 2;
  ctx.fillStyle = palette.text;
  ctx.textAlign = "right";
  ctx.fillText(data.scoreValue, 396, scoreBaselineY);
  ctx.textAlign = "left";

  const segments = [
    { label: "Pass", count: data.statusCounts.pass, color: palette.pass },
    { label: "Partial", count: data.statusCounts.partial, color: palette.partial },
    { label: "Fail", count: data.statusCounts.fail, color: palette.fail }
  ];
  const barX = 480;
  const barY = 356;
  const barWidth = 636;
  const barHeight = 20;
  fillRoundedRect(ctx, barX, barY, barWidth, barHeight, 10, "#242424");

  let offset = 0;
  const total = Math.max(1, data.scenarioCount);
  for (const segment of segments) {
    if (segment.count <= 0) {
      continue;
    }

    const segmentWidth = Math.max(segment.count > 0 ? 5 : 0, Math.round((segment.count / total) * barWidth));
    const visibleWidth = Math.max(0, Math.min(segmentWidth, barWidth - offset));
    ctx.fillStyle = segment.color;
    ctx.fillRect(barX + offset, barY, visibleWidth, barHeight);
    offset += segmentWidth;
  }

  strokeRoundedRect(ctx, barX, barY, barWidth, barHeight, 10, "rgba(255, 255, 255, 0.12)", 1);

  ctx.font = `760 18px ${displayFont}`;
  let legendX = barX;
  for (const segment of segments) {
    const label = `${segment.label} ${segment.count}`;
    const labelWidth = ctx.measureText(label).width;
    fillRoundedRect(ctx, legendX, 394, 14, 14, 4, segment.color);
    ctx.fillStyle = palette.muted;
    ctx.fillText(label, legendX + 22, 408);
    legendX += labelWidth + 52;
  }

  ctx.font = `800 17px ${monoFont}`;
  ctx.fillStyle = palette.faint;
  ctx.fillText("CATEGORY BREAKDOWN", 480, 462);

  ctx.font = `760 20px ${displayFont}`;
  const chipStartX = 480;
  const chipAreaWidth = 636;
  const chipRows = [472, 508];
  const chipGap = 9;
  const chipHeight = 30;
  const chipPaddingX = 28;
  const chipMinWidth = 78;
  const chipMaxWidth = 220;
  const measureCategoryChipWidth = (label: string) =>
    Math.min(chipMaxWidth, Math.max(chipMinWidth, Math.ceil(ctx.measureText(label).width) + chipPaddingX));
  const layoutCategoryChips = (chips: Array<{ label: string; overflow: boolean }>) => {
    const layouts: Array<{ label: string; overflow: boolean; x: number; y: number; width: number }> = [];
    let row = 0;
    let x = chipStartX;

    for (const chip of chips) {
      const width = measureCategoryChipWidth(chip.label);

      if (x > chipStartX && x + width > chipStartX + chipAreaWidth) {
        row += 1;
        x = chipStartX;
      }

      if (row >= chipRows.length) {
        return null;
      }

      layouts.push({
        ...chip,
        x,
        y: chipRows[row],
        width
      });
      x += width + chipGap;
    }

    return layouts;
  };

  let visibleCategoryCount = data.categories.length;
  let categoryChipLayouts: ReturnType<typeof layoutCategoryChips> = null;

  while (visibleCategoryCount >= 0 && !categoryChipLayouts) {
    const categoryChips = data.categories.slice(0, visibleCategoryCount).map((category) => ({
      label: `${category.id}: ${category.score}`,
      overflow: false
    }));

    if (visibleCategoryCount < data.categories.length) {
      categoryChips.push({
        label: `+${data.categories.length - visibleCategoryCount} more`,
        overflow: true
      });
    }

    categoryChipLayouts = layoutCategoryChips(categoryChips);
    visibleCategoryCount -= 1;
  }

  const drawCategoryChip = (label: string, x: number, y: number, width: number, overflow = false) => {
    fillRoundedRect(ctx, x, y, width, chipHeight, 15, overflow ? "#202020" : "#181818");
    strokeRoundedRect(ctx, x, y, width, chipHeight, 15, "rgba(255, 255, 255, 0.14)", 1);
    ctx.fillStyle = overflow ? palette.accentStrong : palette.text;
    ctx.fillText(label, x + 14, y + 21);
  };

  categoryChipLayouts?.forEach((chip) => {
    const label = truncateCanvasText(ctx, chip.label, chip.width - chipPaddingX);
    drawCategoryChip(label, chip.x, chip.y, chip.width, chip.overflow);
  });

  ctx.font = `700 18px ${displayFont}`;
  ctx.fillStyle = palette.muted;
  const meta = [
    data.runModeLabel,
    `${data.runsPerTest}x run${data.runsPerTest === 1 ? "" : "s"}`,
    data.runDateLabel,
    data.durationLabel ? `${data.durationLabel} total` : null
  ].filter(Boolean).join(" · ");
  ctx.textBaseline = "middle";
  ctx.fillText(truncateCanvasText(ctx, meta, 760), 78, 570);

  ctx.font = `800 18px ${monoFont}`;
  ctx.fillStyle = palette.accentStrong;
  ctx.textAlign = "right";
  ctx.fillText(data.footerLabel, SHARE_CARD_WIDTH - 78, 570);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export async function createShareCardBlob(data: ResultShareCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const [, logoImage] = await Promise.all([loadShareCardFonts(), loadShareCardLogoImage()]);
  drawShareCardCanvas(canvas, data, logoImage);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not render share card."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}
export async function renderShareCardPreviewCanvas(canvas: HTMLCanvasElement, data: ResultShareCardData): Promise<void> {
  try {
    const [, logoImage] = await Promise.all([loadShareCardFonts(), loadShareCardLogoImage()]);
    drawShareCardCanvas(canvas, data, logoImage);
  } catch (error) {
    console.error(error);
    drawShareCardCanvas(canvas, data);
  }
}