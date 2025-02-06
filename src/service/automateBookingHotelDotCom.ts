import { Page } from "playwright";
import { Socket } from "socket.io";

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
  }: {
    city: string;
    check_in_date: string;
    check_out_date: string;
    socket?: Socket;
    user_filters?: string[];
    cleanup: (() => void) | null;
    activeStreams: any;
  }
) {
  try {
    await page.goto("https://www.hotels.com", {
      waitUntil: "domcontentloaded",
    });

    try {
      //Closing Popup
      const popupSelector = ".uitk-menu-container.uitk-menu-open";
      await page.waitForSelector(popupSelector, { timeout: 5000 });
      console.log("Popup detected.");
      await page.keyboard.press("Escape");
      console.log("Popup closed by pressing Escape.");

      //Search
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

      //Clicking check in check out dates

      await page.click(
        'button[data-testid="uitk-date-selector-input1-default"]'
      );

      // Wait for the calendar popup to appear.
      await page.waitForSelector('section[data-testid="popover-sheet"]', {
        state: "visible",
      });

      // User-supplied dates.

      // Helper function: converts "YYYY-MM-DD" to "D Month, YYYY"
      // e.g. "2025-02-03" => "3 February, 2025"
      function formatDateForAriaLabel(dateStr: string) {
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

      // Use the `has` filter to find the day button that has a descendant
      // with an aria-label containing the desired date string.
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

      // Click the "Done" button to apply the dates.
      await page.locator('button[data-stid="apply-date-selector"]').click();

      //Clicking search button
      const searchBtnSelector = "button#search_button";
      const searchBtnEl = await page.locator(searchBtnSelector);
      await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        searchBtnEl.click(),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 3000));

      //Clicking filters
      const starRating = "4";
      await page
        .locator("label.uitk-button-toggle-content", { hasText: starRating })
        .click();
      await page.locator('label:has-text("Fully refundable property")').click();
      await page.waitForLoadState("domcontentloaded");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      //Clicking first hotel
      await page.waitForSelector('a[data-stid="open-hotel-information"]');
      await page
        .locator('a[data-stid="open-hotel-information"]')
        .first()
        .click();
    } catch (err) {
      console.log("Popup did not appear within the timeout.", err);
    }
  } catch (error) {
    console.log("⚠️ error occurred", error);
  }
}
