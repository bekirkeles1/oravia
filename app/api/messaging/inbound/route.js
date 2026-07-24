import { NextResponse } from "next/server";

import messagingInboundHandler from "../../../../src/api/messagingInboundHandler";
import runtimeCompositionRoot from "../../../../src/secretary/appointmentReviewRouteRuntimeCompositionRoot";

export async function POST(request) {
  const payloadResult = await readJsonPayload(request);

  if (payloadResult.error) {
    return NextResponse.json(payloadResult.error.body, {
      status: payloadResult.error.status
    });
  }

  const result = handleInboundWithRuntime(payloadResult.payload);

  return NextResponse.json(result.body, { status: result.status });
}

function handleInboundWithRuntime(payload) {
  try {
    const adapter =
      runtimeCompositionRoot.getActiveAppointmentReviewRouteRuntimeAdapter();

    if (adapter && typeof adapter.handleMessagingInbound === "function") {
      return adapter.handleMessagingInbound(payload);
    }
  } catch {}

  return messagingInboundHandler.handleMessagingInbound(payload);
}

async function readJsonPayload(request) {
  try {
    return {
      payload: await request.json()
    };
  } catch (error) {
    return {
      error: {
        status: 400,
        body: {
          error: "Request body must be valid JSON."
        }
      }
    };
  }
}
