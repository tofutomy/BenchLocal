import { type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import type { GenerationRequest } from "@core";
import { Modal } from "../../shared/components/Modal";
import { Field } from "../../shared/components/settings-primitives";

export type SamplingFormState = {
  temperature: string;
  top_p: string;
  top_k: string;
  min_p: string;
  repetition_penalty: string;
  presence_penalty: string;
  request_timeout_seconds: string;
};

type NumericGenerationRequestKey = {
  [Key in keyof GenerationRequest]: GenerationRequest[Key] extends number | undefined ? Key : never;
}[keyof GenerationRequest];
type SamplingFieldKey = Extract<keyof SamplingFormState, NumericGenerationRequestKey>;

const SAMPLING_FIELDS: Array<{
  key: SamplingFieldKey;
  label: string;
  placeholder: string;
  integer?: boolean;
}> = [
  { key: "temperature", label: "Temperature", placeholder: "Leave blank" },
  { key: "top_p", label: "Top P", placeholder: "Leave blank" },
  { key: "top_k", label: "Top K", placeholder: "Leave blank", integer: true },
  { key: "min_p", label: "Min P", placeholder: "Leave blank" },
  { key: "repetition_penalty", label: "Repetition Penalty", placeholder: "Leave blank" },
  { key: "presence_penalty", label: "Presence Penalty", placeholder: "Leave blank" },
  { key: "request_timeout_seconds", label: "Request Timeout Seconds", placeholder: "Leave blank", integer: true }
];

export function createSamplingForm(input?: GenerationRequest): SamplingFormState {
  return {
    temperature: input?.temperature?.toString() ?? "",
    top_p: input?.top_p?.toString() ?? "",
    top_k: input?.top_k?.toString() ?? "",
    min_p: input?.min_p?.toString() ?? "",
    repetition_penalty: input?.repetition_penalty?.toString() ?? "",
    presence_penalty: input?.presence_penalty?.toString() ?? "",
    request_timeout_seconds: input?.request_timeout_seconds?.toString() ?? ""
  };
}

export function parseSamplingForm(form: SamplingFormState): { value?: GenerationRequest; error?: string } {
  const result: GenerationRequest = {};

  for (const field of SAMPLING_FIELDS) {
    const rawValue = form[field.key].trim();

    if (!rawValue) {
      continue;
    }

    const parsed = field.integer ? Number.parseInt(rawValue, 10) : Number(rawValue);

    if (!Number.isFinite(parsed)) {
      return { error: `${field.label} must be a valid number.` };
    }

    if (field.integer && parsed <= 0) {
      return { error: `${field.label} must be greater than zero.` };
    }

    result[field.key] = parsed;
  }

  return { value: result };
}

export function SamplingModal({
  benchPackName,
  defaults,
  form,
  onChange,
  onClose,
  onSubmit
}: {
  benchPackName: string;
  defaults: GenerationRequest;
  form: SamplingFormState;
  onChange: (form: SamplingFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const hasEffectiveDefaults = Object.values(defaults).some((value) => value !== undefined);

  return (
    <Modal
      title="Bench Pack Samplings"
      subtitle={`Configure request sampling overrides for ${benchPackName}. Blank fields use Bench Pack defaults where defined; otherwise BenchLocal omits them so the inference backend uses its configured defaults.`}
      onClose={onClose}
      onSubmit={onSubmit}
      submitLabel="Save Samplings"
      size="wide"
      leadingActions={
        <button
          type="button"
          onClick={() => onChange(createSamplingForm())}
          className="ghost-button"
        >
          <RotateCcw size={14} />
          Reset Overrides
        </button>
      }
    >
      {hasEffectiveDefaults ? (
        <div className="helper-copy">
          <p>
            Effective defaults:
            {" "}
            {SAMPLING_FIELDS.map((field) => {
              const value = defaults[field.key];
              return value === undefined ? null : (
                <span key={field.key} className="settings-inline-meta">
                  <strong>{field.label}:</strong> {value}
                </span>
              );
            }).filter(Boolean).reduce<ReactNode[]>((items, item, index) => {
              if (index > 0) {
                items.push(<span key={`sep-${index}`}> · </span>);
              }
              items.push(item);
              return items;
            }, [])}
          </p>
        </div>
      ) : (
        <div className="helper-copy">
          <p>This Bench Pack does not define recommended defaults yet. Blank sampling fields are not sent by BenchLocal, except for BenchLocal's request timeout default.</p>
        </div>
      )}
      <div className="entry-grid two-col">
        {SAMPLING_FIELDS.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            value={form[field.key]}
            placeholder={defaults[field.key] === undefined ? field.placeholder : `Default: ${defaults[field.key]}`}
            onChange={(value) => onChange({
              ...form,
              [field.key]: value
            })}
          />
        ))}
      </div>
    </Modal>
  );
}
