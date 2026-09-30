import { ImageResponse } from "next/og";
import { AppIcon } from "@/components/app-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** The browser tab icon (Next adds the link, so browsers stop asking for /favicon.ico). */
export default function Icon() {
  return new ImageResponse(<AppIcon size={32} maskable={false} />, size);
}
