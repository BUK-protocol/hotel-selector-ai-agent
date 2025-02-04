import dotenv from "dotenv";
import express, { Request, Response } from "express";
import http from "http";
import { Browser, Page } from "playwright";
import { Server, Socket } from "socket.io";
import path from "path";
import cors from "cors";
import { launchBrowserWithFakeMedia, setupStreaming } from "./service/helper";
import { automateBookingAgoda } from "./service/automaticBookingAgoda";
import { automateBookingMmt } from "./service/automaticBookingMmt";
import { LANGFLOW_CONFIG, SITE_LABEL } from "./constant";
import axios from "axios";
import { automateBookingHotelDotCom } from "./service/automateBookingHotelDotCom";
import { automateBookingExpedia } from "./service/automateBookingExpedia";

dotenv.config();

const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

//Socket io and server setup
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

//Streams Variables
//Mapping of (socketid-website) to page and cleanup function
const activeStreams = new Map<string, { page: Page; cleanup: () => void }>();
const activeBrowsers = new Map<string, Browser>();
const videoPathAgoda = path.join(__dirname, "./media/agoda-automation.mjpeg");
const videoPathMmt = path.join(__dirname, "./media/mmt-automation.mjpeg");
const videoPathHotelDotCom = path.join(
  __dirname,
  "./media/hoteldotcom-automation.mjpeg"
);
const videoPathExpedia = path.join(
  __dirname,
  "./media/expedia-automation.mjpeg"
);

