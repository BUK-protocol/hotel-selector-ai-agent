import { Page } from "playwright";
import { Socket } from "socket.io";

export interface SiteConfig {
  label: string;
  videoPath: string;
  automationFn: (page: Page, params: {
    city: string;
    check_in_date: string;
    check_out_date: string;
    socket: Socket;
    user_filters: string[];
    cleanup: (() => void) | null;
    activeStreams: Map<string, { page: Page; cleanup:(() => void) | null}>;
  }) => Promise<AutomateBookingResponse>;
}

export interface AutomateBookingPropsType {
    city: string;
    check_in_date: string;
    check_out_date: string;
    socket?: Socket;
    user_filters?: string[];
    cleanup: (() => void) | null;
    activeStreams: any;
}

export interface AutomateBookingResponse {
    hotelBookingPrice:number,
    hotelBookingUrl:string
}