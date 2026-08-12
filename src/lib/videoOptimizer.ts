import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

const CORE_BASE =
  "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd/ffmpeg-core.js";

const MAX_OPTIMIZE_BYTES = 20 * 1024 * 1024;
const SKIP_IF_SMALLER_THAN = 5 * 1024 * 1024;
const MAX_DURATION_MS = 120_000;

let ffmpegPromise: Promise<FFmpeg> | null = null;

function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(CORE_BASE, "text/javascript"),
        wasmURL: await toBlobURL(
          CORE_BASE.replace(".js", ".wasm"),
          "application/wasm",
        ),
      });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration * 1000);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("timeout")),
      ms,
    );
    promise.then(
      (v) => {
        window.clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Transcodes a short chat video to a lighter H.264/mp4 in the browser.
 * Falls back to the original file if the video is already small, too
 * long, fails to process, or ends up larger than the source.
 */
export async function optimizeVideo(file: File): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  if (file.size <= SKIP_IF_SMALLER_THAN) return file;
  if (file.size > MAX_OPTIMIZE_BYTES) return file;

  try {
    const duration = await probeDuration(file);
    if (duration === 0 || duration > MAX_DURATION_MS) return file;

    const ffmpeg = await getFFmpeg();
    const inName = "in" + (file.name.match(/\.[^.]+$/)?.[0] ?? ".mp4");
    const outName = "out.mp4";

    await ffmpeg.writeFile(inName, await fetchFile(file));
    await withTimeout(
      ffmpeg.exec([
        "-i",
        inName,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "28",
        "-vf",
        "scale='min(1280,iw)':-2",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        outName,
      ]),
      60_000,
    );
    const data = await ffmpeg.readFile(outName);
    await ffmpeg.deleteFile(inName).catch(() => {});
    await ffmpeg.deleteFile(outName).catch(() => {});

    if (!(data instanceof Uint8Array) || data.byteLength === 0) return file;

    const optimized = new File(
      [new Uint8Array(data)],
      file.name.replace(/\.[^.]+$/, "") + ".mp4",
      { type: "video/mp4" },
    );
    return optimized.size >= file.size ? file : optimized;
  } catch {
    return file;
  }
}
