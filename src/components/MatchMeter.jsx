function getScoreStatus(score) {
  if (score >= 85) return "非常匹配";
  if (score >= 72) return "姿势合格";
  if (score >= 50) return "接近目标";
  return "继续调整";
}

export default function MatchMeter({ score }) {
  const circumference = 2 * Math.PI * 25;
  const offset = circumference - (score / 100) * circumference;
  const scoreStatus = getScoreStatus(score);

  return (
    <div className={`match-meter ${score >= 72 ? "is-ready" : ""}`}>
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
