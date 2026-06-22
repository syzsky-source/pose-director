export default function MatchMeter({ score }) {
  const circumference = 2 * Math.PI * 25;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={`match-meter ${score >= 85 ? "is-ready" : ""}`}>
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
    </div>
  );
}
