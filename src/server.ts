// src/server.ts
import puppeteer from "puppeteer";
import express, { Request, Response } from "express";
import { Server } from "socket.io";
import http from "http";
import cors from "cors";
import axios from "axios";
import { filterMappings, LANGFLOW_CONFIG, STREAM_CONFIG } from "./constant";
import { getStream, launch } from "puppeteer-stream";

// Constants and Configuration
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = "http://localhost:5173";

// Server Setup
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// Socket.IO Connection Handler
io.on("connection", (socket) => {
  console.log("[Socket] New client connected with ID:", socket.id);
  let streamDestroy: (() => void) | null = null;

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

      if (streamDestroy) {
        console.log("[Stream] Cleaning up stream after automation");
        await streamDestroy();
        streamDestroy = null;
      }
    } catch (error) {
      console.error("[Socket] Automation error:", error);
      socket.emit("automation_error", error);

      if (streamDestroy) {
        console.log("[Stream] Cleaning up stream after error");
        await streamDestroy();
        streamDestroy = null;
      }
    }
  });

  socket.on("disconnect", async () => {
    console.log("[Socket] Client disconnected:", socket.id);
    if (streamDestroy) {
      console.log("[Stream] Cleaning up stream on disconnect");
      await streamDestroy();
      streamDestroy = null;
    }
  });
});

/**
 * Handles the streaming setup and management
 */
async function setupStreaming(page: any, socket: any) {
  console.log("[Stream] Setting up streaming for page");
  try {
    console.log("[Stream] Creating stream with config:", {
      video: true,
      audio: false,
      videoBitsPerSecond: 2500000,
      frameSize: 20,
    });

    const stream = await getStream(page, {
      video: true,
      audio: false,
      videoBitsPerSecond: 2500000,
      frameSize: 20,
    });

    console.log("[Stream] Stream created successfully");

    // Handle stream data
    stream.on("data", (chunk: Buffer) => {
      console.log("[Stream] Received chunk of size:", chunk.length);
      try {
        const arrayBuffer = chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset + chunk.byteLength
        );
        console.log("[Stream] Sending chunk to client");
        socket.emit("video_chunk", Buffer.from(arrayBuffer));
      } catch (error) {
        console.error("[Stream] Error processing chunk:", error);
      }
    });

    // Handle stream end
    stream.on("end", () => {
      console.log("[Stream] Stream ended");
      socket.emit("stream_end");
    });

    // Handle stream errors
    stream.on("error", (error: Error) => {
      console.error("[Stream] Stream error:", error);
      socket.emit("stream_error", error.message);
    });

    // Return cleanup function
    return async () => {
      console.log("[Stream] Destroying stream");
      try {
        await stream.destroy();
        console.log("[Stream] Stream destroyed successfully");
      } catch (error) {
        console.error("[Stream] Error destroying stream:", error);
      }
    };
  } catch (error) {
    console.error("[Stream] Failed to setup streaming:", error);
    socket.emit("stream_error", "Failed to setup streaming");
    throw error;
  }
}

/**
 * Main automation function to handle hotel booking process
 */
async function automaticBooking(
  city: string,
  check_in_date: string,
  check_out_date: string,
  socket: any,
  user_filters: string[]
) {
  console.log("[Automation] Starting booking automation");
  let streamDestroy: (() => void) | null = null;

  try {
    socket.emit("automation_message", "Starting browser");
    console.log("[Browser] Launching browser");

    let executablePath = '';
    const platform = process.platform;
    
    console.log("[Browser] Detecting platform:", platform);
    
    if (platform === 'darwin') { // macOS
      executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else if (platform === 'win32') { // Windows
      executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } else if (platform === 'linux') { // Linux
      executablePath = '/usr/bin/google-chrome';
    }
    
    console.log("[Browser] Using Chrome executable path:", executablePath);
    
    const browser = await launch({
      headless: false,
      args: ["--start-maximized"],
      defaultViewport: null,
      executablePath: executablePath,
    });

    console.log("[Browser] Browser launched successfully");

    console.log("[Browser] Creating new page");
    const page = await browser.newPage();

    // Setup streaming before starting automation
    console.log("[Stream] Setting up initial stream");
    streamDestroy = await setupStreaming(page, socket);

    console.log("[Browser] Navigating to Agoda");
    await page.goto("https://www.agoda.com/");

    // Handle destination selection
    socket.emit("automation_message", "Selecting destination");
    await selectDestination(page, city);

    // Handle date selection
    socket.emit("automation_message", "Selecting dates");
    await selectDates(page, check_in_date, check_out_date);

    // Perform search
    socket.emit("automation_message", "Searching for hotels");
    await performSearch(page);

    // Get the newly opened page after search
    console.log("[Browser] Getting new page after search");
    const pages = await browser.pages();
    const newPage = pages[pages.length - 1];
    console.log("[Browser] Got new page, pages count:", pages.length);

    // Setup streaming for the new page
    if (streamDestroy) {
      console.log("[Stream] Cleaning up old stream");
      await streamDestroy();
    }
    console.log("[Stream] Setting up stream for new page");
    streamDestroy = await setupStreaming(newPage, socket);

    // Apply filters
    socket.emit("automation_message", "Applying filters");
    await applyFilters(newPage, user_filters);

    // Select first available hotel
    socket.emit("automation_message", "Selecting first available hotel");
    await selectFirstHotel(newPage);

    // Emit filter data
    //emitFilterData(socket, user_filters);

    socket.emit("display_data", {
      data: user_filters,
      type: "Filters",
      text: "I have applied these filters",
    });
    console.log("Emitting filter mappings data");
    socket.emit("display_data", {
      data: filterMappings,
      type: "Filters",
      text: "If you want to change filters select from the list below",
    });

    socket.emit("automation_message", "Automation completed successfully");
    console.log("[Automation] Booking automation completed");

    // Cleanup streaming
    if (streamDestroy) {
      console.log("[Stream] Final stream cleanup");
      await streamDestroy();
    }
  } catch (error) {
    console.error("[Automation] Error in booking automation:", error);
    // Cleanup streaming on error
    if (streamDestroy) {
      console.log("[Stream] Cleaning up stream after error");
      await streamDestroy();
    }
    throw error;
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
  console.log("[Automation] Selecting dates:", { check_in_date, check_out_date });
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

// Start server
server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT} with Socket.IO support`);
});