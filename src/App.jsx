import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Download,
  RefreshCw,
  ScanLine,
  Sparkles,
} from "lucide-react";
import MatchMeter from "./components/MatchMeter";
import PoseCanvas from "./components/PoseCanvas";
import { POSES } from "./data/poses";
import { useCamera } from "./hooks/useCamera";
import { detectPose } from "./services/poseDetection";

const COUNTDOWN_SECONDS = 3;

export default function App() {
  const { videoRef, status, error, startCamera } = useCamera();
  const [selectedPoseIndex, setSelectedPoseIndex] = useState(0);
  const [score, setScore] = useState(POSES[0].initialScore);
  const [countdown, setCountdown] = useState(null);
  const [capturedImage, setCapturedImage] = useState("");
  const detectionStartRef = useRef(performance.now());
  const capturedRef = useRef(false);
  const currentPose = POSES[selectedPoseIndex];

  const resetSession = useCallback(() => {
    capturedRef.current = false;
    setCapturedImage("");
    setCountdown(null);
    setScore(currentPose.initialScore);
    detectionStartRef.current = performance.now();
  }, [currentPose.initialScore]);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || capturedRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    capturedRef.current = true;
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.92));
    setCountdown(null);
  }, [videoRef]);

  useEffect(() => {
    resetSession();
  }, [selectedPoseIndex, resetSession]);

  useEffect(() => {
    if (status !== "ready" || capturedImage) return undefined;

    let active = true;
    let animationFrame;
    let lastDetection = 0;

    const runDetection = async (timestamp) => {
      if (!active) return;
      if (timestamp - lastDetection > 180) {
        lastDetection = timestamp;
        const result = await detectPose(
          videoRef.current,
          currentPose,
          timestamp - detectionStartRef.current,
        );
        if (active) setScore(result.score);
      }
      animationFrame = requestAnimationFrame(runDetection);
    };

    animationFrame = requestAnimationFrame(runDetection);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
    };
  }, [capturedImage, currentPose, status, videoRef]);

  useEffect(() => {
    if (score >= 85 && countdown === null && !capturedImage) {
      setCountdown(COUNTDOWN_SECONDS);
    }
  }, [capturedImage, countdown, score]);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (countdown === 0) {
      capturePhoto();
      return undefined;
    }

    const timer = window.setTimeout(
      () => setCountdown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [capturePhoto, countdown]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark"><ScanLine size={18} /></span>
          <div>
            <h1>姿势导演</h1>
            <p>POSE DIRECTOR</p>
          </div>
        </div>
        <div className="session-status">
          <span className={status === "ready" ? "live-dot" : "idle-dot"} />
          {status === "ready" ? "实时指导中" : "等待相机"}
        </div>
        <span className="raw-badge">RAW</span>
      </header>

      <section className="studio">
        <div className="camera-stage">
          <video
            ref={videoRef}
            className="camera-feed"
            autoPlay
            muted
            playsInline
          />

          {status !== "ready" && (
            <div className="camera-state">
              <img src="/camera-frame.svg" alt="" />
              {status === "requesting" ? (
                <>
                  <strong>正在连接摄像头</strong>
                  <span>请在浏览器提示中允许摄像头访问</span>
                </>
              ) : (
                <>
                  <strong>无法开启取景器</strong>
                  <span>{error}</span>
                  <button className="secondary-button" onClick={startCamera}>
                    <RefreshCw size={15} />
                    重新连接
                  </button>
                </>
              )}
            </div>
          )}

          {status === "ready" && !capturedImage && (
            <>
              <PoseCanvas keypoints={currentPose.skeleton} />
              <div className="frame-corners" aria-hidden="true">
                <i /><i /><i /><i />
              </div>
            </>
          )}

          {countdown !== null && (
            <div className="countdown-layer">
              <div key={countdown} className="countdown-number">
                {countdown}
              </div>
              <span>保持姿势</span>
            </div>
          )}

          <div className="camera-meta">
            <span>1/125</span>
            <span>F 2.8</span>
            <span>ISO 200</span>
          </div>

          {!capturedImage && (
            <div className="direction-panel">
              <div className="direction-copy">
                <span className="eyebrow">导演指令 · {currentPose.number}</span>
                <p className={score >= 85 ? "ready-message" : ""}>
                  {score >= 85 ? (
                    <>
                      <Check size={17} />
                      姿势很好，3 秒后拍摄
                    </>
                  ) : (
                    currentPose.instruction
                  )}
                </p>
              </div>
              <MatchMeter score={score} />
            </div>
          )}
        </div>

        <aside className="control-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">POSE LIBRARY</span>
              <h2>选择指导姿势</h2>
            </div>
            <span className="pose-count">
              {selectedPoseIndex + 1} / {POSES.length}
            </span>
          </div>

          <div className="pose-list">
            {POSES.map((pose, index) => (
              <button
                key={pose.id}
                className={`pose-card ${
                  index === selectedPoseIndex ? "is-selected" : ""
                }`}
                onClick={() => setSelectedPoseIndex(index)}
              >
                <span className="pose-number">{pose.number}</span>
                <span className="pose-card-copy">
                  <strong>{pose.name}</strong>
                  <small>{pose.instruction}</small>
                </span>
                <span className="mini-figure" aria-hidden="true">
                  <i />
                </span>
              </button>
            ))}
          </div>

          <div className="shutter-area">
            <button
              className="shutter-button"
              onClick={capturePhoto}
              disabled={status !== "ready" || Boolean(capturedImage)}
              aria-label="立即拍摄"
              title="立即拍摄"
            >
              <span />
            </button>
            <div>
              <strong>自动快门已开启</strong>
              <span>匹配度达到 85% 后自动拍摄</span>
            </div>
          </div>
        </aside>
      </section>

      {capturedImage && (
        <div className="result-overlay">
          <section className="result-dialog" aria-modal="true" role="dialog">
            <div className="result-photo">
              <img src={capturedImage} alt="本次拍摄结果" />
              <span><Sparkles size={14} /> CAPTURED</span>
            </div>
            <div className="result-content">
              <span className="eyebrow">拍摄完成</span>
              <h2>这一张，很有感觉。</h2>
              <p>{currentPose.name} · 最终匹配度 {score}%</p>
              <div className="result-actions">
                <button className="secondary-button" onClick={resetSession}>
                  <RefreshCw size={16} />
                  重新拍摄
                </button>
                <a
                  className="primary-button"
                  href={capturedImage}
                  download={`pose-director-${currentPose.id}.jpg`}
                >
                  <Download size={16} />
                  保存照片
                </a>
              </div>
            </div>
          </section>
        </div>
      )}

      <footer>
        <span><Camera size={13} /> CAMERA READY</span>
        <p>让每一次按下快门，都有摄影师在场。</p>
        <span>WEB APP · 01</span>
      </footer>
    </main>
  );
}
