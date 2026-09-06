import { useEffect, useMemo, useRef, useState } from "react";

const OUTPUT_WIDTH = 300;
const OUTPUT_HEIGHT = 400; // 3:4 passport-style portrait ratio
const JPEG_QUALITY = 0.78;
const MIN_SCALE = 1;
const MAX_SCALE = 4;

interface PassportPhotoCropperProps {
  file: File;
  /** A small JPEG data URL, already cropped/rotated/compressed - ready
   *  to store directly in the `photo_url` column (see the comment in
   *  ReportDataService/report templates: they already expect
   *  `photoDataUrl` to be a browser-renderable src, so a self-contained
   *  data URL is a drop-in fit with no other code changes needed). */
  onConfirm: (dataUrl: string) => void;
  onCancel: () => void;
}

/**
 * A small, dependency-free "refine your passport photo" tool: crop to a
 * fixed passport ratio, pan, zoom, and rotate in 90-degree steps, then
 * export at a fixed small size and JPEG quality - everything runs on a
 * <canvas> already sized to the exact output resolution, so what's
 * visible in the frame is pixel-for-pixel what gets saved. No camera/
 * cropping library: this is small enough, and specific enough to this
 * one use case, to just write directly against the Canvas API.
 *
 * Deliberately built to also work fully offline (pure client-side image
 * processing, no network) - the Capture app hands the resulting data
 * URL straight to its outbox, no different from any other field.
 */
export function PassportPhotoCropper({ file, onConfirm, onCancel }: PassportPhotoCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setScale(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => setError("Could not read this image file.");
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The scale that exactly covers the OUTPUT_WIDTH x OUTPUT_HEIGHT frame
  // for the image at its current rotation, before the user's own zoom is
  // applied on top - this is what makes scale=1 always start "filled,
  // no letterboxing" regardless of the source photo's own dimensions.
  const coverScale = useMemo(() => {
    if (!image) return 1;
    const rotated = rotation === 90 || rotation === 270;
    const iw = rotated ? image.naturalHeight : image.naturalWidth;
    const ih = rotated ? image.naturalWidth : image.naturalHeight;
    return Math.max(OUTPUT_WIDTH / iw, OUTPUT_HEIGHT / ih);
  }, [image, rotation]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
    ctx.fillStyle = "#e9ecef";
    ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

    ctx.translate(OUTPUT_WIDTH / 2 + offset.x, OUTPUT_HEIGHT / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    const finalScale = coverScale * scale;
    ctx.scale(finalScale, finalScale);
    ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
    ctx.restore();

    // Frame guide so it's clear what the passport crop boundary is.
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, OUTPUT_WIDTH - 2, OUTPUT_HEIGHT - 2);
  }, [image, scale, rotation, offset, coverScale]);

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset };
  }
  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy });
  }
  function handlePointerUp() {
    dragRef.current = null;
  }
  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s - e.deltaY * 0.001)));
  }

  function rotateStep() {
    setRotation((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270);
    setOffset({ x: 0, y: 0 });
  }

  function confirm() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onConfirm(canvas.toDataURL("image/jpeg", JPEG_QUALITY));
  }

  if (error) {
    return <div className="alert alert-danger small mb-0">{error}</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-center mb-2">
        <canvas
          ref={canvasRef}
          width={OUTPUT_WIDTH}
          height={OUTPUT_HEIGHT}
          style={{ touchAction: "none", cursor: "grab", borderRadius: 8, maxWidth: "100%", height: "auto" }}
          className="border"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onWheel={handleWheel}
        />
      </div>
      <p className="text-muted small text-center mb-2">Drag to reposition · scroll or use the slider to zoom</p>
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="small text-muted">Zoom</span>
        <input
          type="range"
          className="form-range"
          min={MIN_SCALE}
          max={MAX_SCALE}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
        />
      </div>
      <div className="d-flex justify-content-between gap-2">
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={rotateStep}>
          Rotate
        </button>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={confirm} disabled={!image}>
            Use this photo
          </button>
        </div>
      </div>
    </div>
  );
}
