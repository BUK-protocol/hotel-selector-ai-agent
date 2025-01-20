// src/server.ts
import puppeteer from 'puppeteer';

async function automaticBooking() {
  try {
    console.log('1. Launching browser...');
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    console.log('✅ Browser launched successfully');

    console.log('2. Creating new page...');
    const page = await browser.newPage();
    console.log('✅ New page created');
    
    console.log('3. Navigating to Booking.com...');
    await page.goto('https://www.booking.com');
    console.log('✅ Navigation complete');
    
    // Wait for and handle cookie consent if it appears
    console.log('4. Checking for cookie consent...');
    try {
      await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
      await page.click('#onetrust-accept-btn-handler');
      console.log('✅ Cookie consent handled');
    } catch (e) {
      console.log('ℹ️ No cookie consent found or already accepted');
    }



    //DESTINATION
    
    console.log('5. Typing destination...');
    // Clear the field first and type New York
    await page.click('[name="ss"]');
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await page.type('[name="ss"]', 'New York', {delay: 100});
    console.log('✅ Destination typed');
    
    console.log('6. Waiting for destination suggestions...');
    // Wait for the autocomplete results
    await page.waitForSelector('[data-testid="autocomplete-results"]');
    
    // Wait for autocomplete results to populate
    await page.waitForNetworkIdle({ timeout: 6000 });
    
    // Click the first suggestion (New York)
    await page.evaluate(() => {
        // Find the first autocomplete result
        const firstResult = document.querySelector('#autocomplete-result-0 [role="button"]');
        if (firstResult) {
            (firstResult as HTMLElement).click();
        } else {
            throw new Error('First autocomplete result not found');
        }
    });
    
    // Wait to ensure the selection is registered
    await page.waitForNetworkIdle({ timeout: 6000 });
    
    // Verify the selection
    const selectedDestination = await page.$eval('[name="ss"]', (el) => (el as HTMLInputElement).value);
    console.log('Selected destination:', selectedDestination);
    
    if (!selectedDestination.toLowerCase().includes('new york')) {
        throw new Error('Destination was not properly set to New York');
    }
    
    console.log('✅ New York destination confirmed');







    // DATEPICKER
   // After destination selection...
   console.log('7. Opening date picker...');
   // Wait for and click the date display field
   await page.waitForSelector('[data-testid="date-display-field-start"]', { timeout: 5000 });
   await page.click('[data-testid="date-display-field-start"]');
   console.log('✅ Clicked date picker button');

   // Wait for calendar to appear (we'll need to inspect what appears after clicking)
   // Add a small delay to ensure elements are interactive





   console.log('7. Opening date picker...');
   // Wait for and click the date display field
   await page.waitForSelector('[data-testid="date-display-field-start"]', { timeout: 5000 });
   await page.click('[data-testid="date-display-field-start"]');
   console.log('✅ Clicked date picker button');

   // Use waitForNetworkIdle instead of timeout
   await page.waitForNetworkIdle({ timeout: 2000 });

   console.log('Selecting check-in date...');
   try {
       // Try to click the check-in date
       await page.evaluate((checkInDate) => {
           const dateElements = Array.from(document.querySelectorAll('td[data-date], span[data-date]'));
           const dateElement = dateElements.find(el => {
               const dataDate = el.getAttribute('data-date');
               return dataDate === checkInDate;
           });
           
           if (dateElement) {
               (dateElement as HTMLElement).click();
           } else {
               throw new Error(`Could not find date element for ${checkInDate}`);
           }
       }, "2025-01-15");
       console.log('✅ Selected check-in date');

       // Wait for any potential calendar updates
       await page.waitForNetworkIdle({ timeout: 2000 });

       console.log('Selecting check-out date...');
       await page.evaluate((checkOutDate) => {
           const dateElements = Array.from(document.querySelectorAll('td[data-date], span[data-date]'));
           const dateElement = dateElements.find(el => {
               const dataDate = el.getAttribute('data-date');
               return dataDate === checkOutDate;
           });
           
           if (dateElement) {
               (dateElement as HTMLElement).click();
           } else {
               throw new Error(`Could not find date element for ${checkOutDate}`);
           }
       }, "2025-01-20");
       console.log('✅ Selected check-out date');

   } catch (error) {
       // Take a screenshot for debugging
       await page.screenshot({ path: 'calendar-error.png', fullPage: true });
       console.error('Failed to select dates. Screenshot saved as calendar-error.png');
       
       // Log the calendar HTML for debugging
       const calendarHTML = await page.evaluate(() => {
           return document.querySelector('[data-testid="searchbox-datepicker"]')?.outerHTML || 
                  'Calendar element not found';
       });
       console.log('Calendar HTML at time of error:', calendarHTML);
       
       throw error;
   }



   // SEARCH BUTTON CLICK
    
    console.log('8. Clicking search button...');
    await page.waitForSelector('button[type="submit"]');
    console.log('✅ Search button found');
    

    await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const searchButton = buttons.find(button => 
          button.innerText.toLowerCase().includes('search')
        );
        if (searchButton) searchButton.click();
        else throw new Error('Search button not found');
      });
      console.log('✅ Search initiated');





