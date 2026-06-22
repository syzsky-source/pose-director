import { useCallback, useEffect, useRef, useState } from "react";

export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const demoFrameRef = useRef(null);
  const [status, setStatus] = useState("requesting");
  const [error, setError] = useState("");

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (demoFrameRef.current) cancelAnimationFrame(demoFrameRef.current);
    demoFrameRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setStatus("requesting");
    setError("");

    const isDemoMode = new URLSearchParams(window.location.search).has("demo");

    if (!navigator.mediaDevices?.getUserMedia && !isDemoMode) {
      setStatus("error");
      setError("当前浏览器不支持摄像头访问，请使用最新版 Chrome 或 Edge。");
      return;
    }

    try {
      let stream;

      if (isDemoMode) {
        const canvas = document.createElement("canvas");
        canvas.width = 960;
        canvas.height = 720;
        const context = canvas.getContext("2d");

        const drawFrame = (time) => {
          const pulse = (Math.sin(time / 900) + 1) / 2;
          const gradient = context.createRadialGradient(
            480,
            300,
            60,
            480,
            360,
            620,
          );
          gradient.addColorStop(0, `rgb(${68 + pulse * 10}, 70, 74)`);
          gradient.addColorStop(1, "#18191b");
          context.fillStyle = gradient;
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.fillStyle = "rgba(255, 255, 255, 0.05)";
          context.fillRect(0, 0, canvas.width, 72);
          context.font = "500 16px sans-serif";
          context.fillText("POSE DIRECTOR / DEMO CAMERA", 34, 44);
          demoFrameRef.current = requestAnimationFrame(drawFrame);
        };

        demoFrameRef.current = requestAnimationFrame(drawFrame);
        stream = canvas.captureStream(30);
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("ready");
    } catch (cameraError) {
      setStatus("error");
      setError(
        cameraError.name === "NotAllowedError"
          ? "摄像头权限未开启，请在浏览器地址栏中允许访问后重试。"
          : "暂时无法连接摄像头，请检查设备是否被其他应用占用。",
      );
    }
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  return { videoRef, status, error, startCamera };
}
