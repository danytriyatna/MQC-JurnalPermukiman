import { forwardWidgetChatRequest } from "@/lib/widget-proxy";

export const maxDuration = 60;

export async function POST(request: Request) {
  return forwardWidgetChatRequest(request);
}
