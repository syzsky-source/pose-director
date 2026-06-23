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

function getGuideState(score, scoringEnabled) {
  if (!scoringEnabled) return "neutral";
  if (score >= 72) return "ready";
  if (score >= 50) return "near";
  return "idle";
}

function getGuideBox(skeleton, zone) {
  const points = zone.points
    .map((name) => skeleton[name])
    .filter(Boolean)
    .map(([x, y]) => ({ x, y }));

  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));

  return {
    left: `${Math.max(0, minX - zone.paddingX) * 100}%`,
    top: `${Math.max(0, minY - zone.paddingY) * 100}%`,
    width: `${Math.min(1, maxX + zone.paddingX) * 100 - Math.max(0, minX - zone.paddingX) * 100}%`,
    height: `${Math.min(1, maxY + zone.paddingY) * 100 - Math.max(0, minY - zone.paddingY) * 100}%`,
  };
}

export default function PoseGuideFrames({ pose, score, scoringEnabled = true }) {
  if (!pose?.skeleton) return null;

  const state = getGuideState(score, scoringEnabled);

  return (
    <div className={`pose-guide-frames is-${state}`} aria-hidden="true">
      {GUIDE_ZONES.map((zone) => (
        <div
          key={zone.id}
          className={`guide-zone guide-zone-${zone.id}`}
          style={getGuideBox(pose.skeleton, zone)}
        >
          <span>{zone.label}</span>
        </div>
      ))}
    </div>
  );
}
