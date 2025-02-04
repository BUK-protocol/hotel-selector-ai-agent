import { Page } from "playwright";
import { Socket } from "socket.io";
import { setupStreaming } from "./helper";
import { SITE_LABEL } from "../constant";

export async function automateBookingMmt(
  page: Page,
  {
    city,
    check_in_date,
    check_out_date,
    socket,
    user_filters,
    cleanupMmt,
    activeStreams,
  }: {
    city: string;
    check_in_date: string;
    check_out_date: string;
    socket?: Socket;
    user_filters?: string[];
    cleanupMmt: (() => void) | null;
    activeStreams: any;
  }
) {
  try {
    await page.goto("https://www.makemytrip.com/hotels/", {
      waitUntil: "domcontentloaded",
    });

    socket?.emit("automation_message", "Selecting destination (make my trip)");

    // Select the destination
    await selectDestinationMakeMyTrip(page, city, cleanupMmt);

    await page.click('input[data-cy="checkin"]');

    await selectDate(check_in_date, page);
    await selectDate(check_out_date, page);

    console.log("Date selected successfully");
    console.log("clicking room and guest button");

    await page.locator('[data-cy="RoomsGuestsNew_327"]').click();

    console.log("Room button clicked successfully | Clicking search button");

    const searchBtnId = "button#hsw_search_button";
    const searchBtnEl = await page.locator(searchBtnId);
    await searchBtnEl.click();

    console.log("Search Btn Clicked Success | Waiting for dom loading");

    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      searchBtnEl.click(), // <--- the click that triggers navigation
    ]);

    console.log("Clicking 3 star");
    await page.locator('label:has-text("3 Star")').click();

    console.log("Clicking free cancellation");
    await page.locator('label:has-text("Free Cancellation")').click();

    console.log("Clicking first hotel");
    await page.locator("div#Listing_hotel_0").click();

    const context = page.context();
    const pages = context.pages();
    const resultsPage = pages[pages.length - 1];

    if (cleanupMmt) {
      await cleanupMmt();
      cleanupMmt = null;
    }

    //@ts-ignore
    cleanupMmt = await setupStreaming(
      resultsPage,
      //@ts-ignore
      socket,
      SITE_LABEL.MMT,
      activeStreams
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    socket?.emit("automation_error", `Agoda flow error: ${String(error)}`);
    throw error;
  }
}

function formatDateForAriaLabel(dateStr: string) {
  // dateStr is 'YYYY-MM-DD'
  const [year, month, day] = dateStr.split("-").map(Number);
  // Construct a Date object
  // Note: month is zero-based in JS, so subtract 1
  const dateObj = new Date(year, month - 1, day);

  // Get abbreviated weekday, e.g. "Sun", "Mon", "Tue"
  const weekday = dateObj.toLocaleString("en-US", { weekday: "short" });
  // Get abbreviated month, e.g. "Jan", "Feb", "Mar"
  const shortMonth = dateObj.toLocaleString("en-US", { month: "short" });
  // Get zero-padded day, e.g. "02", "03", "10"
  const dayStr = dateObj.toLocaleString("en-US", { day: "2-digit" });
  // Get full year, e.g. "2025"
  const yearStr = dateObj.toLocaleString("en-US", { year: "numeric" });

  // Combine them in the same order/spacing as the aria-label
  // e.g. "Mon Feb 03 2025"
  return `${weekday} ${shortMonth} ${dayStr} ${yearStr}`;
}

// Function to select a date
async function selectDate(dateStr: string, page: Page) {
  console.log("dateStr", dateStr);
  const dateFormatted = formatDateForAriaLabel(dateStr);
  console.log("dateFormatted", dateFormatted);
  const selector = `.DayPicker-Day[aria-label="${dateFormatted}"]`;
  await page.click(selector);
}

async function selectDestinationMakeMyTrip(
  page: Page,
  city: string,
  currentStreamCleanup: (() => void) | null
) {
  try {
    await page.waitForSelector('div[data-cy="outsideModal"].displayBlock', {
      state: "visible",
    });
    console.log("Overlay is visible.");

    // Click the close button
    const closeButton = page.locator('span[data-cy="closeModal"]');
    if (await closeButton.isVisible()) {
      await closeButton.click();
      console.log("Clicked on the close button.");
    } else {
      console.error("Close button not visible or available.");
    }

    // Optional: Confirm that the overlay is closed
    await page.waitForSelector('div[data-cy="outsideModal"]', {
      state: "hidden",
    });
    console.log("Overlay has been closed.");

    await page.click("input#city");

    await page.click("input.react-autosuggest__input");

    // Type the city name, for example 'Delhi'
    const inputEl = "input.react-autosuggest__input";
    await page.locator(inputEl).fill(city);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    console.log("########--City--##########", city);
    // await page.type("input.react-autosuggest__input", city, { delay: 50 });

    await page.waitForSelector(".react-autosuggest__suggestion--first", {
      state: "visible",
    });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await page.click(".react-autosuggest__suggestion--first");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if the city has been filled correctly
    const cityValue = await page.inputValue("input#city");
    console.log("City selected:", cityValue);
  } catch (error) {
    if (currentStreamCleanup) {
      currentStreamCleanup();
    }
    console.error("[Automation] Error selecting destination (Travala):", error);
    throw error;
  }
}
