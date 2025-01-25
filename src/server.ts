import puppeteer from "puppeteer";
import express, { Request, Response } from "express";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";
import axios from "axios";
import { filterMappings, LANGFLOW_CONFIG } from "./constant";
import path from "path";
import fs from "fs";
import dotenv from 'dotenv';

dotenv.config()

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

const activeStreams = new Map();
const activeBrowsers = new Map();

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

async function setupStreaming(page: any, socket: any) {
  console.log("[Stream] Setting up streaming for page");
  try {
    // Check for existing stream
    const existingStream = activeStreams.get(page);
    if (existingStream) {
      console.log("[Stream] Reusing existing stream");
      return existingStream.cleanup;
    }

    // Wait for page to be ready
    // await page.waitForTimeout(1000);

    // Setup screenshot interval for streaming
    const screenshotInterval = setInterval(async () => {
      try {
        const screenshot = await page.screenshot({
          type: "jpeg",
          quality: 80,
          encoding: "binary",
          fullPage: false,
          captureBeyondViewport: false,
        });

        if (screenshot) {
          socket.emit("video_chunk", screenshot);
        }
      } catch (error) {
        console.error("[Stream] Screenshot error:", error);
      }
    }, 100); // 10 FPS

    // Store cleanup function
    const cleanup = () => {
      clearInterval(screenshotInterval);
      activeStreams.delete(page);
      console.log("[Stream] Stream cleanup completed");
    };

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

  let executablePath = "";
  const platform = process.platform;

  if (platform === "darwin") {
    executablePath =
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  } else if (platform === "win32") {
    executablePath =
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  } else if (platform === "linux") {
    executablePath = "/usr/bin/google-chrome";
  }

  // Verify video file exists
  if (!fs.existsSync(videoPath)) {
    console.error(`[Browser] Video file not found at ${videoPath}`);
    throw new Error(`Video file not found at ${videoPath}`);
  }

  return await puppeteer.launch({
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${videoPath}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--start-maximized",
      "--disable-notifications",
      "--allow-file-access-from-files",
      "--disable-infobars",
      "--disable-dev-shm-usage",
      "--disable-features=IsolateOrigins",
      "--disable-site-isolation-trials",
    ],
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
    executablePath: executablePath,
    ignoreDefaultArgs: ["--mute-audio", "--enable-automation"],
  });
}

async function automaticBooking(
  city: string,
  check_in_date: string,
  check_out_date: string,
  socket: any,
  user_filters: string[]
) {
  let browser = null;
  let currentStreamCleanup: (() => void) | null = null;

  try {
    socket.emit("automation_message", "Starting browser");

    const videoPath = path.join(__dirname, "./media/automation.mjpeg");
    browser = await launchBrowserWithFakeMedia(videoPath);
    activeBrowsers.set(socket.id, browser);

    const page = await browser.newPage();

    // Set up streaming
    socket.emit("automation_message", "Setting up video stream");
    currentStreamCleanup = await setupStreaming(page, socket);

    // Continue with automation...
    await page.goto("https://www.agoda.com/");

    socket.emit("automation_message", "Selecting destination");
    await selectDestination(page, city);

    socket.emit("automation_message", "Selecting dates");
    await selectDates(page, check_in_date, check_out_date);

    socket.emit("automation_message", "Searching for hotels");
    await performSearch(page);

    const pages = await browser.pages();
    const newPage = pages[pages.length - 1];

    if (currentStreamCleanup) {
      await currentStreamCleanup();
      currentStreamCleanup = null;
    }

    socket.emit("automation_message", "Switching view to search results");
    currentStreamCleanup = await setupStreaming(newPage, socket);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    socket.emit("automation_message", "Applying filters");
    await applyFilters(newPage, user_filters);

    socket.emit("automation_message", "Selecting hotel");
    await selectFirstHotel(newPage);

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const allPages = await browser.pages();
    const lastPage = allPages[allPages.length - 1];

    if (currentStreamCleanup) {
      await currentStreamCleanup();
      currentStreamCleanup = null;
    }

    // const hotelNameAttribute = '[data-selenium="hotel-header-name"]';
    // const hotelNameText = await page.$eval(
    //   hotelNameAttribute,
    //   (el) => el.textContent
    // );


    //await new Promise((resolve) => setTimeout(resolve, 5000));
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const hotelName = await lastPage
      .locator('[data-selenium="hotel-header-name"]')
      .map(element => element.textContent?.trim() || '')
      .wait();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const hotelRattingAttribute = "";
    const totalHotelReviewersAttribute = "";

    //@ts-ignore
    const {rating,reviewCount} = await getReviewScoreWithLocator(lastPage)

    console.log('Details.....',hotelName,rating,reviewCount)

    socket.emit("automation_message", "Switching view to search results");
    currentStreamCleanup = await setupStreaming(lastPage, socket);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    socket.emit("display_data", {
      data: user_filters,
      type: "Filters",
      text: "Applied filters successfully",
    });

    socket.emit(
      "automation_message",
      `I recommend you choose ${hotelName} hotel which has been rated ${rating}/10 with ${reviewCount}`
    );

    const lastPageUrl = await lastPage.url()


    socket.emit(
      "automation_message",
      `If you want to proceed with booking here is the url for it ${lastPageUrl}`
    );


    if (currentStreamCleanup) {
      await currentStreamCleanup();
    }
  } catch (error) {
    console.error("[Automation] Error:", error);
    throw error;
  }
}

