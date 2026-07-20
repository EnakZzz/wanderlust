"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  Clock,
  FolderOpen,
  Map as MapIcon,
  MapPin,
  Navigation,
  Paperclip,
  Plus,
  Save,
  Sparkles,
  Ticket,
  Trash2,
  Type
} from "lucide-react";
import { createTripDays, removeItineraryItem, sortItineraryItems, updateItineraryItem, type ItineraryItem, type TripDay } from "@wanderlust/domain";

type TripDraft = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  status: "draft" | "active" | "archived";
  days: TripDay[];
  places: PlaceDraft[];
  tickets: TicketDraft[];
  checklist: ChecklistDraft[];
};

type SessionUser = {
  id: string;
  provider: "google" | "apple";
  email?: string;
  name?: string;
  avatarUrl?: string;
};

type TripSummary = {
  id: string;
  title: string;
  destination: string;
  status: "draft" | "active" | "archived";
  startDate?: string;
  endDate?: string;
  updatedAt: string;
};

type EditorModule = "itinerary" | "places" | "map" | "tickets" | "checklist";

type PlaceDraft = {
  id: string;
  name: string;
  category: string;
  area: string;
  note: string;
};

type TicketDraft = {
  id: string;
  title: string;
  reference: string;
  status: string;
};

type ChecklistDraft = {
  id: string;
  title: string;
  done: boolean;
};

const storageKey = "wanderlust.editorDraft.v1";

const initialDays = createTripDays("trip_kyoto", "2026-10-12", "2026-10-16").map((day) => ({
  ...day,
  title: day.sortOrder === 1 ? "Southern & Western Kyoto" : day.title,
  items:
    day.sortOrder === 1
      ? sortItineraryItems([
          {
            id: "fushimi",
            dayId: day.id,
            type: "place",
            title: "Fushimi Inari before the crowds",
            startTime: "08:00",
            sortOrder: 0,
            notes: "Walk the lower gates, then stop for coffee near the station."
          },
          {
            id: "arashiyama",
            dayId: day.id,
            type: "activity",
            title: "Arashiyama bamboo grove",
            startTime: "14:00",
            sortOrder: 1,
            notes: "Keep the Tenryu-ji ticket PDF offline."
          },
          {
            id: "rain-note",
            dayId: day.id,
            type: "note",
            title: "Pack a compact umbrella",
            sortOrder: 3
          }
        ])
      : []
}));

const initialDraft: TripDraft = {
  id: "local_kyoto",
  title: "Kyoto Autumn Routebook",
  destination: "Kyoto, Japan",
  startDate: "2026-10-12",
  endDate: "2026-10-16",
  status: "draft",
  days: initialDays,
  places: [
    { id: "place_fushimi", name: "Fushimi Inari Taisha", category: "Culture", area: "Southern Kyoto", note: "Go early and save the station exit note." },
    { id: "place_arashiyama", name: "Arashiyama bamboo grove", category: "Nature", area: "Western Kyoto", note: "Pair with Tenryu-ji ticket." }
  ],
  tickets: [
    { id: "ticket_jr", title: "JR pass PDF", reference: "Cached in offline files", status: "Ready" },
    { id: "ticket_tenryuji", title: "Tenryu-ji entry", reference: "Booking confirmation", status: "Needs check" }
  ],
  checklist: [
    { id: "check_passport", title: "Passport and visa screenshots", done: true },
    { id: "check_umbrella", title: "Compact umbrella", done: false },
    { id: "check_esim", title: "Install eSIM before departure", done: false }
  ]
};

