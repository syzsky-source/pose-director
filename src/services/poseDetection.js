import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";

const WASM_PATH =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

const MIN_VISIBILITY = 0.45;
const MIN_LIMB_VISIBILITY = 0.35;

const LEFT_RIGHT_PAIRS = [
  ["leftShoulder", "rightShoulder"],
  ["leftElbow", "rightElbow"],
  ["leftWrist", "rightWrist"],
  ["leftHip", "rightHip"],
  ["leftKnee", "rightKnee"],
  ["leftAnkle", "rightAnkle"],
];

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

const ANGLE_FEATURES = [
  ["leftElbow", "leftShoulder", "leftElbow", "leftWrist", 1],
  ["rightElbow", "rightShoulder", "rightElbow", "rightWrist", 1],
  ["leftKnee", "leftHip", "leftKnee", "leftAnkle", 1],
  ["rightKnee", "rightHip", "rightKnee", "rightAnkle", 1],
  ["leftShoulder", "leftElbow", "leftShoulder", "neck", 0.75],
  ["rightShoulder", "rightElbow", "rightShoulder", "neck", 0.75],
  ["leftHip", "leftShoulder", "leftHip", "leftKnee", 0.85],
  ["rightHip", "rightShoulder", "rightHip", "rightKnee", 0.85],
];

const POSITION_FEATURES = [
  "leftWrist",
  "rightWrist",
  "leftElbow",
  "rightElbow",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
];

let landmarkerPromise;

async function getPoseLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = FilesetResolver.forVisionTasks(WASM_PATH).then(
      (vision) =>
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_PATH,
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
              modelAssetPath: MODEL_PATH,
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

  return landmarkerPromise;
}

