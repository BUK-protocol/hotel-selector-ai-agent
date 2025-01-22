// src/server.ts
import puppeteer from "puppeteer";
import express, { Request, Response } from "express";
import { Server } from "socket.io";
import http from "http";
import cors from 'cors';
import axios from "axios";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Update this to match your frontend URL
    methods: ["GET", "POST"],
    credentials: true
  }
});

const filterMappings:{[key:string]:string} = {
  // Star ratings
  '5 star': '[aria-label="5-Star rating"]',
  '4 star': '[aria-label="4-Star rating"]',
  '3 star': '[aria-label="3-Star rating"]',
  '2 star': '[aria-label="2-Star rating"]',
  '1 star': '[aria-label="1-Star rating"]',
  
  // Payment options
  'free cancellation': '[data-selenium="filter-item-text"]::-p-text("Free cancellation")',
  'pay at hotel': '[data-selenium="filter-item-text"]::-p-text("Pay at the hotel")',
  'book now pay later': '[data-selenium="filter-item-text"]::-p-text("Book now, pay later")',
  'pay now': '[data-selenium="filter-item-text"]::-p-text("Pay now")',
  'book without credit card': '[data-selenium="filter-item-text"]::-p-text("Book without credit card")',
  
  // Distance filters
  'inside city center': '[data-selenium="filter-item-text"]::-p-text("Inside city center")',
  'less than 2km': '[data-selenium="filter-item-text"]::-p-text("<2 km to center")',
  '2-5km': '[data-selenium="filter-item-text"]::-p-text("2-5 km to center")',
  '5-10km': '[data-selenium="filter-item-text"]::-p-text("5-10 km to center")',
  'more than 10km': '[data-selenium="filter-item-text"]::-p-text(">10 km to center")',

  // Special deals
  'secret deals': '[data-element-name="search-sort-secret-deals"]'
};


app.use(cors());
app.use(express.json());

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("start-automation", async (data) => {
    const { city, check_in_date, check_out_date, user_filters} = data;
    try {
      await automaticBooking(city, check_in_date, check_out_date, socket,user_filters);
      socket.emit("automation_complete");
    } catch (error) {
      socket.emit("automation_error", error);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});


async function automaticBooking(
  city: string,
  check_in_date: string,
  check_out_date: string,
  socket: any,
  user_filters:string[]
) {
  try {
    socket.emit("automation_message", "Starting browser");
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized"]
    });

    const page = await browser.newPage();
    socket.emit("automation_message", "Going to Agoda.com");
    await page.goto("https://www.agoda.com/");

    // Destination Selection
    socket.emit("automation_message", "Selecting destination");
    try {
      const searchInputElement = '[id="textInput"]';
      await page.waitForSelector(searchInputElement, { visible: true, timeout: 5000 });
      await page.click(searchInputElement);
      await page.evaluate((selector) => {
        const element = document.querySelector(selector) as HTMLInputElement;
        if (element) element.value = "";
      }, searchInputElement);
      
      await page.type(searchInputElement, city, { delay: 150 });
      await new Promise(resolve => setTimeout(resolve, 1500));
      await page.keyboard.press("Enter");
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      socket.emit("automation_message", "Failed to select destination");
      throw error;
    }

    // Date Selection
    socket.emit("automation_message", "Selecting dates");
    const checkInBoxSelector = '[data-element-name="check-in-box"]';
    await page.waitForSelector(checkInBoxSelector, { timeout: 5000 });
    await page.click(checkInBoxSelector);
    
    // Select check-in date
    const checkInSelector = `[data-selenium-date="${check_in_date}"]`;
    await page.waitForSelector(checkInSelector, { timeout: 5000 });
    await page.click(checkInSelector);
    
    // Select check-out date
    const checkOutSelector = `[data-selenium-date="${check_out_date}"]`;
    await page.waitForSelector(checkOutSelector, { timeout: 5000 });
    await page.click(checkOutSelector);

    // Search
    socket.emit("automation_message", "Searching for hotels");
    const searchBtnElement = '[data-selenium="searchButton"]';
    await page.waitForSelector(searchBtnElement);
    await page.click(searchBtnElement);
    
    const pages = await browser.pages();
    const newPage = pages[pages.length - 1];

    // Apply Filters
    socket.emit("automation_message", "Applying filters");
    // const filters = [
    //   '[data-element-name="search-sort-secret-deals"]',
    //   '[data-selenium="filter-item-text"]::-p-text("Free cancellation")',
    //   '[aria-label="4-Star rating"]',
    //   '[data-selenium="filter-item-text"]::-p-text("Inside city center")'
    // ];

    



    for (const filter of user_filters) {
      try {
        const filter_element = filterMappings?.[filter]
        const filterLocator = newPage.locator(filter_element);
        await filterLocator.click();
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        continue;
      }
    }

    // Select Hotel
    socket.emit("automation_message", "Selecting first available hotel");
    await newPage.waitForSelector(".hotel-list-container", { timeout: 10000 });
    const firstHotelLocator = newPage.locator(".PropertyCard__Link");
    await firstHotelLocator.click();

    socket.emit("automation_message", "Automation completed successfully");
    
  } catch (error) {
    throw error;
  }
}

app.post("/automate-search", async (req: Request, res: Response) => {
  try {
    const { city, check_in_date, check_out_date } = req.body;
    //@ts-ignore
    await automaticBooking(city, check_in_date, check_out_date);
    res.status(200).send('Automation completed')
  } catch (error) {
    console.log("Error ouccurred in automate booking", error);
    res.status(500).send("Something went wrong");
  }
});

const LANGFLOW_API = 'https://api.langflow.astra.datastax.com';
const LANGFLOW_ID = 'ebfd2f4a-2569-45af-ba6a-28409e1dea0c';
const FLOW_ID = 'e54d4f23-cdd0-4fdb-95e5-7bf8ae211681';
const AUTH_TOKEN = 'AstraCS:CMBAUJobQhtQaZlXwsObOHRA:95d6ca9170b693f0a6fc09278a6c0d275eff0fcbcdd98323fc229fd66d5c0766';

app.post('/api/query', async (req, res) => {
    try {
        const response = await axios.post(
            `${LANGFLOW_API}/lf/${LANGFLOW_ID}/api/v1/run/${FLOW_ID}?stream=false`,
            {
                input_value: req.body.query,
                input_type: 'chat',
                output_type: 'chat',
                tweaks: {
                    "Agent-1ZBB4": {},
                    "ChatInput-8jsp2": {},
                    "ChatOutput-X6ZsD": {}
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${AUTH_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.json(response.data);
    } catch (error) {
      //@ts-ignore
        console.error('Proxy Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to process query' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} with Socket.IO support`);
});




//console.log("Starting automation script...");
// automaticBooking()
//   .then(() => {
//     console.log("Script execution finished");
//   })
//   .catch((error) => {
//     console.error("Script failed:", error);
//   });