const modules = [
  { id: "itinerary", icon: CalendarDays, title: "Itinerary", copy: "Edit days, time blocks, bookings, and notes." },
  { id: "places", icon: MapPin, title: "Places", copy: "Keep map locations and context in the same routebook." },
  { id: "map", icon: MapIcon, title: "Map", copy: "Preview the route spatially before exporting to mobile." },
  { id: "tickets", icon: Ticket, title: "Tickets", copy: "Attach PDFs and images to hotels, flights, restaurants, museums, and trains." },
  { id: "checklist", icon: CheckSquare, title: "Checklist", copy: "Track packing and paperwork before departure." }
] satisfies Array<{ id: EditorModule; icon: typeof CalendarDays; title: string; copy: string }>;

const moduleTitles: Record<EditorModule, string> = {
  itinerary: "Itinerary builder",
  places: "Place library",
  map: "Planning map",
  tickets: "Tickets and bookings",
  checklist: "Departure checklist"
};

const moduleCopy: Record<EditorModule, string> = {
  itinerary: "Build the day-by-day routebook that the phone app will use offline.",
  places: "Keep places, neighborhoods, categories, and on-site notes in one editable list.",
  map: "Review how the route clusters spatially before you use mobile navigation.",
  tickets: "Track confirmations and files that need to be available during travel.",
  checklist: "Finish paperwork, packing, connectivity, and departure tasks."
};

function hydrateDraft(input: Partial<TripDraft>): TripDraft {
  return {
    ...initialDraft,
    ...input,
    days: input.days?.length ? input.days : initialDraft.days,
    places: input.places ?? initialDraft.places,
    tickets: input.tickets ?? initialDraft.tickets,
    checklist: input.checklist ?? initialDraft.checklist
  };
}

function createDraftId(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

function createBlankTripDraft(): TripDraft {
  const id = `trip_${crypto.randomUUID()}`;
  const days = createTripDays(id, "2026-10-12", "2026-10-14");
  return {
    id,
    title: "New routebook",
    destination: "New destination",
    startDate: "2026-10-12",
    endDate: "2026-10-14",
    status: "draft",
    days,
    places: [],
    tickets: [],
    checklist: [{ id: createDraftId("check"), title: "Confirm passport and entry requirements", done: false }]
  };
}

function rehomeTripDraft(draft: TripDraft): TripDraft {
  const id = `trip_${crypto.randomUUID()}`;
  const dayIds = new Map(draft.days.map((day) => [day.id, `${id}-${day.date}`]));
  return {
    ...draft,
    id,
    days: draft.days.map((day) => {
      const nextDayId = dayIds.get(day.id) ?? `${id}-${day.date}`;
      return {
        ...day,
        id: nextDayId,
        tripId: id,
        items: day.items.map((item) => ({
          ...item,
          dayId: dayIds.get(item.dayId) ?? nextDayId
        }))
      };
    })
  };
}

function readLocalDraft(): TripDraft {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) {
    return initialDraft;
  }

  try {
    return hydrateDraft(JSON.parse(saved) as Partial<TripDraft>);
  } catch {
    window.localStorage.removeItem(storageKey);
    return initialDraft;
  }
}

