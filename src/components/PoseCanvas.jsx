import { useEffect, useRef } from "react";
import { SKELETON_CONNECTIONS } from "../data/poses";

function drawSkeleton(context, width, height, keypoints) {
  context.clearRect(0, 0, width, height);
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, 0.82)";
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = Math.max(1.5, width / 360);
  context.lineCap = "round";
  context.setLineDash([7, 7]);
  context.shadowColor = "rgba(0, 0, 0, 0.35)";
  context.shadowBlur = 5;

  for (const [from, to] of SKELETON_CONNECTIONS) {
    const [fromX, fromY] = keypoints[from];
    const [toX, toY] = keypoints[to];
    context.beginPath();
    context.moveTo(fromX * width, fromY * height);
    context.lineTo(toX * width, toY * height);
    context.stroke();
  }

  const [headX, headY] = keypoints.head;
  context.beginPath();
  context.ellipse(
    headX * width,
    headY * height,
    width * 0.046,
    height * 0.055,
    0,
    0,
    Math.PI * 2,
  );
  context.stroke();

  context.setLineDash([]);
  Object.entries(keypoints)
    .filter(([name]) => name !== "head")
    .forEach(([, [x, y]]) => {
      context.beginPath();
      context.arc(x * width, y * height, 2.2, 0, Math.PI * 2);
      context.fill();
    });
  context.restore();
}

export default function PoseCanvas({ keypoints }) {
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
      drawSkeleton(context, rect.width, rect.height, keypoints);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [keypoints]);

  return <canvas ref={canvasRef} className="pose-canvas" aria-hidden="true" />;
}
