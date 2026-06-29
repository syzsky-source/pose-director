import { POSES } from "./poses.js";

const DEFAULT_GUIDE_FRAME = {
  headZone: {
    label: "头部框",
    points: ["head", "neck"],
    padding: { x: 0.07, y: 0.055 },
  },
  shoulderZone: {
    label: "肩线框",
    points: ["leftShoulder", "rightShoulder"],
    padding: { x: 0.075, y: 0.05 },
  },
  torsoZone: {
    label: "躯干框",
    points: ["leftShoulder", "rightShoulder", "leftHip", "rightHip"],
    padding: { x: 0.055, y: 0.045 },
  },
  leftArmZone: {
    label: "左臂方向",
    points: ["leftShoulder", "leftElbow", "leftWrist"],
    padding: { x: 0.035, y: 0.035 },
  },
  rightArmZone: {
    label: "右臂方向",
    points: ["rightShoulder", "rightElbow", "rightWrist"],
    padding: { x: 0.035, y: 0.035 },
  },
  leftLegZone: {
    label: "左腿方向",
    points: ["leftHip", "leftKnee", "leftAnkle"],
    padding: { x: 0.04, y: 0.035 },
  },
  rightLegZone: {
    label: "右腿方向",
    points: ["rightHip", "rightKnee", "rightAnkle"],
    padding: { x: 0.04, y: 0.035 },
  },
  footZone: {
    label: "脚部底座",
    points: ["leftAnkle", "rightAnkle"],
    padding: { x: 0.065, y: 0.035 },
  },
};

const DEFAULT_TOLERANCE = {
  angleDegrees: 68,
  bodyLineDegrees: 46,
  relativePosition: 1.05,
  compositionWeight: 0.16,
  minimumVisibility: 0.42,
  minimumVisibleRatio: 0.72,
};

const DEFAULT_SMOOTHING = {
  enabled: true,
  alpha: 0.38,
};

const DEFAULT_FEEDBACK = {
  lowScore: {
    maxScore: 49,
    message: "继续调整，先处理最明显的动作偏差",
  },
  nearTarget: {
    minScore: 50,
    message: "已经接近目标，再做一点细调",
  },
  qualified: {
    minScore: 70,
    message: "姿势合格，保持身体稳定",
  },
  excellent: {
    minScore: 86,
    message: "状态很好，保持当前姿势",
  },
  detectedFalse: "未检测到人体，请进入画面",
};

function angleFeature(id, label, points, weight, correctionMessage, options = {}) {
  return {
    id,
    label,
    points,
    weight,
    correctionMessage,
    ...options,
  };
}

function lineFeature(id, label, points, weight, correctionMessage, options = {}) {
  return {
    id,
    label,
    points,
    weight,
    correctionMessage,
    ...options,
  };
}

function positionFeature(id, label, point, anchor, weight, correctionMessage, options = {}) {
  return {
    id,
    label,
    point,
    anchor,
    weight,
    correctionMessage,
    ...options,
  };
}

function buildScoring({
  angleFeatures,
  bodyLineFeatures,
  relativePositionFeatures,
  featureWeights = { angles: 0.3, bodyLines: 0.28, relativePositions: 0.42 },
  tolerance = {},
  smoothing = {},
}) {
  return {
    angleFeatures,
    bodyLineFeatures,
    relativePositionFeatures,
    featureWeights,
    tolerance: { ...DEFAULT_TOLERANCE, ...tolerance },
    smoothing: { ...DEFAULT_SMOOTHING, ...smoothing },
  };
}

function buildCorrectionRules(features, fallback) {
  return {
    strategy: "weakestFeature",
    byFeature: Object.fromEntries(
      features.map((feature) => [feature.id, feature.correctionMessage]),
    ),
    fallback,
  };
}

function createRule(config) {
  const features = [
    ...config.scoring.angleFeatures,
    ...config.scoring.bodyLineFeatures,
    ...config.scoring.relativePositionFeatures,
  ];

  return {
    mirrorAllowed: true,
    scoringEnabled: true,
    ...config,
    autoCapture: {
      enabled: false,
      threshold: 72,
      stableMs: 1500,
      countdownSeconds: 3,
      ...config.autoCapture,
    },
    guideFrame: {
      ...DEFAULT_GUIDE_FRAME,
      ...config.guideFrame,
    },
    feedbackRules: {
      ...DEFAULT_FEEDBACK,
      ...config.feedbackRules,
    },
    correctionRules:
      config.correctionRules ??
      buildCorrectionRules(features, config.instruction),
  };
}

