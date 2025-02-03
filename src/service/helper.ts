import { chromium, Page } from "playwright";
import { Socket } from "socket.io";
import { IS_HEADLESS } from "../constant";
import fs from "fs";

export async function setupStreaming(
  page: Page,
  socket: Socket,
  siteLabel: string,
  activeStreams: Map<string, { page: Page; cleanup: () => void }>
) {
  const streamKey = `${socket.id}-${siteLabel}`;
  console.log(`[Stream] Setting up streaming for key: ${streamKey}`);

  // If there's already a stream for this key, reuse or skip
  if (activeStreams.has(streamKey)) {
    console.log("[Stream] Reusing existing stream for", streamKey);

    const existingStream = activeStreams.get(streamKey);
    if (!existingStream) {
      return null; // no stream to reuse
    }
    return existingStream.cleanup;
  }

  // Start screenshot interval
  const screenshotInterval = setInterval(async () => {
    try {
      const screenshot = await page.screenshot({
        type: "jpeg",
        quality: 80,
      });
      if (screenshot) {
        socket.emit("video_chunk", {
          site: siteLabel,
          image: screenshot,
        });
      }
    } catch (error) {
      console.error(`[Stream] Screenshot error (${streamKey}):`, error);
    }
  }, 300);

  const cleanup = () => {
    clearInterval(screenshotInterval);
    // Remove from the map
    activeStreams.delete(streamKey);
    console.log(`[Stream] Cleanup for ${streamKey}`);
  };

  activeStreams.set(streamKey, { page, cleanup });

  return cleanup;
}

//Function to launch browser
export async function launchBrowserWithFakeMedia(videoPath: string) {
  console.log("[Browser] Launching browser with fake media");

  // Verify video file exists
  if (!fs.existsSync(videoPath)) {
    console.error(`[Browser] Video file not found at ${videoPath}`);
    throw new Error(`Video file not found at ${videoPath}`);
  }

  return await chromium.launch({
    headless: IS_HEADLESS,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${videoPath}`,
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-gpu",
      "--start-maximized",
    ],
  });
}
