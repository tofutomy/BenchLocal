import { Modal } from "../../shared/components/Modal";
import { Field } from "../../shared/components/settings-primitives";

export function ModelAliasModal({
  alias,
  baseLabel,
  onAliasChange,
  onClose,
  onSubmit
}: {
  alias: string;
  baseLabel: string;
  onAliasChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title="Edit Model Alias"
      subtitle={`Override the display name for this model in the current tab only. Default label: ${baseLabel}`}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Save Alias"
    >
      <Field
        label="Alias"
        value={alias}
        placeholder={baseLabel}
        onChange={onAliasChange}
      />
    </Modal>
  );
}