const crossedArmsAngles = [
  angleFeature(
    "leftElbowFold",
    "左肘弯曲",
    ["leftShoulder", "leftElbow", "leftWrist"],
    1,
    "左手再抬高一点，让前臂自然抱住身体",
  ),
  angleFeature(
    "rightElbowFold",
    "右肘弯曲",
    ["rightShoulder", "rightElbow", "rightWrist"],
    1,
    "右手再抬高一点，让前臂自然抱住身体",
  ),
];
const crossedArmsLines = [
  lineFeature(
    "shoulderLine",
    "肩线",
    ["leftShoulder", "rightShoulder"],
    1.15,
    "肩线放松并保持平稳",
  ),
  lineFeature(
    "torsoLine",
    "躯干稳定",
    ["neck", "hip"],
    1,
    "身体再立直一点，保持躯干稳定",
  ),
  lineFeature(
    "footBase",
    "双脚站稳",
    ["leftAnkle", "rightAnkle"],
    0.8,
    "双脚再拉开一点，站得更稳",
  ),
];
const crossedArmsPositions = [
  positionFeature(
    "leftWristCross",
    "左腕抱臂位置",
    "leftWrist",
    "neck",
    1.25,
    "左手再向身体中线靠近一点",
  ),
  positionFeature(
    "rightWristCross",
    "右腕抱臂位置",
    "rightWrist",
    "neck",
    1.25,
    "右手再向身体中线靠近一点",
  ),
  positionFeature(
    "leftAnkleBase",
    "左脚位置",
    "leftAnkle",
    "hip",
    0.65,
    "左脚向外打开一点",
  ),
  positionFeature(
    "rightAnkleBase",
    "右脚位置",
    "rightAnkle",
    "hip",
    0.65,
    "右脚向外打开一点",
  ),
];

const calmFrontAngles = [
  angleFeature(
    "leftArmRelaxed",
    "左臂自然",
    ["leftShoulder", "leftElbow", "leftWrist"],
    0.9,
    "左手自然放低，不要抬起或夹紧",
  ),
  angleFeature(
    "rightArmRelaxed",
    "右臂自然",
    ["rightShoulder", "rightElbow", "rightWrist"],
    0.9,
    "右手自然放低，不要抬起或夹紧",
  ),
  angleFeature(
    "leftLegStraight",
    "左腿稳定",
    ["leftHip", "leftKnee", "leftAnkle"],
    0.75,
    "左腿放松站直，避免膝盖内扣",
  ),
  angleFeature(
    "rightLegStraight",
    "右腿稳定",
    ["rightHip", "rightKnee", "rightAnkle"],
    0.75,
    "右腿放松站直，避免膝盖内扣",
  ),
];
const calmFrontLines = [
  lineFeature(
    "shoulderLine",
    "肩线水平",
    ["leftShoulder", "rightShoulder"],
    1.2,
    "肩线放平，避免一边肩膀塌下去",
  ),
  lineFeature(
    "hipLine",
    "髋线水平",
    ["leftHip", "rightHip"],
    0.8,
    "髋部保持稳定，不要明显歪斜",
  ),
  lineFeature(
    "torsoLine",
    "躯干正立",
    ["neck", "hip"],
    1.2,
    "身体再正立一点，不要向一侧偏",
  ),
  lineFeature(
    "footBase",
    "双脚稳定",
    ["leftAnkle", "rightAnkle"],
    0.8,
    "双脚保持平稳，重心均匀落下",
  ),
];
const calmFrontPositions = [
  positionFeature(
    "leftHandDown",
    "左手自然下垂",
    "leftWrist",
    "leftHip",
    1,
    "左手再放低一点，贴近身体自然下垂",
  ),
  positionFeature(
    "rightHandDown",
    "右手自然下垂",
    "rightWrist",
    "rightHip",
    1,
    "右手再放低一点，贴近身体自然下垂",
  ),
  positionFeature(
    "headCentered",
    "头部居中",
    "head",
    "neck",
    0.7,
    "头部回到肩线中央，视线保持平稳",
  ),
];

