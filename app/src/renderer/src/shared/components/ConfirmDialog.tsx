import { Modal } from "./Modal";

export type ConfirmDialogState =
  | {
      title: string;
      subtitle: string;
      confirmLabel: string;
      tone?: "danger" | "neutral";
      onConfirm: () => void;
    }
  | null;

export function ConfirmDialog({
  dialog,
  onClose
}: {
  dialog: NonNullable<ConfirmDialogState>;
  onClose: () => void;
}) {
  return (
    <Modal
      title={dialog.title}
      subtitle={dialog.subtitle}
      onClose={onClose}
      onSubmit={() => {
        dialog.onConfirm();
        onClose();
      }}
      submitLabel={dialog.confirmLabel}
      submitTone={dialog.tone === "danger" ? "danger" : "primary"}
    />
  );
}