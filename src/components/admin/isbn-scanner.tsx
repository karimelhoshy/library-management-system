"use client";

import { Camera, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isValidIsbn } from "@/lib/isbn";

type BarcodeDetectorLike = {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
};
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** Book barcodes are EAN-13 starting with 978/979, which is the ISBN-13. */
function asIsbn(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return /^97[89]\d{10}$/.test(digits) && isValidIsbn(digits) ? digits : null;
}

/**
 * Scans a book barcode with the camera. Uses the browser's native BarcodeDetector
 * when it exists (fast, Chrome/Android) and falls back to ZXing everywhere else.
 */
function ScannerView({ onDetected }: { onDetected: (isbn: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  // Keep the latest callback without restarting the camera when the parent re-renders.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let frame = 0;

    const finish = (isbn: string) => {
      if (stopped) return;
      stopped = true;
      navigator.vibrate?.(60);
      onDetectedRef.current(isbn);
    };

    async function start() {
      const video = videoRef.current;
      if (!video) return;
      try {
        const Native = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
        if (Native) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          video.srcObject = stream;
          await video.play();
          setStatus("scanning");
          const detector = new Native({ formats: ["ean_13"] });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              const isbn = codes.map((c) => asIsbn(c.rawValue)).find(Boolean);
              if (isbn) return finish(isbn);
            } catch {
              // A frame that can't be read; keep going.
            }
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints(
            { video: { facingMode: "environment" } },
            video,
            (result) => {
              const isbn = result ? asIsbn(result.getText()) : null;
              if (isbn) finish(isbn);
            },
          );
          stopZxing = () => controls.stop();
          setStatus("scanning");
        }
      } catch (cause) {
        setStatus("error");
        setError(
          cause instanceof DOMException && cause.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser settings, or type the ISBN instead."
            : "Couldn't start the camera on this device. Type the ISBN instead.",
        );
      }
    }

    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stopZxing?.();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-foreground">
        <video ref={videoRef} className="size-full object-cover" muted playsInline />
        {status === "scanning" && (
          <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
        )}
        {status === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-white">
            <Loader2 className="size-6 animate-spin" aria-label="Starting camera" />
          </div>
        )}
      </div>
      <p role="status" className="mt-3 text-sm text-ink-2">
        {error ?? "Point the camera at the barcode on the back cover."}
      </p>
    </div>
  );
}

export function IsbnScanButton({ onDetected }: { onDetected: (isbn: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="h-12">
          <Camera /> Scan
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Scan a barcode</DialogTitle>
          <DialogDescription>We&apos;ll read the ISBN and look the book up for you.</DialogDescription>
        </DialogHeader>
        {open && (
          <ScannerView
            onDetected={(isbn) => {
              setOpen(false);
              onDetected(isbn);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
