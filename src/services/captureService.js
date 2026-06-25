import { applyBeauty } from "./beautyService";

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.94) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function captureHighResolutionPhoto(video, beautyMode = "natural") {
  if (!video?.videoWidth || !video?.videoHeight) return null;

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { alpha: false });

  context.save();
  context.translate(canvas.width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  context.restore();

  applyBeauty(canvas, beautyMode);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.94);
  const url = URL.createObjectURL(blob);

  return {
    url,
    blob,
    width: canvas.width,
    height: canvas.height,
    size: blob.size,
    sizeLabel: formatFileSize(blob.size),
    mode: beautyMode,
  };
}

export function revokeCapturedPhoto(photo) {
  if (photo?.url) URL.revokeObjectURL(photo.url);
}
