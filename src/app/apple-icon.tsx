import { labsMarkResponse, MARK_SIZE } from "@/lib/mark-icon";

export const size = MARK_SIZE;
export const contentType = "image/png";

export default function AppleIcon() {
  return labsMarkResponse();
}
