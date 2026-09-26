import { z } from "zod";
import { defineTool, READ_ONLY } from "./define.js";

export const getAthleteTool = defineTool({
  name: "get_athlete",
  description:
    "Get the athlete's profile including FTP, LTHR, weight, max HR, resting HR, " +
    "power/HR/pace zones, and sport-specific settings. " +
    "Use this to understand the athlete's current fitness parameters for training plan creation. " +
    "Returns the full athlete object — relevant fields include icu_ftp, icu_lthr, " +
    "weight, sportSettings (FTP/zones per sport).",
  schema: z.object({}),
  annotations: READ_ONLY,
  outputSchema: null,
  handler: (client) => client.athlete.getAthlete(),
});
