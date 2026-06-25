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

function shouldRunFace(template) {
  return ["halfBody", "closeUp"].includes(template?.shotType);
}

export async function detectPose(videoElement, template, timestamp) {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
    return {
      keypoints: null,
      faceLandmarks: null,
      score: 0,
      detected: false,
      composition: { passed: false, score: 0, hints: ["未检测到画面"] },
      scoreResult: null,
      hints: ["未检测到画面"],
    };
  }

  const poseLandmarker = await getPoseLandmarker();
  const poseResult = poseLandmarker.detectForVideo(videoElement, timestamp);
  const landmarks = poseResult.landmarks?.[0];

  if (!landmarks) {
    return {
      keypoints: null,
      faceLandmarks: null,
      score: 0,
      detected: false,
      composition: { passed: false, score: 0, hints: ["未检测到人体，请进入画面"] },
      scoreResult: null,
      hints: ["未检测到人体，请进入画面"],
    };
  }

  const keypoints = toPoseKeypoints(landmarks);
  let faceLandmarks = null;

  if (shouldRunFace(template)) {
    const faceLandmarker = await getFaceLandmarker();
    const faceResult = faceLandmarker.detectForVideo(videoElement, timestamp);
    faceLandmarks = summarizeFace(faceResult.faceLandmarks);
  }

  const composition = checkComposition(
    keypoints,
    faceLandmarks,
    template?.shotType ?? "fullBody",
  );
  const scoreResult = scorePose(keypoints, template, composition);

  return {
    keypoints,
    faceLandmarks,
    score: scoreResult.score,
    detected: true,
    composition,
    scoreResult,
    hints: scoreResult.hints,
  };
}
