import dotenv from "dotenv";
import express, { Request, Response } from "express";
import http from "http";
import { Browser, Page } from "playwright";
import { Server, Socket } from "socket.io";
import path from "path";
import cors from "cors";
import axios from "axios";
import { LANGFLOW_CONFIG, SITE_LABEL } from "./constant";
import { automateBookingAgoda } from "./service/automaticBookingAgoda";
import { automateBookingMmt } from "./service/automaticBookingMmt";
import { automateBookingHotelDotCom } from "./service/automateBookingHotelDotCom";
import { launchBrowserWithFakeMedia, setupStreaming } from "./service/helper";
import { automateBookingExpedia } from "./service/automateBookingExpedia";
import { SiteConfig } from "./types";

dotenv.config();

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Create Express app, HTTP server, and socket.io instance
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

// Maps to track active streams and browsers
const activeStreams = new Map<string, { page: Page; cleanup: () => void }>();
const activeBrowsers = new Map<string, Browser>();

// Define video paths for each site
const videoPaths = {
  [SITE_LABEL.AGODA]: path.join(__dirname, "./media/agoda-automation.mjpeg"),
  [SITE_LABEL.MMT]: path.join(__dirname, "./media/mmt-automation.mjpeg"),
  [SITE_LABEL.HOTEL_DOT_COM]: path.join(__dirname, "./media/hoteldotcom-automation.mjpeg"),
  [SITE_LABEL.EXPEDIA]: path.join(__dirname, "./media/expedia-automation.mjpeg"),
};

// Create a configuration array for the sites


const sites: SiteConfig[] = [
  {
    label: SITE_LABEL.AGODA,
    videoPath: videoPaths[SITE_LABEL.AGODA],
    automationFn: automateBookingAgoda,
  },
  {
    label: SITE_LABEL.MMT,
    videoPath: videoPaths[SITE_LABEL.MMT],
    automationFn: automateBookingMmt,
  },
  {
    label: SITE_LABEL.HOTEL_DOT_COM,
    videoPath: videoPaths[SITE_LABEL.HOTEL_DOT_COM],
    //@ts-ignore
    automationFn: automateBookingHotelDotCom,
  },
  {
    label: SITE_LABEL.EXPEDIA,
    videoPath: videoPaths[SITE_LABEL.EXPEDIA],
    automationFn: automateBookingExpedia,
  },
];

// Helper to emit messages with a site label prefix
function emitMessage(socket: Socket, label: string, message: string) {
  socket.emit("automation_message", `[${label}] ${message}`);
}

// Helper function to setup and run automation for a given site
async function setupSiteAutomation(
  site: SiteConfig,
  socket: Socket,
  city: string,
  check_in_date: string,
  check_out_date: string,
  user_filters: string[]
): Promise<{ key: string; browser: Browser }> {
  const key = `${socket.id}-${site.label}`;
  const browser = await launchBrowserWithFakeMedia(site.videoPath);
  activeBrowsers.set(key, browser);

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  // Setup streaming for this page
  const cleanup = await setupStreaming(page, socket, site.label, activeStreams);

  emitMessage(socket, site.label, "Starting automation...");
  // Run the site-specific automation function
  await site.automationFn(page, {
    city,
    check_in_date,
    check_out_date,
    socket,
    user_filters,
    cleanup,
    activeStreams,
  });
  emitMessage(socket, site.label, "Automation completed!");

  return { key, browser };
}

// Main automation function that runs all site automations in parallel
async function automateBooking(
  city: string,
  check_in_date: string,
  check_out_date: string,
  socket: Socket,
  user_filters: string[]
) {
  try {
    const automationPromises = sites.map((site) =>
      setupSiteAutomation(site, socket, city, check_in_date, check_out_date, user_filters)
    );
    await Promise.all(automationPromises);
    socket.emit("automation_message", "All site automations complete!");
  } catch (error) {
    console.error("[Automation] Error:", error);
    socket.emit("automation_error", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Socket.io connection handler
io.on("connection", (socket) => {
  console.log("[Socket] New client connected with ID:", socket.id);

  socket.on("start-automation", async (data) => {
    console.log("[Socket] Received start-automation event:", data);
    const { city, check_in_date, check_out_date, user_filters } = data;
    try {
      await automateBooking(city, check_in_date, check_out_date, socket, user_filters);
      socket.emit("automation_complete");
    } catch (error) {
      console.error("[Socket] Automation error:", error);
      socket.emit("automation_error", error);
    }
  });

  socket.on("disconnect", async () => {
    console.log("[Socket] Disconnecting:", socket.id);
    // Clean up streams and browsers for each site using the configuration array
    for (const site of sites) {
      const key = `${socket.id}-${site.label}`;
      if (activeStreams.has(key)) {
        const streamData = activeStreams.get(key);
        if (streamData) {
          streamData.cleanup();
          activeStreams.delete(key);
        }
      }
      if (activeBrowsers.has(key)) {
        const browser = activeBrowsers.get(key);
        if (browser) {
          await browser.close();
          activeBrowsers.delete(key);
        }
      }
    }
  });
});

// Health check endpoint
app.get("/health", (req: Request, res: Response) => {
  res.send("Health OK!");
});

// Test automation endpoint
//@ts-ignore
app.post("/test-automation", async (req: Request, res: Response) => {
  console.log("[Test Automation] Received request:", req.body);

  // For testing, using hardcoded values
  const { city, check_in_date, check_out_date, filters } = {
    city: "Delhi",
    check_in_date: "2025-02-06",
    check_out_date: "2025-02-07",
    filters: ["3 star", "free cancellation", "less than 2km"],
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
    return res.status(400).json({ error: "Invalid date format. Please use YYYY-MM-DD format" });
  }

  if (checkInDate >= checkOutDate) {
    return res.status(400).json({ error: "Check-in date must be before check-out date" });
  }

  try {
    const mockSocket = {
      emit: (event: string, data: any) => {
        //console.log(`[Mock Socket] Event: ${event}`, data);
      },
      id: "test-socket-" + Date.now(),
    } as Socket;

    await automateBooking(city, check_in_date, check_out_date, mockSocket, filters);
    return res.json({
      message: "Automation test completed successfully",
      details: { city, check_in_date, check_out_date, filters },
    });
  } catch (error) {
    console.error("[Test Automation] Error:", error);
    return res.status(500).json({
      error: "Automation test failed",
      details: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// API query endpoint using axios
app.post("/api/query", async (req: Request, res: Response) => {
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
    console.error("API Query Error:", error);
    res.status(500).json({ error: "Failed to process query" });
  }
});

server.listen(
  {
    port: PORT,
    host: "0.0.0.0",
  },
  () => {
    console.log(`Server ready on port ${PORT}, bound to 0.0.0.0`);
});
