import type { IEventsApi } from "../../src/services/events/index.js";

/**
 * A fully typed `IEventsApi` fake: the methods a test supplies, and every
 * other method rejecting when called. Typing the whole interface here, rather
 * than casting a partial literal, is what makes a test fail to compile the next
 * time the interface grows.
 */
export function stubEventsApi(methods: Partial<IEventsApi> = {}): IEventsApi {
  const unused = (name: keyof IEventsApi) => async (): Promise<never> => {
    throw new Error(`stubEventsApi: ${name} not stubbed`);
  };
  return {
    getEvents: unused("getEvents"),
    getEvent: unused("getEvent"),
    createEvents: unused("createEvents"),
    updateEvent: unused("updateEvent"),
    deleteEvent: unused("deleteEvent"),
    deleteEvents: unused("deleteEvents"),
    ...methods,
  };
}
