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
    
    console.log('5. Typing destination...');
    await page.type('[name="ss"]', 'New York');
    console.log('✅ Destination typed');
    
    console.log('6. Waiting for destination suggestions...');
   // await page.waitForSelector('.sb-searchbox__input-destination-suggestion');
  //  await page.click('.sb-searchbox__input-destination-suggestion');
    console.log('✅ First suggestion selected');
    
    await page.waitForSelector('button[data-testid="date-display-field-start"]');
    await page.click('button[data-testid="date-display-field-start"]');
    console.log('✅ Opened date picker');

    // Wait for the calendar to appear
    await page.waitForSelector('div[data-testid="searchbox-datepicker"]');
    console.log('✅ Calendar loaded');

    // Select check-in date (February 1, 2024)
    const checkInDate = await page.waitForSelector('span[data-date="2025-01-15"]');
    //@ts-ignore
    await checkInDate.click();
    console.log('✅ Selected check-in date');

    // Select check-out date (February 5, 2024)
    const checkOutDate = await page.waitForSelector('span[data-date="2025-01-20"]');
    //@ts-ignore
    await checkOutDate.click();
    console.log('✅ Selected check-out date');
    
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
  
    
    console.log('9. Waiting for search results...');
    await page.waitForSelector('.sr_property_block');
    console.log('✅ Search results loaded');
    
    console.log('10. Applying star rating filter...');
    await page.click('[data-filters-group="class"]');
    await page.click('[data-filters-item="class:class=4"]');
    console.log('✅ Filter applied');
    
    console.log('11. Waiting for filtered results...');
    await page.waitForNetworkIdle({ timeout: 2000 });
    console.log('✅ Filtered results loaded');
    
    console.log('12. Selecting first hotel...');
    await page.click('.sr_property_block');
    console.log('✅ Hotel selected');
    
    console.log('13. Waiting for hotel page to load...');
    await page.waitForNavigation();
    console.log('✅ Hotel page loaded');
    
    console.log('14. Selecting room...');
    await page.click('.hprt-table-cell-roomtype');
    console.log('✅ Room selected');
    
    console.log('15. Filling in personal details...');
    await page.type('#firstname', 'John');
    await page.type('#lastname', 'Doe');
    await page.type('#email', 'john@example.com');
    console.log('✅ Personal details filled');
    
    console.log('16. Waiting for final page load...');
    await page.waitForNetworkIdle({ timeout: 5000 });
    console.log('✅ Final page loaded');
    
    console.log('17. Closing browser...');
    await browser.close();
    console.log('✅ Browser closed successfully');
    
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