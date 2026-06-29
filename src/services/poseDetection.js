import {
  FaceLandmarker,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { checkComposition } from "./compositionCheck";
import { scorePose } from "./poseScoring";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const POSE_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
const FACE_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

const LANDMARK_INDEXES = {
  head: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
};

let visionPromise;
let poseLandmarkerPromise;
let faceLandmarkerPromise;
const smoothedScores = new Map();

function getVision() {
  if (!visionPromise) {
    visionPromise = FilesetResolver.forVisionTasks(WASM_PATH);
  }

  return visionPromise;
}

async function getPoseLandmarker() {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = getVision().then((vision) =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_PATH,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }).catch(() =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: POSE_MODEL_PATH,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
      ),
    );
  }

  return poseLandmarkerPromise;
}

async function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = getVision().then((vision) =>
      FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: FACE_MODEL_PATH,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }).catch(() =>
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: FACE_MODEL_PATH,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
      ),
    );
  }

  return faceLandmarkerPromise;
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function normalizeLandmark(landmark) {
  return {
    x: clamp01(1 - landmark.x),
    y: clamp01(landmark.y),
    z: landmark.z ?? 0,
    visibility: landmark.visibility ?? landmark.presence ?? 1,
  };
}

function averagePoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: (first.z + second.z) / 2,
    visibility: Math.min(first.visibility, second.visibility),
  };
}

function toPoseKeypoints(landmarks) {
  const points = Object.fromEntries(
    Object.entries(LANDMARK_INDEXES).map(([name, index]) => [
      name,
      normalizeLandmark(landmarks[index]),
    ]),
  );

  points.neck = averagePoint(points.leftShoulder, points.rightShoulder);
  points.hip = averagePoint(points.leftHip, points.rightHip);

  return points;
}

function summarizeFace(faceLandmarks) {
  const landmarks = faceLandmarks?.[0];

  if (!landmarks?.length) return null;

  const points = landmarks.map((landmark) => ({
    x: clamp01(1 - landmark.x),
    y: clamp01(landmark.y),
    z: landmark.z ?? 0,
  }));
  const bounds = {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };

  return {
    points,
    bounds,
  };
}

function shouldRunFace(rule) {
  return ["halfBody", "closeUp"].includes(rule?.shotType);
}

function getEmptyResult(rule, message) {
  return {
    score: 0,
    rawScore: 0,
    detected: false,
    keypoints: null,
    faceLandmarks: null,
    featureScores: {},
    weakestFeature: null,
    correctionMessage: message,
    status: "adjusting",
    statusMessage: message,
    composition: { passed: false, score: 0, hints: [message] },
    scoreResult: null,
    hints: [message],
    ruleId: rule?.id ?? null,
  };
}

function smoothScore(rule, rawScore) {
  const smoothing = rule.scoring?.smoothing;
  if (smoothing?.enabled === false) return rawScore;

  const alpha = clamp01(smoothing?.alpha ?? 0.38);
  const previous = smoothedScores.get(rule.id);
  const score =
    previous === undefined
      ? rawScore
      : previous * (1 - alpha) + rawScore * alpha;

  smoothedScores.set(rule.id, score);
  return Math.round(score);
}

function getStatus(score, rule) {
  if (score >= rule.feedbackRules.excellent.minScore) return "excellent";
  if (
    score >=
    (rule.autoCapture.threshold || rule.feedbackRules.qualified.minScore)
  ) {
    return "qualified";
  }
  if (score >= rule.feedbackRules.nearTarget.minScore) return "nearTarget";
  return "adjusting";
}

function getStatusMessage(status, rule) {
  const feedbackKey = {
    adjusting: "lowScore",
    nearTarget: "nearTarget",
    qualified: "qualified",
    excellent: "excellent",
  }[status];

  return rule.feedbackRules[feedbackKey]?.message ?? rule.instruction;
}

export function resetPoseSmoothing(ruleId) {
  if (ruleId) {
    smoothedScores.delete(ruleId);
    return;
  }

  smoothedScores.clear();
}

export async function detectPose(videoElement, rule, timestamp) {
  const detectedFalseMessage =
    rule?.feedbackRules?.detectedFalse ?? "未检测到人体，请进入画面";

  if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
    resetPoseSmoothing(rule?.id);
    return getEmptyResult(rule, detectedFalseMessage);
  }

  const poseLandmarker = await getPoseLandmarker();
  const poseResult = poseLandmarker.detectForVideo(videoElement, timestamp);
  const landmarks = poseResult.landmarks?.[0];

  if (!landmarks) {
    resetPoseSmoothing(rule?.id);
    return getEmptyResult(rule, detectedFalseMessage);
  }

  const keypoints = toPoseKeypoints(landmarks);
  let faceLandmarks = null;

  if (shouldRunFace(rule)) {
    const faceLandmarker = await getFaceLandmarker();
    const faceResult = faceLandmarker.detectForVideo(videoElement, timestamp);
    faceLandmarks = summarizeFace(faceResult.faceLandmarks);
  }

  const composition = checkComposition(
    keypoints,
    faceLandmarks,
    rule?.shotType ?? "fullBody",
  );
  const scoreResult = scorePose(keypoints, rule, composition);
  const score = smoothScore(rule, scoreResult.rawScore);
  const scoreStatus = getStatus(score, rule);
  const status =
    !composition.passed &&
    (scoreStatus === "qualified" || scoreStatus === "excellent")
      ? "nearTarget"
      : scoreStatus;
  const passed =
    ["qualified", "excellent"].includes(status) &&
    scoreResult.visibilityRatio >=
      rule.scoring.tolerance.minimumVisibleRatio &&
    composition.passed;
  const statusMessage = getStatusMessage(status, rule);

  return {
    keypoints,
    faceLandmarks,
    score,
    rawScore: scoreResult.rawScore,
    detected: true,
    composition,
    featureScores: scoreResult.featureScores,
    weakestFeature: scoreResult.weakestFeature,
    correctionMessage: scoreResult.correctionMessage,
    status,
    statusMessage,
    scoreResult: {
      ...scoreResult,
      score,
      status,
      statusMessage,
      passed,
      canAutoCapture:
        rule.mode === "autoCapture" &&
        rule.autoCapture.enabled === true &&
        passed,
    },
    hints: [
      status === "adjusting"
        ? scoreResult.correctionMessage
        : statusMessage,
    ],
    ruleId: rule.id,
  };
}
