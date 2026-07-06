import { NextResponse } from "next/server";

import manualAppointmentCalendarSync from "../../../../../src/appointments/manualAppointmentCalendarSync";

export async function POST(request) {
  const payloadResult = await readJsonPayload(request);

  if (payloadResult.error) {
    return NextResponse.json(payloadResult.error.body, {
      status: payloadResult.error.status
    });
  }

  try {
    const result =
      await manualAppointmentCalendarSync.createManualAppointmentCalendarEvent(
        payloadResult.payload
      );

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Manual appointment calendar sync failed."
      },
      { status: 500 }
    );
  }
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
