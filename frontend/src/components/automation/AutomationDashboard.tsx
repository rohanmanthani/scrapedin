import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AutoPlanResponse,
  SalesNavSeniority,
  SearchPreset,
  SearchTask,
  SearchTaskType
} from "../../types";
import { apiClient } from "../../api/client";

type TaskWithPreset = SearchTask & { preset?: SearchPreset };

const formatDate = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");

const statusLabels: Record<SearchTask["status"], string> = {
  draft: "Draft",
  pending: "Warming Up",
  queued: "Queued",
  running: "Running",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled"
};

const statusVariants: Record<SearchTask["status"], "ok" | "error" | "warn" | "info" | "progress"> =
  {
    draft: "info",
    pending: "progress",
    queued: "warn",
    running: "warn",
    succeeded: "ok",
    failed: "error",
    cancelled: "error"
  };

type CreateMode = "icp" | "accounts" | "posts" | "profiles";

interface AutomationDashboardProps {
  onOpenSettings?: () => void;
}

const SENIORITY_OPTIONS: Array<{ value: SalesNavSeniority; label: string }> = [
  { value: "OWNER", label: "Owner" },
  { value: "PARTNER", label: "Partner" },
  { value: "CXO", label: "C-Level" },
  { value: "VP", label: "VP" },
  { value: "DIRECTOR", label: "Director" },
  { value: "MANAGER", label: "Manager" },
  { value: "SENIOR", label: "Senior IC" },
  { value: "ENTRY", label: "Entry" }
];

