import { NextResponse } from "next/server";

import demoApiHandlers from "../../../../src/api/demoApiHandlers";

export async function POST(request) {
  const payloadResult = await readJsonPayload(request);

  if (payloadResult.error) {
    return NextResponse.json(payloadResult.error.body, {
      status: payloadResult.error.status
    });
  }

  const result = demoApiHandlers.handleDemoAppointment(payloadResult.payload);

  return NextResponse.json(result.body, { status: result.status });
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
