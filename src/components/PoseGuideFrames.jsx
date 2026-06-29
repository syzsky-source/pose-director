import { useEffect, useRef, useState } from "react";

function getStagePoint(point, layout) {
  const sourceX = point[0] * layout.videoWidth;
  const sourceY = point[1] * layout.videoHeight;

  return {
    x: sourceX * layout.scale + layout.offsetX,
    y: sourceY * layout.scale + layout.offsetY,
  };
}

function getCoverLayout(stageWidth, stageHeight, videoSize) {
  const scale = Math.max(
    stageWidth / videoSize.videoWidth,
    stageHeight / videoSize.videoHeight,
  );

  return {
    scale,
    videoWidth: videoSize.videoWidth,
    videoHeight: videoSize.videoHeight,
    offsetX: (stageWidth - videoSize.videoWidth * scale) / 2,
    offsetY: (stageHeight - videoSize.videoHeight * scale) / 2,
  };
}

function getGuideState(status, scoringEnabled, detected) {
  if (!scoringEnabled || !detected) return "neutral";
  if (status === "qualified" || status === "excellent") return "ready";
  if (status === "nearTarget") return "near";
  return "idle";
}

function getGuideBox(skeleton, zone, layout, stageWidth, stageHeight) {
  const points = zone.points
    .map((name) => skeleton[name])
    .filter(Boolean)
    .map((point) => getStagePoint(point, layout));

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const paddingX = zone.padding?.x ?? 0.04;
  const paddingY = zone.padding?.y ?? 0.04;
  const left = Math.max(0, minX - paddingX * stageWidth);
  const top = Math.max(0, minY - paddingY * stageHeight);
  const right = Math.min(stageWidth, maxX + paddingX * stageWidth);
  const bottom = Math.min(stageHeight, maxY + paddingY * stageHeight);

  return {
    left: `${(left / stageWidth) * 100}%`,
    top: `${(top / stageHeight) * 100}%`,
    width: `${((right - left) / stageWidth) * 100}%`,
    height: `${((bottom - top) / stageHeight) * 100}%`,
  };
}

function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: rect.width,
        height: rect.height,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size];
}

export default function PoseGuideFrames({
  rule,
  status,
  detected,
  scoringEnabled = true,
  videoSize,
}) {
  const [containerRef, stageSize] = useElementSize();

  if (!rule?.template?.points || !rule?.guideFrame) return null;

  const state = getGuideState(status, scoringEnabled, detected);
  const zones = Object.entries(rule.guideFrame).map(([id, zone]) => ({
    id,
    ...zone,
  }));
  const canLayout =
    stageSize.width > 0 &&
    stageSize.height > 0 &&
    videoSize?.videoWidth > 0 &&
    videoSize?.videoHeight > 0;
  const layout = canLayout
    ? getCoverLayout(stageSize.width, stageSize.height, videoSize)
    : null;

  return (
    <div
      ref={containerRef}
      className={`pose-guide-frames is-${state}`}
      aria-hidden="true"
    >
      {layout &&
        zones.map((zone) => (
          <div
            key={zone.id}
            className={`guide-zone guide-zone-${zone.id} ${
              zone.points.length === 3 ? "is-direction-zone" : ""
            }`}
            style={getGuideBox(
              rule.template.points,
              zone,
              layout,
              stageSize.width,
              stageSize.height,
            )}
          >
            <span>{zone.label}</span>
          </div>
        ))}
    </div>
  );
}
