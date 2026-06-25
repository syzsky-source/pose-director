const MIN_CORE_VISIBILITY = 0.48;
const MIN_LIMB_VISIBILITY = 0.34;

const REQUIRED_BY_SHOT = {
  fullBody: [
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
  threeQuarter: [
    "head",
    "leftShoulder",
    "rightShoulder",
    "leftHip",
    "rightHip",
    "leftKnee",
    "rightKnee",
  ],
  halfBody: [
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
  closeUp: ["head", "leftShoulder", "rightShoulder"],
};

const ANGLE_FEATURES = [
  ["leftElbow", "leftShoulder", "leftElbow", "leftWrist", 1],
  ["rightElbow", "rightShoulder", "rightElbow", "rightWrist", 1],
  ["leftKnee", "leftHip", "leftKnee", "leftAnkle", 0.85],
  ["rightKnee", "rightHip", "rightKnee", "rightAnkle", 0.85],
  ["leftShoulder", "leftElbow", "leftShoulder", "neck", 0.7],
  ["rightShoulder", "rightElbow", "rightShoulder", "neck", 0.7],
  ["leftHip", "leftShoulder", "leftHip", "leftKnee", 0.75],
  ["rightHip", "rightShoulder", "rightHip", "rightKnee", 0.75],
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function midpoint(first, second) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    z: ((first.z ?? 0) + (second.z ?? 0)) / 2,
    visibility: Math.min(first.visibility ?? 1, second.visibility ?? 1),
  };
}

function vector(from, to) {
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

  return (
    (Math.acos(clamp(dot / (firstLength * secondLength), -1, 1)) * 180) /
    Math.PI
  );
}

function lineAngle(first, second) {
  return (Math.atan2(second.y - first.y, second.x - first.x) * 180) / Math.PI;
}

function angleDifference(first, second) {
  let diff = Math.abs(first - second) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

function scoreFromDistance(value, tolerance) {
  return clamp(1 - Math.pow(value / tolerance, 1.35), 0, 1);
}

function pointFromTemplate(point) {
  return {
    x: point[0],
    y: point[1],
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

  if (!points.neck && points.leftShoulder && points.rightShoulder) {
    points.neck = midpoint(points.leftShoulder, points.rightShoulder);
  }

  if (!points.hip && points.leftHip && points.rightHip) {
    points.hip = midpoint(points.leftHip, points.rightHip);
  }

  return points;
}

function hasPoint(points, name, minimum = MIN_CORE_VISIBILITY) {
  return Boolean(points?.[name] && (points[name].visibility ?? 1) >= minimum);
}

function visibleRatio(points, shotType = "fullBody") {
  const required = REQUIRED_BY_SHOT[shotType] ?? REQUIRED_BY_SHOT.fullBody;
  const visible = required.filter((name) =>
    hasPoint(points, name, name.includes("Ankle") ? MIN_LIMB_VISIBILITY : MIN_CORE_VISIBILITY),
  );

  return visible.length / required.length;
}

function bodyScale(points) {
  const shoulderWidth = distance(points.leftShoulder, points.rightShoulder);
  const hipWidth = points.leftHip && points.rightHip
    ? distance(points.leftHip, points.rightHip)
    : shoulderWidth;
  const bodyHeight = points.leftAnkle && points.rightAnkle
    ? Math.max(distance(points.head, points.leftAnkle), distance(points.head, points.rightAnkle))
    : Math.max(distance(points.head, points.leftHip), distance(points.head, points.rightHip));

  return Math.max(shoulderWidth, hipWidth, bodyHeight * 0.32, 0.12);
}

function lineScore(points, templatePoints, first, second, tolerance) {
  if (!points[first] || !points[second] || !templatePoints[first] || !templatePoints[second]) {
    return 0;
  }

  return scoreFromDistance(
    angleDifference(
      lineAngle(points[first], points[second]),
      lineAngle(templatePoints[first], templatePoints[second]),
    ),
    tolerance,
  );
}

function scoreAngles(points, templatePoints) {
  let total = 0;
  let weightTotal = 0;

  for (const [name, a, b, c, weight] of ANGLE_FEATURES) {
    if (
      !hasPoint(points, a, MIN_LIMB_VISIBILITY) ||
      !hasPoint(points, b, MIN_LIMB_VISIBILITY) ||
      !hasPoint(points, c, MIN_LIMB_VISIBILITY) ||
      !templatePoints[a] ||
      !templatePoints[b] ||
      !templatePoints[c]
    ) {
      continue;
    }

    const currentAngle = angleBetween(vector(points[b], points[a]), vector(points[b], points[c]));
    const targetAngle = angleBetween(
      vector(templatePoints[b], templatePoints[a]),
      vector(templatePoints[b], templatePoints[c]),
    );
    const tolerance = name.includes("Elbow") || name.includes("Knee") ? 70 : 62;
    total += scoreFromDistance(angleDifference(currentAngle, targetAngle), tolerance) * weight;
    weightTotal += weight;
  }

  return weightTotal ? total / weightTotal : 0;
}

function scorePositions(points, templatePoints) {
  const currentScale = bodyScale(points);
  const targetScale = bodyScale(templatePoints);
  let total = 0;
  let count = 0;

  for (const name of POSITION_FEATURES) {
    if (
      !hasPoint(points, name, MIN_LIMB_VISIBILITY) ||
      !templatePoints[name] ||
      !points.neck ||
      !templatePoints.neck
    ) {
      continue;
    }

    const current = {
      x: (points[name].x - points.neck.x) / currentScale,
      y: (points[name].y - points.neck.y) / currentScale,
    };
    const target = {
      x: (templatePoints[name].x - templatePoints.neck.x) / targetScale,
      y: (templatePoints[name].y - templatePoints.neck.y) / targetScale,
    };

    total += scoreFromDistance(Math.hypot(current.x - target.x, current.y - target.y), 1.05);
    count += 1;
  }

  return count ? total / count : 0;
}

function shoulderTilt(points) {
  return Math.abs(points.leftShoulder.y - points.rightShoulder.y);
}

function hipTilt(points) {
  if (!points.leftHip || !points.rightHip) return 0;
  return Math.abs(points.leftHip.y - points.rightHip.y);
}

function isFrontFacing(points) {
  const shoulderWidth = Math.abs(points.leftShoulder.x - points.rightShoulder.x);
  const hipWidth = Math.abs(points.leftHip.x - points.rightHip.x);
  const shoulderCenter = midpoint(points.leftShoulder, points.rightShoulder);
  const hipCenter = midpoint(points.leftHip, points.rightHip);

  return shoulderWidth > 0.15 && hipWidth > 0.08 && Math.abs(shoulderCenter.x - hipCenter.x) < 0.08;
}

function isSideOrThreeQuarter(points) {
  const shoulderWidth = Math.abs(points.leftShoulder.x - points.rightShoulder.x);
  const hipWidth = Math.abs(points.leftHip.x - points.rightHip.x);

  return shoulderWidth < 0.24 || hipWidth < 0.15;
}

function wristsInChestBand(points) {
  const top = Math.min(points.leftShoulder.y, points.rightShoulder.y) - 0.03;
  const bottom = Math.max(points.leftHip.y, points.rightHip.y) + 0.02;
  const left = Math.min(points.leftShoulder.x, points.rightShoulder.x) - 0.15;
  const right = Math.max(points.leftShoulder.x, points.rightShoulder.x) + 0.15;

  return ["leftWrist", "rightWrist"].every((name) => {
    const point = points[name];
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  });
}

function armsCrossed(points) {
  const centerX = (points.leftShoulder.x + points.rightShoulder.x + points.leftHip.x + points.rightHip.x) / 4;
  const leftCrosses = points.leftWrist.x > centerX || points.leftWrist.x > points.rightElbow.x - 0.02;
  const rightCrosses = points.rightWrist.x < centerX || points.rightWrist.x < points.leftElbow.x + 0.02;
  const wristsClose = Math.abs(points.leftWrist.y - points.rightWrist.y) < 0.18;
  const elbowBend =
    angleBetween(vector(points.leftElbow, points.leftShoulder), vector(points.leftElbow, points.leftWrist)) < 150 &&
    angleBetween(vector(points.rightElbow, points.rightShoulder), vector(points.rightElbow, points.rightWrist)) < 150;

  return wristsInChestBand(points) && leftCrosses && rightCrosses && wristsClose && elbowBend;
}

function handsDown(points) {
  return (
    points.leftWrist.y > points.leftElbow.y &&
    points.rightWrist.y > points.rightElbow.y &&
    points.leftWrist.y > points.leftHip.y - 0.02 &&
    points.rightWrist.y > points.rightHip.y - 0.02
  );
}

function handsNearFace(points) {
  return (
    distance(points.leftWrist, points.head) < 0.24 ||
    distance(points.rightWrist, points.head) < 0.24
  );
}

function handsAtWaist(points) {
  const centerY = (points.leftHip.y + points.rightHip.y + points.leftShoulder.y + points.rightShoulder.y) / 2;
  return (
    Math.abs(points.leftWrist.y - centerY) < 0.16 ||
    Math.abs(points.rightWrist.y - centerY) < 0.16
  );
}

function hasWeightShift(points) {
  const hipCenter = midpoint(points.leftHip, points.rightHip);
  const ankleCenter = midpoint(points.leftAnkle, points.rightAnkle);
  return Math.abs(hipCenter.x - ankleCenter.x) > 0.035;
}

function feetStaggered(points) {
  return Math.abs(points.leftAnkle.y - points.rightAnkle.y) > 0.025 ||
    Math.abs(points.leftAnkle.x - points.rightAnkle.x) > 0.18;
}

function stanceStable(points) {
  return (
    Math.abs(points.leftAnkle.x - points.rightAnkle.x) > 0.09 &&
    Math.abs(points.leftKnee.x - points.rightKnee.x) > 0.06
  );
}

const RULE_CHECKS = {
  crossedArms: {
    test: armsCrossed,
    hint: "双手抬到胸前，并交叉抱住手臂",
    cap: 55,
  },
  frontFacing: {
    test: isFrontFacing,
    hint: "身体再正对镜头一点",
    cap: 60,
  },
  sideFacing: {
    test: isSideOrThreeQuarter,
    hint: "身体侧转一些，形成侧身层次",
    cap: 65,
  },
  handsDown: {
    test: handsDown,
    hint: "双臂自然下垂，手不要叉腰或抱胸",
    cap: 60,
  },
  handsNearFace: {
    test: handsNearFace,
    hint: "把手靠近脸侧，形成更松弛的轮廓",
    cap: 64,
  },
  handsAtWaist: {
    test: handsAtWaist,
    hint: "把一只手移到腰侧或口袋附近",
    cap: 66,
  },
  levelShoulders: {
    test: (points) => shoulderTilt(points) < 0.045,
    hint: "把肩线放平，避免一边肩膀塌下去",
    cap: 68,
  },
  levelHips: {
    test: (points) => hipTilt(points) < 0.055,
    hint: "髋部保持稳定，不要明显歪斜",
    cap: 68,
  },
  weightShift: {
    test: hasWeightShift,
    hint: "把重心落到一侧，姿态会更有张力",
    cap: 66,
  },
  feetStaggered: {
    test: feetStaggered,
    hint: "把一只脚向前错开半步",
    cap: 66,
  },
  stableLegs: {
    test: stanceStable,
    hint: "请保持双腿自然站稳",
    cap: 62,
  },
};

function evaluateHardRules(points, template) {
  const failed = [];
  let cap = 100;

  for (const ruleName of template.hardRules ?? []) {
    const rule = RULE_CHECKS[ruleName];
    if (!rule || rule.test(points)) continue;

    failed.push({
      rule: ruleName,
      hint: rule.hint,
      cap: rule.cap,
    });
    cap = Math.min(cap, rule.cap);
  }

  return {
    passed: failed.length === 0,
    failed,
    cap,
  };
}

function scoreBodyOrientation(points, templatePoints, template) {
  const shoulder = lineScore(points, templatePoints, "leftShoulder", "rightShoulder", 42);
  const hip = points.leftHip && points.rightHip
    ? lineScore(points, templatePoints, "leftHip", "rightHip", 50)
    : shoulder;
  const torso = points.neck && points.hip && templatePoints.neck && templatePoints.hip
    ? lineScore(points, templatePoints, "neck", "hip", 48)
    : 0.7;
  const ruleBonus =
    template.hardRules?.includes("frontFacing") && isFrontFacing(points)
      ? 1
      : template.hardRules?.includes("sideFacing") && isSideOrThreeQuarter(points)
        ? 1
        : 0.75;

  return clamp((shoulder * 0.34 + hip * 0.26 + torso * 0.24 + ruleBonus * 0.16), 0, 1);
}

function scoreStability(points) {
  const shoulder = scoreFromDistance(shoulderTilt(points), 0.09);
  const hip = points.leftHip && points.rightHip ? scoreFromDistance(hipTilt(points), 0.1) : 0.8;
  const legs = points.leftAnkle && points.rightAnkle ? (stanceStable(points) ? 1 : 0.55) : 0.7;

  return shoulder * 0.4 + hip * 0.28 + legs * 0.32;
}

export function scorePose(points, template, composition = { passed: true, score: 100 }) {
  if (!points || !template?.skeleton) {
    return {
      score: 0,
      passed: false,
      canAutoCapture: false,
      cap: 0,
      hardRules: { passed: false, failed: [] },
      breakdown: {
        composition: 0,
        orientation: 0,
        angles: 0,
        action: 0,
        stability: 0,
      },
      hints: ["未检测到人体，请进入画面"],
    };
  }

  const shotType = template.shotType ?? "fullBody";
  const visibility = visibleRatio(points, shotType);
  const templatePoints = buildTemplatePoints(template);
  const hardRules = evaluateHardRules(points, template);
  const positionScore = scorePositions(points, templatePoints);
  const actionScore = hardRules.passed
    ? positionScore
    : clamp(positionScore - hardRules.failed.length * 0.24, 0.2, 0.65);
  const breakdown = {
    composition: (composition.passed ? 1 : composition.score / 100) * 20,
    orientation: scoreBodyOrientation(points, templatePoints, template) * 20,
    angles: scoreAngles(points, templatePoints) * 25,
    action: actionScore * 25,
    stability: scoreStability(points) * 10,
  };
  const rawScore = Object.values(breakdown).reduce((total, value) => total + value, 0);
  const visibilityCap = visibility < 0.72 ? 48 : visibility < 0.9 ? 72 : 100;
  const compositionCap = composition.passed ? 100 : 68;
  const finalCap = Math.min(hardRules.cap, visibilityCap, compositionCap);
  const score = Math.round(clamp(rawScore, 0, finalCap));
  const hints = getCorrectionHints(points, template, composition, hardRules);

  return {
    score,
    passed: score >= (template.autoCapture?.threshold ?? 72) && hardRules.passed && composition.passed,
    canAutoCapture:
      template.autoCapture?.enabled === true &&
      score >= (template.autoCapture?.threshold ?? 72) &&
      hardRules.passed &&
      composition.passed,
    cap: finalCap,
    hardRules,
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([name, value]) => [name, Math.round(value)]),
    ),
    hints,
  };
}

export function getCorrectionHints(points, template, composition, hardRules) {
  if (!points) return ["未检测到人体，请进入画面"];

  const hints = [];

  if (composition && !composition.passed) {
    hints.push(...composition.hints);
  }

  if (hardRules?.failed?.length) {
    hints.push(...hardRules.failed.map((rule) => rule.hint));
  }

  if (!hints.length && template.hardRules?.includes("levelShoulders") && shoulderTilt(points) > 0.025) {
    hints.push("右肩或左肩再微调一下，让肩线更平");
  }

  if (!hints.length && template.hardRules?.includes("feetStaggered") && !feetStaggered(points)) {
    hints.push("把右脚向前踩半步");
  }

  if (!hints.length) {
    hints.push(template.instruction ?? "保持当前姿势，做一点细微调整");
  }

  return [...new Set(hints)].slice(0, 2);
}

export const poseRuleDescriptions = {
  crossedArms: "双腕位于胸前或上腹区域，前臂明显跨过身体中线，双肘弯曲；不满足时最高 55 分。",
  frontFacing: "身体正面对镜头，肩宽和髋宽可见且躯干中心稳定；明显侧身时封顶 60 分。",
  sideFacing: "身体需要侧身或三分之二侧身，肩髋宽度和模板方向一致；正立时封顶 65 分。",
  handsDown: "双臂自然下垂，不能叉腰、抱胸或大幅抬手；不满足时最高 60 分。",
  handsNearFace: "至少一只手靠近脸侧形成松弛侧身动作；不满足时最高 64 分。",
  handsAtWaist: "至少一只手位于腰侧、髋部或口袋附近；不满足时最高 66 分。",
  levelShoulders: "双肩基本水平，避免明显一高一低；不满足时最高 68 分。",
  levelHips: "双髋基本水平并稳定；不满足时最高 68 分。",
  weightShift: "重心需要有明确偏移，不能只是直立平均站姿；不满足时最高 66 分。",
  feetStaggered: "双脚需要前后或左右错开形成层次；不满足时最高 66 分。",
  stableLegs: "双腿自然站稳，膝踝关系不能过度交叉或塌陷；不满足时最高 62 分。",
};
