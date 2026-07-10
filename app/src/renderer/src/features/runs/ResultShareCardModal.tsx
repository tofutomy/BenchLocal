import { useEffect, useRef } from "react";
import { Copy } from "lucide-react";
import { Modal } from "../../shared/components/Modal";

export type ShareCardStatusCounts = {
  pass: number;
  partial: number;
  fail: number;
};

export type ResultShareCardData = {
  benchPackName: string;
  modelLabel: string;
  providerName: string;
  modelIdentifier: string;
  scoreValue: string;
  scenarioCount: number;
  completedCount: number;
  statusCounts: ShareCardStatusCounts;
  categories: Array<{ id: string; label: string; score: string }>;
  runModeLabel: string;
  runsPerTest: number;
  runDateLabel: string;
  durationLabel: string | null;
  footerLabel: string;
  outcomeLabel: string;
  fileName: string;
};

export function ResultShareCardModal({
  data,
  pixelWidth,
  pixelHeight,
  onClose,
  renderCanvas,
  createBlob
}: {
  data: ResultShareCardData;
  pixelWidth: number;
  pixelHeight: number;
  onClose: () => void;
  renderCanvas: (canvas: HTMLCanvasElement, data: ResultShareCardData) => Promise<void> | void;
  createBlob: (data: ResultShareCardData) => Promise<Blob>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    let cancelled = false;

    if (!canvas) {
      return;
    }

    void Promise.resolve(renderCanvas(canvas, data)).catch((error) => {
      if (!cancelled) {
        console.error(error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [data, renderCanvas]);

  const savePng = async () => {
    const blob = await createBlob(data);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = data.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyImage = async () => {
    type ClipboardItemConstructor = new (items: Record<string, Blob>) => ClipboardItem;
    const clipboardItem = (window as typeof window & { ClipboardItem?: ClipboardItemConstructor }).ClipboardItem;

    if (!navigator.clipboard?.write || !clipboardItem) {
      return;
    }

    const blob = await createBlob(data);
    await navigator.clipboard.write([new clipboardItem({ "image/png": blob })]);
  };

  return (
    <Modal
      title="Share Result Card"
      subtitle="Preview a social-ready PNG for this model result."
      onClose={onClose}
      onSubmit={() => void savePng().catch((error) => console.error(error))}
      submitLabel="Save PNG"
      size="wide"
      leadingActions={
        <button
          type="button"
          className="ghost-button"
          onClick={() => void copyImage().catch((error) => console.error(error))}
        >
          <Copy size={14} />
          Copy Image
        </button>
      }
    >
      <div className="share-card-modal-body">
        <div className="share-card-preview-shell">
          <canvas
            ref={canvasRef}
            width={pixelWidth}
            height={pixelHeight}
            className="share-card-canvas"
            aria-label={`Share card preview for ${data.modelLabel}`}
          />
        </div>
        <div className="share-card-meta-grid">
          <div>
            <span className="share-card-meta-label">Size</span>
            <span className="share-card-meta-value">
              {pixelWidth}x{pixelHeight} PNG
            </span>
          </div>
          <div>
            <span className="share-card-meta-label">Result</span>
            <span className="share-card-meta-value">{data.scoreValue} score / {data.completedCount} results</span>
          </div>
          <div>
            <span className="share-card-meta-label">Filename</span>
            <span className="share-card-meta-value">{data.fileName}</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
