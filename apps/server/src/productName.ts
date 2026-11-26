declare const __WEFT_APP_NAME__: string | undefined;

export const productName =
  (typeof __WEFT_APP_NAME__ === "undefined" ? "" : __WEFT_APP_NAME__) || "T3 Code";
