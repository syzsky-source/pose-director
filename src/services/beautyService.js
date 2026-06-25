export const BEAUTY_MODES = [
  { id: "original", label: "原片" },
  { id: "natural", label: "自然美颜" },
  { id: "portrait", label: "增强人像" },
];

function drawFilteredCopy(context, canvas, filter, alpha = 1) {
  context.save();
  context.globalAlpha = alpha;
  context.filter = filter;
  context.drawImage(canvas, 0, 0);
  context.restore();
}

function addSoftLight(context, width, height, strength) {
  const gradient = context.createRadialGradient(
    width * 0.5,
    height * 0.34,
    Math.min(width, height) * 0.05,
    width * 0.5,
    height * 0.38,
    Math.max(width, height) * 0.62,
  );

  gradient.addColorStop(0, `rgba(255, 238, 220, ${0.12 * strength})`);
  gradient.addColorStop(0.45, `rgba(255, 255, 255, ${0.035 * strength})`);
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.save();
  context.globalCompositeOperation = "screen";
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function addHighlightRecovery(context, width, height, strength) {
  context.save();
  context.globalCompositeOperation = "multiply";
  context.fillStyle = `rgba(245, 238, 228, ${0.045 * strength})`;
  context.fillRect(0, 0, width, height);
  context.restore();
}

function addSubtleSharpen(context, canvas, strength) {
  context.save();
  context.globalAlpha = 0.22 * strength;
  context.filter = "contrast(1.12) saturate(1.02)";
  context.globalCompositeOperation = "overlay";
  context.drawImage(canvas, 0, 0);
  context.restore();
}

export function applyBeauty(canvas, mode = "natural") {
  if (mode === "original") return canvas;

  const context = canvas.getContext("2d");
  const { width, height } = canvas;
  const strength = mode === "portrait" ? 1.25 : 0.82;
  const original = document.createElement("canvas");
  original.width = width;
  original.height = height;
  original.getContext("2d").drawImage(canvas, 0, 0);

  drawFilteredCopy(
    context,
    original,
    `brightness(${1 + 0.035 * strength}) saturate(${1 + 0.045 * strength}) contrast(${1 - 0.025 * strength})`,
    0.86,
  );

  context.save();
  context.globalAlpha = 0.1 * strength;
  context.filter = `blur(${Math.max(0.8, Math.min(width, height) / 900)}px)`;
  context.drawImage(original, 0, 0);
  context.restore();

  addHighlightRecovery(context, width, height, strength);
  addSoftLight(context, width, height, strength);
  addSubtleSharpen(context, original, strength);

  return canvas;
}
