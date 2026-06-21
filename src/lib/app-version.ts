declare const __APP_BUILD_VERSION__: string | undefined;

export const APP_BUILD_VERSION =
  typeof __APP_BUILD_VERSION__ === "string" && __APP_BUILD_VERSION__.length > 0
    ? __APP_BUILD_VERSION__
    : "development";
