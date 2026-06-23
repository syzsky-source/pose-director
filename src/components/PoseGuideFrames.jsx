import { useEffect, useRef, useState } from "react";

const GUIDE_ZONES = [
  {
    id: "head",
    label: "头部框",
    points: ["head", "neck"],
    paddingX: 0.07,
    paddingY: 0.055,
  },
  {
    id: "shoulders",
    label: "肩线框",
    points: ["leftShoulder", "rightShoulder"],
    paddingX: 0.075,
    paddingY: 0.05,
  },
  {
    id: "torso",
    label: "躯干框",
    points: ["leftShoulder", "rightShoulder", "leftHip", "rightHip"],
    paddingX: 0.055,
    paddingY: 0.045,
  },
  {
    id: "arms",
    label: "手臂方向框",
    points: [
      "leftShoulder",
      "rightShoulder",
      "leftElbow",
      "rightElbow",
      "leftWrist",
      "rightWrist",
    ],
    paddingX: 0.055,
    paddingY: 0.055,
  },
  {
    id: "feet",
    label: "腿部 / 双脚底座框",
    points: ["leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"],
    paddingX: 0.065,
    paddingY: 0.045,
  },
];

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

function getGuideState(score, scoringEnabled) {
  if (!scoringEnabled) return "neutral";
  if (score >= 72) return "ready";
  if (score >= 50) return "near";
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
  const left = Math.max(0, minX - zone.paddingX * stageWidth);
  const top = Math.max(0, minY - zone.paddingY * stageHeight);
  const right = Math.min(stageWidth, maxX + zone.paddingX * stageWidth);
  const bottom = Math.min(stageHeight, maxY + zone.paddingY * stageHeight);

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
  pose,
  score,
  scoringEnabled = true,
  videoSize,
}) {
  const [containerRef, stageSize] = useElementSize();

  if (!pose?.skeleton) return null;

  const state = getGuideState(score, scoringEnabled);
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
        GUIDE_ZONES.map((zone) => (
          <div
            key={zone.id}
            className={`guide-zone guide-zone-${zone.id}`}
            style={getGuideBox(
              pose.skeleton,
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
