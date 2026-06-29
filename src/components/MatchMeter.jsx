const STATUS_LABELS = {
  adjusting: "继续调整",
  nearTarget: "接近目标",
  qualified: "姿势合格",
  excellent: "非常匹配",
};

function getScoreStatus(score, status) {
  if (status) return STATUS_LABELS[status] ?? STATUS_LABELS.adjusting;
  if (score >= 85) return STATUS_LABELS.excellent;
  if (score >= 72) return STATUS_LABELS.qualified;
  if (score >= 50) return STATUS_LABELS.nearTarget;
  return STATUS_LABELS.adjusting;
}

export default function MatchMeter({ score, status }) {
  const circumference = 2 * Math.PI * 25;
  const offset = circumference - (score / 100) * circumference;
  const scoreStatus = getScoreStatus(score, status);
  const isReady = status
    ? status === "qualified" || status === "excellent"
    : score >= 72;

  return (
    <div className={`match-meter ${isReady ? "is-ready" : ""}`}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle className="meter-track" cx="30" cy="30" r="25" />
        <circle
          className="meter-value"
          cx="30"
          cy="30"
          r="25"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="meter-copy">
        <strong>{score}</strong>
        <span>MATCH</span>
      </div>
      <small className="meter-status">{scoreStatus}</small>
    </div>
  );
}
