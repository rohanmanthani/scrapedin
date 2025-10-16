import { useQuery } from "@tanstack/react-query";
import type { AutomationSettings } from "../types";
import { apiClient } from "../api/client";

export const useSettings = () => {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const { data } = await apiClient.get<AutomationSettings>("/settings");
      return data;
    }
  });
};

