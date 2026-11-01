"use client";

import Image from "next/image";
import {
  Camera,
  Check,
  ImagePlus,
  RefreshCw,
  Sun,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Notice } from "./ui";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "This browser can’t open a camera here. You can choose a photo or follow the text guidance.",
      );
      return;
    }
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 1600 },
        },
        audio: false,
      });
      if (!mounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      setActive(true);
    } catch (cause) {
      setCameraError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Camera access is off. Enable it in your browser’s site settings, or choose a photo instead."
          : "The camera couldn’t start. Check that another app isn’t using it, or choose a photo instead.",
      );
    } finally {
      if (mounted.current) setStarting(false);
    }
  }, []);

  useEffect(() => {
    if (active && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current
        .play()
        .catch(() =>
          setCameraError("Tap to start the camera again, or use a photo."),
        );
    }
  }, [active]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  const capture = useCallback(
    async () => captureVideoFrame(videoRef.current),
    [],
  );
  return { videoRef, active, starting, cameraError, start, stop, capture };
}

export async function captureVideoFrame(
  video: HTMLVideoElement | null,
): Promise<File> {
  if (!video || video.readyState < 2 || !video.videoWidth)
    throw new Error(
      "The camera is still opening. Wait for your picture, then capture again.",
    );
  const canvas = document.createElement("canvas");
  const ratio = Math.min(
    1,
    1920 / Math.max(video.videoWidth, video.videoHeight),
  );
  canvas.width = Math.round(video.videoWidth * ratio);
  canvas.height = Math.round(video.videoHeight * ratio);
  const context = canvas.getContext("2d");
  if (!context)
    throw new Error(
      "This browser couldn’t capture a still. Choose a photo instead.",
    );
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.94),
  );
  if (!blob)
    throw new Error("The photo couldn’t be captured. Please try again.");
  return new File([blob], `steady-capture-${Date.now()}.jpg`, {
    type: "image/jpeg",
  });
}

export function usePhotoUrl(file: File | null) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    queueMicrotask(() => setUrl(next));
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return file ? url : "";
}

export function StillCapture({
  file,
  onSelected,
  label = "Choose a clear photo",
  maxBytes = 10 * 1024 * 1024,
  showGuidelines = true,
  description,
  previewLabel,
}: {
  file: File | null;
  onSelected: (file: File | null) => void;
  label?: string;
  maxBytes?: number;
  showGuidelines?: boolean;
  description?: string;
  previewLabel?: string;
}) {
  const { videoRef, active, starting, cameraError, start, stop, capture } =
    useCamera();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const url = usePhotoUrl(file);
  const [error, setError] = useState("");

  function choose(selected?: File) {
    if (!selected) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) {
      setError(
        "Choose a JPG, PNG, or WebP photo. You can convert HEIC photos on your device first.",
      );
      return;
    }
    if (selected.size > maxBytes) {
      setError(
        `Choose a photo smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`,
      );
      return;
    }
    stop();
    onSelected(selected);
  }

  async function takePhoto() {
    try {
      choose(await capture());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Please try the capture again.",
      );
    }
  }

  return (
    <div className="still-capture">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {file && url ? (
        <div className="capture-preview">
          <Image
            src={url}
            width={1200}
            height={1200}
            alt={
              previewLabel ||
              "Your selected actual photo, ready for confirmation"
            }
            unoptimized
          />
          <div className="capture-actions">
            <Button variant="secondary" onClick={() => onSelected(null)}>
              <RefreshCw size={16} aria-hidden />
              Choose again
            </Button>
          </div>
        </div>
      ) : active ? (
        <div className="camera-mini">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            aria-label="Live camera, mirrored for framing"
          />
          <div className="capture-actions">
            <Button onClick={() => void takePhoto()}>
              <Camera size={17} aria-hidden />
              Take this photo
            </Button>
            <Button
              variant="secondary"
              onClick={stop}
              aria-label="Close camera"
            >
              <X size={18} aria-hidden />
            </Button>
          </div>
        </div>
      ) : (
        <div className="upload-zone">
          <ImagePlus size={35} aria-hidden />
          <p>{description || label}</p>
          <div className="capture-actions">
            <Button
              variant="secondary"
              onClick={() => void start()}
              busy={starting}
            >
              <Camera size={17} aria-hidden />
              Open camera
            </Button>
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={17} aria-hidden />
              Choose photo
            </Button>
          </div>
        </div>
      )}
      {cameraError || error ? (
        <div style={{ marginTop: 15 }}>
          <Notice kind="error">{error || cameraError}</Notice>
        </div>
      ) : null}
      {showGuidelines ? (
        <div className="capture-guidelines">
          <span>
            <Sun size={14} aria-hidden />
            Light in front
          </span>
          <span>
            <Check size={14} aria-hidden />
            No filter
          </span>
        </div>
      ) : null}
    </div>
  );
}