const pocketAngles = [
  angleFeature(
    "leftArmPocket",
    "左臂插袋角度",
    ["leftShoulder", "leftElbow", "leftWrist"],
    0.9,
    "左手再靠近裤袋一点",
  ),
  angleFeature(
    "rightArmPocket",
    "右臂放松角度",
    ["rightShoulder", "rightElbow", "rightWrist"],
    0.8,
    "右侧手臂再放松一点",
  ),
];
const pocketLines = [
  lineFeature(
    "shoulderTurn",
    "肩部侧转",
    ["leftShoulder", "rightShoulder"],
    1.2,
    "身体再侧一点，让肩部形成前后层次",
  ),
  lineFeature(
    "hipTurn",
    "髋部侧转",
    ["leftHip", "rightHip"],
    1,
    "髋部跟着身体侧转一些",
  ),
  lineFeature(
    "torsoLine",
    "躯干方向",
    ["neck", "hip"],
    0.8,
    "躯干保持自然，不要过度歪斜",
  ),
];
const pocketPositions = [
  positionFeature(
    "leftHandPocket",
    "左手口袋位置",
    "leftWrist",
    "leftHip",
    1.2,
    "左手再靠近裤袋一点",
  ),
  positionFeature(
    "rightHandPocket",
    "右手口袋位置",
    "rightWrist",
    "rightHip",
    1.15,
    "右手再靠近裤袋或腰侧一点",
  ),
  positionFeature(
    "headLookback",
    "头部回看",
    "head",
    "neck",
    1.1,
    "头部再回看镜头一点",
  ),
  positionFeature(
    "rearFoot",
    "双脚错位",
    "rightAnkle",
    "hip",
    0.75,
    "双脚前后错开一点，增加侧身层次",
  ),
];

const bossAngles = [
  angleFeature(
    "leftArmRelaxed",
    "左臂放松",
    ["leftShoulder", "leftElbow", "leftWrist"],
    0.85,
    "左侧手臂再放松一点",
  ),
  angleFeature(
    "rightArmRelaxed",
    "右臂放松",
    ["rightShoulder", "rightElbow", "rightWrist"],
    0.85,
    "右侧手臂再放松一点",
  ),
  angleFeature(
    "leftLegWeight",
    "左腿支撑",
    ["leftHip", "leftKnee", "leftAnkle"],
    0.8,
    "重心再落向后腿一点",
  ),
  angleFeature(
    "rightLegWeight",
    "右腿支撑",
    ["rightHip", "rightKnee", "rightAnkle"],
    0.8,
    "重心再落向后腿一点",
  ),
];
const bossLines = [
  lineFeature(
    "shoulderTilt",
    "肩线倾斜",
    ["leftShoulder", "rightShoulder"],
    1.15,
    "肩线轻微倾斜一点，不要完全僵直",
  ),
  lineFeature(
    "hipLine",
    "髋部重心",
    ["leftHip", "rightHip"],
    0.95,
    "髋部向后腿方向沉一点",
  ),
  lineFeature(
    "torsoLean",
    "躯干气势",
    ["neck", "hip"],
    1,
    "身体略微前压，保持躯干有力量",
  ),
  lineFeature(
    "footBase",
    "站姿底座",
    ["leftAnkle", "rightAnkle"],
    0.9,
    "双脚再拉开一点，让下盘更稳",
  ),
];
const bossPositions = [
  positionFeature(
    "leftHandRelaxed",
    "左手位置",
    "leftWrist",
    "leftHip",
    0.9,
    "左侧手臂自然落下，不要贴得太紧",
  ),
  positionFeature(
    "rightHandRelaxed",
    "右手位置",
    "rightWrist",
    "rightHip",
    0.9,
    "右侧手臂自然落下，不要贴得太紧",
  ),
  positionFeature(
    "leftFootWidth",
    "左脚站位",
    "leftAnkle",
    "hip",
    0.8,
    "左脚再向外打开一点",
  ),
  positionFeature(
    "rightFootWidth",
    "右脚站位",
    "rightAnkle",
    "hip",
    0.8,
    "右脚再向外打开一点",
  ),
];

