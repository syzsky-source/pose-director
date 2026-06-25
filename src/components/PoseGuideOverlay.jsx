import { getShotFrame, shotTypeLabels } from "../services/compositionCheck";

function getState(scoreResult, detected) {
  if (!detected) return "idle";
  if (scoreResult?.canAutoCapture) return "ready";
  if (scoreResult?.score >= 60) return "near";
  return "adjust";
}

export default function PoseGuideOverlay({
  detected,
  pose,
  scoreResult,
  composition,
}) {
  const shotType = pose?.shotType ?? "fullBody";
  const frameStyle = getShotFrame(shotType);
  const state = getState(scoreResult, detected);
  const hints = scoreResult?.hints?.length
    ? scoreResult.hints
    : composition?.hints ?? [];

  return (
    <div className={`pose-guide-overlay is-${state}`} aria-hidden="true">
      <div className={`shot-frame shot-frame-${shotType}`} style={frameStyle}>
        <span>{shotTypeLabels[shotType] ?? "取景"}</span>
      </div>
      <div className="pose-silhouette">
        <i className="silhouette-head" />
        <i className="silhouette-body" />
        <i className="silhouette-left-arm" />
        <i className="silhouette-right-arm" />
      </div>
      {composition?.bounds && (
        <div
          className="subject-bounds"
          style={{
            left: `${composition.bounds.minX * 100}%`,
            top: `${composition.bounds.minY * 100}%`,
            width: `${(composition.bounds.maxX - composition.bounds.minX) * 100}%`,
            height: `${(composition.bounds.maxY - composition.bounds.minY) * 100}%`,
          }}
        />
      )}
      {hints.slice(0, 2).map((hint, index) => (
        <span key={hint} className={`guide-hint-dot guide-hint-dot-${index + 1}`}>
          {hint}
        </span>
      ))}
    </div>
  );
}
