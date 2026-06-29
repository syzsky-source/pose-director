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
  let difference = Math.abs(first - second) % 360;
  if (difference > 180) difference = 360 - difference;
  return difference;
}

function scoreFromDifference(value, tolerance) {
  return clamp(1 - Math.pow(value / Math.max(tolerance, 0.001), 1.35), 0, 1);
}

function pointFromTemplate(point) {
  return {
    x: point[0],
    y: point[1],
    z: 0,
    visibility: 1,
  };
}

function buildTemplatePoints(rule) {
  const points = Object.fromEntries(
    Object.entries(rule.template?.points ?? {}).map(([name, point]) => [
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

function isVisible(point, minimumVisibility) {
  return Boolean(
    point && (point.visibility ?? point.presence ?? 1) >= minimumVisibility,
  );
}

function bodyScale(points) {
  if (!points.leftShoulder || !points.rightShoulder || !points.head) return 0.12;

  const shoulderWidth = distance(points.leftShoulder, points.rightShoulder);
  const hipWidth =
    points.leftHip && points.rightHip
      ? distance(points.leftHip, points.rightHip)
      : shoulderWidth;
  const lowerPoint =
    points.leftAnkle && points.rightAnkle
      ? midpoint(points.leftAnkle, points.rightAnkle)
      : points.hip ?? midpoint(points.leftShoulder, points.rightShoulder);
  const bodyHeight = distance(points.head, lowerPoint);

  return Math.max(shoulderWidth, hipWidth, bodyHeight * 0.32, 0.12);
}

function getFeaturePoints(points, names, minimumVisibility) {
  const selected = names.map((name) => points[name]);
  return selected.every((point) => isVisible(point, minimumVisibility))
    ? selected
    : null;
}

function evaluateAngleFeature(points, templatePoints, feature, tolerance) {
  const current = getFeaturePoints(
    points,
    feature.points,
    tolerance.minimumVisibility,
  );
  const target = feature.points.map((name) => templatePoints[name]);

  if (!current || target.some((point) => !point)) return null;

  const currentAngle = angleBetween(
    vector(current[1], current[0]),
    vector(current[1], current[2]),
  );
  const targetAngle =
    feature.targetAngle ??
    angleBetween(vector(target[1], target[0]), vector(target[1], target[2]));
  const difference = angleDifference(currentAngle, targetAngle);
  const score =
    scoreFromDifference(
      difference,
      feature.tolerance ?? tolerance.angleDegrees,
    ) * 100;

  return {
    score,
    value: currentAngle,
    target: targetAngle,
    difference,
  };
}

function evaluateBodyLineFeature(points, templatePoints, feature, tolerance) {
  const current = getFeaturePoints(
    points,
    feature.points,
    tolerance.minimumVisibility,
  );
  const target = feature.points.map((name) => templatePoints[name]);

  if (!current || target.some((point) => !point)) return null;

  const currentAngle = lineAngle(current[0], current[1]);
  const targetAngle =
    feature.targetAngle ?? lineAngle(target[0], target[1]);
  const difference = angleDifference(currentAngle, targetAngle);
  const score =
    scoreFromDifference(
      difference,
      feature.tolerance ?? tolerance.bodyLineDegrees,
    ) * 100;

  return {
    score,
    value: currentAngle,
    target: targetAngle,
    difference,
  };
}

function evaluateRelativePositionFeature(
  points,
  templatePoints,
  feature,
  tolerance,
) {
  const current = getFeaturePoints(
    points,
    [feature.point, feature.anchor],
    tolerance.minimumVisibility,
  );
  const target = [templatePoints[feature.point], templatePoints[feature.anchor]];

  if (!current || target.some((point) => !point)) return null;

  const currentScale = bodyScale(points);
  const targetScale = bodyScale(templatePoints);
  const currentOffset = {
    x: (current[0].x - current[1].x) / currentScale,
    y: (current[0].y - current[1].y) / currentScale,
  };
  const targetOffset = feature.targetOffset ?? {
    x: (target[0].x - target[1].x) / targetScale,
    y: (target[0].y - target[1].y) / targetScale,
  };
  const difference = Math.hypot(
    currentOffset.x - targetOffset.x,
    currentOffset.y - targetOffset.y,
  );
  const score =
    scoreFromDifference(
      difference,
      feature.tolerance ?? tolerance.relativePosition,
    ) * 100;

  return {
    score,
    value: currentOffset,
    target: targetOffset,
    difference,
  };
}

function evaluateFeatureGroup(
  groupName,
  features,
  evaluator,
  points,
  templatePoints,
  tolerance,
) {
  const featureScores = {};
  let weightedTotal = 0;
  let weightTotal = 0;

  for (const feature of features ?? []) {
    const result = evaluator(points, templatePoints, feature, tolerance);
    const weight = feature.weight ?? 1;
    const score = result?.score ?? 0;

    featureScores[feature.id] = {
      id: feature.id,
      label: feature.label,
      group: groupName,
      score: Math.round(score),
      weight,
      reliable: Boolean(result),
      value: result?.value ?? null,
      target: result?.target ?? null,
      difference: result?.difference ?? null,
    };
    weightedTotal += score * weight;
    weightTotal += weight;
  }

  return {
    score: weightTotal ? weightedTotal / weightTotal : 0,
    featureScores,
  };
}

function getRequiredPointNames(rule) {
  const scoring = rule.scoring;
  const names = new Set();

  for (const feature of scoring.angleFeatures ?? []) {
    feature.points.forEach((name) => names.add(name));
  }
  for (const feature of scoring.bodyLineFeatures ?? []) {
    feature.points.forEach((name) => names.add(name));
  }
  for (const feature of scoring.relativePositionFeatures ?? []) {
    names.add(feature.point);
    names.add(feature.anchor);
  }

  return [...names];
}

function getVisibilityRatio(points, rule) {
  const minimumVisibility = rule.scoring.tolerance.minimumVisibility;
  const required = getRequiredPointNames(rule);
  if (!required.length) return 1;

  return (
    required.filter((name) => isVisible(points[name], minimumVisibility)).length /
    required.length
  );
}

function resolveStatus(score, rule) {
  const feedback = rule.feedbackRules;
  const qualificationScore =
    rule.autoCapture.threshold || feedback.qualified.minScore;

  if (score >= feedback.excellent.minScore) return "excellent";
  if (score >= qualificationScore) return "qualified";
  if (score >= feedback.nearTarget.minScore) return "nearTarget";
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

function getWeakestFeature(featureScores) {
  const reliableScores = Object.values(featureScores).filter(
    (feature) => feature.reliable,
  );
  const candidates = reliableScores.length
    ? reliableScores
    : Object.values(featureScores);

  return (
    candidates.reduce(
      (weakest, feature) =>
        !weakest || feature.score < weakest.score ? feature : weakest,
      null,
    ) ?? null
  );
}

function evaluateRule(points, rule, composition) {
  const templatePoints = buildTemplatePoints(rule);
  const tolerance = rule.scoring.tolerance;
  const angleResult = evaluateFeatureGroup(
    "angles",
    rule.scoring.angleFeatures,
    evaluateAngleFeature,
    points,
    templatePoints,
    tolerance,
  );
  const bodyLineResult = evaluateFeatureGroup(
    "bodyLines",
    rule.scoring.bodyLineFeatures,
    evaluateBodyLineFeature,
    points,
    templatePoints,
    tolerance,
  );
  const relativePositionResult = evaluateFeatureGroup(
    "relativePositions",
    rule.scoring.relativePositionFeatures,
    evaluateRelativePositionFeature,
    points,
    templatePoints,
    tolerance,
  );
  const groupScores = {
    angles: angleResult.score,
    bodyLines: bodyLineResult.score,
    relativePositions: relativePositionResult.score,
  };
  const featureScores = {
    ...angleResult.featureScores,
    ...bodyLineResult.featureScores,
    ...relativePositionResult.featureScores,
  };
  const weights = rule.scoring.featureWeights;
  const poseWeight = Object.values(weights).reduce(
    (total, weight) => total + weight,
    0,
  );
  const poseScore = poseWeight
    ? Object.entries(weights).reduce(
        (total, [group, weight]) => total + (groupScores[group] ?? 0) * weight,
        0,
      ) / poseWeight
    : 0;
  const compositionWeight = clamp(tolerance.compositionWeight ?? 0, 0, 0.5);
  const compositionScore = composition?.score ?? 100;
  const weightedScore =
    poseScore * (1 - compositionWeight) +
    compositionScore * compositionWeight;
  const visibilityRatio = getVisibilityRatio(points, rule);
  const minimumVisibleRatio = tolerance.minimumVisibleRatio;
  const visibilityCap =
    visibilityRatio < minimumVisibleRatio
      ? 52
      : visibilityRatio < 0.9
        ? 76
        : 100;
  const rawScore = Math.round(clamp(weightedScore, 0, visibilityCap));
  const weakestFeature = getWeakestFeature(featureScores);

  return {
    rawScore,
    featureScores,
    groupScores: Object.fromEntries(
      Object.entries(groupScores).map(([name, score]) => [
        name,
        Math.round(score),
      ]),
    ),
    weakestFeature,
    visibilityRatio,
  };
}

function swapSideName(name) {
  if (name.startsWith("left")) return `right${name.slice(4)}`;
  if (name.startsWith("right")) return `left${name.slice(5)}`;
  return name;
}

function mirrorKeypoints(points) {
  return Object.fromEntries(
    Object.entries(points).map(([name, point]) => {
      const source = points[swapSideName(name)] ?? point;
      return [
        name,
        {
          ...source,
          x: 1 - source.x,
        },
      ];
    }),
  );
}

export function scorePose(
  points,
  rule,
  composition = { passed: true, score: 100 },
) {
  if (!points || !rule?.scoring || !rule?.template?.points) {
    return {
      rawScore: 0,
      featureScores: {},
      weakestFeature: null,
      correctionMessage:
        rule?.feedbackRules?.detectedFalse ?? "未检测到人体，请进入画面",
      status: "adjusting",
      statusMessage:
        rule?.feedbackRules?.detectedFalse ?? "未检测到人体，请进入画面",
      mirrored: false,
      passed: false,
      canAutoCapture: false,
      visibilityRatio: 0,
      groupScores: {},
    };
  }

  const regular = evaluateRule(points, rule, composition);
  const mirrored =
    rule.mirrorAllowed === true
      ? evaluateRule(mirrorKeypoints(points), rule, composition)
      : null;
  const best =
    mirrored && mirrored.rawScore > regular.rawScore ? mirrored : regular;
  const usedMirror = best === mirrored;
  const status = resolveStatus(best.rawScore, rule);
  const correctionMessage =
    rule.correctionRules.byFeature?.[best.weakestFeature?.id] ??
    best.weakestFeature?.label ??
    rule.correctionRules.fallback ??
    rule.instruction;
  const passed =
    ["qualified", "excellent"].includes(status) &&
    best.visibilityRatio >= rule.scoring.tolerance.minimumVisibleRatio &&
    composition.passed;

  return {
    ...best,
    correctionMessage,
    status,
    statusMessage: getStatusMessage(status, rule),
    mirrored: usedMirror,
    passed,
    canAutoCapture:
      rule.mode === "autoCapture" &&
      rule.autoCapture.enabled === true &&
      passed,
  };
}
