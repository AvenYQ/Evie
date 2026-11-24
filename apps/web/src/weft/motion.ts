// Weft's one motion language, mirrored as --weft-* in weft.css. Arrivals decelerate, surfaces
// that open or close use the stock drawer curve, exits accelerate and are shorter. The sidebar
// tick/capsule springs are the exception: their feel is user-approved.

export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";
export const EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
export const EASE_STOCK = "ease-out";

export const DURATION_HOVER = 150;
export const DURATION_LAYOUT = 250;
