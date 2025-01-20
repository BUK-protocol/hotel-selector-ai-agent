// src/server.ts
import puppeteer from "puppeteer";

async function automaticBooking() {
  try {
    console.log("1. Launching browser...");
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized"],
    });
    console.log("✅ Browser launched successfully");

    console.log("2. Creating new page...");
    const page = await browser.newPage();
    console.log("✅ New page created");

    console.log("3. Navigating to Booking.com...");
    await page.goto("https://www.agoda.com/");
    console.log("✅ Navigation complete");

    //DESTINATION

    // console.log('5. Typing destination...');

    // const searchInputElement = '[id="textInput"]'
    // const searchText = 'New York'

    // // Clear the field first and type New York and typing
    // await page.click(searchInputElement);
    // await page.keyboard.down('Control');
    // await page.keyboard.press('A');
    // await page.keyboard.up('Control');
    // await page.keyboard.press('Backspace');
    // await page.type(searchInputElement, searchText, {delay: 100});
    // console.log('✅ Destination typed');

    // console.log('6. Waiting for destination suggestions...');

    // await page.waitForNetworkIdle({ timeout: 6000 });

    //Selecting the first item from the suggestion
    //const suggestionElement = '[data-selenium="autosuggest-item"]'
    //const firstItem = await page.$(suggestionElement)
    // await firstItem?.click()

    console.log("Fist suggestion clicked");

    // Wait to ensure the selection is registered
    // await page.waitForNetworkIdle({ timeout: 6000 });

    //DESTINATION
    console.log("5. Typing destination...");

    console.log("6. Waiting for destination suggestions...");
    // Wait for suggestions to appear and select the first one
    // DESTINATION
    console.log("5. Starting destination selection...");
    try {
      const searchInputElement = '[id="textInput"]';
      const searchText = "New York";

      // Wait for input to be ready
      await page.waitForSelector(searchInputElement, {
        visible: true,
        timeout: 5000,
      });
      console.log("✅ Search input found");

      // Click and clear with more reliable method
      await page.click(searchInputElement);
      await page.evaluate((selector) => {
        const element = document.querySelector(selector) as HTMLInputElement;
        if (element) {
          element.value = "";
        }
      }, searchInputElement);
      console.log("✅ Search input cleared");

      // Type slowly and wait for suggestions
      await page.type(searchInputElement, searchText, { delay: 150 });
      console.log("✅ Destination typed");

      // Wait for network activity to settle
      await page.waitForNetworkIdle({ timeout: 5000 });

      // Wait for suggestions explicitly
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Press Enter to confirm selection
      await page.keyboard.press("Enter");
      console.log("✅ Selection confirmed");

      // Final wait to ensure everything is processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("✅ Destination selection completed");
    } catch (error) {
      console.error("Error during destination selection:", error);
      throw error;
    }

    // Wait to ensure the selection is registered
    await page.waitForNetworkIdle({ timeout: 6000 });

    async function selectDate(startDate: string, endDate: string) {
      try {
        console.log("Starting date selection process...");

        // First click the check-in box to open calendar
        console.log("Attempting to click check-in box...");
        const checkInBoxSelector = '[data-element-name="check-in-box"]';
        await page.waitForSelector(checkInBoxSelector, { timeout: 5000 });
        await page.click(checkInBoxSelector);
        console.log("Check-in box clicked successfully");

        // Wait for calendar to appear
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Now look for the calendar
        const calendarSelectors = [
          '[data-selenium="rangePickerCheckIn"]',
          ".DayPicker",
          "#DatePicker__AccessibleV2",
        ];

        let calendarFound = false;
        for (const selector of calendarSelectors) {
          try {
            console.log(`Waiting for calendar with selector: ${selector}`);
            await page.waitForSelector(selector, { timeout: 2000 });
            calendarFound = true;
            console.log(`Calendar found with selector: ${selector}`);
            break;
          } catch (err) {
            console.log(`Calendar not found with selector: ${selector}`);
          }
        }

        if (!calendarFound) {
          throw new Error("Calendar not found after opening");
        }

        // Select check-in date
        console.log(`Selecting check-in date: ${startDate}`);
        const checkInDateSelector = `[data-selenium-date="${startDate}"]`;
        await page.waitForSelector(checkInDateSelector, { timeout: 5000 });
        await page.click(checkInDateSelector);
        console.log("Check-in date selected");

        // Wait before selecting check-out
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Select check-out date
        console.log(`Selecting check-out date: ${endDate}`);
        const checkOutDateSelector = `[data-selenium-date="${endDate}"]`;
        await page.waitForSelector(checkOutDateSelector, { timeout: 5000 });
        await page.click(checkOutDateSelector);
        console.log("Check-out date selected");

        console.log("Date selection completed successfully");
      } catch (error) {
        console.error("Error during date selection:", error);
        throw error;
      }
    }

    try {
      await selectDate("2025-02-01", "2025-02-10");
    } catch (error) {
      console.error("Failed to select dates:", error);
    }

    try {
      const searchBtnElement = '[data-selenium="searchButton"]';
      const searchBtn = await page.waitForSelector(searchBtnElement);
      searchBtn?.click();
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.log("failed to hit search button", error);
    }

    const pages = await browser.pages();
    console.log("pages", pages);
    const newPage = pages[pages.length - 1];

    console.log("new page", newPage);
    await newPage.waitForNetworkIdle();
    console.log("end........");





    // try {
    //   // await page.waitForNetworkIdle({ timeout: 2000 });
    //   console.log("topReviewed");
    //   const topReviewedElement =
    //     '[data-element-name="search-sort-secret-deals"]';
    //   const topReviewed = await newPage.waitForSelector(topReviewedElement);
    //   console.log("topReviewed....", topReviewed);
    //   topReviewed?.click();
    //   //await page.waitForNetworkIdle();
    //   await new Promise((resolve) => setTimeout(resolve, 5000));
    // } catch (error) {
    //   console.log("failed to hit search button", error);
    // }


    try {
        console.log('Clicking top reviewed sort option...');
        
        // Use locator instead of waitForSelector
        const topReviewedLocator = newPage.locator('[data-element-name="search-sort-secret-deals"]');
        await topReviewedLocator.click();
        
        console.log('✅ Top reviewed sort option clicked');
        
        // Wait for page to update
        await newPage.waitForNetworkIdle();
    
    } catch (error) {
        console.error('Error clicking sort option:', error);
    }





    try {
        console.log('Clicking free cancellation filter...');
        
        // Use the data-selenium attribute and text selector
        const freeCancellationLocator = newPage.locator('[data-selenium="filter-item-text"]::-p-text("Free cancellation")');
        freeCancellationLocator.click()
        
         console.log('✅ Free cancellation filter clicked');
        
        // Wait for results to update
        await newPage.waitForNetworkIdle();
    
    } catch (error) {
        console.error('Error clicking filter:', error);
    }


   try {
    console.log('Clicking 4-star filter...');
    
    // Target using aria-label
    const fourStarLocator = newPage.locator('[aria-label="4-Star rating"]');
    await fourStarLocator.click();
    
    console.log('✅ 4-star filter clicked');
    
    // Wait for results to update
    await newPage.waitForNetworkIdle();

} catch (error) {
    console.error('Error clicking 4-star filter:', error);
}



