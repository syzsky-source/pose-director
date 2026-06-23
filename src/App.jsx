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
import PoseGuideFrames from "./components/PoseGuideFrames";
import PoseCanvas from "./components/PoseCanvas";
import { POSES } from "./data/poses";
import { TUTORIALS } from "./data/tutorials";
import { useCamera } from "./hooks/useCamera";
import { detectPose } from "./services/poseDetection";

const COUNTDOWN_SECONDS = 3;
const READY_SCORE = 72;
const STABLE_READY_MS = 1500;
const SCORE_SMOOTHING_ALPHA = 0.38;
const DEFAULT_VIDEO_SIZE = {
  videoWidth: 1280,
  videoHeight: 960,
};

export default function App() {
  const { videoRef, status, error, startCamera } = useCamera();
  const [selectedPoseIndex, setSelectedPoseIndex] = useState(0);
  const [activeTutorialId, setActiveTutorialId] = useState("");
  const [isTutorialLibraryOpen, setIsTutorialLibraryOpen] = useState(false);
  const [score, setScore] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [capturedImage, setCapturedImage] = useState("");
  const [poseResult, setPoseResult] = useState({
    detected: false,
    keypoints: null,
  });
  const [videoSize, setVideoSize] = useState(DEFAULT_VIDEO_SIZE);
  const capturedRef = useRef(false);
  const countdownRef = useRef(null);
  const stableSinceRef = useRef(null);
  const smoothedScoreRef = useRef(null);
  const activeTutorial = TUTORIALS.find(
    (tutorial) => tutorial.id === activeTutorialId,
  );
  const currentPose = activeTutorial?.pose ?? POSES[selectedPoseIndex];
  const scoringEnabled = activeTutorial?.scoringEnabled !== false;
  const autoCapture = activeTutorial
    ? activeTutorial.autoCapture
    : {
        enabled: true,
        threshold: READY_SCORE,
        stableMs: STABLE_READY_MS,
      };
  const autoCaptureEnabled = autoCapture?.enabled !== false;
  const readyScore = autoCapture?.threshold ?? READY_SCORE;
  const stableReadyMs = autoCapture?.stableMs ?? STABLE_READY_MS;

  const resetSession = useCallback(() => {
    capturedRef.current = false;
    stableSinceRef.current = null;
    smoothedScoreRef.current = null;
    setCapturedImage("");
    setCountdown(null);
    setScore(0);
    setPoseResult({
      detected: false,
      keypoints: null,
    });
  }, []);

  const updateVideoSize = useCallback(() => {
    const video = videoRef.current;

    if (!video?.videoWidth || !video?.videoHeight) return;

    setVideoSize({
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
    });
  }, [videoRef]);

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
    stableSinceRef.current = null;
    smoothedScoreRef.current = null;
    setCapturedImage(canvas.toDataURL("image/jpeg", 0.92));
    setCountdown(null);
  }, [videoRef]);

  useEffect(() => {
    resetSession();
  }, [activeTutorialId, selectedPoseIndex, resetSession]);

  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);

  useEffect(() => {
    if (status !== "ready" || capturedImage) return undefined;
    if (!scoringEnabled) {
      stableSinceRef.current = null;
      smoothedScoreRef.current = null;
      setPoseResult({
        detected: false,
        keypoints: null,
      });
      setScore(0);
      setCountdown(null);
      return undefined;
    }

    let active = true;
    let animationFrame;
    let lastDetection = 0;

    const updateReadyState = (result, timestamp) => {
      if (!autoCaptureEnabled) {
        stableSinceRef.current = null;
        if (countdownRef.current !== null) setCountdown(null);
        return;
      }

      const isReady = result.detected && result.score >= readyScore;

      if (!isReady) {
        stableSinceRef.current = null;
        if (countdownRef.current !== null) setCountdown(null);
        return;
      }

      if (stableSinceRef.current === null) {
        stableSinceRef.current = timestamp;
        return;
      }

      if (
        timestamp - stableSinceRef.current >= stableReadyMs &&
        countdownRef.current === null &&
        !capturedRef.current
      ) {
        setCountdown(COUNTDOWN_SECONDS);
      }
    };

    const runDetection = async (timestamp) => {
      if (!active) return;

      if (timestamp - lastDetection > 80) {
        lastDetection = timestamp;
        updateVideoSize();

        try {
          const result = await detectPose(videoRef.current, currentPose, timestamp);

          if (active) {
            const nextScore = result.detected
              ? Math.round(
                  smoothedScoreRef.current === null
                    ? result.score
                    : smoothedScoreRef.current * (1 - SCORE_SMOOTHING_ALPHA) +
                        result.score * SCORE_SMOOTHING_ALPHA,
                )
              : 0;
            smoothedScoreRef.current = result.detected ? nextScore : null;
            const smoothedResult = {
              ...result,
              score: nextScore,
            };

            setPoseResult({
              detected: smoothedResult.detected,
              keypoints: smoothedResult.keypoints,
            });
            setScore(smoothedResult.score);
            updateReadyState(smoothedResult, timestamp);
          }
        } catch (detectionError) {
          console.error("Pose detection failed", detectionError);
          if (active) {
            setPoseResult({
              detected: false,
              keypoints: null,
            });
            setScore(0);
            smoothedScoreRef.current = null;
            stableSinceRef.current = null;
            setCountdown(null);
          }
        }
      }

      animationFrame = requestAnimationFrame(runDetection);
    };

    animationFrame = requestAnimationFrame(runDetection);
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
    };
  }, [
    autoCaptureEnabled,
    capturedImage,
    currentPose,
    readyScore,
    scoringEnabled,
    stableReadyMs,
    status,
    updateVideoSize,
    videoRef,
  ]);

  useEffect(() => {
    if (countdown === null) return undefined;
    if (!autoCaptureEnabled || !poseResult.detected || score < readyScore) {
      setCountdown(null);
      return undefined;
    }
    if (countdown === 0) {
      capturePhoto();
      return undefined;
    }

    const timer = window.setTimeout(
      () => setCountdown((value) => value - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [
    autoCaptureEnabled,
    capturePhoto,
    countdown,
    poseResult.detected,
    readyScore,
    score,
  ]);

  const isPoseQualified = scoringEnabled && poseResult.detected && score >= readyScore;
  const isReadyToShoot = isPoseQualified && autoCaptureEnabled;
  const instructionText = poseResult.detected
    ? currentPose.instruction
    : "未检测到人体，请进入画面";

  const startTutorialPractice = (tutorial) => {
    setActiveTutorialId(tutorial.id);
    setIsTutorialLibraryOpen(false);
  };

  const selectPose = (index) => {
    setActiveTutorialId("");
    setSelectedPoseIndex(index);
  };

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
            onLoadedMetadata={updateVideoSize}
          />

          {status !== "ready" && (
            <div className="camera-state">
              <img src="/camera-frame.svg" alt="" />
              {status === "requesting" ? (
                <>
                  <strong>正在连接摄像头</strong>
                  <span>请在浏览器提示中允许摄像头访问。</span>
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
              <PoseCanvas
                keypoints={poseResult.detected ? poseResult.keypoints : null}
                videoSize={videoSize}
              />
              {activeTutorial && (
                <PoseGuideFrames
                  pose={currentPose}
                  score={score}
                  scoringEnabled={scoringEnabled && poseResult.detected}
                  videoSize={videoSize}
                />
              )}
              {!poseResult.detected && (
                <div className="no-person-message">
                  {scoringEnabled
                    ? "未检测到人体，请进入画面"
                    : "引导练习模式：请对齐画面中的分区框"}
                </div>
              )}
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
                <p className={isReadyToShoot ? "ready-message" : ""}>
                  {isReadyToShoot ? (
                    <>
                      <Check size={17} />
                      姿势合格，稳定 {stableReadyMs / 1000} 秒后自动拍摄
                    </>
                  ) : isPoseQualified ? (
                    <>
                      <Check size={17} />
                      姿势合格，继续微调
                    </>
                  ) : !scoringEnabled ? (
                    activeTutorial?.pose.instruction
                  ) : (
                    instructionText
                  )}
                </p>
              </div>
              {scoringEnabled ? (
                <MatchMeter score={score} />
              ) : (
                <div className="guide-practice-badge">
                  <strong>GUIDE</strong>
                  <span>引导练习</span>
                </div>
              )}
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
                onClick={() => selectPose(index)}
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

          <div className="tutorial-library">
            <button
              className="tutorial-library-toggle"
              onClick={() => setIsTutorialLibraryOpen((value) => !value)}
            >
              <span>
                <small className="eyebrow">TUTORIAL LIBRARY</small>
                姿势教程库
              </span>
              <strong>{isTutorialLibraryOpen ? "收起" : "打开"}</strong>
            </button>

            {activeTutorial && (
              <div className="active-tutorial-chip">
                当前练习：{activeTutorial.title}
              </div>
            )}

            {isTutorialLibraryOpen && (
              <div className="tutorial-drawer">
                {TUTORIALS.map((tutorial) => (
                  <article
                    key={tutorial.id}
                    className={`tutorial-card ${
                      tutorial.id === activeTutorialId ? "is-active" : ""
                    }`}
                  >
                    <img src={tutorial.image} alt={`${tutorial.title}效果图`} />
                    <div className="tutorial-card-body">
                      <div className="tutorial-card-heading">
                        <div>
                          <span className="eyebrow">POSE TUTORIAL</span>
                          <h3>{tutorial.title}</h3>
                        </div>
                        <span>{tutorial.difficulty}</span>
                      </div>
                      <p>{tutorial.scene}</p>
                      <ul>
                        {tutorial.tips.map((tip) => (
                          <li key={tip}>{tip}</li>
                        ))}
                      </ul>
                      <button
                        className="tutorial-practice-button"
                        onClick={() => startTutorialPractice(tutorial)}
                      >
                        开始练习
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
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
              <span>
                {activeTutorial && !autoCaptureEnabled
                  ? "当前教程仅辅助评分，不强制自动拍照。"
                  : `匹配度达到 ${readyScore}% 并稳定 ${
                      stableReadyMs / 1000
                    } 秒后自动倒计时。`}
              </span>
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
