# AI Routebook Assistant Design

## Goal

Make AI feel like part of the routebook editing workflow instead of a separate AI tab. The first version focuses on itinerary editing only. It adds a floating global AI chat plus contextual AI actions on itinerary cards, and every AI result must become a reviewable visual diff before it can change the trip.

## Scope

In scope for the first implementation:

- A right-bottom floating AI assistant window in the web routebook editor.
- Contextual AI entry points on itinerary day and itinerary item cards.
- Prompt-driven itinerary changes for the current trip.
- A visual before/after preview for AI-generated itinerary changes.
- Per-change selection so the user can choose which changes to apply.
- Applying selected changes to the local draft only; the existing Save button remains responsible for persistence.

Out of scope for the first implementation:

- AI editing for places, bookings, files, packing, budget, and weather modules.
- Multi-user collaboration semantics.
- Streaming responses.
- Fully natural-language undo history beyond the existing unsaved draft state.
- Automatic cloud save after applying AI changes.

## User Experience

The user can open a floating AI assistant from the lower-right corner of the editor. The assistant accepts prompts such as:

- "把第 2 天改轻松一点"
- "加入雨天备用方案"
- "把整体改成亲子友好"
- "第 1 天少走路，多安排咖啡店"

Itinerary cards also expose a small AI action. Those local actions seed the global assistant with context, such as the selected day or selected itinerary item, but the resulting workflow is the same: generate preview first, then let the user confirm selected changes.

The AI never silently mutates the trip. After generation, the user sees a comparison:

- Current itinerary on the left.
- AI proposed itinerary on the right.
- A change summary grouped by day.
- Checkboxes for each atomic change.
- "Apply selected" and "Discard" actions.

Applying changes updates the current in-memory draft and marks it unsaved. The user still clicks Save to persist.

## Change Model

The first version should use structured itinerary patch operations rather than returning a full replacement draft as the primary contract.

Supported operations:

- `add_item`: add an itinerary item to a day.
- `update_item`: update item fields such as title, time, location, reason, notes, type, and coordinates.
- `delete_item`: remove an itinerary item.
- `move_item`: move an item to another day or reorder it within the same day.
- `update_day`: update a day title or date when explicitly requested.

Each operation includes:

- A stable client-side operation id.
- A human-readable summary in Chinese.
- The target day id or date.
- The target item id when applicable.
- Before data when applicable.
- After data when applicable.
- A confidence or warning string when AI inferred missing details.

The preview UI renders these operations as visual differences. The apply step filters to checked operation ids and applies only those operations.

## API Design

Add a new endpoint:

`POST /api/ai/patch`

Request shape:

```json
{
  "trip": {
    "id": "trip_x",
    "title": "京都春日路书",
    "destination": "京都，日本",
    "startDate": "2026-04-01",
    "endDate": "2026-04-03",
    "timezone": "Asia/Tokyo",
    "days": []
  },
  "prompt": "把第 2 天改轻松一点",
  "context": {
    "scope": "trip",
    "dayId": "day_2",
    "itemId": null
  }
}
```

Response shape:

```json
{
  "proposal": {
    "id": "proposal_x",
    "summary": "调整第 2 天节奏，减少移动距离并新增咖啡休息。",
    "operations": []
  },
  "provider": "cloudflare-workers-ai",
  "model": "@cf/..."
}
```

The server validates AI output against a strict schema before returning it. If the model cannot produce valid patch operations, the endpoint returns a typed error instead of a partial mutation.

## Frontend Components

Recommended component boundaries:

- `AiAssistantLauncher`: floating lower-right entry button.
- `AiAssistantPanel`: prompt input, conversation messages, generation state, and quick prompt chips.
- `AiContextAction`: local entry point for day cards and itinerary item cards.
- `AiPatchPreview`: before/after comparison shell.
- `AiPatchOperationList`: selectable atomic change list.
- `applyItineraryPatchOperations`: pure helper that applies selected operations to a `TripDraft`.

`RoutebookEditor` should own the draft state and pass focused context into these components. The patch apply helper should be covered by unit tests because it becomes the safety boundary between AI output and user data.

## Error Handling

The UI should handle these states explicitly:

- User is not signed in: show that AI requires login.
- Workers AI is not configured: show an operational error.
- Prompt is empty: keep the submit disabled.
- AI response fails schema validation: show a failure message and keep the current draft unchanged.
- Patch operation target cannot be found: show that specific operation as unavailable and unchecked.
- Network failure: keep the prompt and let the user retry.

No error state should modify the current trip.

## Testing

Unit tests:

- Build patch operations from fixture data.
- Apply selected operations only.
- Skip or reject operations whose targets no longer exist.
- Preserve unchanged days and items by reference where practical.

API tests:

- Reject unauthenticated requests.
- Reject empty prompts.
- Validate AI output schema.
- Return structured patch proposals.

Frontend verification:

- Floating panel opens and closes without changing active editor module.
- Local card AI action pre-fills scoped context.
- Preview renders before/after differences.
- Unchecked operations are not applied.
- Applying selected operations marks the draft dirty but does not auto-save.

## Implementation Notes

The existing `/api/ai/plan` and `/api/ai/import` endpoints can remain for draft generation and import workflows. The new `/api/ai/patch` endpoint should not replace them immediately. The current AI tab can later be deprecated or transformed into the same assistant panel, but the first version can keep it while adding the new assistant workflow.

The floating panel should be visually light and avoid covering the main card content by default. On mobile, it should open as a bottom sheet.
