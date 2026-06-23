import { useEffect, useRef } from "react";
import { SKELETON_CONNECTIONS } from "../data/poses";

function getCanvasPoint(point, layout) {
  const sourceX = point.x * layout.videoWidth;
  const sourceY = point.y * layout.videoHeight;

  return {
    x: sourceX * layout.scale + layout.offsetX,
    y: sourceY * layout.scale + layout.offsetY,
  };
}

function drawSkeleton(context, width, height, keypoints, videoSize) {
  context.clearRect(0, 0, width, height);

  if (!keypoints) return;

  const scale = Math.max(
    width / videoSize.videoWidth,
    height / videoSize.videoHeight,
  );
  const layout = {
    scale,
    videoWidth: videoSize.videoWidth,
    videoHeight: videoSize.videoHeight,
    offsetX: (width - videoSize.videoWidth * scale) / 2,
    offsetY: (height - videoSize.videoHeight * scale) / 2,
  };

  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.88)";
  context.fillStyle = "rgba(255, 255, 255, 0.95)";
  context.lineWidth = Math.max(2, width / 320);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = "rgba(0, 0, 0, 0.45)";
  context.shadowBlur = 7;

  for (const [from, to] of SKELETON_CONNECTIONS) {
    if (!keypoints[from] || !keypoints[to]) continue;

    const start = getCanvasPoint(keypoints[from], layout);
    const end = getCanvasPoint(keypoints[to], layout);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  Object.entries(keypoints)
    .filter(([name]) => !["leftHip", "rightHip"].includes(name))
    .forEach(([, point]) => {
      const canvasPoint = getCanvasPoint(point, layout);
      context.beginPath();
      context.arc(canvasPoint.x, canvasPoint.y, 3.4, 0, Math.PI * 2);
      context.fill();
    });

  context.restore();
}

export default function PoseCanvas({ keypoints, videoSize }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return undefined;

    const render = () => {
      const rect = parent.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * pixelRatio);
      canvas.height = Math.round(rect.height * pixelRatio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      const context = canvas.getContext("2d");
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      drawSkeleton(context, rect.width, rect.height, keypoints, videoSize);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [keypoints, videoSize]);

  return <canvas ref={canvasRef} className="pose-canvas" aria-hidden="true" />;
}
