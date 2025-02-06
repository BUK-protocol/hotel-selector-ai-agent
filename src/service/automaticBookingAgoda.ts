import { Page } from "playwright";
import { Socket } from "socket.io";
import { filterMappings, SITE_LABEL } from "../constant";
import { setupStreaming } from "./helper";
import { AutomateBookingPropsType, AutomateBookingResponse } from "../types";

export async function automateBookingAgoda(
  page: Page,
  {
    city,
    check_in_date,
    check_out_date,
    socket,
    user_filters,
    cleanup,
    activeStreams,
  }: AutomateBookingPropsType
): Promise<AutomateBookingResponse> {
  try {
    // If you're not already on Agoda’s homepage, go there:
    await page.goto("https://www.agoda.com/");

    // Optionally emit messages to the client (if you have a socket):
    socket?.emit("automation_message", "Selecting destination (Agoda)");

    // 1) Select the destination:
    await selectDestinationAgoda(page, city, cleanup);

    // 2) Select check-in/check-out dates:
    socket?.emit("automation_message", "Selecting dates (Agoda)");
    await selectDatesAgoda(page, check_in_date, check_out_date, cleanup);

    // 3) Perform search:
    socket?.emit("automation_message", "Performing search (Agoda)");
    await performSearchAgoda(page, cleanup);

    // Wait for navigation / new tab if needed
    const context = page.context();
    const pages = context.pages();
    const resultsPage = pages[pages.length - 1]; // usually the last opened page

    if (cleanup) {
      await cleanup();
      cleanup = null;
    }

    cleanup = await setupStreaming(
      resultsPage,
      //@ts-ignore
      socket,
      SITE_LABEL.AGODA,
      activeStreams
    );

    // 4) Apply filters (if provided)
    if (user_filters && user_filters.length > 0) {
      socket?.emit("automation_message", "Applying filters (Agoda)");
      await applyFiltersAgoda(resultsPage, user_filters, cleanup);
    }

    // 5) Select the first hotel
    socket?.emit("automation_message", "Selecting first hotel (Agoda)");
    await selectFirstHotelAgoda(resultsPage, cleanup);

    // 6) Bring final page to front (if a new page opened)
    await resultsPage.waitForTimeout(1500);
    const allPages = context.pages();
    const finalPage = allPages[allPages.length - 1];

    await new Promise((resolve) => setTimeout(resolve, 1500));

    if (cleanup) {
      await cleanup();
      cleanup = null;
    }

    cleanup = await setupStreaming(
      resultsPage,
      //@ts-ignore
      socket,
      SITE_LABEL.AGODA,
      activeStreams
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));

    await finalPage.bringToFront();
    await finalPage.waitForLoadState("domcontentloaded");

    // 7) (Optional) Extract hotel info, rating, etc.
    const hotelNameElement = finalPage.locator(
      '[data-selenium="hotel-header-name"]'
    );
    const hotelName = (await hotelNameElement.textContent()) || "Unknown Hotel";
    socket?.emit(
      "automation_message",
      `Agoda final page loaded. Recommended hotel: ${hotelName}`
    );

    // Optionally gather review/rating:
    const { rating, reviewCount } = await getReviewScoreAgoda(finalPage);
    socket?.emit(
      "automation_message",
      `Rating: ${rating}, Reviews: ${reviewCount}`
    );

    socket?.emit("automation_message", "Agoda flow complete!");

    return { hotelBookingPrice: 0, hotelBookingUrl: "" };

    // DONE – now you can return if you want or do extra steps (like booking login, etc.)
  } catch (error) {
    socket?.emit("automation_error", `Agoda flow error: ${String(error)}`);
    throw error;
  }
}

async function getReviewScoreAgoda(page: Page) {
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

async function selectDestinationAgoda(
  page: Page,
  city: string,
  currentStreamCleanup: (() => void) | null
) {
  console.log("[Automation] Selecting destination:", city);
  try {
    const searchInputElement = '[id="textInput"]';
    const suggestionSelector = '[data-selenium="autosuggest-item"]';

    //Wait for the input to be ready
    const input = page.locator(searchInputElement);
    await input.waitFor({ state: "visible", timeout: 5000 });

    //Clear and fill the input (more stable than type)
    await input.clear();
    await input.fill(city);

    //Wait for suggestions to appear
    await page.waitForSelector(suggestionSelector, { timeout: 5000 });

    //Select the first suggestion
    const firstSuggestion = page.locator(suggestionSelector).first();
    await firstSuggestion.click();

    //Wait for the selection to take effect
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

async function selectDatesAgoda(
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
    //Click on the check-in input to open the calendar
    await page.waitForSelector('[data-element-name="search-box-check-in"]', {
      state: "visible",
    });
    await page.click('[data-element-name="search-box-check-in"]');

    //Wait for the calendar popup to appear
    await page.waitForSelector(".Popup.WideRangePicker", { state: "visible" });

    //Select Check-in Date
    const checkInSelector = `[data-selenium-date="${check_in_date}"]`;
    await page.waitForSelector(checkInSelector, { state: "visible" });
    await page.click(checkInSelector);

    //Select Check-out Date
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

async function performSearchAgoda(
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

async function applyFiltersAgoda(
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

      //Small delay to let the filter apply
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

async function selectFirstHotelAgoda(
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
