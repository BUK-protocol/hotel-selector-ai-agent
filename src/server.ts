import { Browser, chromium, Page } from "playwright";
import express, { Request, Response } from "express";
import { Server, Socket } from "socket.io";
import http from "http";
import cors from "cors";
import axios from "axios";
import { filterMappings, IS_HEADLESS, LANGFLOW_CONFIG } from "./constant";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const activeStreams = new Map<Page, { cleanup: () => void }>();
const activeBrowsers = new Map<string, Browser>();

app.use(cors());
app.use(express.json());

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log("[Socket] New client connected with ID:", socket.id);
  let streamCleanup: (() => void) | null = null;

  socket.on("start-automation", async (data) => {
    console.log("[Socket] Received start-automation event:", data);
    const { city, check_in_date, check_out_date, user_filters } = data;
    try {
      await automaticBooking(
        city,
        check_in_date,
        check_out_date,
        socket,
        user_filters
      );
      console.log("[Socket] Automation completed successfully");
      socket.emit("automation_complete");
    } catch (error) {
      console.error("[Socket] Automation error:", error);
      socket.emit("automation_error", error);
    }
  });

  socket.on("disconnect", async () => {
    console.log("[Socket] Client disconnected:", socket.id);
    try {
      const browser = activeBrowsers.get(socket.id);
      if (browser) {
        await browser.close();
        activeBrowsers.delete(socket.id);
      }
      if (streamCleanup) {
        //@ts-ignore
        await streamCleanup();
      }
    } catch (error) {
      console.error("[Socket] Error during cleanup:", error);
    }
  });
});

export async function setupStreaming(page: Page, socket: Socket) {
  console.log("[Stream] Setting up streaming for page");

  try {
    // If we already have a stream for this page, reuse it
    const existingStream = activeStreams.get(page);
    if (existingStream) {
      console.log("[Stream] Reusing existing stream");
      return existingStream.cleanup;
    }

    // Lower capture rate to ~3 FPS (300 ms interval)
    const screenshotInterval = setInterval(async () => {
      try {
        // Attempt to capture screenshot
        const screenshot = await page.screenshot({
          type: "jpeg",
          quality: 80,
          fullPage: false,
        });
        if (screenshot) {
          socket.emit("video_chunk", screenshot);
        }
      } catch (error) {
        console.error("[Stream] Screenshot error:", error);
      }
    }, 300);

    // Cleanup function stops the interval and removes from the map
    const cleanup = () => {
      clearInterval(screenshotInterval);
      activeStreams.delete(page);
      console.log("[Stream] Stream cleanup completed");
    };

    // Mark this page as streaming
    activeStreams.set(page, { cleanup });
    return cleanup;
  } catch (error) {
    console.error("[Stream] Failed to setup streaming:", error);
    socket.emit("stream_error", "Failed to setup streaming: " + error);
    throw error;
  }
}

