import type { FormEvent } from "react";

export interface MasterDataPasteValues {
  sourceName: string;
  lines: string;
}

export interface MasterDataPasteFormProps {
  helperText?: string;
  disabled: boolean;
  error: string | null;
  status: string | null;
  values: MasterDataPasteValues;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onValuesChange: (nextValues: MasterDataPasteValues) => void;
}

export function MasterDataPasteForm(props: MasterDataPasteFormProps) {
  const { disabled, error, helperText, onSubmit, onValuesChange, status, values } = props;

  return (
    <section className="panel panel-form">
      <h2>2. Master Data</h2>
      <form onSubmit={onSubmit}>
        <label>
          Study material pack name
          <input
            value={values.sourceName}
            onChange={(event) =>
              onValuesChange({
                ...values,
                sourceName: event.target.value
              })
            }
          />
        </label>

        <label>
          Paste study material lines
          <textarea
            rows={8}
            value={values.lines}
            onChange={(event) =>
              onValuesChange({
                ...values,
                lines: event.target.value
              })
            }
          />
        </label>

        <p className="hint">
          One line per item: <code>prompt || canonical answer || visible material || optional keywords</code>
        </p>
        {helperText ? <p className="hint">{helperText}</p> : null}

        <button type="submit" disabled={disabled}>
          {disabled ? "Saving study material..." : "Save study material"}
        </button>
      </form>

      {status ? <p className="status">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
