import type { ICPProfile } from "../types.js";
import { AppStateRepository } from "../repositories/AppStateRepository.js";
import { icpSchema } from "../schemas.js";

export class ICPService {
  constructor(private readonly repository: AppStateRepository) {}

  async getProfile(): Promise<ICPProfile> {
    return this.repository.getICP();
  }

  async updateProfile(payload: unknown): Promise<ICPProfile> {
    const parsed = icpSchema.parse(payload);
    return this.repository.saveICP(parsed);
  }
}

