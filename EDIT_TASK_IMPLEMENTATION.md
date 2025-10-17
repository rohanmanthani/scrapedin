# Edit Task Implementation

## Overview

This document describes the implementation of the Edit functionality for all task types in the LinkedIn Scraper automation dashboard. Previously, the Edit button only worked for ICP (Sales Navigator) tasks. This implementation extends edit functionality to Account Scraping, Post Scraping, and Profile Scraping tasks.

## Problem

The Edit button in the automations page overflow menu was only functional for ICP tasks that had a preset. Account scraping, post scraping, and profile scraping tasks used a different data structure (payload-based) and had no edit functionality.

## Solution Architecture

### Backend Changes

**File: `backend/src/routes/taskRoutes.ts`**

Updated the `PATCH /:taskId` endpoint to accept `payload` updates:

```typescript
router.patch("/:taskId", asyncHandler(async (req, res) => {
  const { name, status, scheduledFor, payload } = req.body ?? {};
  // ... existing logic for status updates
  // NEW: Added payload support
  if (payload && typeof payload === "object") {
    updates.payload = payload;
  }
  // ... rest of implementation
}));
```

The backend already had an `update()` method in `SearchTaskService` that could handle any field updates, so no service layer changes were needed.

### Frontend Changes

**File: `frontend/src/components/automation/AutomationDashboard.tsx`**

#### 1. Added Edit State Variables

Added state variables for editing payload-based tasks:

```typescript
// Edit state for payload-based tasks
const [editAccountsInput, setEditAccountsInput] = useState("");
const [editAccountsLeadList, setEditAccountsLeadList] = useState("");
const [editPostsInput, setEditPostsInput] = useState("");
const [editPostsLeadList, setEditPostsLeadList] = useState("");
const [editPostsScrapeReactions, setEditPostsScrapeReactions] = useState(true);
const [editPostsScrapeCommenters, setEditPostsScrapeCommenters] = useState(true);
const [editProfilesInput, setEditProfilesInput] = useState("");
const [editProfilesLeadList, setEditProfilesLeadList] = useState("");
```

#### 2. Made Edit Button Visible for All Tasks

Removed the conditional that hid the Edit button for non-preset tasks:

```typescript
// Before:
{task.preset ? (
  <button type="button" onClick={() => { ... }}>Edit</button>
) : null}

// After:
<button type="button" onClick={() => { ... }}>Edit</button>
```

#### 3. Added Task Update Mutation

Created a new mutation for updating tasks:

```typescript
const updateTask = useMutation({
  mutationFn: async ({ taskId, payload }: { 
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
```

#### 4. Initialize Edit State on Task Selection

Added a useEffect hook to populate edit fields when a task is selected:

```typescript
useEffect(() => {
  if (!editingTask) return;

  // Initialize for account_followers tasks
  if (editingTask.type === "account_followers" && editingTask.payload) {
    const urls = editingTask.payload.accountUrls ?? [];
    setEditAccountsInput(urls.join("\n"));
    setEditAccountsLeadList(editingTask.payload.targetLeadListName ?? "");
    return;
  }

  // Similar logic for post_engagement and profile_scrape
  // ...
}, [editingTask]);
```

#### 5. Conditional Modal Rendering

Updated the edit modal to show different forms based on task type:

```typescript
<form onSubmit={
  editingTask.type === "sales_navigator"
    ? handleEditSubmit
    : handleEditPayloadSubmit
}>
  {editingTask.type === "account_followers" ? (
    // Account URLs editor
  ) : editingTask.type === "post_engagement" ? (
    // Post URLs and engagement settings editor
  ) : editingTask.type === "profile_scrape" ? (
    // Profile URLs editor
  ) : (
    // ICP/Sales Navigator filters editor
  )}
</form>
```

#### 6. Payload Submit Handler

Created `handleEditPayloadSubmit` to handle updates for payload-based tasks:

```typescript
const handleEditPayloadSubmit = useCallback(
  async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTask) return;

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
      }
      // Similar logic for post_engagement and profile_scrape
    } catch (error) {
      setEditError(error instanceof Error ? error.message : "Failed to update task");
    }
  },
  [editingTask, editAccountsInput, ...]
);
```

## Task Types and Editable Fields

### Account Followers Tasks (`account_followers`)

**Editable Fields:**
- Account URLs (one per line or comma-separated)
- Target lead list name (optional)

**Validation:**
- At least one account URL is required

### Post Engagement Tasks (`post_engagement`)

**Editable Fields:**
- Post URLs (one per line or comma-separated)
- Scrape reactions (checkbox)
- Scrape commenters (checkbox)
- Target lead list name (optional)

**Validation:**
- At least one post URL is required
- At least one engagement type (reactions or comments) must be selected