//data-testid="sorters-dropdown-trigger"

const dropdownTriggerBtn = await page.waitForSelector('[data-testid="sorters-dropdown-trigger"]')
const test = await page.$('[data-testid="sorters-dropdown-trigger"]')
console.log('dropdownTriggerBtn............',dropdownTriggerBtn,test)
await test?.click()
await dropdownTriggerBtn?.click()


// First click the sort button to open dropdown
      console.log('10. Opening sort dropdown...');
      await page.waitForSelector('button[data-testid="sorters-dropdown-trigger"]', { 
          visible: true, 
          timeout: 10000 
      });
      
      await page.click('button[data-testid="sorters-dropdown-trigger"]');
      console.log('✅ Clicked sort dropdown button');

      // Wait for dropdown to appear and click "Top reviewed"
      await page.waitForSelector('[data-testid="sorters-dropdown"]', { 
          visible: true, 
          timeout: 5000 
      });

      // Click the "Top reviewed" option
      await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button[data-id]'));
          const topReviewedButton = buttons.find(button => 
              button.getAttribute('data-id') === 'bayesian_review_score'
          );
          if (topReviewedButton && topReviewedButton instanceof HTMLElement) {
              topReviewedButton.click();
          } else {
              throw new Error('Top reviewed option not found');
          }
      });

      // Wait for the sort to be applied
      await page.waitForNetworkIdle({ timeout: 10000 });

      // Verify the sort was applied
      const sortState = await page.evaluate(() => {
          const trigger = document.querySelector('button[data-testid="sorters-dropdown-trigger"]');
          return {
              selectedSort: trigger?.getAttribute('data-selected-sorter'),
              buttonText: trigger?.textContent
          };
      });

      console.log('Sort state:', sortState);

      if (sortState.selectedSort !== 'bayesian_review_score') {
          throw new Error('Failed to apply Top reviewed sort');
      }

      console.log('✅ Applied Top reviewed sort');


//       //@ts-ignore
//       const waitForTimeout = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));

//   // Wait for the 4-star checkbox to appear in the DOM
// const fourStarSelector = 'input[name="class=4"]'; // Update this to your specific selector if different
// const abc = await page.waitForSelector(fourStarSelector, { visible: true, timeout: 5000 });
// console.log('4-star filter found',abc);

// // Click the 4-star filter checkbox
// await page.click(fourStarSelector);
// console.log('4-star filter selected');









// const breakFastIncluded = 'input[name="mealplan=1"]'; // Update this to your specific selector if different
// const bca = await page.waitForSelector(fourStarSelector, { visible: true, timeout: 5000 });
// console.log('breakfast includede',bca);

// // Click the 4-star filter checkbox
// await page.click(breakFastIncluded);
// console.log('4-star filter selected');






// const distanceFromCenter = 'input[name="distance=1000"]'; // Update this to your specific selector if different
// await page.waitForSelector(fourStarSelector, { visible: true, timeout: 5000 });
// console.log('distanceFromCenter');

// // Click the 4-star filter checkbox
// await page.click(distanceFromCenter);
// console.log('distanceFromCenter filter selected');



await page.waitForNetworkIdle({ timeout: 2000 });






      



      //Clicking PROPERTY RATING 
  





  

    
    console.log('✅ AUTOMATION COMPLETED SUCCESSFULLY');

  } catch (error) {
    console.error('❌ ERROR OCCURRED AT STEP:', error);
    console.error('Full error details:', error);

  }
}

console.log('Starting automation script...');
automaticBooking().then(() => {
  console.log('Script execution finished');
}).catch((error) => {
  console.error('Script failed:', error);
});