export function RoutebookEditor() {
  const [draft, setDraft] = useState<TripDraft>(initialDraft);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [selectedDayId, setSelectedDayId] = useState(initialDraft.days[1]!.id);
  const [activeModule, setActiveModule] = useState<EditorModule>("itinerary");
  const [isSaved, setIsSaved] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountTrips() {
      const sessionResponse = await fetch("/auth/session", { credentials: "include" });
      const session = (await sessionResponse.json()) as { user?: SessionUser | null };
      if (!session.user) {
        return;
      }

      const tripsResponse = await fetch("/api/trips", { credentials: "include" });
      if (!tripsResponse.ok) {
        throw new Error("Could not load account trips");
      }

      const tripsPayload = (await tripsResponse.json()) as { trips: TripSummary[] };
      if (cancelled) {
        return;
      }

      setUser(session.user);
      setIsSyncing(true);
      if (tripsPayload.trips[0]) {
        setTrips(tripsPayload.trips);
        await loadTrip(tripsPayload.trips[0].id);
        setIsSyncing(false);
        return;
      }

      const importedDraft = rehomeTripDraft(readLocalDraft());
      const createResponse = await fetch("/api/trips", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(importedDraft)
      });
      if (!createResponse.ok) {
        throw new Error("Could not create first account trip");
      }
      const createPayload = (await createResponse.json()) as { trip: TripDraft };
      const createdTrip = hydrateDraft(createPayload.trip);
      setDraft(createdTrip);
      setSelectedDayId(createdTrip.days[0]?.id ?? initialDraft.days[0]!.id);
      setTrips([
        {
          id: createdTrip.id,
          title: createdTrip.title,
          destination: createdTrip.destination,
          status: createdTrip.status,
          startDate: createdTrip.startDate,
          endDate: createdTrip.endDate,
          updatedAt: new Date().toISOString()
        }
      ]);
      setIsSaved(true);
      setIsSyncing(false);
    }

    loadAccountTrips().catch((error) => {
      if (!cancelled) {
        setIsSyncing(false);
        setSyncError(error instanceof Error ? error.message : "Could not load account trips");
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user) {
      return;
    }

    const parsed = readLocalDraft();
    if (parsed.days?.length) {
      setDraft(parsed);
      setSelectedDayId(parsed.days[0]!.id);
    }
  }, [user]);

  const selectedDay = useMemo(
    () => draft.days.find((day) => day.id === selectedDayId) ?? draft.days[0]!,
    [draft.days, selectedDayId]
  );

  const isAccountTripPersisted = Boolean(user && trips.some((trip) => trip.id === draft.id));
  const itemCount = draft.days.reduce((count, day) => count + day.items.length, 0);
  const doneCount = draft.checklist.filter((item) => item.done).length;

  function updateSelectedDay(patch: Partial<Pick<TripDay, "title" | "date">>) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) => (day.id === selectedDay.id ? { ...day, ...patch } : day))
    }));
    setIsSaved(false);
  }

  function updateItem(itemId: string, patch: Partial<Omit<ItineraryItem, "id" | "dayId">>) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === selectedDay.id ? { ...day, items: updateItineraryItem(day.items, itemId, patch) } : day
      )
    }));
    setIsSaved(false);
  }

  function addItem() {
    const nextItem: ItineraryItem = {
      id: `item_${Date.now()}`,
      dayId: selectedDay.id,
      type: "activity",
      title: "New plan item",
      startTime: "09:00",
      notes: "",
      sortOrder: selectedDay.items.length
    };

    setDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === selectedDay.id ? { ...day, items: sortItineraryItems([...day.items, nextItem]) } : day
      )
    }));
    setIsSaved(false);
  }

  function deleteItem(itemId: string) {
    setDraft((current) => ({
      ...current,
      days: current.days.map((day) =>
        day.id === selectedDay.id ? { ...day, items: removeItineraryItem(day.items, itemId) } : day
      )
    }));
    setIsSaved(false);
  }

  async function refreshTrips() {
    if (!user) {
      return;
    }

    const response = await fetch("/api/trips", { credentials: "include" });
    if (!response.ok) {
      throw new Error("Could not refresh trips");
    }
    const payload = (await response.json()) as { trips: TripSummary[] };
    setTrips(payload.trips);
  }

  async function loadTrip(tripId: string) {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Could not open trip");
      }
      const payload = (await response.json()) as { trip: TripDraft };
      const hydrated = hydrateDraft(payload.trip);
      setDraft(hydrated);
      setSelectedDayId(hydrated.days[0]?.id ?? initialDraft.days[0]!.id);
      setIsSaved(true);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not open trip");
    } finally {
      setIsSyncing(false);
    }
  }

  async function createSyncedTrip() {
    const nextDraft = createBlankTripDraft();
    setDraft(nextDraft);
    setSelectedDayId(nextDraft.days[0]!.id);
    setIsSaved(false);

    if (!user) {
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextDraft)
      });
      if (!response.ok) {
        throw new Error("Could not create trip");
      }
      const payload = (await response.json()) as { trip: TripDraft };
      const hydrated = hydrateDraft(payload.trip);
      setDraft(hydrated);
      setSelectedDayId(hydrated.days[0]!.id);
      setIsSaved(true);
      await refreshTrips();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not create trip");
    } finally {
      setIsSyncing(false);
    }
  }

  async function saveDraft() {
    setSyncError(null);
    if (!user) {
      window.localStorage.setItem(storageKey, JSON.stringify(draft));
      setIsSaved(true);
      return;
    }

    setIsSyncing(true);
    try {
      const isExistingTrip = trips.some((trip) => trip.id === draft.id);
      const draftToSave = isExistingTrip || !draft.id.startsWith("local_") ? draft : rehomeTripDraft(draft);
      const response = await fetch(isExistingTrip ? `/api/trips/${encodeURIComponent(draft.id)}` : "/api/trips", {
        method: isExistingTrip ? "PUT" : "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftToSave)
      });
      if (!response.ok) {
        throw new Error("Could not save trip");
      }
      const payload = (await response.json()) as { trip: TripDraft };
      const hydrated = hydrateDraft(payload.trip);
      setDraft(hydrated);
      setSelectedDayId(hydrated.days[0]?.id ?? initialDraft.days[0]!.id);
      setIsSaved(true);
      await refreshTrips();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not save trip");
    } finally {
      setIsSyncing(false);
    }
  }

  function updatePlace(placeId: string, patch: Partial<PlaceDraft>) {
    setDraft((current) => ({
      ...current,
      places: current.places.map((place) => (place.id === placeId ? { ...place, ...patch } : place))
    }));
    setIsSaved(false);
  }

  function addPlace() {
    setDraft((current) => ({
      ...current,
      places: [
        ...current.places,
        { id: createDraftId("place"), name: "New saved place", category: "Other", area: current.destination, note: "" }
      ]
    }));
    setIsSaved(false);
  }

  function updateTicket(ticketId: string, patch: Partial<TicketDraft>) {
    setDraft((current) => ({
      ...current,
      tickets: current.tickets.map((ticket) => (ticket.id === ticketId ? { ...ticket, ...patch } : ticket))
    }));
    setIsSaved(false);
  }

  function addTicket() {
    setDraft((current) => ({
      ...current,
      tickets: [...current.tickets, { id: createDraftId("ticket"), title: "New ticket", reference: "Add confirmation details", status: "Needs check" }]
    }));
    setIsSaved(false);
  }

  function updateChecklistItem(itemId: string, patch: Partial<ChecklistDraft>) {
    setDraft((current) => ({
      ...current,
      checklist: current.checklist.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
    }));
    setIsSaved(false);
  }

  function addChecklistItem() {
    setDraft((current) => ({
      ...current,
      checklist: [...current.checklist, { id: createDraftId("check"), title: "New checklist item", done: false }]
    }));
    setIsSaved(false);
  }

  return (
    <section id="editor" className="workspace">
      <aside className="rail" aria-label="Trip sections">
        {modules.map((module) => (
          <button
            key={module.title}
            className={activeModule === module.id ? "rail-item active" : "rail-item"}
            type="button"
            title={module.copy}
            aria-pressed={activeModule === module.id}
            onClick={() => setActiveModule(module.id)}
          >
            <module.icon size={18} />
            <span>{module.title}</span>
          </button>
        ))}
      </aside>

      <div className="panel itinerary-panel">
        <div className="trip-library">
          <div>
            <p className="eyebrow">{user ? "Account trips" : "Local draft"}</p>
            <h2>{user ? "Your routebooks" : "Sign in to sync trips"}</h2>
          </div>
          <button className="new-trip-button" type="button" onClick={createSyncedTrip}>
            <FolderOpen size={18} />
            <span>New trip</span>
          </button>
          {user ? (
            <div className="trip-card-grid">
              {trips.map((trip) => (
                <button
                  key={trip.id}
                  className={trip.id === draft.id ? "trip-card active" : "trip-card"}
                  type="button"
                  onClick={() => loadTrip(trip.id)}
                >
                  <strong>{trip.title}</strong>
                  <span>{trip.destination}</span>
                  <small>{trip.startDate && trip.endDate ? `${trip.startDate} - ${trip.endDate}` : trip.status}</small>
                </button>
              ))}
              {trips.length === 0 ? <div className="empty-trip-card">{isSyncing ? "Creating your first synced trip..." : "No synced trips yet."}</div> : null}
            </div>
          ) : (
            <div className="local-trip-note">Google 登录后，这里会显示当前账号自己的旅行列表；保存会写入 Cloudflare D1。</div>
          )}
        </div>

        <div className="panel-heading editor-heading">
          <div className="title-fields">
            <label>
              <span>Routebook</span>
              <input
                aria-label="Routebook title"
                value={draft.title}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, title: event.target.value }));
                  setIsSaved(false);
                }}
              />
            </label>
            <label>
              <span>Destination</span>
              <input
                aria-label="Destination"
                value={draft.destination}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, destination: event.target.value }));
                  setIsSaved(false);
                }}
              />
            </label>
          </div>
          <button className="save-button" type="button" onClick={saveDraft} title="Save local draft">
            <Save size={18} />
            <span>{isSyncing ? "Saving" : isSaved ? "Saved" : "Save"}</span>
          </button>
        </div>
        {syncError ? <div className="sync-error">{syncError}</div> : null}

        <div className="module-heading">
          <p>{moduleTitles[activeModule]}</p>
          <span>{moduleCopy[activeModule]}</span>
        </div>

        {activeModule === "itinerary" ? (
          <>
            <div className="day-strip" aria-label="Trip days">
              {draft.days.map((day) => (
                <button
                  key={day.id}
                  className={day.id === selectedDay.id ? "day-tab active" : "day-tab"}
                  type="button"
                  onClick={() => setSelectedDayId(day.id)}
                >
                  <strong>{day.title}</strong>
                  <span>{day.date}</span>
                </button>
              ))}
            </div>

            <div className="day-editor">
              <label>
                <span>Day title</span>
                <input value={selectedDay.title} onChange={(event) => updateSelectedDay({ title: event.target.value })} />
              </label>
              <label>
                <span>Date</span>
                <input type="date" value={selectedDay.date} onChange={(event) => updateSelectedDay({ date: event.target.value })} />
              </label>
            </div>

            <div className="timeline editor-timeline">
              {selectedDay.items.map((item) => (
                <article key={item.id} className="timeline-item editable-item">
                  <label className="time-field">
                    <Clock size={16} />
                    <input
                      aria-label={`${item.title} start time`}
                      type="time"
                      value={item.startTime ?? ""}
                      onChange={(event) => updateItem(item.id, { startTime: event.target.value || undefined })}
                    />
                  </label>
                  <div className="item-fields">
                    <label>
                      <Type size={16} />
                      <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                    </label>
                    <textarea
                      aria-label={`${item.title} notes`}
                      value={item.notes ?? ""}
                      onChange={(event) => updateItem(item.id, { notes: event.target.value })}
                    />
                  </div>
                  <button className="delete-button" type="button" onClick={() => deleteItem(item.id)} title="Delete item">
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
            </div>

            <button className="add-button" type="button" onClick={addItem}>
              <Plus size={18} />
              <span>Add plan item</span>
            </button>
          </>
        ) : null}

        {activeModule === "places" ? (
          <div className="module-list">
            {draft.places.map((place) => (
              <article key={place.id} className="module-row place-row">
                <label>
                  <span>Place</span>
                  <input value={place.name} onChange={(event) => updatePlace(place.id, { name: event.target.value })} />
                </label>
                <label>
                  <span>Area</span>
                  <input value={place.area} onChange={(event) => updatePlace(place.id, { area: event.target.value })} />
                </label>
                <label>
                  <span>Category</span>
                  <input value={place.category} onChange={(event) => updatePlace(place.id, { category: event.target.value })} />
                </label>
                <textarea value={place.note} onChange={(event) => updatePlace(place.id, { note: event.target.value })} />
              </article>
            ))}
            <button className="add-button" type="button" onClick={addPlace}>
              <Plus size={18} />
              <span>Add place</span>
            </button>
          </div>
        ) : null}

        {activeModule === "map" ? (
          <div className="map-editor">
            <div className="map-card interactive-map">
              {draft.places.map((place, index) => (
                <button key={place.id} className={`map-pin pin-${index + 1}`} type="button" onClick={() => setActiveModule("places")} title={place.name}>
                  <MapPin size={16} />
                </button>
              ))}
              <span>{draft.destination} route cluster</span>
            </div>
            <div className="map-place-list">
              {draft.places.map((place) => (
                <div key={place.id}>
                  <Navigation size={16} />
                  <strong>{place.name}</strong>
                  <span>{place.area}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {activeModule === "tickets" ? (
          <div className="module-list">
            {draft.tickets.map((ticket) => (
              <article key={ticket.id} className="module-row ticket-row-editor">
                <Paperclip size={18} />
                <label>
                  <span>Ticket</span>
                  <input value={ticket.title} onChange={(event) => updateTicket(ticket.id, { title: event.target.value })} />
                </label>
                <label>
                  <span>Reference</span>
                  <input value={ticket.reference} onChange={(event) => updateTicket(ticket.id, { reference: event.target.value })} />
                </label>
                <label>
                  <span>Status</span>
                  <input value={ticket.status} onChange={(event) => updateTicket(ticket.id, { status: event.target.value })} />
                </label>
              </article>
            ))}
            <button className="add-button" type="button" onClick={addTicket}>
              <Plus size={18} />
              <span>Add ticket</span>
            </button>
          </div>
        ) : null}

        {activeModule === "checklist" ? (
          <div className="module-list">
            {draft.checklist.map((item) => (
              <label key={item.id} className="check-row">
                <input type="checkbox" checked={item.done} onChange={(event) => updateChecklistItem(item.id, { done: event.target.checked })} />
                <span>{item.done ? "Done" : "Open"}</span>
                <input value={item.title} onChange={(event) => updateChecklistItem(item.id, { title: event.target.value })} />
              </label>
            ))}
            <button className="add-button" type="button" onClick={addChecklistItem}>
              <Plus size={18} />
              <span>Add checklist item</span>
            </button>
          </div>
        ) : null}
      </div>

      <div className="panel side-panel">
        <div className="sync-card">
          <Sparkles size={19} />
          <div>
            <strong>
              {user
                ? isAccountTripPersisted && isSaved
                  ? "Account trip saved"
                  : "Unsaved account changes"
                : isSaved
                  ? "Local draft saved"
                  : "Unsaved local changes"}
            </strong>
            <span>
              {user
                ? isAccountTripPersisted
                  ? "This trip is stored under the signed-in account."
                  : "This trip will be added to the signed-in account on save."
                : "Sign in with Google to separate and sync trips by account."}
            </span>
          </div>
        </div>
        <div className="map-card">
          <div className="pin one" />
          <div className="pin two" />
          <div className="pin three" />
          <span>{draft.destination} planning map</span>
        </div>
        <div className="quick-grid">
          <div><strong>{draft.days.length}</strong><span>days</span></div>
          <div><strong>{itemCount}</strong><span>items</span></div>
          <div><strong>{draft.tickets.length}</strong><span>offline files</span></div>
          <div><strong>{doneCount}/{draft.checklist.length}</strong><span>checks</span></div>
        </div>
      </div>
    </section>
  );
}