const seatedAngles = [
  angleFeature(
    "leftArmSupport",
    "左臂支点",
    ["leftShoulder", "leftElbow", "leftWrist"],
    1,
    "左侧手臂找到稳定支点",
  ),
  angleFeature(
    "rightArmSupport",
    "右臂支点",
    ["rightShoulder", "rightElbow", "rightWrist"],
    1,
    "右侧手臂找到稳定支点",
  ),
  angleFeature(
    "leftKneeSeat",
    "左膝坐姿角度",
    ["leftHip", "leftKnee", "leftAnkle"],
    0.8,
    "左膝再打开一点，形成稳定坐姿",
  ),
  angleFeature(
    "rightKneeSeat",
    "右膝坐姿角度",
    ["rightHip", "rightKnee", "rightAnkle"],
    0.8,
    "右膝再打开一点，形成稳定坐姿",
  ),
];
const seatedLines = [
  lineFeature(
    "shoulderLine",
    "坐姿肩线",
    ["leftShoulder", "rightShoulder"],
    1,
    "肩线保持稳定，身体不要塌下去",
  ),
  lineFeature(
    "torsoLean",
    "身体前倾",
    ["neck", "hip"],
    1.2,
    "身体再前倾一点，保持压迫感",
  ),
  lineFeature(
    "footBase",
    "脚部支撑",
    ["leftAnkle", "rightAnkle"],
    0.8,
    "双脚踩稳，形成稳定三角",
  ),
];
const seatedPositions = [
  positionFeature(
    "leftHandSupport",
    "左手支点",
    "leftWrist",
    "leftHip",
    1,
    "左手靠近膝部或大腿，找到支点",
  ),
  positionFeature(
    "rightHandSupport",
    "右手支点",
    "rightWrist",
    "rightHip",
    1,
    "右手靠近膝部或大腿，找到支点",
  ),
  positionFeature(
    "headFocus",
    "头部集中",
    "head",
    "neck",
    0.8,
    "下巴微收，视线集中到镜头",
  ),
];

