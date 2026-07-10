export function VerifierPreparationModal({
  benchPackName,
  verifierId,
  message,
  isCancelling,
  onCancel
}: {
  benchPackName: string;
  verifierId: string;
  message: string;
  isCancelling?: boolean;
  onCancel?: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog-shell verifier-preparation-shell">
        <div className="verifier-preparation-header">
          <div className="verifier-preparation-spinner">
            <span className="spinner" />
          </div>
          <div className="verifier-preparation-copy">
            <p className="eyebrow">Preparing Verifier</p>
            <h3 className="dialog-title">{benchPackName}</h3>
            <p className="section-copy" style={{ marginTop: "12px" }}>
              BenchLocal is preparing <code className="detail-inline-code">{verifierId}</code> before the run can start.
            </p>
          </div>
        </div>

        <p className="settings-row-secondary verifier-preparation-message">{message}</p>

        {onCancel ? (
          <div className="dialog-footer verifier-preparation-footer">
            <button type="button" className="button-warn" onClick={onCancel} disabled={isCancelling}>
              {isCancelling ? <span className="spinner" /> : null}
              {isCancelling ? "Cancelling..." : "Cancel Run"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
