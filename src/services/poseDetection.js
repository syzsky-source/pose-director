/**
 * Future pose-detection adapter.
 * Replace this mock with MediaPipe, TensorFlow.js, or an API that returns
 * normalized keypoints and a 0-100 match score.
 */
export async function detectPose(_videoElement, template, elapsedMs) {
  const progress = Math.min(elapsedMs / 6200, 1);
  const easedProgress = 1 - Math.pow(1 - progress, 2);
  const score =
    template.initialScore +
    (template.targetScore - template.initialScore) * easedProgress;

  return {
    keypoints: template.skeleton,
    score: Math.round(score),
    detected: true,
  };
}
