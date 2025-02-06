import { Page } from "playwright";
import { AutomateBookingPropsType, AutomateBookingResponse } from "../types";

export async function automateBookingExpedia(
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
    await page.goto("https://www.expedia.co.in", {
      waitUntil: "domcontentloaded",
    });

    // Closing Popup
    const popupSelector = ".uitk-menu-container.uitk-menu-open";
    const popupExists = await page.locator(popupSelector).isVisible();
    if (popupExists) {
      console.log("Popup detected.");
      await page.keyboard.press("Escape");
      console.log("Popup closed by pressing Escape.");
    }

    // Search
    const searchTriggerSelector =
      'button[data-stid="destination_form_field-menu-trigger"]';
    await page.click(searchTriggerSelector);

    const searchDropdownSelector = 'section[data-testid="popover-sheet"]';
    await page.waitForSelector(searchDropdownSelector, { state: "visible" });

    const searchInputSelector = "input#destination_form_field";
    await page.fill(searchInputSelector, city);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const dropdownSelector = `button[data-stid="destination_form_field-result-item-button"][aria-label*=${city}]`;
    await page.waitForSelector(dropdownSelector, { timeout: 5000 });
    await page.click(dropdownSelector);

    // Clicking check-in & check-out dates
    await page.click('button[data-testid="uitk-date-selector-input1-default"]');

    // Wait for the calendar popup
    await page.waitForSelector('section[data-testid="popover-sheet"]', {
      state: "visible",
    });

    // Helper function: Convert "YYYY-MM-DD" to "D Month YYYY"
    function formatDateForAriaLabel(dateStr: string) {
      const date = new Date(dateStr);
      return `${date.getDate()} ${date.toLocaleString("default", { month: "long" })} ${date.getFullYear()}`;
    }

    const checkInAria = formatDateForAriaLabel(check_in_date);
    const checkOutAria = formatDateForAriaLabel(check_out_date);

    console.log("Looking for check-in aria:", checkInAria);
    console.log("Looking for check-out aria:", checkOutAria);

    // Select Check-in and Check-out Dates
    await page
      .locator("div.uitk-day-button", {
        has: page.locator(
          `div.uitk-day-aria-label[aria-label*="${checkInAria}"]`
        ),
      })
      .first()
      .click();

    await page
      .locator("div.uitk-day-button", {
        has: page.locator(
          `div.uitk-day-aria-label[aria-label*="${checkOutAria}"]`
        ),
      })
      .first()
      .click();

    // Click "Done" to confirm dates
    await page.locator('button[data-stid="apply-date-selector"]').click();

    // Click Search Button
    const searchBtnSelector = "button#search_button";
    await Promise.all([
      page.waitForLoadState("domcontentloaded"),
      page.locator(searchBtnSelector).click(),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Apply Filters
    const starRating = "4";
    await page.locator("label.uitk-button-toggle-content", { hasText: starRating }).click();
    await page.locator('label:has-text("Fully refundable property")').click();
    await page.waitForLoadState("domcontentloaded");
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Select First Hotel
    await page.waitForSelector('a[data-stid="open-hotel-information"]');
    await page.locator('a[data-stid="open-hotel-information"]').first().click();

    return { hotelBookingPrice: 0, hotelBookingUrl: "" };
  } catch (error) {
    console.log("⚠️ Error occurred:", error);
    return { hotelBookingPrice: 0, hotelBookingUrl: "" }; // Ensuring function always returns a valid response
  }
}
