import dotenv from "dotenv";

dotenv.config();

export const LANGFLOW_CONFIG = {
  API: "https://api.langflow.astra.datastax.com",
  LANGFLOW_ID: process.env.LANGFLOW_ID,
  FLOW_ID: process.env.FLOW_ID,
  AUTH_TOKEN: process.env.AUTH_TOKEN,
};

// Mapping of user-friendly filter names to their selectors
export const filterMappings: { [key: string]: string } = {
  // Star ratings
  "5 star": '[aria-label="5-Star rating"]',
  "4 star": '[aria-label="4-Star rating"]',
  "3 star": '[aria-label="3-Star rating"]',
  "2 star": '[aria-label="2-Star rating"]',
  "1 star": '[aria-label="1-Star rating"]',

  // Payment options
  "free cancellation": '[data-selenium="filter-item-text"]:has-text("Free cancellation")',
  "pay at hotel": '[data-selenium="filter-item-text"]:has-text("Pay at the hotel")',
  "book now pay later": '[data-selenium="filter-item-text"]:has-text("Book now, pay later")',
  "pay now": '[data-selenium="filter-item-text"]:has-text("Pay now")',
  "book without credit card": '[data-selenium="filter-item-text"]:has-text("Book without credit card")',

  // Distance filters
  "inside city center": '[data-selenium="filter-item-text"]:has-text("Inside city center")',
  "less than 2km": '[data-selenium="filter-item-text"]:has-text("<2 km to center")',
  "2-5km": '[data-selenium="filter-item-text"]:has-text("2-5 km to center")',
  "5-10km": '[data-selenium="filter-item-text"]:has-text("5-10 km to center")',
  "more than 10km": '[data-selenium="filter-item-text"]:has-text(">10 km to center")',

  // Special deals
  "secret deals": '[data-element-name="search-sort-secret-deals"]',
};

export const STREAM_CONFIG = {
  video: true,
  audio: false,
  mimeType: 'video/webm; codecs="vp8"',
  videoBitsPerSecond: 2500000,
  frameSize: 20,
};

export const SITE_LABEL: { [key in 'AGODA' | 'MMT'| 'HOTEL_DOT_COM'|'EXPEDIA']: string } = {
  AGODA: 'agoda',
  MMT: 'mmt',
  HOTEL_DOT_COM:'hoteldotcom',
  EXPEDIA:'expedia'
};


export const IS_HEADLESS = process.env.IS_HEADLESS === "true" ? true : false;
