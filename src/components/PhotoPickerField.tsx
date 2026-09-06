import { useRef, useState } from "react";
import { PassportPhotoCropper } from "./PassportPhotoCropper";

interface PhotoPickerFieldProps {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}

/**
 * "Student photo (optional)" field used by both registration forms -
 * shows a thumbnail (or a placeholder), a button to add/replace it via
 * PassportPhotoCropper, and a remove option. Picking a file always opens
 * the cropper before anything is accepted, so every stored photo has
 * already been through the same crop/rotate/compress step - there's no
 * path that saves a raw, unrefined upload.
 */
export function PhotoPickerField({ value, onChange }: PhotoPickerFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPendingFile(file);
    e.target.value = "";
  }

  if (pendingFile) {
    return (
      <div className="actrs-card p-3">
        <PassportPhotoCropper
          file={pendingFile}
          onConfirm={(dataUrl) => {
            onChange(dataUrl);
            setPendingFile(null);
          }}
          onCancel={() => setPendingFile(null)}
        />
      </div>
    );
  }

  return (
    <div className="d-flex align-items-center gap-3">
      <div
        style={{
          width: 72,
          height: 96,
          borderRadius: 8,
          overflow: "hidden",
          background: "#e9ecef",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
        className="border"
      >
        {value ? (
          <img src={value} alt="Student" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span className="text-muted" style={{ fontSize: "0.65rem" }}>
            No photo
          </span>
        )}
      </div>
      <div className="d-flex flex-column gap-2">
        <input ref={inputRef} type="file" accept="image/*" className="d-none" onChange={handleFileSelected} />
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => inputRef.current?.click()}>
          {value ? "Replace photo" : "Add photo"}
        </button>
        {value && (
          <button type="button" className="btn btn-link btn-sm text-danger p-0" onClick={() => onChange(null)}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