export const AutomationDashboard = ({
  onOpenSettings: _onOpenSettings
}: AutomationDashboardProps) => {
  const queryClient = useQueryClient();

  const { data: presets } = useQuery({
    queryKey: ["search-presets"],
    queryFn: async () => {
      const { data } = await apiClient.get<SearchPreset[]>("/search-presets");
      return data;
    }
  });

  const { data: tasks } = useQuery({
    queryKey: ["tasks"],
    queryFn: async () => {
      const { data } = await apiClient.get<SearchTask[]>("/tasks");
      return data;
    },
    refetchInterval: 15_000
  });

  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const [startInFlight, setStartInFlight] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskWithPreset | null>(null);
  const [editKeywords, setEditKeywords] = useState("");
  const [editExcluded, setEditExcluded] = useState("");
  const [editPageLimit, setEditPageLimit] = useState("3");
  const [editError, setEditError] = useState<string | null>(null);
  const [editIndustries, setEditIndustries] = useState("");
  const [editGeographies, setEditGeographies] = useState("");
  const [editFunctions, setEditFunctions] = useState("");
  const [editCompanyHeadquarters, setEditCompanyHeadquarters] = useState("");
  const [editCompanyTypes, setEditCompanyTypes] = useState("");
  const [editCurrentCompanies, setEditCurrentCompanies] = useState("");
  const [editPastCompanies, setEditPastCompanies] = useState("");
  const [editCurrentTitles, setEditCurrentTitles] = useState("");
  const [editPastTitles, setEditPastTitles] = useState("");
  const [editProfileLanguages, setEditProfileLanguages] = useState("");
  const [editGroups, setEditGroups] = useState("");
  const [editSchools, setEditSchools] = useState("");
  const [editConnectionsOf, setEditConnectionsOf] = useState("");
  const [editAccountLists, setEditAccountLists] = useState("");
  const [editLeadLists, setEditLeadLists] = useState("");
  const [editPersonas, setEditPersonas] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editHeadcountMin, setEditHeadcountMin] = useState("");
  const [editHeadcountMax, setEditHeadcountMax] = useState("");
  const [editRevenueMin, setEditRevenueMin] = useState("");
  const [editRevenueMax, setEditRevenueMax] = useState("");
  const [editYearsAtCompanyMin, setEditYearsAtCompanyMin] = useState("");
  const [editYearsAtCompanyMax, setEditYearsAtCompanyMax] = useState("");
  const [editYearsInRoleMin, setEditYearsInRoleMin] = useState("");
  const [editYearsInRoleMax, setEditYearsInRoleMax] = useState("");
  const [editYearsExperienceMin, setEditYearsExperienceMin] = useState("");
  const [editYearsExperienceMax, setEditYearsExperienceMax] = useState("");
  const [editRelationship, setEditRelationship] = useState<
    "" | "1" | "2" | "3" | "group" | "teamlink"
  >("");
  const [editPostedInPastDays, setEditPostedInPastDays] = useState("");
  const [editChangedJobsWindow, setEditChangedJobsWindow] = useState("");
  const [editFollowingCompany, setEditFollowingCompany] = useState(false);
  const [editSharedExperiences, setEditSharedExperiences] = useState(false);
  const [editTeamLinkIntroductions, setEditTeamLinkIntroductions] = useState(false);
  const [editViewedProfile, setEditViewedProfile] = useState(false);
  const [editPastCustomer, setEditPastCustomer] = useState(false);
  const [editPastColleague, setEditPastColleague] = useState(false);
  const [editBuyerIntent, setEditBuyerIntent] = useState(false);
  const [editPeopleInCRM, setEditPeopleInCRM] = useState(false);
  const [editPeopleInteractedWith, setEditPeopleInteractedWith] = useState(false);
  const [editSavedLeadsAndAccounts, setEditSavedLeadsAndAccounts] = useState(false);
  const [editSeniorities, setEditSeniorities] = useState<SalesNavSeniority[]>([]);
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuPosition, setCreateMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const [icpPrompt, setIcpPrompt] = useState("");
  const [icpCommandName, setIcpCommandName] = useState("");
  const [accountsInput, setAccountsInput] = useState("");
  const [accountsName, setAccountsName] = useState("");
  const [accountsLeadList, setAccountsLeadList] = useState("");
  const [postsInput, setPostsInput] = useState("");
  const [postsName, setPostsName] = useState("");
  const [postsLeadList, setPostsLeadList] = useState("");
  const [postsScrapeReactions, setPostsScrapeReactions] = useState(true);
  const [postsScrapeCommenters, setPostsScrapeCommenters] = useState(true);
  const [profilesInput, setProfilesInput] = useState("");
  const [profilesName, setProfilesName] = useState("");
  const [profilesLeadList, setProfilesLeadList] = useState("");

  // Edit state for payload-based tasks
  const [editAccountsInput, setEditAccountsInput] = useState("");
  const [editAccountsLeadList, setEditAccountsLeadList] = useState("");
  const [editPostsInput, setEditPostsInput] = useState("");
  const [editPostsLeadList, setEditPostsLeadList] = useState("");
  const [editPostsScrapeReactions, setEditPostsScrapeReactions] = useState(true);
  const [editPostsScrapeCommenters, setEditPostsScrapeCommenters] = useState(true);
  const [editProfilesInput, setEditProfilesInput] = useState("");
  const [editProfilesLeadList, setEditProfilesLeadList] = useState("");

  const closeMenu = useCallback(() => {
    setMenuTaskId(null);
    setMenuPosition(null);
  }, []);

  const closeCreateMenu = useCallback(() => {
    setCreateMenuOpen(false);
    setCreateMenuPosition(null);
  }, []);

  const handleEditModalClose = useCallback(() => {
    setEditingTask(null);
    setEditError(null);
  }, []);

  const resetCreateState = useCallback(() => {
    setCreateError(null);
    setIcpPrompt("");
    setIcpCommandName("");
    setAccountsInput("");
    setAccountsName("");
    setAccountsLeadList("");
    setPostsInput("");
    setPostsName("");
    setPostsLeadList("");
    setPostsScrapeReactions(true);
    setPostsScrapeCommenters(true);
    setProfilesInput("");
    setProfilesName("");
    setProfilesLeadList("");
  }, []);

  const handleCreateModalClose = useCallback(() => {
    setCreateMode(null);
    resetCreateState();
  }, [resetCreateState]);

  useEffect(() => {
    const handler = () => {
      closeMenu();
      closeCreateMenu();
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [closeMenu, closeCreateMenu]);

  useEffect(() => {
    if (!menuTaskId) {
      return;
    }
    const handler = () => closeMenu();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, true);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler, true);
    };
  }, [menuTaskId, closeMenu]);

  useEffect(() => {
    if (!editingTask) {
      return;
    }

    // Initialize edit state for payload-based tasks
    if (editingTask.type === "account_followers" && editingTask.payload) {
      const urls = editingTask.payload.accountUrls ?? [];
      setEditAccountsInput(urls.join("\n"));
      setEditAccountsLeadList(editingTask.payload.targetLeadListName ?? "");
      setEditError(null);
      return;
    }

    if (editingTask.type === "post_engagement" && editingTask.payload) {
      const urls = editingTask.payload.postUrls ?? [];
      setEditPostsInput(urls.join("\n"));
      setEditPostsLeadList(editingTask.payload.targetLeadListName ?? "");
      setEditPostsScrapeReactions(editingTask.payload.scrapeReactions ?? false);
      setEditPostsScrapeCommenters(editingTask.payload.scrapeCommenters ?? false);
      setEditError(null);
      return;
    }

    if (editingTask.type === "profile_scrape" && editingTask.payload) {
      const urls = editingTask.payload.profileUrls ?? [];
      setEditProfilesInput(urls.join("\n"));
      setEditProfilesLeadList(editingTask.payload.targetLeadListName ?? "");
      setEditError(null);
      return;
    }

    // For ICP/preset-based tasks
    const editingPreset = editingTask.preset;
    if (!editingPreset) {
      return;
    }
    setEditKeywords(editingPreset.filters.keywords.join("\n"));
    setEditExcluded(editingPreset.filters.excludedKeywords.join("\n"));
    setEditPageLimit(String(editingPreset.pageLimit ?? 3));
    setEditIndustries((editingPreset.filters.industries ?? []).join("\n"));
    setEditGeographies((editingPreset.filters.geographies ?? []).join("\n"));
    setEditFunctions((editingPreset.filters.functions ?? []).join("\n"));
    setEditCompanyHeadquarters((editingPreset.filters.companyHeadquarters ?? []).join("\n"));
    setEditCompanyTypes((editingPreset.filters.companyTypes ?? []).join("\n"));
    setEditCurrentCompanies((editingPreset.filters.currentCompanies ?? []).join("\n"));
    setEditPastCompanies((editingPreset.filters.pastCompanies ?? []).join("\n"));
    setEditCurrentTitles((editingPreset.filters.currentJobTitles ?? []).join("\n"));
    setEditPastTitles((editingPreset.filters.pastJobTitles ?? []).join("\n"));
    setEditProfileLanguages((editingPreset.filters.profileLanguages ?? []).join("\n"));
    setEditGroups((editingPreset.filters.groups ?? []).join("\n"));
    setEditSchools((editingPreset.filters.schools ?? []).join("\n"));
    setEditConnectionsOf((editingPreset.filters.connectionsOf ?? []).join("\n"));
    setEditAccountLists((editingPreset.filters.accountLists ?? []).join("\n"));
    setEditLeadLists((editingPreset.filters.leadLists ?? []).join("\n"));
    setEditPersonas((editingPreset.filters.personas ?? []).join("\n"));
    setEditFirstName(editingPreset.filters.firstName ?? "");
    setEditLastName(editingPreset.filters.lastName ?? "");
    setEditHeadcountMin(
      editingPreset.filters.companyHeadcount.min !== undefined
        ? String(editingPreset.filters.companyHeadcount.min)
        : ""
    );
    setEditHeadcountMax(
      editingPreset.filters.companyHeadcount.max !== undefined
        ? String(editingPreset.filters.companyHeadcount.max)
        : ""
    );
    setEditRevenueMin(
      editingPreset.filters.companyRevenue.min !== undefined
        ? String(editingPreset.filters.companyRevenue.min)
        : ""
    );
    setEditRevenueMax(
      editingPreset.filters.companyRevenue.max !== undefined
        ? String(editingPreset.filters.companyRevenue.max)
        : ""
    );
    setEditYearsAtCompanyMin(
      editingPreset.filters.yearsInCurrentCompany.min !== undefined
        ? String(editingPreset.filters.yearsInCurrentCompany.min)
        : ""
    );
    setEditYearsAtCompanyMax(
      editingPreset.filters.yearsInCurrentCompany.max !== undefined
        ? String(editingPreset.filters.yearsInCurrentCompany.max)
        : ""
    );
    setEditYearsInRoleMin(
      editingPreset.filters.yearsInCurrentPosition.min !== undefined
        ? String(editingPreset.filters.yearsInCurrentPosition.min)
        : ""
    );
    setEditYearsInRoleMax(
      editingPreset.filters.yearsInCurrentPosition.max !== undefined
        ? String(editingPreset.filters.yearsInCurrentPosition.max)
        : ""
    );
    setEditYearsExperienceMin(
      editingPreset.filters.yearsOfExperience.min !== undefined
        ? String(editingPreset.filters.yearsOfExperience.min)
        : ""
    );
    setEditYearsExperienceMax(
      editingPreset.filters.yearsOfExperience.max !== undefined
        ? String(editingPreset.filters.yearsOfExperience.max)
        : ""
    );
    setEditRelationship(editingPreset.filters.relationship ?? "");
    setEditPostedInPastDays(
      editingPreset.filters.postedInPastDays !== undefined
        ? String(editingPreset.filters.postedInPastDays)
        : ""
    );
    setEditChangedJobsWindow(
      editingPreset.filters.changedJobsInPastDays !== undefined
        ? String(editingPreset.filters.changedJobsInPastDays)
        : ""
    );
    setEditFollowingCompany(Boolean(editingPreset.filters.followingYourCompany));
    setEditSharedExperiences(Boolean(editingPreset.filters.sharedExperiences));
    setEditTeamLinkIntroductions(Boolean(editingPreset.filters.teamLinkIntroductions));
    setEditViewedProfile(Boolean(editingPreset.filters.viewedYourProfile));
    setEditPastCustomer(Boolean(editingPreset.filters.pastCustomer));
    setEditPastColleague(Boolean(editingPreset.filters.pastColleague));
    setEditBuyerIntent(Boolean(editingPreset.filters.buyerIntent));
    setEditPeopleInCRM(Boolean(editingPreset.filters.peopleInCRM));
    setEditPeopleInteractedWith(Boolean(editingPreset.filters.peopleInteractedWith));
    setEditSavedLeadsAndAccounts(Boolean(editingPreset.filters.savedLeadsAndAccounts));
    setEditSeniorities([...editingPreset.filters.seniorities]);
    setEditError(null);
  }, [editingTask]);

  useEffect(() => {
    if (!createMode) {
      return;
    }
    setCreateError(null);
  }, [createMode]);

  useEffect(() => {
    if (!editingTask) {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleEditModalClose();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [editingTask, handleEditModalClose]);

  const toggleSeniority = useCallback((value: SalesNavSeniority) => {
    setEditSeniorities((previous) =>
      previous.includes(value) ? previous.filter((item) => item !== value) : [...previous, value]
    );
  }, []);

  const parseListInput = useCallback((raw: string) => {
    return raw
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }, []);

  const resolveTaskType = (task: SearchTask): SearchTaskType =>
    ((task.type ?? "sales_navigator") as SearchTaskType) ?? "sales_navigator";

  const formatListPreview = (items: string[] | undefined, limit = 2): string | undefined => {
    if (!items || items.length === 0) {
      return undefined;
    }
    if (items.length <= limit) {
      return items.join(", ");
    }
    const preview = items.slice(0, limit).join(", ");
    return `${preview} +${items.length - limit} more`;
  };

  const getTaskTypeLabel = (task: SearchTask): string => {
    const type = resolveTaskType(task);
    switch (type) {
      case "account_followers":
        return "Account follower scrape";
      case "post_engagement":
        return "Post engagement scrape";
      case "profile_scrape":
        return "Profile list scrape";
      case "sales_navigator":
      default:
        return "Sales Navigator search";
    }
  };

  const getTaskDetailsText = (task: TaskWithPreset): string => {
    const type = resolveTaskType(task);
    const parts: string[] = [];
    const payload = task.payload ?? {};

    if (type === "sales_navigator") {
      if (task.preset?.name) {
        parts.push(`Preset: ${task.preset.name}`);
      }
      if (task.preset?.filters.keywords?.length) {
        const preview = formatListPreview(task.preset.filters.keywords);
        if (preview) {
          parts.push(`Keywords: ${preview}`);
        }
      }
      if (task.preset?.filters.geographies?.length) {
        const preview = formatListPreview(task.preset.filters.geographies);
        if (preview) {
          parts.push(`Geos: ${preview}`);
        }
      }
      if (task.preset?.pageLimit) {
        parts.push(`Page limit: ${task.preset.pageLimit}`);
      }
      if (parts.length === 0) {
        parts.push("Preset ready for review");
      }
      return parts.join(" • ");
    }

    if (type === "account_followers") {
      const accounts = payload.accountUrls ?? [];
      if (accounts.length) {
        parts.push(`${accounts.length} account${accounts.length === 1 ? "" : "s"}`);
        const preview = formatListPreview(accounts);
        if (preview) {
          parts.push(preview);
        }
      }
      if (payload.targetLeadListName) {
        parts.push(`Lead list: ${payload.targetLeadListName}`);
      }
      return parts.length ? parts.join(" • ") : "No accounts added yet";
    }

    if (type === "post_engagement") {
      const posts = payload.postUrls ?? [];
      if (posts.length) {
        parts.push(`${posts.length} post${posts.length === 1 ? "" : "s"}`);
        const preview = formatListPreview(posts);
        if (preview) {
          parts.push(preview);
        }
      }
      const engagement: string[] = [];
      if (payload.scrapeReactions) engagement.push("reactions");
      if (payload.scrapeCommenters) engagement.push("comments");
      if (engagement.length) {
        parts.push(`Collect: ${engagement.join(" & ")}`);
      }
      if (payload.targetLeadListName) {
        parts.push(`Lead list: ${payload.targetLeadListName}`);
      }
      return parts.length ? parts.join(" • ") : "No posts added yet";
    }

    if (type === "profile_scrape") {
      const profiles = payload.profileUrls ?? [];
      if (profiles.length) {
        parts.push(`${profiles.length} profile${profiles.length === 1 ? "" : "s"}`);
        const preview = formatListPreview(profiles);
        if (preview) {
          parts.push(preview);
        }
      }
      if (payload.targetLeadListName) {
        parts.push(`Lead list: ${payload.targetLeadListName}`);
      }
      return parts.length ? parts.join(" • ") : "No profiles added yet";
    }

    return "Ready for review";
  };

  const startTask = useMutation({
    mutationFn: async (taskId: string) => {
      setStartInFlight(taskId);
      const { data } = await apiClient.patch<SearchTask>(`/tasks/${taskId}`, {
        status: "pending",
        scheduledFor: new Date().toISOString()
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onSettled: () => {
      setStartInFlight(null);
    }
  });

  const pauseTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { data } = await apiClient.patch<SearchTask>(`/tasks/${taskId}`, {
        status: "draft"
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const renameTask = useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      const { data } = await apiClient.patch<SearchTask>(`/tasks/${taskId}`, { name });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      await apiClient.delete(`/tasks/${taskId}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  });

  const updatePreset = useMutation({
    mutationFn: async ({
      presetId,
      payload
    }: {
      presetId: string;
      payload: Partial<SearchPreset>;
    }) => {
      const { data } = await apiClient.put<SearchPreset>(`/search-presets/${presetId}`, payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["search-presets"] });
    }
  });

  const updateTask = useMutation({
    mutationFn: async ({
      taskId,
      payload
    }: {
      taskId: string;
      payload: Record<string, unknown>;
    }) => {
      const { data } = await apiClient.patch<SearchTask>(`/tasks/${taskId}`, payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      handleEditModalClose();
      setBannerMessage("Task updated successfully");
    },
    onError: (error: unknown) => {
      setEditError(error instanceof Error ? error.message : "Failed to update task");
    }
  });

  const createIcpMutation = useMutation({
    mutationFn: async ({ prompt, commandName }: { prompt: string; commandName: string }) => {
      const { data } = await apiClient.post<AutoPlanResponse>("/workflow/auto-plan", {
        instructions: prompt,
        commandName
      });
      return data;
    },
    onSuccess: (result) => {
      const count = result.tasks.length;
      setBannerMessage(
        count > 0
          ? `Generated ${count} draft automation${count === 1 ? "" : "s"} from your ICP prompt.`
          : "ICP prompt processed. Review presets to configure your automations."
      );
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["search-presets"] });
      handleCreateModalClose();
    },
    onError: (error: unknown) => {
      setCreateError(
        error instanceof Error ? error.message : "Failed to generate automation from ICP"
      );
    }
  });

  const createAccountsMutation = useMutation({
    mutationFn: async (payload: { accountUrls: string[]; name: string; leadListName?: string }) => {
      const { data } = await apiClient.post<SearchTask>("/tasks/accounts", payload);
      return data;
    },
    onSuccess: (task) => {
      setBannerMessage(
        `Draft account follower task "${task.name ?? "Account Followers"}" created.`
      );
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      handleCreateModalClose();
    },
    onError: (error: unknown) => {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create account follower task"
      );
    }
  });

  const createPostsMutation = useMutation({
    mutationFn: async (payload: {
      postUrls: string[];
      scrapeReactions: boolean;
      scrapeCommenters: boolean;
      name: string;
      leadListName?: string;
    }) => {
      const { data } = await apiClient.post<SearchTask>("/tasks/posts", payload);
      return data;
    },
    onSuccess: (task) => {
      setBannerMessage(`Draft post engagement task "${task.name ?? "Post Engagement"}" created.`);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      handleCreateModalClose();
    },
    onError: (error: unknown) => {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create post engagement task"
      );
    }
  });

  const createProfilesMutation = useMutation({
    mutationFn: async (payload: {
      profileUrls: string[];
      name?: string;
      leadListName?: string;
    }) => {
      const { data } = await apiClient.post<SearchTask>("/tasks/profiles", payload);
      return data;
    },
    onSuccess: (task) => {
      setBannerMessage(`Draft profile scrape task "${task.name ?? "Profile List"}" created.`);
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      handleCreateModalClose();
    },
    onError: (error: unknown) => {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create profile scrape task"
      );
    }
  });

  const handleEditSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const editingPreset = editingTask?.preset;
      if (!editingPreset) {
        return;
      }
      const parseOptionalInteger = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return undefined;
        }
        const parsed = Number.parseInt(trimmed, 10);
        return Number.isInteger(parsed) ? parsed : Number.NaN;
      };
      const keywords = editKeywords
        .split("\n")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      const excludedKeywords = editExcluded
        .split("\n")
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      const industries = editIndustries
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const geographies = editGeographies
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const functions = editFunctions
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const companyHeadquarters = editCompanyHeadquarters
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const companyTypes = editCompanyTypes
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const currentCompanies = editCurrentCompanies
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const pastCompanies = editPastCompanies
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const currentJobTitles = editCurrentTitles
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const pastJobTitles = editPastTitles
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const profileLanguages = editProfileLanguages
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const groups = editGroups
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const schools = editSchools
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const connectionsOf = editConnectionsOf
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const accountLists = editAccountLists
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const leadLists = editLeadLists
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const personas = editPersonas
        .split("\n")
        .map((entry) => entry.trim())
        .filter(Boolean);
      const firstName = editFirstName.trim() || undefined;
      const lastName = editLastName.trim() || undefined;
      const trimmedPageLimit = editPageLimit.trim();
      const parsedPageLimit =
        trimmedPageLimit === "" ? undefined : Number.parseInt(trimmedPageLimit, 10);
      if (
        parsedPageLimit !== undefined &&
        (!Number.isInteger(parsedPageLimit) || parsedPageLimit <= 0)
      ) {
        setEditError("Page limit must be a positive number.");
        return;
      }
      const headcountMin = parseOptionalInteger(editHeadcountMin);
      if (Number.isNaN(headcountMin) || (headcountMin !== undefined && headcountMin < 0)) {
        setEditError("Company size minimum must be a positive number.");
        return;
      }
      const headcountMax = parseOptionalInteger(editHeadcountMax);
      if (Number.isNaN(headcountMax) || (headcountMax !== undefined && headcountMax < 0)) {
        setEditError("Company size maximum must be a positive number.");
        return;
      }
      if (headcountMin !== undefined && headcountMax !== undefined && headcountMin > headcountMax) {
        setEditError("Company size minimum cannot exceed the maximum.");
        return;
      }
      const revenueMin = parseOptionalInteger(editRevenueMin);
      if (Number.isNaN(revenueMin) || (revenueMin !== undefined && revenueMin < 0)) {
        setEditError("Company revenue minimum must be a positive number.");
        return;
      }
      const revenueMax = parseOptionalInteger(editRevenueMax);
      if (Number.isNaN(revenueMax) || (revenueMax !== undefined && revenueMax < 0)) {
        setEditError("Company revenue maximum must be a positive number.");
        return;
      }
      if (revenueMin !== undefined && revenueMax !== undefined && revenueMin > revenueMax) {
        setEditError("Company revenue minimum cannot exceed the maximum.");
        return;
      }
      const postedInPastDays = parseOptionalInteger(editPostedInPastDays);
      if (
        Number.isNaN(postedInPastDays) ||
        (postedInPastDays !== undefined && postedInPastDays <= 0)
      ) {
        setEditError("Posted in past days must be a positive number.");
        return;
      }
      const changedJobsInPastDays = parseOptionalInteger(editChangedJobsWindow);
      if (
        Number.isNaN(changedJobsInPastDays) ||
        (changedJobsInPastDays !== undefined && changedJobsInPastDays <= 0)
      ) {
        setEditError("Changed jobs window must be a positive number.");
        return;
      }
      const yearsAtCompanyMin = parseOptionalInteger(editYearsAtCompanyMin);
      if (
        Number.isNaN(yearsAtCompanyMin) ||
        (yearsAtCompanyMin !== undefined && yearsAtCompanyMin < 0)
      ) {
        setEditError("Years in company minimum must be a positive number.");
        return;
      }
      const yearsAtCompanyMax = parseOptionalInteger(editYearsAtCompanyMax);
      if (
        Number.isNaN(yearsAtCompanyMax) ||
        (yearsAtCompanyMax !== undefined && yearsAtCompanyMax < 0)
      ) {
        setEditError("Years in company maximum must be a positive number.");
        return;
      }
      if (
        yearsAtCompanyMin !== undefined &&
        yearsAtCompanyMax !== undefined &&
        yearsAtCompanyMin > yearsAtCompanyMax
      ) {
        setEditError("Years in company minimum cannot exceed the maximum.");
        return;
      }
      const yearsInRoleMin = parseOptionalInteger(editYearsInRoleMin);
      if (Number.isNaN(yearsInRoleMin) || (yearsInRoleMin !== undefined && yearsInRoleMin < 0)) {
        setEditError("Years in position minimum must be a positive number.");
        return;
      }
      const yearsInRoleMax = parseOptionalInteger(editYearsInRoleMax);
      if (Number.isNaN(yearsInRoleMax) || (yearsInRoleMax !== undefined && yearsInRoleMax < 0)) {
        setEditError("Years in position maximum must be a positive number.");
        return;
      }
      if (
        yearsInRoleMin !== undefined &&
        yearsInRoleMax !== undefined &&
        yearsInRoleMin > yearsInRoleMax
      ) {
        setEditError("Years in position minimum cannot exceed the maximum.");
        return;
      }
      const yearsExperienceMin = parseOptionalInteger(editYearsExperienceMin);
      if (
        Number.isNaN(yearsExperienceMin) ||
        (yearsExperienceMin !== undefined && yearsExperienceMin < 0)
      ) {
        setEditError("Years of experience minimum must be a positive number.");
        return;
      }
      const yearsExperienceMax = parseOptionalInteger(editYearsExperienceMax);
      if (
        Number.isNaN(yearsExperienceMax) ||
        (yearsExperienceMax !== undefined && yearsExperienceMax < 0)
      ) {
        setEditError("Years of experience maximum must be a positive number.");
        return;
      }
      if (
        yearsExperienceMin !== undefined &&
        yearsExperienceMax !== undefined &&
        yearsExperienceMin > yearsExperienceMax
      ) {
        setEditError("Years of experience minimum cannot exceed the maximum.");
        return;
      }
      const companyHeadcount = { ...editingPreset.filters.companyHeadcount };
      if (headcountMin !== undefined) {
        companyHeadcount.min = headcountMin;
      } else {
        delete companyHeadcount.min;
      }
      if (headcountMax !== undefined) {
        companyHeadcount.max = headcountMax;
      } else {
        delete companyHeadcount.max;
      }
      const companyRevenue = { ...editingPreset.filters.companyRevenue };
      if (revenueMin !== undefined) {
        companyRevenue.min = revenueMin;
      } else {
        delete companyRevenue.min;
      }
      if (revenueMax !== undefined) {
        companyRevenue.max = revenueMax;
      } else {
        delete companyRevenue.max;
      }
      const yearsInCurrentCompany = { ...editingPreset.filters.yearsInCurrentCompany };
      if (yearsAtCompanyMin !== undefined) {
        yearsInCurrentCompany.min = yearsAtCompanyMin;
      } else {
        delete yearsInCurrentCompany.min;
      }
      if (yearsAtCompanyMax !== undefined) {
        yearsInCurrentCompany.max = yearsAtCompanyMax;
      } else {
        delete yearsInCurrentCompany.max;
      }
      const yearsInCurrentPosition = { ...editingPreset.filters.yearsInCurrentPosition };
      if (yearsInRoleMin !== undefined) {
        yearsInCurrentPosition.min = yearsInRoleMin;
      } else {
        delete yearsInCurrentPosition.min;
      }
      if (yearsInRoleMax !== undefined) {
        yearsInCurrentPosition.max = yearsInRoleMax;
      } else {
        delete yearsInCurrentPosition.max;
      }
      const yearsOfExperience = { ...editingPreset.filters.yearsOfExperience };
      if (yearsExperienceMin !== undefined) {
        yearsOfExperience.min = yearsExperienceMin;
      } else {
        delete yearsOfExperience.min;
      }
      if (yearsExperienceMax !== undefined) {
        yearsOfExperience.max = yearsExperienceMax;
      } else {
        delete yearsOfExperience.max;
      }
      setEditError(null);
      try {
        await updatePreset.mutateAsync({
          presetId: editingPreset.id,
          payload: {
            filters: {
              ...editingPreset.filters,
              keywords,
              excludedKeywords,
              industries,
              companyHeadquarters,
              geographies,
              functions,
              currentCompanies,
              pastCompanies,
              currentJobTitles,
              pastJobTitles,
              companyTypes,
              profileLanguages,
              groups,
              schools,
              connectionsOf,
              accountLists,
              leadLists,
              personas,
              firstName,
              lastName,
              seniorities: editSeniorities,
              companyHeadcount,
              companyRevenue,
              yearsInCurrentCompany,
              yearsInCurrentPosition,
              yearsOfExperience,
              postedInPastDays: postedInPastDays ?? undefined,
              changedJobsInPastDays: changedJobsInPastDays ?? undefined,
              followingYourCompany: editFollowingCompany ? true : undefined,
              sharedExperiences: editSharedExperiences ? true : undefined,
              teamLinkIntroductions: editTeamLinkIntroductions ? true : undefined,
              viewedYourProfile: editViewedProfile ? true : undefined,
              pastCustomer: editPastCustomer ? true : undefined,
              pastColleague: editPastColleague ? true : undefined,
              buyerIntent: editBuyerIntent ? true : undefined,
              peopleInCRM: editPeopleInCRM ? true : undefined,
              peopleInteractedWith: editPeopleInteractedWith ? true : undefined,
              savedLeadsAndAccounts: editSavedLeadsAndAccounts ? true : undefined,
              relationship: editRelationship || undefined
            },
            pageLimit: parsedPageLimit
          }
        });
        handleEditModalClose();
      } catch (error) {
        setEditError(error instanceof Error ? error.message : "Failed to update preset filters.");
      }
    },
    [
      editingTask,
      editKeywords,
      editExcluded,
      editPageLimit,
      editIndustries,
      editGeographies,
      editFunctions,
      editCompanyHeadquarters,
      editCompanyTypes,
      editCurrentCompanies,
      editPastCompanies,
      editCurrentTitles,
      editPastTitles,
      editProfileLanguages,
      editGroups,
      editSchools,
      editConnectionsOf,
      editAccountLists,
      editLeadLists,
      editPersonas,
      editFirstName,
      editLastName,
      editHeadcountMin,
      editHeadcountMax,
      editRevenueMin,
      editRevenueMax,
      editYearsAtCompanyMin,
      editYearsAtCompanyMax,
      editYearsInRoleMin,
      editYearsInRoleMax,
      editYearsExperienceMin,
      editYearsExperienceMax,
      editPostedInPastDays,
      editChangedJobsWindow,
      editFollowingCompany,
      editSharedExperiences,
      editTeamLinkIntroductions,
      editViewedProfile,
      editPastCustomer,
      editPastColleague,
      editBuyerIntent,
      editPeopleInCRM,
      editPeopleInteractedWith,
      editSavedLeadsAndAccounts,
      editSeniorities,
      editRelationship,
      updatePreset,
      handleEditModalClose
    ]
  );

  const handleEditPayloadSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editingTask) {
        return;
      }

      setEditError(null);

      try {
        if (editingTask.type === "account_followers") {
          const urls = editAccountsInput
            .split(/[\n,]/)
            .map((url) => url.trim())
            .filter(Boolean);

          if (urls.length === 0) {
            setEditError("Please provide at least one account URL");
            return;
          }

          await updateTask.mutateAsync({
            taskId: editingTask.id,
            payload: {
              payload: {
                accountUrls: urls,
                targetLeadListName: editAccountsLeadList.trim() || undefined
              }
            }
          });
        } else if (editingTask.type === "post_engagement") {
          const urls = editPostsInput
            .split(/[\n,]/)
            .map((url) => url.trim())
            .filter(Boolean);

          if (urls.length === 0) {
            setEditError("Please provide at least one post URL");
            return;
          }

          if (!editPostsScrapeReactions && !editPostsScrapeCommenters) {
            setEditError("Please select at least one engagement type to scrape");
            return;
          }

          await updateTask.mutateAsync({
            taskId: editingTask.id,
            payload: {
              payload: {
                postUrls: urls,
                scrapeReactions: editPostsScrapeReactions,
                scrapeCommenters: editPostsScrapeCommenters,
                targetLeadListName: editPostsLeadList.trim() || undefined
              }
            }
          });
        } else if (editingTask.type === "profile_scrape") {
          const urls = editProfilesInput
            .split(/[\n,]/)
            .map((url) => url.trim())
            .filter(Boolean);

          if (urls.length === 0) {
            setEditError("Please provide at least one profile URL");
            return;
          }

          await updateTask.mutateAsync({
            taskId: editingTask.id,
            payload: {
              payload: {
                profileUrls: urls,
                targetLeadListName: editProfilesLeadList.trim() || undefined
              }
            }
          });
        }
      } catch (error) {
        setEditError(error instanceof Error ? error.message : "Failed to update task");
      }
    },
    [
      editingTask,
      editAccountsInput,
      editAccountsLeadList,
      editPostsInput,
      editPostsLeadList,
      editPostsScrapeReactions,
      editPostsScrapeCommenters,
      editProfilesInput,
      editProfilesLeadList,
      updateTask
    ]
  );

  const linkedTasks: TaskWithPreset[] = useMemo(() => {
    if (!tasks) {
      return [];
    }
    const presetMap = new Map((presets ?? []).map((preset) => [preset.id, preset]));
    return tasks.map((task) => ({
      ...task,
      preset: task.presetId ? presetMap.get(task.presetId) : undefined
    }));
  }, [tasks, presets]);

  const handleSubmitCreateIcp = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreateError(null);
      const commandName = icpCommandName.trim();
      if (!commandName) {
        setCreateError("Name your automation to continue.");
        return;
      }
      const prompt = icpPrompt.trim();
      if (!prompt) {
        setCreateError("Describe your ICP to continue.");
        return;
      }
      createIcpMutation.mutate({ prompt, commandName });
    },
    [icpPrompt, icpCommandName, createIcpMutation]
  );

  const handleSubmitCreateAccounts = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreateError(null);
      const name = accountsName.trim();
      if (!name) {
        setCreateError("Name your automation to continue.");
        return;
      }
      const urls = parseListInput(accountsInput);
      if (urls.length === 0) {
        setCreateError("Add at least one LinkedIn company URL.");
        return;
      }
      createAccountsMutation.mutate({
        accountUrls: urls,
        name,
        leadListName: accountsLeadList.trim() || undefined
      });
    },
    [accountsInput, accountsName, accountsLeadList, createAccountsMutation, parseListInput]
  );

  const handleSubmitCreatePosts = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreateError(null);
      const name = postsName.trim();
      if (!name) {
        setCreateError("Name your automation to continue.");
        return;
      }
      const urls = parseListInput(postsInput);
      if (urls.length === 0) {
        setCreateError("Add at least one LinkedIn post URL.");
        return;
      }
      if (!postsScrapeReactions && !postsScrapeCommenters) {
        setCreateError("Select at least one engagement type to scrape.");
        return;
      }
      createPostsMutation.mutate({
        postUrls: urls,
        scrapeReactions: postsScrapeReactions,
        scrapeCommenters: postsScrapeCommenters,
        name,
        leadListName: postsLeadList.trim() || undefined
      });
    },
    [
      postsInput,
      postsScrapeReactions,
      postsScrapeCommenters,
      postsName,
      postsLeadList,
      createPostsMutation,
      parseListInput
    ]
  );

  const handleSubmitCreateProfiles = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setCreateError(null);
      const urls = parseListInput(profilesInput);
      if (urls.length === 0) {
        setCreateError("Add at least one LinkedIn profile URL.");
        return;
      }
      createProfilesMutation.mutate({
        profileUrls: urls,
        name: profilesName.trim() || undefined,
        leadListName: profilesLeadList.trim() || undefined
      });
    },
    [profilesInput, profilesName, profilesLeadList, createProfilesMutation, parseListInput]
  );

  const isCreateLoading =
    createMode === "icp"
      ? createIcpMutation.isLoading
      : createMode === "accounts"
        ? createAccountsMutation.isLoading
        : createMode === "posts"
          ? createPostsMutation.isLoading
          : createMode === "profiles"
            ? createProfilesMutation.isLoading
            : false;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>Automation Jobs</h2>
            <p className="muted">Monitor and manage queued, running, and completed jobs.</p>
          </div>
          <div className="panel__header-actions">
            <div
              className="overflow-wrapper"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <button
                type="button"
                className="button"
                onClick={(event) => {
                  event.stopPropagation();
                  if (createMenuOpen) {
                    closeCreateMenu();
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setCreateMenuPosition({
                    top: rect.bottom + 8,
                    right: Math.max(window.innerWidth - rect.right, 8)
                  });
                  setCreateMenuOpen(true);
                }}
              >
                Add New
              </button>
            </div>
          </div>
        </div>
        {bannerMessage ? (
          <div className="alert alert--success">
            <span>{bannerMessage}</span>
            <button type="button" className="alert__dismiss" onClick={() => setBannerMessage(null)}>
              ×
            </button>
          </div>
        ) : null}
        <div className="table-wrapper">
          <table className="table automation-table">
            <thead>
              <tr>
                <th>Task</th>
                <th className="automation-table__details-heading">Details</th>
                <th>Status</th>
                <th>Scheduled</th>
                <th>Started</th>
                <th>Completed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {linkedTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="muted">
                    No automation jobs yet. Use “Add New” to draft your first automation.
                  </td>
                </tr>
              ) : (
                linkedTasks.map((task) => {
                  const taskType = resolveTaskType(task);
                  const isStartableTask =
                    taskType === "sales_navigator" ||
                    taskType === "account_followers" ||
                    taskType === "post_engagement" ||
                    taskType === "profile_scrape";
                  const taskName = task.name ?? task.preset?.name ?? "Untitled";
                  const detailText = getTaskDetailsText(task);
                  const typeLabel = getTaskTypeLabel(task);

                  return (
                    <tr key={task.id}>
                      <td>
                        <strong>{taskName}</strong>
                        <div className="muted">{typeLabel}</div>
                      </td>
                      <td className="automation-table__details">
                        <div className="muted automation-table__details-text">{detailText}</div>
                      </td>
                      <td>
                        <span className={`status-pill status-pill--${statusVariants[task.status]}`}>
                          {statusLabels[task.status]}
                        </span>
                        {task.errorMessage && (
                          <div className="muted">Error: {task.errorMessage}</div>
                        )}
                      </td>
                      <td>{formatDate(task.scheduledFor)}</td>
                      <td>{formatDate(task.startedAt)}</td>
                      <td>{formatDate(task.completedAt)}</td>
                      <td className="table-actions">
                        <div
                          className="action-buttons"
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        >
                          {isStartableTask ? (
                            task.status === "draft" ? (
                              <button
                                type="button"
                                className="button"
                                onClick={() => startTask.mutate(task.id)}
                                disabled={startInFlight === task.id && startTask.isLoading}
                              >
                                {startInFlight === task.id && startTask.isLoading
                                  ? "Starting..."
                                  : "Start"}
                              </button>
                            ) : task.status === "pending" ||
                              task.status === "queued" ||
                              task.status === "running" ? (
                              <button
                                type="button"
                                className="button button--danger"
                                onClick={() => pauseTask.mutate(task.id)}
                                disabled={pauseTask.isLoading}
                              >
                                {pauseTask.isLoading ? "Pausing..." : "Pause"}
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="button button--secondary"
                                onClick={() => startTask.mutate(task.id)}
                                disabled={startInFlight === task.id && startTask.isLoading}
                              >
                                {startInFlight === task.id && startTask.isLoading
                                  ? "Starting..."
                                  : "Re-run"}
                              </button>
                            )
                          ) : (
                            <button type="button" className="button button--secondary" disabled>
                              Review Only
                            </button>
                          )}
                          <div className="overflow-wrapper">
                            <button
                              type="button"
                              className="table-actions__menu-button"
                              aria-label="Task actions"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (menuTaskId === task.id) {
                                  closeMenu();
                                  return;
                                }
                                const rect = event.currentTarget.getBoundingClientRect();
                                setMenuTaskId(task.id);
                                setMenuPosition({
                                  top: rect.bottom + 8,
                                  right: Math.max(window.innerWidth - rect.right, 8)
                                });
                              }}
                            >
                              ⋯
                            </button>
                            {menuTaskId === task.id && menuPosition
                              ? createPortal(
                                  <div
                                    className="automation-menu"
                                    style={{ top: menuPosition.top, right: menuPosition.right }}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        closeMenu();
                                        const next = window.prompt(
                                          "Edit name",
                                          task.name ?? task.preset?.name ?? ""
                                        );
                                        if (next && next.trim()) {
                                          renameTask.mutate({ taskId: task.id, name: next.trim() });
                                        }
                                      }}
                                      disabled={renameTask.isLoading}
                                    >
                                      Rename
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        closeMenu();
                                        setEditingTask(task);
                                      }}
                                      disabled={updatePreset.isLoading || updateTask.isLoading}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        closeMenu();
                                        deleteTask.mutate(task.id);
                                      }}
                                      disabled={deleteTask.isLoading}
                                    >
                                      Delete
                                    </button>
                                  </div>,
                                  document.body
                                )
                              : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {createMenuOpen && createMenuPosition
        ? createPortal(
            <div
              className="automation-menu"
              style={{ top: createMenuPosition.top, right: createMenuPosition.right }}
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <button
                type="button"
                onClick={() => {
                  closeCreateMenu();
                  resetCreateState();
                  setCreateMode("icp");
                }}
              >
                Create by ICP
              </button>
              <button
                type="button"
                onClick={() => {
                  closeCreateMenu();
                  resetCreateState();
                  setCreateMode("accounts");
                }}
              >
                Create by Accounts
              </button>
              <button
                type="button"
                onClick={() => {
                  closeCreateMenu();
                  resetCreateState();
                  setCreateMode("posts");
                }}
              >
                Create by Posts
              </button>
              <button
                type="button"
                onClick={() => {
                  closeCreateMenu();
                  resetCreateState();
                  setCreateMode("profiles");
                }}
              >
                Create by Profiles
              </button>
            </div>,
            document.body
          )
        : null}

      {editingTask
        ? createPortal(
            <div
              className="modal-overlay"
              onClick={() => {
                if (!updatePreset.isLoading && !updateTask.isLoading) {
                  handleEditModalClose();
                }
              }}
            >
              <form
                className="modal modal--wide"
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onSubmit={
                  editingTask.type === "sales_navigator"
                    ? handleEditSubmit
                    : handleEditPayloadSubmit
                }
              >
                <header className="modal__header">
                  <h2>Edit {editingTask.name ?? "Task"}</h2>
                  <p className="muted">
                    {editingTask.type === "account_followers"
                      ? "Update account URLs and settings"
                      : editingTask.type === "post_engagement"
                        ? "Update post URLs and engagement settings"
                        : editingTask.type === "profile_scrape"
                          ? "Update profile URLs and settings"
                          : `Fine-tune keywords for ${editingTask.preset?.name ?? "this preset"}`}
                  </p>
                </header>
                <div className="modal__body">
                  {editError ? <p className="form-error">{editError}</p> : null}
                  {editingTask.type === "account_followers" ? (
                    <div className="input-group">
                      <label htmlFor="edit-accounts">Account URLs (one per line)</label>
                      <textarea
                        id="edit-accounts"
                        value={editAccountsInput}
                        onChange={(event) => setEditAccountsInput(event.target.value)}
                        rows={10}
                        placeholder="https://www.linkedin.com/company/example-one&#10;https://www.linkedin.com/company/example-two"
                      />
                      <small className="muted">Separate each company by a new line or comma.</small>
                      <div className="input-group" style={{ marginTop: "1rem" }}>
                        <label htmlFor="edit-accounts-leadlist">Target lead list (optional)</label>
                        <input
                          id="edit-accounts-leadlist"
                          value={editAccountsLeadList}
                          onChange={(event) => setEditAccountsLeadList(event.target.value)}
                          placeholder="e.g., My Lead List"
                        />
                      </div>
                    </div>
                  ) : editingTask.type === "post_engagement" ? (
                    <div>
                      <div className="input-group">
                        <label htmlFor="edit-posts">Post URLs (one per line)</label>
                        <textarea
                          id="edit-posts"
                          value={editPostsInput}
                          onChange={(event) => setEditPostsInput(event.target.value)}
                          rows={10}
                          placeholder="https://www.linkedin.com/posts/..."
                        />
                        <small className="muted">Separate each post by a new line or comma.</small>
                      </div>
                      <div className="input-group inline">
                        <label>Collect</label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={editPostsScrapeReactions}
                            onChange={(event) => setEditPostsScrapeReactions(event.target.checked)}
                          />
                          <span>Reactions</span>
                        </label>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={editPostsScrapeCommenters}
                            onChange={(event) => setEditPostsScrapeCommenters(event.target.checked)}
                          />
                          <span>Comments</span>
                        </label>
                      </div>
                      <div className="input-group">
                        <label htmlFor="edit-posts-leadlist">Target lead list (optional)</label>
                        <input
                          id="edit-posts-leadlist"
                          value={editPostsLeadList}
                          onChange={(event) => setEditPostsLeadList(event.target.value)}
                          placeholder="e.g., My Lead List"
                        />
                      </div>
                    </div>
                  ) : editingTask.type === "profile_scrape" ? (
                    <div className="input-group">
                      <label htmlFor="edit-profiles">Profile URLs (one per line)</label>
                      <textarea
                        id="edit-profiles"
                        value={editProfilesInput}
                        onChange={(event) => setEditProfilesInput(event.target.value)}
                        rows={10}
                        placeholder="https://www.linkedin.com/in/example-one&#10;https://www.linkedin.com/in/example-two"
                      />
                      <small className="muted">Separate each profile by a new line or comma.</small>
                      <div className="input-group" style={{ marginTop: "1rem" }}>
                        <label htmlFor="edit-profiles-leadlist">Target lead list (optional)</label>
                        <input
                          id="edit-profiles-leadlist"
                          value={editProfilesLeadList}
                          onChange={(event) => setEditProfilesLeadList(event.target.value)}
                          placeholder="e.g., My Lead List"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="modal__grid">
                      <section className="modal__section">
                        <h3>Prospecting &amp; Signals</h3>
                        <div className="input-group">
                          <label htmlFor="edit-keywords">Keywords (one per line)</label>
                          <textarea
                            id="edit-keywords"
                            value={editKeywords}
                            onChange={(event) => setEditKeywords(event.target.value)}
                            rows={6}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-excluded">Excluded keywords (one per line)</label>
                          <textarea
                            id="edit-excluded"
                            value={editExcluded}
                            onChange={(event) => setEditExcluded(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-posted">Posted in past days</label>
                          <input
                            id="edit-posted"
                            type="number"
                            min={1}
                            value={editPostedInPastDays}
                            onChange={(event) => setEditPostedInPastDays(event.target.value)}
                          />
                          <small className="muted">Leave blank to include all activity.</small>
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-changed-jobs">Changed jobs within days</label>
                          <input
                            id="edit-changed-jobs"
                            type="number"
                            min={1}
                            value={editChangedJobsWindow}
                            onChange={(event) => setEditChangedJobsWindow(event.target.value)}
                          />
                          <small className="muted">
                            Set to 90 to match Sales Navigator's default quick filter.
                          </small>
                        </div>
                        <div className="toggle-grid">
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editFollowingCompany}
                              onChange={(event) => setEditFollowingCompany(event.target.checked)}
                            />
                            <span>Following your company</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editSharedExperiences}
                              onChange={(event) => setEditSharedExperiences(event.target.checked)}
                            />
                            <span>Shared experiences</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editTeamLinkIntroductions}
                              onChange={(event) =>
                                setEditTeamLinkIntroductions(event.target.checked)
                              }
                            />
                            <span>TeamLink intro available</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editViewedProfile}
                              onChange={(event) => setEditViewedProfile(event.target.checked)}
                            />
                            <span>Viewed your profile</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editPastCustomer}
                              onChange={(event) => setEditPastCustomer(event.target.checked)}
                            />
                            <span>Past customer</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editPastColleague}
                              onChange={(event) => setEditPastColleague(event.target.checked)}
                            />
                            <span>Past colleague</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editBuyerIntent}
                              onChange={(event) => setEditBuyerIntent(event.target.checked)}
                            />
                            <span>High buyer intent</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editPeopleInCRM}
                              onChange={(event) => setEditPeopleInCRM(event.target.checked)}
                            />
                            <span>People in CRM</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editPeopleInteractedWith}
                              onChange={(event) =>
                                setEditPeopleInteractedWith(event.target.checked)
                              }
                            />
                            <span>People you interacted with</span>
                          </label>
                          <label className="toggle-option">
                            <input
                              type="checkbox"
                              checked={editSavedLeadsAndAccounts}
                              onChange={(event) =>
                                setEditSavedLeadsAndAccounts(event.target.checked)
                              }
                            />
                            <span>Saved leads &amp; accounts</span>
                          </label>
                        </div>
                      </section>
                      <section className="modal__section">
                        <h3>Account Filters</h3>
                        <div className="input-group">
                          <label htmlFor="edit-current-companies">
                            Current companies (one per line)
                          </label>
                          <textarea
                            id="edit-current-companies"
                            value={editCurrentCompanies}
                            onChange={(event) => setEditCurrentCompanies(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-past-companies">Past companies (one per line)</label>
                          <textarea
                            id="edit-past-companies"
                            value={editPastCompanies}
                            onChange={(event) => setEditPastCompanies(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-industries">Industries (one per line)</label>
                          <textarea
                            id="edit-industries"
                            value={editIndustries}
                            onChange={(event) => setEditIndustries(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-company-types">Company types (one per line)</label>
                          <textarea
                            id="edit-company-types"
                            value={editCompanyTypes}
                            onChange={(event) => setEditCompanyTypes(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-company-hq">
                            Company HQ locations (one per line)
                          </label>
                          <textarea
                            id="edit-company-hq"
                            value={editCompanyHeadquarters}
                            onChange={(event) => setEditCompanyHeadquarters(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-account-lists">Account lists (one per line)</label>
                          <textarea
                            id="edit-account-lists"
                            value={editAccountLists}
                            onChange={(event) => setEditAccountLists(event.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-lead-lists">Lead lists (one per line)</label>
                          <textarea
                            id="edit-lead-lists"
                            value={editLeadLists}
                            onChange={(event) => setEditLeadLists(event.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="input-group">
                          <label>Company size (employees)</label>
                          <div className="input-row">
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Min</span>
                              <input
                                type="number"
                                min={0}
                                value={editHeadcountMin}
                                onChange={(event) => setEditHeadcountMin(event.target.value)}
                              />
                            </div>
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Max</span>
                              <input
                                type="number"
                                min={0}
                                value={editHeadcountMax}
                                onChange={(event) => setEditHeadcountMax(event.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Company revenue (USD)</label>
                          <div className="input-row">
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Min</span>
                              <input
                                type="number"
                                min={0}
                                value={editRevenueMin}
                                onChange={(event) => setEditRevenueMin(event.target.value)}
                              />
                            </div>
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Max</span>
                              <input
                                type="number"
                                min={0}
                                value={editRevenueMax}
                                onChange={(event) => setEditRevenueMax(event.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                      <section className="modal__section">
                        <h3>Persona Filters</h3>
                        <div className="input-row">
                          <div className="input-subgroup">
                            <label htmlFor="edit-first-name">First name</label>
                            <input
                              id="edit-first-name"
                              value={editFirstName}
                              onChange={(event) => setEditFirstName(event.target.value)}
                            />
                          </div>
                          <div className="input-subgroup">
                            <label htmlFor="edit-last-name">Last name</label>
                            <input
                              id="edit-last-name"
                              value={editLastName}
                              onChange={(event) => setEditLastName(event.target.value)}
                            />
                          </div>
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-functions">
                            Functions / Departments (one per line)
                          </label>
                          <textarea
                            id="edit-functions"
                            value={editFunctions}
                            onChange={(event) => setEditFunctions(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-current-titles">
                            Current job titles (one per line)
                          </label>
                          <textarea
                            id="edit-current-titles"
                            value={editCurrentTitles}
                            onChange={(event) => setEditCurrentTitles(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-past-titles">Past job titles (one per line)</label>
                          <textarea
                            id="edit-past-titles"
                            value={editPastTitles}
                            onChange={(event) => setEditPastTitles(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-profile-languages">
                            Profile languages (one per line)
                          </label>
                          <textarea
                            id="edit-profile-languages"
                            value={editProfileLanguages}
                            onChange={(event) => setEditProfileLanguages(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-personas">Personas (one per line)</label>
                          <textarea
                            id="edit-personas"
                            value={editPersonas}
                            onChange={(event) => setEditPersonas(event.target.value)}
                            rows={3}
                          />
                        </div>
                        <fieldset className="input-fieldset">
                          <legend>Seniority levels</legend>
                          <div className="checkbox-list">
                            {SENIORITY_OPTIONS.map((option) => (
                              <label key={option.value} className="checkbox-pill">
                                <input
                                  type="checkbox"
                                  checked={editSeniorities.includes(option.value)}
                                  onChange={() => toggleSeniority(option.value)}
                                />
                                <span>{option.label}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <div className="input-group">
                          <label>Years in current company</label>
                          <div className="input-row">
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Min</span>
                              <input
                                type="number"
                                min={0}
                                value={editYearsAtCompanyMin}
                                onChange={(event) => setEditYearsAtCompanyMin(event.target.value)}
                              />
                            </div>
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Max</span>
                              <input
                                type="number"
                                min={0}
                                value={editYearsAtCompanyMax}
                                onChange={(event) => setEditYearsAtCompanyMax(event.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Years in current position</label>
                          <div className="input-row">
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Min</span>
                              <input
                                type="number"
                                min={0}
                                value={editYearsInRoleMin}
                                onChange={(event) => setEditYearsInRoleMin(event.target.value)}
                              />
                            </div>
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Max</span>
                              <input
                                type="number"
                                min={0}
                                value={editYearsInRoleMax}
                                onChange={(event) => setEditYearsInRoleMax(event.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="input-group">
                          <label>Total years of experience</label>
                          <div className="input-row">
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Min</span>
                              <input
                                type="number"
                                min={0}
                                value={editYearsExperienceMin}
                                onChange={(event) => setEditYearsExperienceMin(event.target.value)}
                              />
                            </div>
                            <div className="input-subgroup">
                              <span className="input-subgroup__label">Max</span>
                              <input
                                type="number"
                                min={0}
                                value={editYearsExperienceMax}
                                onChange={(event) => setEditYearsExperienceMax(event.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      </section>
                      <section className="modal__section">
                        <h3>Network &amp; Reach</h3>
                        <div className="input-group">
                          <label htmlFor="edit-geographies">Geographies (one per line)</label>
                          <textarea
                            id="edit-geographies"
                            value={editGeographies}
                            onChange={(event) => setEditGeographies(event.target.value)}
                            rows={4}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-relationship">Relationship</label>
                          <select
                            id="edit-relationship"
                            value={editRelationship}
                            onChange={(event) =>
                              setEditRelationship(
                                event.target.value as "" | "1" | "2" | "3" | "group" | "teamlink"
                              )
                            }
                          >
                            <option value="">All</option>
                            <option value="1">1st-degree connections</option>
                            <option value="2">2nd-degree connections</option>
                            <option value="3">3rd-degree &amp; more</option>
                            <option value="group">Shared LinkedIn groups</option>
                            <option value="teamlink">TeamLink introductions</option>
                          </select>
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-connections-of">Connections of (one per line)</label>
                          <textarea
                            id="edit-connections-of"
                            value={editConnectionsOf}
                            onChange={(event) => setEditConnectionsOf(event.target.value)}
                            rows={3}
                          />
                          <small className="muted">
                            Use teammate names to leverage TeamLink networks.
                          </small>
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-groups">Groups (one per line)</label>
                          <textarea
                            id="edit-groups"
                            value={editGroups}
                            onChange={(event) => setEditGroups(event.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-schools">Schools (one per line)</label>
                          <textarea
                            id="edit-schools"
                            value={editSchools}
                            onChange={(event) => setEditSchools(event.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="input-group">
                          <label htmlFor="edit-page-limit">Page limit</label>
                          <input
                            id="edit-page-limit"
                            type="number"
                            min={1}
                            value={editPageLimit}
                            onChange={(event) => setEditPageLimit(event.target.value)}
                          />
                          <small className="muted">
                            Controls how many pages of results the automation requests.
                          </small>
                        </div>
                      </section>
                    </div>
                  )}
                </div>
                <footer className="modal__footer">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={handleEditModalClose}
                    disabled={updatePreset.isLoading || updateTask.isLoading}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="button" disabled={updatePreset.isLoading}>
                    {updatePreset.isLoading ? "Saving..." : "Save Changes"}
                  </button>
                </footer>
              </form>
            </div>,
            document.body
          )
        : null}
      {createMode
        ? createPortal(
            (() => {
              let submitHandler: (event: FormEvent<HTMLFormElement>) => void;
              let title: string;
              let description: string;
              switch (createMode) {
                case "icp":
                  submitHandler = handleSubmitCreateIcp;
                  title = "Create Automation by ICP";
                  description =
                    "Use natural language to describe your ideal customer profile. We'll expand it into filters and create draft automations.";
                  break;
                case "accounts":
                  submitHandler = handleSubmitCreateAccounts;
                  title = "Create Automation from Accounts";
                  description =
                    "Paste the LinkedIn company URLs you care about. We'll prepare a draft follower scrape for review.";
                  break;
                case "posts":
                  submitHandler = handleSubmitCreatePosts;
                  title = "Create Automation from Posts";
                  description =
                    "Paste LinkedIn post URLs and choose which engagement to harvest. We'll prepare a draft task ready for review.";
                  break;
                case "profiles":
                  submitHandler = handleSubmitCreateProfiles;
                  title = "Create Automation from Profiles";
                  description =
                    "Paste LinkedIn profile URLs and we'll capture top-card, experience, and contact details into your lead list.";
                  break;
                default:
                  submitHandler = handleSubmitCreateIcp;
                  title = "Create Automation";
                  description = "Configure your automation parameters.";
              }

              return (
                <div
                  className="modal-overlay"
                  onClick={() => {
                    if (!isCreateLoading) {
                      handleCreateModalClose();
                    }
                  }}
                >
                  <form
                    className="modal modal--wide modal--create"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onSubmit={submitHandler}
                  >
                    <header className="modal__header">
                      <h2>{title}</h2>
                      <p className="muted">{description}</p>
                    </header>
                    <div className="modal__body modal__body--create">
                      {createError ? <p className="form-error">{createError}</p> : null}
                      {(() => {
                        if (createMode === "icp") {
                          return (
                            <div className="stack">
                              <div className="input-group">
                                <label htmlFor="icp-command-name">
                                  Automation name <span className="required-indicator">*</span>
                                </label>
                                <input
                                  id="icp-command-name"
                                  value={icpCommandName}
                                  onChange={(event) => setIcpCommandName(event.target.value)}
                                  placeholder="e.g., HR SaaS expansion"
                                  required
                                />
                              </div>
                              <div className="input-group">
                                <label htmlFor="icp-prompt">Describe your ICP</label>
                                <textarea
                                  id="icp-prompt"
                                  rows={6}
                                  value={icpPrompt}
                                  onChange={(event) => setIcpPrompt(event.target.value)}
                                  placeholder="Target mid-market HR leaders in SaaS companies across North America..."
                                />
                              </div>
                            </div>
                          );
                        }
                        if (createMode === "accounts") {
                          return (
                            <div className="stack">
                              <div className="input-group">
                                <label htmlFor="accounts-name">
                                  Automation name <span className="required-indicator">*</span>
                                </label>
                                <input
                                  id="accounts-name"
                                  value={accountsName}
                                  onChange={(event) => setAccountsName(event.target.value)}
                                  placeholder="e.g., Monitor competitor followers"
                                  required
                                />
                              </div>
                              <div className="input-group">
                                <label htmlFor="accounts-input">LinkedIn company URLs</label>
                                <textarea
                                  id="accounts-input"
                                  rows={6}
                                  value={accountsInput}
                                  onChange={(event) => setAccountsInput(event.target.value)}
                                  placeholder="https://www.linkedin.com/company/example-one\nhttps://www.linkedin.com/company/example-two"
                                />
                                <small className="muted">
                                  Separate each company by a new line or comma.
                                </small>
                              </div>
                              <div className="input-group">
                                <label htmlFor="accounts-leadlist">
                                  Target lead list (optional)
                                </label>
                                <input
                                  id="accounts-leadlist"
                                  value={accountsLeadList}
                                  onChange={(event) => setAccountsLeadList(event.target.value)}
                                  placeholder="Followers - Q4 campaign"
                                />
                              </div>
                            </div>
                          );
                        }
                        if (createMode === "posts") {
                          return (
                            <div className="stack">
                              <div className="input-group">
                                <label htmlFor="posts-name">
                                  Automation name <span className="required-indicator">*</span>
                                </label>
                                <input
                                  id="posts-name"
                                  value={postsName}
                                  onChange={(event) => setPostsName(event.target.value)}
                                  placeholder="e.g., Capture webinar commenters"
                                  required
                                />
                              </div>
                              <div className="input-group">
                                <label htmlFor="posts-input">LinkedIn post URLs</label>
                                <textarea
                                  id="posts-input"
                                  rows={6}
                                  value={postsInput}
                                  onChange={(event) => setPostsInput(event.target.value)}
                                  placeholder="https://www.linkedin.com/posts/..."
                                />
                                <small className="muted">
                                  Separate each post by a new line or comma.
                                </small>
                              </div>
                              <div className="input-group inline">
                                <label>Collect</label>
                                <label className="toggle-option">
                                  <input
                                    type="checkbox"
                                    checked={postsScrapeReactions}
                                    onChange={(event) =>
                                      setPostsScrapeReactions(event.target.checked)
                                    }
                                  />
                                  <span>Reactions</span>
                                </label>
                                <label className="toggle-option">
                                  <input
                                    type="checkbox"
                                    checked={postsScrapeCommenters}
                                    onChange={(event) =>
                                      setPostsScrapeCommenters(event.target.checked)
                                    }
                                  />
                                  <span>Comments</span>
                                </label>
                              </div>
                              <div className="input-group">
                                <label htmlFor="posts-leadlist">Target lead list (optional)</label>
                                <input
                                  id="posts-leadlist"
                                  value={postsLeadList}
                                  onChange={(event) => setPostsLeadList(event.target.value)}
                                  placeholder="Engagement - November launch"
                                />
                              </div>
                            </div>
                          );
                        }
                        if (createMode === "profiles") {
                          return (
                            <div className="stack">
                              <div className="input-group">
                                <label htmlFor="profiles-name">Task name (optional)</label>
                                <input
                                  id="profiles-name"
                                  value={profilesName}
                                  onChange={(event) => setProfilesName(event.target.value)}
                                  placeholder="e.g., Investor outreach list"
                                />
                              </div>
                              <div className="input-group">
                                <label htmlFor="profiles-input">LinkedIn profile URLs</label>
                                <textarea
                                  id="profiles-input"
                                  rows={6}
                                  value={profilesInput}
                                  onChange={(event) => setProfilesInput(event.target.value)}
                                  placeholder={`https://www.linkedin.com/in/example-one\nhttps://www.linkedin.com/in/example-two`}
                                />
                                <small className="muted">
                                  Separate each profile by a new line or comma.
                                </small>
                              </div>
                              <div className="input-group">
                                <label htmlFor="profiles-leadlist">
                                  Target lead list (optional)
                                </label>
                                <input
                                  id="profiles-leadlist"
                                  value={profilesLeadList}
                                  onChange={(event) => setProfilesLeadList(event.target.value)}
                                  placeholder="Profiles - Product Hunt launch"
                                />
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <footer className="modal__footer">
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={handleCreateModalClose}
                        disabled={isCreateLoading}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="button" disabled={isCreateLoading}>
                        {isCreateLoading ? "Creating..." : "Create Draft"}
                      </button>
                    </footer>
                  </form>
                </div>
              );
            })(),
            document.body
          )
        : null}
    </div>
  );
};