export const TUTORIAL_POSE_RULES = [
  createRule({
    id: "crossed-arms",
    name: "压迫感抱臂",
    tutorialCardId: "crossed-arms",
    templateId: "tutorial-crossed-arms",
    mode: "autoCapture",
    difficulty: "中等",
    mirrorAllowed: true,
    scoringEnabled: true,
    number: "T01",
    instruction: "双臂交叉，肩膀打开，下巴微收，保持稳定气场。",
    shotType: "halfBody",
    autoCapture: {
      enabled: true,
      threshold: 72,
      stableMs: 1500,
      countdownSeconds: 3,
    },
    template: {
      points: {
        head: [0.5, 0.16],
        neck: [0.5, 0.25],
        leftShoulder: [0.39, 0.29],
        rightShoulder: [0.61, 0.29],
        leftElbow: [0.43, 0.45],
        rightElbow: [0.57, 0.45],
        leftWrist: [0.61, 0.43],
        rightWrist: [0.39, 0.43],
        leftHip: [0.43, 0.55],
        rightHip: [0.58, 0.55],
        hip: [0.505, 0.55],
        leftKnee: [0.42, 0.75],
        rightKnee: [0.62, 0.75],
        leftAnkle: [0.36, 0.93],
        rightAnkle: [0.66, 0.93],
      },
    },
    scoring: buildScoring({
      angleFeatures: crossedArmsAngles,
      bodyLineFeatures: crossedArmsLines,
      relativePositionFeatures: crossedArmsPositions,
      featureWeights: { angles: 0.25, bodyLines: 0.3, relativePositions: 0.45 },
    }),
    correctionRules: buildCorrectionRules(
      [...crossedArmsAngles, ...crossedArmsLines, ...crossedArmsPositions],
      "双臂自然交叉，肩膀打开，双脚站稳",
    ),
  }),
  createRule({
    id: "calm-front",
    name: "冷静正立",
    tutorialCardId: "calm-front",
    templateId: "tutorial-calm-front",
    mode: "autoCapture",
    difficulty: "简单",
    mirrorAllowed: true,
    scoringEnabled: true,
    number: "T02",
    instruction: "身体正立，肩线放平，双手自然下垂，视线保持冷静。",
    shotType: "fullBody",
    autoCapture: {
      enabled: true,
      threshold: 70,
      stableMs: 1200,
      countdownSeconds: 3,
    },
    template: {
      points: {
        head: [0.5, 0.16],
        neck: [0.5, 0.25],
        leftShoulder: [0.39, 0.29],
        rightShoulder: [0.61, 0.29],
        leftElbow: [0.36, 0.48],
        rightElbow: [0.64, 0.48],
        leftWrist: [0.35, 0.65],
        rightWrist: [0.65, 0.65],
        leftHip: [0.44, 0.56],
        rightHip: [0.56, 0.56],
        hip: [0.5, 0.56],
        leftKnee: [0.43, 0.75],
        rightKnee: [0.57, 0.75],
        leftAnkle: [0.42, 0.94],
        rightAnkle: [0.58, 0.94],
      },
    },
    scoring: buildScoring({
      angleFeatures: calmFrontAngles,
      bodyLineFeatures: calmFrontLines,
      relativePositionFeatures: calmFrontPositions,
      featureWeights: { angles: 0.25, bodyLines: 0.42, relativePositions: 0.33 },
      tolerance: { bodyLineDegrees: 38 },
    }),
    correctionRules: buildCorrectionRules(
      [...calmFrontAngles, ...calmFrontLines, ...calmFrontPositions],
      "肩线放平，身体正立，双手自然下垂",
    ),
  }),
  createRule({
    id: "pocket-lookback",
    name: "侧身插袋回头",
    tutorialCardId: "pocket-lookback",
    templateId: "tutorial-pocket-lookback",
    mode: "assist",
    difficulty: "中等",
    mirrorAllowed: true,
    scoringEnabled: true,
    number: "T03",
    instruction: "身体侧向，单手插袋，头部回看镜头，保持自然松弛。",
    shotType: "threeQuarter",
    autoCapture: {
      enabled: false,
      threshold: 72,
      stableMs: 0,
      countdownSeconds: 0,
    },
    template: {
      points: {
        head: [0.53, 0.16],
        neck: [0.5, 0.25],
        leftShoulder: [0.45, 0.3],
        rightShoulder: [0.58, 0.31],
        leftElbow: [0.43, 0.47],
        rightElbow: [0.63, 0.46],
        leftWrist: [0.48, 0.55],
        rightWrist: [0.58, 0.57],
        leftHip: [0.47, 0.56],
        rightHip: [0.58, 0.56],
        hip: [0.525, 0.56],
        leftKnee: [0.47, 0.75],
        rightKnee: [0.62, 0.73],
        leftAnkle: [0.43, 0.93],
        rightAnkle: [0.68, 0.91],
      },
    },
    scoring: buildScoring({
      angleFeatures: pocketAngles,
      bodyLineFeatures: pocketLines,
      relativePositionFeatures: pocketPositions,
      featureWeights: { angles: 0.2, bodyLines: 0.36, relativePositions: 0.44 },
    }),
    correctionRules: buildCorrectionRules(
      [...pocketAngles, ...pocketLines, ...pocketPositions],
      "身体侧转，手靠近裤袋，头部回看镜头",
    ),
  }),
  createRule({
    id: "boss-stance",
    name: "大佬感站姿",
    tutorialCardId: "boss-stance",
    templateId: "tutorial-boss-stance",
    mode: "assist",
    difficulty: "进阶",
    mirrorAllowed: true,
    scoringEnabled: true,
    number: "T04",
    instruction: "重心落后腿，肩线轻微倾斜，一侧手臂自然放松。",
    shotType: "fullBody",
    autoCapture: {
      enabled: false,
      threshold: 74,
      stableMs: 0,
      countdownSeconds: 0,
    },
    template: {
      points: {
        head: [0.5, 0.15],
        neck: [0.5, 0.25],
        leftShoulder: [0.38, 0.29],
        rightShoulder: [0.62, 0.31],
        leftElbow: [0.34, 0.47],
        rightElbow: [0.66, 0.47],
        leftWrist: [0.42, 0.57],
        rightWrist: [0.58, 0.57],
        leftHip: [0.42, 0.56],
        rightHip: [0.58, 0.58],
        hip: [0.5, 0.57],
        leftKnee: [0.38, 0.75],
        rightKnee: [0.62, 0.75],
        leftAnkle: [0.32, 0.93],
        rightAnkle: [0.68, 0.93],
      },
    },
    scoring: buildScoring({
      angleFeatures: bossAngles,
      bodyLineFeatures: bossLines,
      relativePositionFeatures: bossPositions,
      featureWeights: { angles: 0.25, bodyLines: 0.38, relativePositions: 0.37 },
    }),
    correctionRules: buildCorrectionRules(
      [...bossAngles, ...bossLines, ...bossPositions],
      "重心落后腿，肩线微倾，一侧手臂放松",
    ),
  }),
  createRule({
    id: "seated-fierce",
    name: "狠厉坐姿",
    tutorialCardId: "seated-fierce",
    templateId: "tutorial-seated-fierce",
    mode: "guideOnly",
    difficulty: "进阶",
    mirrorAllowed: true,
    scoringEnabled: false,
    number: "T05",
    instruction: "坐姿前倾，手臂找到支点，眼神集中，先按引导框练习。",
    shotType: "halfBody",
    autoCapture: {
      enabled: false,
      threshold: 0,
      stableMs: 0,
      countdownSeconds: 0,
    },
    template: {
      points: {
        head: [0.5, 0.18],
        neck: [0.5, 0.3],
        leftShoulder: [0.39, 0.34],
        rightShoulder: [0.61, 0.34],
        leftElbow: [0.37, 0.52],
        rightElbow: [0.63, 0.52],
        leftWrist: [0.43, 0.62],
        rightWrist: [0.57, 0.62],
        leftHip: [0.42, 0.6],
        rightHip: [0.58, 0.6],
        hip: [0.5, 0.6],
        leftKnee: [0.36, 0.75],
        rightKnee: [0.64, 0.75],
        leftAnkle: [0.29, 0.9],
        rightAnkle: [0.71, 0.9],
      },
    },
    scoring: buildScoring({
      angleFeatures: seatedAngles,
      bodyLineFeatures: seatedLines,
      relativePositionFeatures: seatedPositions,
    }),
    feedbackRules: {
      lowScore: {
        maxScore: 100,
        message: "坐姿引导练习，首版暂不自动评分",
      },
    },
    correctionRules: buildCorrectionRules(
      [...seatedAngles, ...seatedLines, ...seatedPositions],
      "坐姿引导练习，首版暂不自动评分",
    ),
  }),
];