### Profile Scrape Tasks (`profile_scrape`)

**Editable Fields:**
- Profile URLs (one per line or comma-separated)
- Target lead list name (optional)

**Validation:**
- At least one profile URL is required

### ICP/Sales Navigator Tasks (`sales_navigator`)

**Editable Fields:**
- All existing preset filters (keywords, industries, seniorities, etc.)
- Page limit

This uses the existing `handleEditSubmit` function and updates the associated preset.

## User Experience Flow

1. User clicks the ⋯ menu button on any task row
2. Dropdown menu appears with options: Rename, **Edit**, Delete
3. User clicks **Edit**
4. Modal opens with appropriate form based on task type:
   - **Account tasks**: Shows textarea for account URLs and lead list name field
   - **Post tasks**: Shows textarea for post URLs, engagement checkboxes, and lead list name
   - **Profile tasks**: Shows textarea for profile URLs and lead list name
   - **ICP tasks**: Shows comprehensive preset filter form
5. User makes changes and clicks "Save Changes"
6. Modal closes and success message appears: "Task updated successfully"
7. Task list refreshes with updated data

## Error Handling

The implementation includes validation for:
- Empty URL lists (shows error: "Please provide at least one [type] URL")
- No engagement types selected for posts (shows error: "Please select at least one engagement type to scrape")
- API errors (shows error message from server)

Errors are displayed at the top of the modal and prevent form submission until resolved.

## Technical Details

### State Management

- Used React Query for API mutations and cache invalidation
- Local state for form inputs using React useState
- Automatic cache refresh after successful update via `invalidateQueries`

### Type Safety

- All mutations properly typed with TypeScript
- Payload type defined as `Record<string, unknown>` for flexibility
- Task types discriminated using `task.type` field

### Dependencies

The implementation properly manages React Hook dependencies to avoid stale closures:
- `editingTask` included in all relevant useEffect and useCallback hooks
- Derived values (like `editingPreset`) computed inside callbacks rather than at module level

## Testing Recommendations

To test the edit functionality:

1. **Account Tasks:**
   - Create an account task with 2-3 company URLs
   - Click Edit and add/remove URLs
   - Verify changes are saved and reflected in task details

2. **Post Tasks:**
   - Create a post task with reactions and comments enabled
   - Click Edit and toggle engagement options
   - Add/remove post URLs
   - Verify changes persist

3. **Profile Tasks:**
   - Create a profile task with several profile URLs
   - Click Edit and modify the list
   - Verify URLs are correctly parsed (newline or comma separated)

4. **ICP Tasks:**
   - Ensure existing edit functionality still works
   - Verify preset filters are properly updated

5. **Edge Cases:**
   - Test with empty URL lists (should show error)
   - Test with invalid URLs (should still save, backend validates)
   - Test with very long URL lists (scroll behavior)

## Files Modified

### Backend
- `backend/src/routes/taskRoutes.ts` - Added payload update support

### Frontend
- `frontend/src/components/automation/AutomationDashboard.tsx` - Main implementation file
  - Added edit state variables
  - Removed Edit button conditional
  - Added updateTask mutation
  - Added edit state initialization
  - Updated modal rendering
  - Added handleEditPayloadSubmit function

## API Contract

### PATCH /tasks/:taskId

**Request Body:**
```json
{
  "name": "string (optional)",
  "status": "TaskStatus (optional)",
  "scheduledFor": "string ISO date (optional)",
  "payload": {
    "accountUrls": ["string"],  // for account_followers
    "postUrls": ["string"],      // for post_engagement
    "scrapeReactions": boolean,  // for post_engagement
    "scrapeCommenters": boolean, // for post_engagement
    "profileUrls": ["string"],   // for profile_scrape
    "targetLeadListName": "string (optional)"
  }
}
```

**Response:**
```json
{
  "id": "string",
  "type": "TaskType",
  "status": "TaskStatus",
  "payload": { /* updated payload */ },
  // ... other task fields
}
```

## Future Enhancements

Potential improvements for the edit functionality:

1. **Bulk URL Import**: Add file upload for importing large lists of URLs
2. **URL Validation**: Real-time validation of LinkedIn URL format
3. **Preview Mode**: Show preview of what will be scraped before saving
4. **History Tracking**: Track changes made to tasks over time
5. **Duplicate Detection**: Warn about duplicate URLs in the same task
6. **URL Extraction**: Parse URLs from text blocks automatically

## Conclusion

The edit functionality is now fully implemented for all task types. Users can modify Account Scraping, Post Scraping, and Profile Scraping tasks just as easily as ICP tasks. The implementation follows existing patterns in the codebase and maintains type safety throughout.