async function getReviewScoreWithLocator(page:any) {
  try {
    const reviewText = await page
      .locator('[data-testid="ReviewScoreCompact"]')
      .map((element:any) => element.textContent || '')
      .wait();
      
    // Clean and process the text
    const cleanText = reviewText.replace(/\s+/g, ' ').trim();
    const ratingMatch = cleanText.match(/(\d+\.?\d*)/);
    const reviewCountMatch = cleanText.match(/(\d+,?\d*)\s*reviews/);

    return {
      rating: ratingMatch ? ratingMatch[0] : '',
      reviewCount: reviewCountMatch ? reviewCountMatch[0] : '',
      fullText: cleanText
    };
  } catch (error) {
    console.error('Error extracting review score:', error);
    return null;
  }
}


/**
 * Helper functions for breaking down the automation process
 */
async function selectDestination(page: any, city: string) {
  console.log("[Automation] Selecting destination:", city);
  try {
    const searchInputElement = '[id="textInput"]';
    await page.waitForSelector(searchInputElement, {
      visible: true,
      timeout: 5000,
    });
    await page.click(searchInputElement);
    //@ts-ignore
    await page.evaluate((selector) => {
      const element = document.querySelector(selector) as HTMLInputElement;
      if (element) element.value = "";
    }, searchInputElement);
    await page.type(searchInputElement, city, { delay: 150 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.keyboard.press("Enter");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log("[Automation] Destination selected successfully");
  } catch (error) {
    console.error("[Automation] Error selecting destination:", error);
    throw error;
  }
}

async function selectDates(
  page: any,
  check_in_date: string,
  check_out_date: string
) {
  console.log("[Automation] Selecting dates:", {
    check_in_date,
    check_out_date,
  });
  try {
    const checkInBoxSelector = '[data-element-name="check-in-box"]';
    await page.waitForSelector(checkInBoxSelector, { timeout: 5000 });
    await page.click(checkInBoxSelector);

    const checkInSelector = `[data-selenium-date="${check_in_date}"]`;
    await page.waitForSelector(checkInSelector, { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.click(checkInSelector);

    const checkOutSelector = `[data-selenium-date="${check_out_date}"]`;
    await page.waitForSelector(checkOutSelector, { timeout: 5000 });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await page.click(checkOutSelector);
    console.log("[Automation] Dates selected successfully");
  } catch (error) {
    console.error("[Automation] Error selecting dates:", error);
    throw error;
  }
}

async function performSearch(page: any) {
  console.log("[Automation] Performing search");
  try {
    const searchBtnElement = '[data-selenium="searchButton"]';
    await page.waitForSelector(searchBtnElement);
    await page.click(searchBtnElement);
    console.log("[Automation] Search performed successfully");
  } catch (error) {
    console.error("[Automation] Error performing search:", error);
    throw error;
  }
}

async function applyFilters(page: any, user_filters: string[]) {
  console.log("[Automation] Applying filters:", user_filters);
  for (const filter of user_filters) {
    try {
      const filter_element = filterMappings[filter];
      console.log("[Automation] Applying filter:", filter, filter_element);
      const filterLocator = page.locator(filter_element);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await filterLocator.click();
      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log("[Automation] Filter applied successfully:", filter);
    } catch (error) {
      console.error("[Automation] Error applying filter:", filter, error);
      continue;
    }
  }
}

async function selectFirstHotel(page: any) {
  console.log("[Automation] Selecting first hotel");
  try {
    await page.waitForSelector(".hotel-list-container", { timeout: 10000 });
    const firstHotelLocator = page.locator(".PropertyCard__Link");
    await firstHotelLocator.click();
    console.log("[Automation] First hotel selected successfully");
  } catch (error) {
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


app.get("/health",async(req:Request,res:Response)=>{
  res.send("Health OK!")
})



server.listen({
  port: PORT,
  host: '0.0.0.0'
}, () => {
  console.log(`Server ready on port ${PORT}, bound to 0.0.0.0`);
});

// Start server
// server.listen(PORT, () => {
//   console.log(`[Server] Running on port ${PORT} with Socket.IO support`);
// });