function createLegacyPoseRule(pose) {
  const angleFeatures = [
    angleFeature(
      "leftElbow",
      "左臂角度",
      ["leftShoulder", "leftElbow", "leftWrist"],
      1,
      "左侧手臂再贴近引导方向一点",
    ),
    angleFeature(
      "rightElbow",
      "右臂角度",
      ["rightShoulder", "rightElbow", "rightWrist"],
      1,
      "右侧手臂再贴近引导方向一点",
    ),
    angleFeature(
      "leftKnee",
      "左腿角度",
      ["leftHip", "leftKnee", "leftAnkle"],
      0.8,
      "左腿站位再调整一点",
    ),
    angleFeature(
      "rightKnee",
      "右腿角度",
      ["rightHip", "rightKnee", "rightAnkle"],
      0.8,
      "右腿站位再调整一点",
    ),
  ];
  const bodyLineFeatures = [
    lineFeature(
      "shoulderLine",
      "肩线",
      ["leftShoulder", "rightShoulder"],
      1,
      "肩线再贴近引导框一点",
    ),
    lineFeature(
      "torsoLine",
      "躯干",
      ["neck", "hip"],
      1,
      "身体方向再贴近模板一点",
    ),
    lineFeature(
      "footBase",
      "双脚",
      ["leftAnkle", "rightAnkle"],
      0.8,
      "双脚站位再调整一点",
    ),
  ];
  const relativePositionFeatures = [
    positionFeature(
      "leftWrist",
      "左手位置",
      "leftWrist",
      "neck",
      1,
      "左手位置再贴近引导框一点",
    ),
    positionFeature(
      "rightWrist",
      "右手位置",
      "rightWrist",
      "neck",
      1,
      "右手位置再贴近引导框一点",
    ),
    positionFeature(
      "leftAnkle",
      "左脚位置",
      "leftAnkle",
      "hip",
      0.8,
      "左脚站位再调整一点",
    ),
    positionFeature(
      "rightAnkle",
      "右脚位置",
      "rightAnkle",
      "hip",
      0.8,
      "右脚站位再调整一点",
    ),
  ];

  return createRule({
    id: `base-${pose.id}`,
    name: pose.name,
    tutorialCardId: null,
    templateId: pose.id,
    mode: "assist",
    difficulty: "基础",
    mirrorAllowed: true,
    scoringEnabled: true,
    number: pose.number,
    instruction: pose.instruction,
    shotType: pose.shotType,
    autoCapture: {
      ...pose.autoCapture,
      countdownSeconds: 3,
    },
    template: { points: pose.skeleton },
    scoring: buildScoring({
      angleFeatures,
      bodyLineFeatures,
      relativePositionFeatures,
    }),
  });
}

export const BASE_POSE_RULES = POSES.map(createLegacyPoseRule);
export const POSE_RULES = [...TUTORIAL_POSE_RULES, ...BASE_POSE_RULES];

export function getPoseRule(ruleId) {
  return POSE_RULES.find((rule) => rule.id === ruleId) ?? null;
}

export function getTutorialPoseRule(tutorialCardId) {
  return (
    TUTORIAL_POSE_RULES.find(
      (rule) => rule.tutorialCardId === tutorialCardId,
    ) ?? null
  );
}