//Socket.io connection handler
io.on("connection", (socket) => {
  console.log("[Socket] New client connected with ID:", socket.id);

  socket.on("start-automation", async (data) => {
    console.log("[Socket] Received start-automation event:", data);
    const { city, check_in_date, check_out_date, user_filters } = data;
    try {
      await automateBooking(
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
    console.log("[Socket] Disconnecting:", socket.id);
    const keys = [
      `${socket.id}-${SITE_LABEL.AGODA}`,
      `${socket.id}-${SITE_LABEL.MMT}`,
      `${socket.id}-${SITE_LABEL.HOTEL_DOT_COM}`,
      `${socket.id}-${SITE_LABEL.EXPEDIA}`,
    ];

    for (const key of keys) {
      if (activeStreams.has(key)) {
        const streamData = activeStreams.get(key);
        if (!streamData) {
          return;
        }
        streamData.cleanup();
        activeStreams.delete(key);
      }
    }

    const browserAgoda = activeBrowsers.get(keys[0]);
    const browserMmt = activeBrowsers.get(keys[1]);
    const browserHotelDotCom = activeBrowsers.get(keys[2])
    const browserExpedia = activeBrowsers.get(keys[3])

    if (browserAgoda) {
      await browserAgoda.close();
      activeBrowsers.delete(keys[0]);
    }

    if (browserMmt) {
      await browserMmt.close();
      activeBrowsers.delete(keys[1]);
    }
    if (browserHotelDotCom) {
      await browserHotelDotCom.close();
      activeBrowsers.delete(keys[2]);
    }
    if (browserExpedia) {
      await browserExpedia.close();
      activeBrowsers.delete(keys[3]);
    }
  });
});

//Function to automate booking
async function automateBooking(
  city: string,
  check_in_date: string,
  check_out_date: string,
  socket: Socket,
  user_filters: string[]
) {
  let browserAgoda: Browser | null = null;
  let browserMmt: Browser | null = null;
  let browserHotelDotCom: Browser | null = null;
  let browserExpedia: Browser | null = null;

  let cleanupAgoda: (() => void) | null = null;
  let cleanupMmt: (() => void) | null = null;
  let cleanupHotelDotCom: (() => void) | null = null;
  let cleanupExpedia: (() => void) | null = null;
  try {
    socket.emit(
      "automation_message",
      "Launching separate browsers for Agoda & Make my trip..."
    );

    //Launch two separate browsers
    browserAgoda = await launchBrowserWithFakeMedia(videoPathAgoda);
    browserMmt = await launchBrowserWithFakeMedia(videoPathMmt);
    browserHotelDotCom = await launchBrowserWithFakeMedia(videoPathHotelDotCom)
    browserExpedia = await launchBrowserWithFakeMedia(videoPathExpedia)

    //Create contexts & pages
    const contextAgoda = await browserAgoda.newContext({ viewport: null });
    const contextMmt = await browserMmt.newContext({ viewport: null });
    const contextHotelDotCom = await browserHotelDotCom.newContext({viewport:null})
    const contextExpedia = await browserExpedia.newContext({viewport:null})

    const pageAgoda = await contextAgoda.newPage();
    const pageMmt = await contextMmt.newPage();
    const pageHotelDotCom = await contextHotelDotCom.newPage()
    const pageExpedia = await contextExpedia.newPage()

    // Stream Setup
    cleanupAgoda = await setupStreaming(
      pageAgoda,
      socket,
      SITE_LABEL.AGODA,
      activeStreams
    );

    cleanupMmt = await setupStreaming(
      pageMmt,
      socket,
      SITE_LABEL.MMT,
      activeStreams
    );

    cleanupHotelDotCom = await setupStreaming(
      pageHotelDotCom,
      socket,
      SITE_LABEL.HOTEL_DOT_COM,
      activeStreams
    );

    cleanupExpedia = await setupStreaming(
      pageExpedia,
      socket,
      SITE_LABEL.EXPEDIA,
      activeStreams
    );

    //Automation: run both in parallel
    await Promise.all([
      (async () => {
        socket.emit("automation_message", "Starting Agoda automation...");
        await automateBookingAgoda(pageAgoda, {
          city,
          check_in_date,
          check_out_date,
          socket,
          user_filters,
          cleanupAgoda,
          activeStreams,
        });
        socket.emit("automation_message", "Agoda flow done!");
      })(),
      (async () => {
        socket.emit(
          "automation_message",
          "Starting Make my trip automation..."
        );
        await automateBookingMmt(pageMmt, {
          city,
          check_in_date,
          check_out_date,
          socket,
          user_filters,
          cleanupMmt,
          activeStreams,
        });
        socket.emit("automation_message", "Travala flow done!");
      })(),
      (async () => {
        socket.emit(
          "automation_message",
          "Starting Hotel.com automation..."
        );
        await automateBookingHotelDotCom(pageHotelDotCom, {
          city,
          check_in_date,
          check_out_date,
          socket,
          user_filters,
          cleanupHotelDotCom,
          activeStreams,
        });
        socket.emit("automation_message", "Hotel.com flow done!");
      })(),
      (async () => {
        socket.emit(
          "automation_message",
          "Starting Expedia automation..."
        );
        await automateBookingExpedia(pageHotelDotCom, {
          city,
          check_in_date,
          check_out_date,
          socket,
          user_filters,
          cleanupExpedia,
          activeStreams,
        });
        socket.emit("automation_message", "Expedia flow done!");
      })(),
    ]);

    //Done
    socket.emit(
      "automation_message",
      "Both Agoda & Travala automation complete!"
    );

    // Cleanup streams
    if (cleanupAgoda) cleanupAgoda();
    if (cleanupMmt) cleanupMmt();
    if (cleanupHotelDotCom) cleanupHotelDotCom()
    if (cleanupExpedia) cleanupExpedia()

    // Close browsers
    await browserAgoda.close();
    await browserMmt.close();
    await browserExpedia.close()
    await browserHotelDotCom.close()
  } catch (error) {
    socket.emit(
      "automation_error",
      error instanceof Error ? error.message : String(error)
    );
    console.error("[AutomationBoth] Error:", error);

    // Cleanup
    if (cleanupAgoda) cleanupAgoda();
    if (cleanupMmt) cleanupMmt();

    if (browserAgoda) await browserAgoda.close();
    if (browserMmt) await browserMmt.close();

    throw error;
  }
}

app.get("/health", async (req: Request, res: Response) => {
  res.send("Health OK!");
});

//@ts-ignore
app.post("/test-automation", async (req: Request, res: Response) => {
  console.log("[Test Automation] Received request:", req.body);

  const { city, check_in_date, check_out_date, filters } = {
    city: "Delhi",
    check_in_date: "2025-02-03",
    check_out_date: "2025-02-04",
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

    await automateBooking(
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
    console.log("error", error);
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
  }
);
