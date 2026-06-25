const SHOT_REQUIREMENTS = {
  fullBody: {
    required: [
      "head",
      "leftShoulder",
      "rightShoulder",
      "leftHip",
      "rightHip",
      "leftKnee",
      "rightKnee",
      "leftAnkle",
      "rightAnkle",
    ],
    minHeight: 0.62,
    maxHeight: 0.94,
    minTop: 0.03,
    maxBottom: 0.98,
  },
  threeQuarter: {
    required: [
      "head",
      "leftShoulder",
      "rightShoulder",
      "leftHip",
      "rightHip",
      "leftKnee",
      "rightKnee",
    ],
    minHeight: 0.48,
    maxHeight: 0.96,
    minTop: 0.03,
    maxBottom: 1.08,
  },
  halfBody: {
    required: [
      "head",
      "leftShoulder",
      "rightShoulder",
      "leftElbow",
      "rightElbow",
      "leftWrist",
      "rightWrist",
      "leftHip",
      "rightHip",
    ],
    minHeight: 0.36,
    maxHeight: 0.92,
    minTop: 0.02,
    maxBottom: 1.16,
  },
  closeUp: {
    required: ["head", "leftShoulder", "rightShoulder"],
    minHeight: 0.2,
    maxHeight: 0.72,
    minTop: 0.02,
    maxBottom: 1.18,
  },
};

const MIN_VISIBILITY = 0.38;

function visible(point) {
  return point && (point.visibility ?? 1) >= MIN_VISIBILITY;
}

function getBounds(points, names) {
  const visiblePoints = names.map((name) => points[name]).filter(visible);

  if (!visiblePoints.length) return null;

  return {
    minX: Math.min(...visiblePoints.map((point) => point.x)),
    maxX: Math.max(...visiblePoints.map((point) => point.x)),
    minY: Math.min(...visiblePoints.map((point) => point.y)),
    maxY: Math.max(...visiblePoints.map((point) => point.y)),
    visibleCount: visiblePoints.length,
  };
}

function scorePenalty(condition, amount) {
  return condition ? amount : 0;
}

export function checkComposition(points, faceLandmarks = null, shotType = "fullBody") {
  const requirements = SHOT_REQUIREMENTS[shotType] ?? SHOT_REQUIREMENTS.fullBody;

  if (!points) {
    return {
      passed: false,
      score: 0,
      hints: ["未检测到人体，请进入画面"],
      bounds: null,
    };
  }

  const visibleRequired = requirements.required.filter((name) => visible(points[name]));
  const bounds = getBounds(points, requirements.required);
  const hints = [];

  if (visibleRequired.length < requirements.required.length) {
    const missing = requirements.required.filter((name) => !visible(points[name]));
    if (missing.some((name) => name.includes("Ankle"))) {
      hints.push("请后退半步，让双脚完整入镜");
    } else if (missing.some((name) => name.includes("Knee"))) {
      hints.push("请后退一点，让膝盖进入画面");
    } else if (missing.some((name) => name.includes("Wrist") || name.includes("Elbow"))) {
      hints.push("请让手臂完整出现在画面中");
    } else {
      hints.push("请让脸部和肩膀完整出现在画面中");
    }
  }

  if (!bounds) {
    return {
      passed: false,
      score: 0,
      hints,
      bounds: null,
    };
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const centerX = (bounds.minX + bounds.maxX) / 2;

  if (bounds.minY < requirements.minTop) {
    hints.push("头顶留一点空间");
  }

  if (bounds.maxY > requirements.maxBottom) {
    hints.push(shotType === "fullBody" ? "请后退半步，让双脚完整入镜" : "请把镜头稍微抬高一点");
  }

  if (height < requirements.minHeight) {
    hints.push(shotType === "closeUp" ? "请靠近一点，让脸部占画面更多" : "请靠近一些，让人物占画面更大");
  }

  if (height > requirements.maxHeight) {
    hints.push("请后退一点，避免画面裁切");
  }

  if (bounds.minX < 0.04) {
    hints.push("请向右移动一点");
  } else if (bounds.maxX > 0.96) {
    hints.push("请向左移动一点");
  } else if (centerX < 0.42) {
    hints.push("请向右移动一点，让人物回到画面中心");
  } else if (centerX > 0.58) {
    hints.push("请向左移动一点，让人物回到画面中心");
  }

  if (shotType === "closeUp" && faceLandmarks?.bounds) {
    const faceBounds = faceLandmarks.bounds;
    const faceWidth = faceBounds.maxX - faceBounds.minX;
    const faceHeight = faceBounds.maxY - faceBounds.minY;

    if (faceBounds.minX < 0.04 || faceBounds.maxX > 0.96 || faceBounds.minY < 0.03) {
      hints.push("请让脸部完整出现在画面中");
    }

    if (faceHeight < 0.24 || faceWidth < 0.16) {
      hints.push("请靠近一点，让脸部占画面更多");
    }
  }

  const uniqueHints = [...new Set(hints)].slice(0, 2);
  const penalty =
    scorePenalty(visibleRequired.length < requirements.required.length, 34) +
    scorePenalty(bounds.minY < requirements.minTop, 14) +
    scorePenalty(bounds.maxY > requirements.maxBottom, 18) +
    scorePenalty(height < requirements.minHeight, 18) +
    scorePenalty(height > requirements.maxHeight, 18) +
    scorePenalty(width < 0.1, 10) +
    scorePenalty(centerX < 0.42 || centerX > 0.58, 12) +
    scorePenalty(bounds.minX < 0.04 || bounds.maxX > 0.96, 20);
  const score = Math.max(0, 100 - penalty);

  return {
    passed: uniqueHints.length === 0 && score >= 76,
    score,
    hints: uniqueHints,
    bounds,
  };
}

export function getShotFrame(shotType = "fullBody") {
  const frames = {
    fullBody: { left: "18%", top: "5%", width: "64%", height: "90%" },
    threeQuarter: { left: "20%", top: "6%", width: "60%", height: "82%" },
    halfBody: { left: "17%", top: "7%", width: "66%", height: "66%" },
    closeUp: { left: "25%", top: "8%", width: "50%", height: "52%" },
  };

  return frames[shotType] ?? frames.fullBody;
}

export const shotTypeLabels = {
  fullBody: "全身",
  threeQuarter: "三分之二身",
  halfBody: "半身",
  closeUp: "特写",
};
