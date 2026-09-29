import type { IActivitiesApi } from "../../src/services/activities/index.js";

/**
 * A fully typed `IActivitiesApi` fake: the methods a test supplies, and every
 * other method rejecting when called. Typing the whole interface here, rather
 * than casting a partial literal, is what makes a test fail to compile the next
 * time the interface grows.
 */
export function stubActivitiesApi(
  methods: Partial<IActivitiesApi> = {}
): IActivitiesApi {
  const unused = (name: keyof IActivitiesApi) => async (): Promise<never> => {
    throw new Error(`stubActivitiesApi: ${name} not stubbed`);
  };
  return {
    getActivities: unused("getActivities"),
    getActivity: unused("getActivity"),
    getActivityStreams: unused("getActivityStreams"),
    getActivityLaps: unused("getActivityLaps"),
    getActivityFile: unused("getActivityFile"),
    getActivityIntervals: unused("getActivityIntervals"),
    replaceActivityIntervals: unused("replaceActivityIntervals"),
    ...methods,
  };
}
