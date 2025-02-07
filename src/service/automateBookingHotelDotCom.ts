import { Page } from "playwright";
import { Socket } from "socket.io";
import { AutomateBookingPropsType, AutomateBookingResponse } from "../types";

export async function automateBookingHotelDotCom(
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
    await page.goto("https://www.hotels.com", { waitUntil: "domcontentloaded" });

    // Check if the popup exists and close it if found.
    const popupSelector = ".uitk-menu-container.uitk-menu-open";
    const popupElement = await page.$(popupSelector);
    if (popupElement) {
      console.log("Popup detected.");
      await page.keyboard.press("Escape");
      console.log("Popup closed by pressing Escape.");
    }

    // Open the search field.
    const searchTriggerSelector = 'button[data-stid="destination_form_field-menu-trigger"]';
    await page.click(searchTriggerSelector);

    const searchDropdownSelector = 'section[data-testid="popover-sheet"]';
    await page.waitForSelector(searchDropdownSelector, { state: "visible" });

    // Fill in the search input.
    const searchInputSelector = "input#destination_form_field";
    await page.fill(searchInputSelector, city);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Select the destination from the dropdown.
    const dropdownSelector = `button[data-stid="destination_form_field-result-item-button"][aria-label*="${city}"]`;
    await page.waitForSelector(dropdownSelector, { timeout: 5000 });
    await page.click(dropdownSelector);

    // Open the date selector.
    await page.click('button[data-testid="uitk-date-selector-input1-default"]');
    await page.waitForSelector('section[data-testid="popover-sheet"]', { state: "visible" });

    // Helper function: converts "YYYY-MM-DD" to "D Month, YYYY"
    function formatDateForAriaLabel(dateStr: string): string {
      const date = new Date(dateStr);
      const day = date.getDate();
      const month = date.toLocaleString("default", { month: "long" });
      const year = date.getFullYear();
      return `${day} ${month}, ${year}`;
    }

    const checkInAria = formatDateForAriaLabel(check_in_date);
    const checkOutAria = formatDateForAriaLabel(check_out_date);

    console.log("Looking for check-in aria:", checkInAria);
    console.log("Looking for check-out aria:", checkOutAria);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Select check-in date.
    await page
      .locator("div.uitk-day-button", {
        has: page.locator(`div.uitk-day-aria-label[aria-label*="${checkInAria}"]`),
      })
      .first()
      .click();

    // Select check-out date.
    await page
      .locator("div.uitk-day-button", {
        has: page.locator(`div.uitk-day-aria-label[aria-label*="${checkOutAria}"]`),
      })
      .first()
      .click();

    // Apply the date selection.
    await page.locator('button[data-stid="apply-date-selector"]').click();

    // Click the search button.
    const searchBtnSelector = "button#search_button";
    const searchBtnEl = await page.locator(searchBtnSelector);
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      searchBtnEl.click(),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Apply filters.
    const starRating = "4";
    await page.locator("label.uitk-button-toggle-content", { hasText: starRating }).click();
    await page.locator('label:has-text("Fully refundable property")').click();
    await page.waitForLoadState("domcontentloaded");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Click the first hotel.
    await page.waitForSelector('a[data-stid="open-hotel-information"]');
    await page.locator('a[data-stid="open-hotel-information"]').first().click();


    await new Promise((resolve) => setTimeout(resolve, 3000));

    const context = page.context();
    const pages = context.pages();
    const resultsPage = pages[pages.length - 1];



    await new Promise((resolve) => setTimeout(resolve, 4000));

    //await resultsPage.bringToFront();
    await resultsPage.waitForLoadState("domcontentloaded");

    let priceNumber = 0

    try {
      // 1. Locate the first "price summary" container on the page.
      const priceSummaryLocator = resultsPage.locator('div[data-stid="price-summary"]').first();
    
      // 2. Scroll this container into view (if it's not already).
      await priceSummaryLocator.scrollIntoViewIfNeeded();
    
      // 3. Within that container, target the exact element that has the price text.
      //    In the HTML snippet, the price is inside:
      //    <div class="uitk-text uitk-type-500 uitk-type-medium uitk-text-emphasis-theme">₹47,625</div>
      //    So we look for a matching selector:
      const priceTextLocator = priceSummaryLocator.locator('.uitk-text.uitk-type-500.uitk-type-medium.uitk-text-emphasis-theme').first();
    
      // 4. Wait for that element to appear, then get its text content (e.g. "₹47,625").
      await priceTextLocator.waitFor({ state: 'visible', timeout: 15000 });
      const rawPriceText = (await priceTextLocator.textContent())?.trim() || '';
    
      // 5. Remove non-digit characters (including ₹ and commas) => "47625"
      const numericString = rawPriceText.replace(/[^\d]/g, '');
      priceNumber = parseInt(numericString, 10);
    
      console.log('Extracted price:', priceNumber);
    } catch (error) {
      console.error('Error extracting price:', error);
    }
    
    const hotelBookingUrl = await resultsPage.url();

    const result = {
      hotelBookingPrice: Number(priceNumber),
      hotelBookingUrl: hotelBookingUrl,
    };


    return result;


  } catch (error) {
    console.error("⚠️ error occurred", error);
    // Always return an AutomateBookingResponse even on error.
    return { hotelBookingPrice: 0, hotelBookingUrl: "" };
  }
}
