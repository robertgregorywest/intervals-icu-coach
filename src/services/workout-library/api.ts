import type { IHttpClient } from "../../client.js";
import type {
  LibraryFolder,
  LibraryWorkout,
  LibraryWorkoutInput,
} from "./types.js";

export interface IWorkoutLibraryApi {
  listFolders(): Promise<LibraryFolder[]>;
  getWorkout(workoutId: number): Promise<LibraryWorkout>;
  createFolder(name: string, parent?: number | null): Promise<LibraryFolder>;
  createWorkout(input: LibraryWorkoutInput): Promise<LibraryWorkout>;
  updateWorkout(
    workoutId: number,
    patch: Partial<LibraryWorkoutInput>
  ): Promise<LibraryWorkout>;
  deleteWorkout(workoutId: number): Promise<void>;
  deleteFolder(folderId: number): Promise<void>;
}

export class WorkoutLibraryApi implements IWorkoutLibraryApi {
  private httpClient: IHttpClient;
  private athleteId: string;

  constructor(httpClient: IHttpClient, athleteId: string) {
    this.httpClient = httpClient;
    this.athleteId = athleteId;
  }

  async listFolders(): Promise<LibraryFolder[]> {
    return this.httpClient.request<LibraryFolder[]>(
      `/api/v1/athlete/${this.athleteId}/folders`
    );
  }

  async getWorkout(workoutId: number): Promise<LibraryWorkout> {
    return this.httpClient.request<LibraryWorkout>(
      `/api/v1/athlete/${this.athleteId}/workouts/${workoutId}`
    );
  }

  async createFolder(
    name: string,
    parent: number | null = null
  ): Promise<LibraryFolder> {
    return this.httpClient.request<LibraryFolder>(
      `/api/v1/athlete/${this.athleteId}/folders`,
      {
        method: "POST",
        body: { name, parent },
      }
    );
  }

  async createWorkout(input: LibraryWorkoutInput): Promise<LibraryWorkout> {
    return this.httpClient.request<LibraryWorkout>(
      `/api/v1/athlete/${this.athleteId}/workouts`,
      {
        method: "POST",
        body: input,
      }
    );
  }

  async updateWorkout(
    workoutId: number,
    patch: Partial<LibraryWorkoutInput>
  ): Promise<LibraryWorkout> {
    return this.httpClient.request<LibraryWorkout>(
      `/api/v1/athlete/${this.athleteId}/workouts/${workoutId}`,
      {
        method: "PUT",
        body: patch,
      }
    );
  }

  async deleteWorkout(workoutId: number): Promise<void> {
    await this.httpClient.request<void>(
      `/api/v1/athlete/${this.athleteId}/workouts/${workoutId}`,
      { method: "DELETE" }
    );
  }

  async deleteFolder(folderId: number): Promise<void> {
    await this.httpClient.request<void>(
      `/api/v1/athlete/${this.athleteId}/folders/${folderId}`,
      { method: "DELETE" }
    );
  }
}

export function createWorkoutLibraryApi(
  httpClient: IHttpClient,
  athleteId: string
): IWorkoutLibraryApi {
  return new WorkoutLibraryApi(httpClient, athleteId);
}