function normalizeLandmark(landmark) {
  return {
    x: clamp01(1 - landmark.x),
    y: clamp01(landmark.y),
    z: landmark.z ?? 0,
    visibility: landmark.visibility ?? landmark.presence ?? 1,
  };
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
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

function hasReliableBody(points) {
  const corePoints = [
    points.head,
    points.leftShoulder,
    points.rightShoulder,
    points.leftHip,
    points.rightHip,
  ];
  const limbPoints = [
    points.leftElbow,
    points.rightElbow,
    points.leftWrist,
    points.rightWrist,
    points.leftKnee,
    points.rightKnee,
    points.leftAnkle,
    points.rightAnkle,
  ];

  return (
    corePoints.every((point) => point.visibility >= MIN_VISIBILITY) &&
    limbPoints.filter((point) => point.visibility >= MIN_LIMB_VISIBILITY)
      .length >= 6
  );
}

function toVector(from, to) {
  return {
    x: to.x - from.x,
    y: to.y - from.y,
  };
}

function angleBetween(first, second) {
  const dot = first.x * second.x + first.y * second.y;
  const firstLength = Math.hypot(first.x, first.y);
  const secondLength = Math.hypot(second.x, second.y);

  if (!firstLength || !secondLength) return 0;

  const cosine = Math.min(Math.max(dot / (firstLength * secondLength), -1), 1);
  return (Math.acos(cosine) * 180) / Math.PI;
}

function lineAngle(first, second) {
  return (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI;
}

function angleDifference(first, second) {
  let diff = Math.abs(first - second) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function pointFromTemplate(templatePoint) {
  return {
    x: templatePoint[0],
    y: templatePoint[1],
    z: 0,
    visibility: 1,
  };
}

function buildTemplatePoints(template) {
  const points = Object.fromEntries(
    Object.entries(template.skeleton).map(([name, point]) => [
      name,
      pointFromTemplate(point),
    ]),
  );

  if (!points.leftHip || !points.rightHip) {
    const hipSpread = 0.08;
    points.leftHip = {
      ...points.hip,
      x: clamp01(points.hip.x - hipSpread),
    };
    points.rightHip = {
      ...points.hip,
      x: clamp01(points.hip.x + hipSpread),
    };
  }

  return points;
}

function mirrorPoint(point) {
  return {
    ...point,
    x: clamp01(1 - point.x),
  };
}

function mirrorTemplatePoints(points) {
  const mirrored = {};

  for (const [name, point] of Object.entries(points)) {
    mirrored[name] = mirrorPoint(point);
  }

  for (const [leftName, rightName] of LEFT_RIGHT_PAIRS) {
    mirrored[leftName] = mirrorPoint(points[rightName]);
    mirrored[rightName] = mirrorPoint(points[leftName]);
  }

  return mirrored;
}

function postureScale(points) {
  const shoulderWidth = Math.hypot(
    points.leftShoulder.x - points.rightShoulder.x,
    points.leftShoulder.y - points.rightShoulder.y,
  );
  const bodyHeight = Math.max(
    Math.abs(points.head.y - points.leftAnkle.y),
    Math.abs(points.head.y - points.rightAnkle.y),
  );

  return Math.max(shoulderWidth, bodyHeight * 0.35, 0.12);
}

function scoreFromDistance(distance, tolerance) {
  return Math.max(0, 1 - Math.pow(distance / tolerance, 1.35));
}

function scoreAngles(points, templatePoints) {
  let total = 0;
  let weightTotal = 0;

  for (const [name, a, b, c, weight] of ANGLE_FEATURES) {
    if (
      !points[a] ||
      !points[b] ||
      !points[c] ||
      points[a].visibility < MIN_VISIBILITY ||
      points[b].visibility < MIN_VISIBILITY ||
      points[c].visibility < MIN_VISIBILITY
    ) {
      continue;
    }

    const currentAngle = angleBetween(
      toVector(points[b], points[a]),
      toVector(points[b], points[c]),
    );
    const templateAngle = angleBetween(
      toVector(templatePoints[b], templatePoints[a]),
      toVector(templatePoints[b], templatePoints[c]),
    );
    const score = scoreFromDistance(
      angleDifference(currentAngle, templateAngle),
      name.includes("Elbow") || name.includes("Knee") ? 96 : 82,
    );

    total += score * weight;
    weightTotal += weight;
  }

  return weightTotal ? total / weightTotal : 0;
}

function scoreLine(firstCurrent, secondCurrent, firstTarget, secondTarget, tolerance) {
  return scoreFromDistance(
    angleDifference(
      lineAngle(firstCurrent, secondCurrent),
      lineAngle(firstTarget, secondTarget),
    ),
    tolerance,
  );
}

function scoreBodyLines(points, templatePoints) {
  const shoulderLine = scoreLine(
    points.leftShoulder,
    points.rightShoulder,
    templatePoints.leftShoulder,
    templatePoints.rightShoulder,
    58,
  );
  const torsoLine = scoreLine(
    points.neck,
    points.hip,
    templatePoints.neck,
    templatePoints.hip,
    54,
  );

  return shoulderLine * 0.45 + torsoLine * 0.55;
}

function scoreLimbPositions(points, templatePoints) {
  const currentScale = postureScale(points);
  const templateScale = postureScale(templatePoints);
  let total = 0;
  let count = 0;

  for (const name of POSITION_FEATURES) {
    const point = points[name];
    const target = templatePoints[name];

    if (!point || !target || point.visibility < MIN_VISIBILITY) continue;

    const currentOffset = {
      x: (point.x - points.neck.x) / currentScale,
      y: (point.y - points.neck.y) / currentScale,
    };
    const targetOffset = {
      x: (target.x - templatePoints.neck.x) / templateScale,
      y: (target.y - templatePoints.neck.y) / templateScale,
    };
    const distance = Math.hypot(
      currentOffset.x - targetOffset.x,
      currentOffset.y - targetOffset.y,
    );

    total += scoreFromDistance(distance, 2.15);
    count += 1;
  }

  return count ? total / count : 0;
}

function calculateMatchScore(points, template) {
  const templatePoints = buildTemplatePoints(template);
  const normalScore = calculateTemplateScore(points, templatePoints);
  const mirroredScore = calculateTemplateScore(
    points,
    mirrorTemplatePoints(templatePoints),
  );

  return Math.round(Math.max(normalScore, mirroredScore));
}

function calculateTemplateScore(points, templatePoints) {
  const angleScore = scoreAngles(points, templatePoints);
  const bodyLineScore = scoreBodyLines(points, templatePoints);
  const limbScore = scoreLimbPositions(points, templatePoints);
  const rawScore = angleScore * 0.42 + bodyLineScore * 0.23 + limbScore * 0.35;
  const calibratedScore = 12 + rawScore * 88;

  return Math.min(100, Math.max(0, calibratedScore));
}

export async function detectPose(videoElement, template, timestamp) {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) {
    return {
      keypoints: null,
      score: 0,
      detected: false,
    };
  }

  const poseLandmarker = await getPoseLandmarker();
  const result = poseLandmarker.detectForVideo(videoElement, timestamp);
  const landmarks = result.landmarks?.[0];

  if (!landmarks) {
    return {
      keypoints: null,
      score: 0,
      detected: false,
    };
  }

  const keypoints = toPoseKeypoints(landmarks);

  if (!hasReliableBody(keypoints)) {
    return {
      keypoints: null,
      score: 0,
      detected: false,
    };
  }

  return {
    keypoints,
    score: calculateMatchScore(keypoints, template),
    detected: true,
  };
}