try {
    console.log('Clicking breakfast included filter...');
    
    // Target using aria-label
    const breakfastLocator = newPage.locator('[aria-label="Breakfast included"]');
    await breakfastLocator.click();
    
    console.log('✅ Breakfast filter clicked');
    
    // Wait for results to update
    await newPage.waitForNetworkIdle();

} catch (error) {
    console.error('Error clicking breakfast filter:', error);
}



try {
    console.log('Clicking inside city center filter...');
    
    // Target using aria-label
    const cityCenterLocator = newPage.locator('[aria-label="Inside city center"]');
    await cityCenterLocator.click();
    
    console.log('✅ Inside city center filter clicked');
    
    // Wait for results to update 
    await newPage.waitForNetworkIdle();

} catch (error) {
    console.error('Error clicking city center filter:', error);
}





    













    // try {
    //     console.log('8. Waiting for hotel cards to load...');
        
    //     // Wait for hotel list container first
    //     await newPage.waitForSelector('.hotel-list-container');
    //     console.log('✅ Hotel list container found');
    
    //     // Wait for hotel cards to be loaded
    //     await newPage.waitForSelector('[data-selenium="hotel-item"]', { 
    //         visible: true,
    //         timeout: 10000 
    //     });
    //     console.log('✅ Hotel cards loaded');
    
    //     // Get first hotel card and its link
    //     const firstHotelCard = await newPage.waitForSelector('[data-selenium="hotel-item"] a.PropertyCard__Link');
    //     console.log('✅ First hotel card found');
    
    //     if (firstHotelCard) {
    //         // Click the link
    //         await firstHotelCard.click();
    //         console.log('✅ Successfully clicked first hotel card');
            
    //         // Wait for new page to load
    //         await newPage.waitForNetworkIdle({ timeout: 5000 });
    //         console.log('✅ New page loaded');
    //     } else {
    //         throw new Error('Could not find first hotel card');
    //     }
    
    // } catch (error) {
    //     console.error('Error clicking hotel card:', error);
    //     // Log the current state
    //     const content = await newPage.content();
    //     console.log('Current page content:', content);
    //     throw error;
    // }






    //Clicking check in date btn
    // console.log('Opening check in date popup')
    // const checkInDateBtnElement = '[data-element-name="check-in-box"]'
    // const checkInDateBtn  = await page.waitForSelector(checkInDateBtnElement)
    // await checkInDateBtn?.click()

    //Interacting with the calendar popup

    // async function selectDate(startDate:string, endDate:string) {
    //     try {
    //         console.log(`Starting date selection process for ${startDate} to ${endDate}`);

    //         // Wait for calendar to be visible
    //         const selectors = [
    //             '[data-selenium="rangePickerCheckIn"]',
    //             '.Popup.WideRangePicker',
    //             '.DayPicker',
    //             '#DatePicker__AccessibleV2'
    //         ];

    //         let calendarElement = null;

    //     // Try each selector until we find one that works
    //     for (const selector of selectors) {
    //         try {
    //             console.log(`Trying to find calendar with selector: ${selector}`);
    //             await page.waitForSelector(selector, { timeout: 2000 });
    //             calendarElement = selector;
    //             console.log(`Found calendar with selector: ${selector}`);
    //             break;
    //         } catch (err) {
    //             console.log(`Selector ${selector} not found, trying next...`);
    //         }
    //     }

    //     if (!calendarElement) {
    //         throw new Error('Calendar not found with any selector');
    //     }

    //         console.log('Waiting for calendar to load...');
    //        const popup = await page.waitForSelector('.Popup__content', { timeout: 5000 });
    //         console.log('Calendar loaded successfully',popup);

    //         // Click check-in date
    //         console.log(`Selecting check-in date: ${startDate}`);
    //         const startDateElement = `[data-selenium-date="${startDate}"]`
    //         const endDateElement =`[data-selenium-date="${startDate}"]`

    //         const startDateBtn = await page.waitForSelector(startDateElement)
    //         await startDateBtn?.click()

    //         const endDateBtn = await page.waitForSelector(endDateElement)
    //         await endDateBtn?.click()

    //         console.log('startDateELement',startDateBtn)
    //         console.log('endDateELement',endDateBtn)

    //         // Small delay using proper timeout
    //         console.log('Waiting for UI update...');
    //         await new Promise(resolve => setTimeout(resolve, 1000));

    //         // Click check-out date
    //         console.log(`Selecting check-out date: ${endDate}`);
    //        // await page.click(`[data-selenium-date="${endDate}"]`);

    //         console.log('Date selection completed successfully');

    //     } catch (error) {
    //         console.error('Error during date selection:', error);
    //         console.error('Failed to select dates. Please check if the dates are valid and available');
    //         throw error;
    //     }
    // }

    // // Usage example:
    // try {
    //     await selectDate('2025-02-01', '2025-02-10');
    // } catch (error) {
    //     console.error('Failed to execute date selection:', error);
    // }

    console.log("7. Opening date picker...");
    // Wait for and click the date display field
    //await page.waitForSelector('[data-testid="date-display-field-start"]', { timeout: 5000 });
    //await page.click('[data-testid="date-display-field-start"]');
    console.log("✅ Clicked date picker button");

    // Use waitForNetworkIdle instead of timeout
    //await page.waitForNetworkIdle({ timeout: 2000 });

    //Clicking PROPERTY RATING

    console.log("✅ AUTOMATION COMPLETED SUCCESSFULLY");
  } catch (error) {
    console.error("❌ ERROR OCCURRED AT STEP:", error);
    console.error("Full error details:", error);
  }
}

console.log("Starting automation script...");
automaticBooking()
  .then(() => {
    console.log("Script execution finished");
  })
  .catch((error) => {
    console.error("Script failed:", error);
  });