async function launchBrowserWithFakeMedia(videoPath: string) {
  console.log("[Browser] Launching browser with fake media");

  // Verify video file exists
  if (!fs.existsSync(videoPath)) {
    console.error(`[Browser] Video file not found at ${videoPath}`);
    throw new Error(`Video file not found at ${videoPath}`);
  }

  return await chromium.launch({
    //headless: true,
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

export async function automaticBooking(
  city: string,
  check_in_date: string,
  check_out_date: string,
  socket: Socket,
  user_filters: string[]
) {
  let browser: Browser | null = null;
  let currentStreamCleanup: (() => void) | null = null;

  try {
    socket.emit("automation_message", "Starting browser");

    // Launch browser
    const videoPath = path.join(__dirname, "./media/automation.mjpeg");
    browser = await launchBrowserWithFakeMedia(videoPath);
    activeBrowsers.set(socket.id, browser);

    // Create a context and initial page
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();

    // STREAM 1: Main Page
    socket.emit("automation_message", "Setting up video stream for main page");
    currentStreamCleanup = await setupStreaming(page, socket);

    // Go to agoda
    await page.goto("https://www.agoda.com/");

    // 1) Select destination
    socket.emit("automation_message", "Selecting destination");
    await selectDestination(page, city, currentStreamCleanup);

    // 2) Select dates
    socket.emit("automation_message", "Selecting dates");
    await selectDates(
      page,
      check_in_date,
      check_out_date,
      currentStreamCleanup
    );

    // 3) Search
    socket.emit("automation_message", "Searching for hotels");
    await performSearch(page, currentStreamCleanup);

    // The search likely opens a new page; let's find it
    const pages = context.pages();
    const resultsPage = pages[pages.length - 1];

    // STOP STREAM 1 before starting new stream
    if (currentStreamCleanup) {
      await currentStreamCleanup();
      currentStreamCleanup = null;
    }

    // STREAM 2: Search Results Page
    socket.emit("automation_message", "Switching view to search results page");
    await resultsPage.bringToFront();
    // Wait for the page to stabilize
    await resultsPage.waitForLoadState("domcontentloaded");
    await resultsPage.waitForTimeout(1000);

    currentStreamCleanup = await setupStreaming(resultsPage, socket);
    await resultsPage.waitForTimeout(2000); // let the user see it

    // 4) Apply filters
    socket.emit("automation_message", "Applying filters");
    await applyFilters(resultsPage, user_filters, currentStreamCleanup);

    // 5) Select hotel (which may open final page)
    socket.emit("automation_message", "Selecting hotel");
    await selectFirstHotel(resultsPage, currentStreamCleanup);

    // Wait for the final page to open
    await resultsPage.waitForTimeout(1500);
    const allPages = context.pages();
    const lastPage = allPages[allPages.length - 1];

    // STOP STREAM 2
    if (currentStreamCleanup) {
      await currentStreamCleanup();
      currentStreamCleanup = null;
    }

    // STREAM 3: Final Hotel Page
    socket.emit("automation_message", "Switching to final hotel detail page");
    await lastPage.bringToFront();
    await lastPage.waitForLoadState("domcontentloaded");
    await lastPage.waitForTimeout(1500);

    currentStreamCleanup = await setupStreaming(lastPage, socket);
    await lastPage.waitForTimeout(3000);

    // Grab hotel info
    const hotelNameElement = lastPage.locator(
      '[data-selenium="hotel-header-name"]'
    );
    const hotelName =
      (await hotelNameElement.textContent()) || "(Unknown Hotel)";
    const { rating, reviewCount } = await getReviewScoreWithLocator(lastPage);

    socket.emit("display_data", {
      data: user_filters,
      type: "data",
      text: "Applied filters successfully",
    });

    socket.emit(
      "automation_message",
      `I recommend you choose ${hotelName} hotel, rated ${rating}/10 with ${reviewCount} reviews.`
    );

    const lastPageUrl = lastPage.url();
    socket.emit("display_data", {
      type: "markdown",
      text: `If you want to proceed with booking, here is the hotel: [Click here](${lastPageUrl})`,
    });

    // Stop final stream & close browser
    if (currentStreamCleanup) {
      await currentStreamCleanup();
    }
    await browser.close();
  } catch (error) {
    // CLEANUP ON ERROR
    if (currentStreamCleanup) {
      currentStreamCleanup();
      currentStreamCleanup = null;
    }
    if (browser) {
      await browser.close();
    }
    console.error("[Automation] Error:", error);
    throw error;
  }
}

async function getReviewScoreWithLocator(page: Page) {
  try {
    const elements = await page
      .locator('[data-testid="ReviewScoreCompact"]')
      .all();

    const reviews = await Promise.all(
      elements.map(async (element) => {
        const reviewText = await element.textContent();

        if (!reviewText) return null;

        const cleanText = reviewText.replace(/\s+/g, " ").trim();
        const ratingMatch = cleanText.match(/(\d+\.?\d*)/);
        const reviewCountMatch = cleanText.match(/(\d+,?\d*)\s*reviews/);

        return {
          rating: ratingMatch ? ratingMatch[1] : "",
          reviewCount: reviewCountMatch ? reviewCountMatch[1] : "",
          fullText: cleanText,
        };
      })
    );

    return (
      reviews.filter((review) => review !== null)[0] || {
        rating: "",
        reviewCount: "",
      }
    );
  } catch (error) {
    console.error("Error extracting review scores:", error);
    return { rating: "", reviewCount: "" };
  }
}

async function selectDestination(
  page: Page,
  city: string,
  currentStreamCleanup: (() => void) | null
) {
  console.log("[Automation] Selecting destination:", city);
  try {
    const searchInputElement = '[id="textInput"]';
    const suggestionSelector = '[data-selenium="autosuggest-item"]';

    // Wait for the input to be ready
    const input = page.locator(searchInputElement);
    await input.waitFor({ state: "visible", timeout: 5000 });

    // Clear and fill the input (more stable than type)
    await input.clear();
    await input.fill(city);

    // Wait for suggestions to appear
    await page.waitForSelector(suggestionSelector, { timeout: 5000 });

    // Select the first suggestion
    const firstSuggestion = page.locator(suggestionSelector).first();
    await firstSuggestion.click();

    // Wait for the selection to take effect
    await page.waitForTimeout(2000);

    console.log("[Automation] Destination selected successfully");
  } catch (error) {
    if (currentStreamCleanup) {
      currentStreamCleanup();
    }
    console.error("[Automation] Error selecting destination:", error);
    throw error;
  }
}

async function selectDates(
  page: Page,
  check_in_date: string,
  check_out_date: string,
  currentStreamCleanup: (() => void) | null
) {
  console.log("[Automation] Selecting dates:", {
    check_in_date,
    check_out_date,
  });
  try {
    // Click on the check-in input to open the calendar
    await page.waitForSelector('[data-element-name="search-box-check-in"]', {
      state: "visible",
    });
    await page.click('[data-element-name="search-box-check-in"]');

    // Wait for the calendar popup to appear
    await page.waitForSelector(".Popup.WideRangePicker", { state: "visible" });

    // Select Check-in Date
    const checkInSelector = `[data-selenium-date="${check_in_date}"]`;
    await page.waitForSelector(checkInSelector, { state: "visible" });
    await page.click(checkInSelector);

    // Select Check-out Date
    const checkOutSelector = `[data-selenium-date="${check_out_date}"]`;
    await page.waitForSelector(checkOutSelector, { state: "visible" });
    await page.click(checkOutSelector);
  } catch (error) {
    if (currentStreamCleanup) {
      currentStreamCleanup();
    }
    console.error("[Automation] Error selecting dates:", error);
    throw error;
  }
}

async function performSearch(
  page: Page,
  currentStreamCleanup: (() => void) | null
) {
  console.log("[Automation] Performing search");
  try {
    const searchBtnElement = '[data-selenium="searchButton"]';
    await page.waitForSelector(searchBtnElement);
    await page.click(searchBtnElement);
    await page.waitForNavigation();
    console.log("[Automation] Search performed successfully");
  } catch (error) {
    if (currentStreamCleanup) {
      currentStreamCleanup();
    }
    console.error("[Automation] Error performing search:", error);
    throw error;
  }
}

async function applyFilters(
  page: Page,
  user_filters: string[],
  currentStreamCleanup: (() => void) | null
) {
  console.log("[Automation] Applying filters:", user_filters);
  for (const filter of user_filters) {
    try {
      const filterElement = filterMappings[filter];
      console.log("[Automation] Applying filter:", filter, filterElement);

      if (!filterElement) {
        console.warn(`Filter mapping not found for: ${filter}`);
        continue;
      }

      const locator = page.locator(filterElement);

      // Wait for filter to be visible
      await locator.waitFor({ state: "visible", timeout: 5000 });
      await locator.click();

      // Small delay to let the filter apply
      await page.waitForTimeout(1500);

      console.log("[Automation] Filter applied successfully:", filter);
    } catch (error) {
      if (currentStreamCleanup) {
        currentStreamCleanup();
      }
      console.error("[Automation] Error applying filter:", filter, error);
      continue;
    }
  }
}

async function selectFirstHotel(
  page: Page,
  currentStreamCleanup: (() => void) | null
) {
  console.log("[Automation] Selecting first hotel");
  try {
    await page.waitForSelector(".hotel-list-container", { timeout: 10000 });
    const firstHotelLocator = page.locator(".PropertyCard__Link").first();
    await firstHotelLocator.click();
    console.log("[Automation] First hotel selected successfully");
  } catch (error) {
    if (currentStreamCleanup) {
      currentStreamCleanup();
    }
    console.error("[Automation] Error selecting first hotel:", error);
    throw error;
  }
}

// Test endpoint for streaming
app.post("/test-stream", async (req: Request, res: Response) => {
  console.log("[Test] Starting test stream");
  try {
    //@ts-ignore
    const browser = await launch({
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
      headless: false,
    });

    console.log("[Test] Opening test page");
    const page = await browser.newPage();
    await page.goto("https://www.google.com");

    const sockets = await io.fetchSockets();
    if (sockets.length > 0) {
      console.log("[Test] Found connected socket, setting up stream");
      const socket = sockets[0];
      //@ts-ignore
      const cleanup = await setupStreaming(page, socket);

      setTimeout(async () => {
        console.log("[Test] Cleaning up test stream");
        if (cleanup) await cleanup();
        await browser.close();
      }, 30000);

      res.json({ message: "Test stream started" });
    } else {
      console.log("[Test] No connected sockets found");
      res.status(400).json({ error: "No connected clients" });
    }
  } catch (error) {
    console.error("[Test] Test stream error:", error);
    res.status(500).json({ error: "Failed to start test stream" });
  }
});

app.post("/api/query", async (req, res) => {
  try {
    const response = await axios.post(
      `${LANGFLOW_CONFIG.API}/lf/${LANGFLOW_CONFIG.LANGFLOW_ID}/api/v1/run/${LANGFLOW_CONFIG.FLOW_ID}?stream=false`,
      {
        input_value: req.body.query,
        input_type: "chat",
        output_type: "chat",
        tweaks: {
          "Agent-1ZBB4": {},
          "ChatInput-8jsp2": {},
          "ChatOutput-X6ZsD": {},
        },
      },
      {
        headers: {
          Authorization: `Bearer ${LANGFLOW_CONFIG.AUTH_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Failed to process query" });
  }
});

//@ts-ignore
app.post("/test-automation", async (req: Request, res: Response) => {
  console.log("[Test Automation] Received request:", req.body);

  const { city, check_in_date, check_out_date, filters } = {
    city: "Delhi",
    check_in_date: "2025-02-03",
    check_out_date: "2025-02-04",
    filters: ["3 star", "pay at hotel", "less than 2km"],
  };
  if (!city || !check_in_date || !check_out_date || !filters) {
    return res.status(400).json({
      error:
        "Missing required fields. Please provide city, check_in_date, check_out_date, and filters",
    });
  }

  const checkInDate = new Date(check_in_date);
  const checkOutDate = new Date(check_out_date);

  if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
    return res.status(400).json({
      error: "Invalid date format. Please use YYYY-MM-DD format",
    });
  }

  if (checkInDate >= checkOutDate) {
    return res.status(400).json({
      error: "Check-in date must be before check-out date",
    });
  }

  try {
    const mockSocket = {
      emit: (event: string, data: any) => {
        //console.log(`[Mock Socket] Event: ${event}`, data);
      },
      id: "test-socket-" + Date.now(),
    };

    await automaticBooking(
      city,
      check_in_date,
      check_out_date,
      //@ts-ignore
      mockSocket,
      filters
    );

    return res.json({
      message: "Automation test completed successfully",
      details: {
        city,
        check_in_date,
        check_out_date,
        filters,
      },
    });
  } catch (error) {
    console.error("[Test Automation] Error:", error);
    return res.status(500).json({
      error: "Automation test failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/health", async (req: Request, res: Response) => {
  res.send("Health OK!");
});

server.listen(
  {
    port: PORT,
    host: "0.0.0.0",
  },
  () => {
    console.log(`Server ready on port ${PORT}, bound to 0.0.0.0`);
  }
);
