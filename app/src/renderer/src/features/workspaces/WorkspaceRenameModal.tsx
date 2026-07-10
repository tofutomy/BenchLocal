import { Modal } from "../../shared/components/Modal";
import { Field } from "../../shared/components/settings-primitives";

export function WorkspaceRenameModal({
  name,
  onNameChange,
  onClose,
  onSubmit
}: {
  name: string;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      title="Rename Workspace"
      subtitle="Change the display name for this workspace."
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Save Workspace"
    >
      <Field
        label="Workspace Name"
        value={name}
        onChange={onNameChange}
      />
    </Modal>
  );
}
