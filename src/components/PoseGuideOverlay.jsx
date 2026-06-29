import { getShotFrame, shotTypeLabels } from "../services/compositionCheck";

function getState(status, detected) {
  if (!detected) return "idle";
  if (status === "qualified" || status === "excellent") return "ready";
  if (status === "nearTarget") return "near";
  return "adjust";
}

export default function PoseGuideOverlay({
  detected,
  rule,
  status,
  correctionMessage,
  composition,
}) {
  const shotType = rule?.shotType ?? "fullBody";
  const frameStyle = getShotFrame(shotType);
  const state = getState(status, detected);
  const hints = correctionMessage
    ? [correctionMessage]
    : composition?.hints ?? [];

  return (
    <div className={`pose-guide-overlay is-${state}`} aria-hidden="true">
      <div className={`shot-frame shot-frame-${shotType}`} style={frameStyle}>
        <span>{shotTypeLabels[shotType] ?? "取景"}</span>
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
