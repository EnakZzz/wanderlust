import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { buildApiUrl, parseClientRuntimeConfig, parseHealthResponse, type OAuthProviderStatus } from '@wanderlust/api';
import {
  type Attachment,
  buildMapsUrl,
  createTripDays,
  sortItineraryItems,
  type Booking,
  type BudgetItem,
  type BudgetMember,
  type ItineraryItem,
  type PackingItem,
  type Place,
  type Trip,
  type TripDay,
  type WeatherForecast
} from '@wanderlust/domain';

type Tab = 'Today' | 'Itinerary' | 'Places' | 'Map' | 'Bookings' | 'Files' | 'Packing' | 'Budget';
type SyncState = 'checking' | 'online' | 'unavailable';
type AuthState = 'checking' | 'signed_out' | 'signed_in';
type NavigationItem = { latitude?: number; longitude?: number; title?: string; locationName?: string; name?: string };
type TripSummary = {
  id: string;
  title: string;
  destination: string;
  status: 'draft' | 'active' | 'archived';
  startDate?: string;
  endDate?: string;
  updatedAt: string;
};
type RoutebookTrip = Omit<Trip, 'days' | 'places' | 'bookings' | 'attachments' | 'packingItems' | 'weather'> & {
  days: TripDay[];
  places: Place[];
  bookings: Booking[];
  attachments: NonNullable<Trip['attachments']>;
  packingItems: PackingItem[];
  weather: WeatherForecast[];
  budgetMembers: BudgetMember[];
  budgetItems: BudgetItem[];
};

const tabs: Tab[] = ['Today', 'Itinerary', 'Places', 'Map', 'Bookings', 'Files', 'Packing', 'Budget'];
const runtimeConfig = parseClientRuntimeConfig(Constants.expoConfig?.extra ?? {});
const sessionStorageKey = 'wanderlust.mobileSession.v1';
const offlineTripStorageKey = 'wanderlust.mobileOfflineTrip.v1';
const offlineFilesStorageKey = 'wanderlust.mobileOfflineFiles.v1';
const authCallbackUrl = 'wanderlust://auth';

const demoTrip = createDemoTrip();

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Today');
  const [syncState, setSyncState] = useState<SyncState>('checking');
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProviderStatus>({ google: { configured: false }, apple: { configured: false } });
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [trip, setTrip] = useState<RoutebookTrip>(demoTrip);
  const [message, setMessage] = useState('Opening demo routebook');
  const [packed, setPacked] = useState<Record<string, boolean>>({});
  const [cachedFiles, setCachedFiles] = useState<Record<string, string>>({});
  const [fileBusy, setFileBusy] = useState<Record<string, boolean>>({});

  const today = useMemo(() => getBestTravelDay(trip.days), [trip.days]);
  const todayWeather = trip.weather.find((item) => item.dayId === today.id);
  const nextStop = useMemo(() => today.items.find((item) => getNavigationTarget(item, trip.places)), [today.items, trip.places]);
  const activePlaceIds = new Set(today.items.map((item) => item.placeId).filter(Boolean));

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(buildApiUrl(runtimeConfig, '/health'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
        return response.json();
      })
      .then((payload) => {
        parseHealthResponse(payload);
        setSyncState('online');
      })
      .catch(() => setSyncState('unavailable'))
      .finally(() => clearTimeout(timeout));

    fetch(buildApiUrl(runtimeConfig, '/auth/config'))
      .then((response) => response.json())
      .then((payload) => setProviders(payload.providers as OAuthProviderStatus))
      .catch(() => setProviders({ google: { configured: false }, apple: { configured: false } }));

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(sessionStorageKey)
      .then((token) => {
        if (token) {
          setSessionToken(token);
          setAuthState('signed_in');
          return loadTrips(token);
        }
        setAuthState('signed_out');
        return loadOfflineTrip();
      })
      .catch(() => {
        setAuthState('signed_out');
        setMessage('Could not read saved session');
      });
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(offlineFilesStorageKey)
      .then((saved) => {
        if (saved) setCachedFiles(JSON.parse(saved) as Record<string, string>);
      })
      .catch(() => setCachedFiles({}));
  }, []);

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleAuthCallback(url);
    });

    Linking.getInitialURL().then((url) => {
      if (url) void handleAuthCallback(url);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    setPacked(Object.fromEntries(trip.packingItems.map((item) => [item.id, Boolean(item.packed)])));
  }, [trip.id, trip.packingItems]);

  async function handleAuthCallback(url: string) {
    if (!url.startsWith(authCallbackUrl)) return;
    const parsed = new URL(url);
    const token = parsed.searchParams.get('session');
    if (!token) {
      setMessage('Sign-in returned without a session');
      return;
    }

    await SecureStore.setItemAsync(sessionStorageKey, token);
    setSessionToken(token);
    setAuthState('signed_in');
    setMessage('Signed in. Loading plans...');
    await loadTrips(token);
  }

  async function startLogin(provider: 'google' | 'apple') {
    const url = buildApiUrl(runtimeConfig, `/auth/${provider}/start?returnTo=${encodeURIComponent(authCallbackUrl)}`);
    await Linking.openURL(url);
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(sessionStorageKey);
    setSessionToken(null);
    setAuthState('signed_out');
    setTrips([]);
    setTrip(demoTrip);
    setMessage('Signed out. Showing demo routebook.');
  }

  async function loadTrips(token: string) {
    try {
      const response = await fetch(buildApiUrl(runtimeConfig, '/api/trips'), {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`Could not load plans: ${response.status}`);
      const payload = (await response.json()) as { trips: TripSummary[] };
      setTrips(payload.trips);
      if (payload.trips[0]) {
        await loadTrip(payload.trips[0].id, token);
      } else {
        setTrip(demoTrip);
        setMessage('No account plans yet. Showing demo routebook.');
      }
    } catch (error) {
      setAuthState('signed_out');
      setMessage(error instanceof Error ? error.message : 'Could not load plans');
    }
  }

  async function loadTrip(tripId: string, token = sessionToken) {
    if (!token) return;
    try {
      const response = await fetch(buildApiUrl(runtimeConfig, `/api/trips/${encodeURIComponent(tripId)}`), {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`Could not open plan: ${response.status}`);
      const payload = (await response.json()) as { trip: Partial<Trip> };
      const hydrated = hydrateTrip(payload.trip);
      setTrip(hydrated);
      await SecureStore.setItemAsync(offlineTripStorageKey, JSON.stringify(hydrated));
      await pruneCachedFileIndex(hydrated.attachments);
      setMessage('Synced from account and cached for offline use');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open plan');
    }
  }

  async function loadOfflineTrip() {
    const saved = await SecureStore.getItemAsync(offlineTripStorageKey);
    if (!saved) {
      setTrip(demoTrip);
      setMessage('Showing demo routebook');
      return;
    }

    try {
      setTrip(hydrateTrip(JSON.parse(saved) as Partial<Trip>));
      setMessage('Loaded cached routebook');
    } catch {
      setTrip(demoTrip);
      setMessage('Cached routebook is invalid. Showing demo.');
    }
  }

  const openNavigation = (item: NavigationItem | undefined = getNavigationTarget(nextStop, trip.places)) => {
    if (typeof item?.latitude !== 'number' || typeof item.longitude !== 'number') return;
    const url = buildMapsUrl({ latitude: item.latitude, longitude: item.longitude, label: item.locationName ?? item.title ?? item.name }, 'google');
    void Linking.openURL(url);
  };

  async function openAttachment(attachment: Attachment) {
    if (!sessionToken && !cachedFiles[attachment.id]) {
      setMessage('Sign in before downloading account files');
      return;
    }

    setFileBusy((current) => ({ ...current, [attachment.id]: true }));
    try {
      const localUri = cachedFiles[attachment.id] ?? (await downloadAttachment(attachment));
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localUri, {
          dialogTitle: attachment.title ?? 'Open file',
          mimeType: getAttachmentMimeType(attachment)
        });
      } else {
        await Linking.openURL(localUri);
      }
      setMessage(`${attachment.title ?? 'File'} is available offline`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open file');
    } finally {
      setFileBusy((current) => ({ ...current, [attachment.id]: false }));
    }
  }

  async function downloadAttachment(attachment: Attachment): Promise<string> {
    if (!sessionToken) throw new Error('Sign in before downloading account files');
    const root = FileSystem.documentDirectory;
    if (!root) throw new Error('Local file storage is unavailable');

    const directory = `${root}wanderlust-files/${trip.id}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const localUri = `${directory}${attachment.id}-${sanitizeFileName(attachment.title ?? attachment.storagePath)}`;
    const existing = await FileSystem.getInfoAsync(localUri);
    if (!existing.exists) {
      const response = await FileSystem.downloadAsync(
        buildApiUrl(runtimeConfig, `/api/attachments/${encodeURIComponent(attachment.storagePath)}`),
        localUri,
        { headers: { authorization: `Bearer ${sessionToken}` } }
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Could not download file: ${response.status}`);
      }
    }

    const next = { ...cachedFiles, [attachment.id]: localUri };
    setCachedFiles(next);
    await SecureStore.setItemAsync(offlineFilesStorageKey, JSON.stringify(next));
    return localUri;
  }

  async function pruneCachedFileIndex(attachments: Attachment[]) {
    const validIds = new Set(attachments.map((attachment) => attachment.id));
    const next = Object.fromEntries(Object.entries(cachedFiles).filter(([id]) => validIds.has(id)));
    if (Object.keys(next).length !== Object.keys(cachedFiles).length) {
      setCachedFiles(next);
      await SecureStore.setItemAsync(offlineFilesStorageKey, JSON.stringify(next));
    }
  }

  const syncCopy =
    syncState === 'online'
      ? authState === 'signed_in'
        ? 'Cloudflare sync online'
        : 'Online · sign in to sync plans'
      : syncState === 'checking'
        ? 'Checking Cloudflare sync'
        : 'Offline bundle ready';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.eyebrow}>{authState === 'signed_in' ? 'Travel mode' : 'Routebook preview'}</Text>
            <View style={styles.offlineBadge}><Text style={styles.offlineText}>Cached</Text></View>
          </View>
          <Text style={styles.title}>{trip.title}</Text>
          <Text style={styles.subtitle}>{trip.destination} · {trip.startDate} to {trip.endDate}</Text>
          <Text style={[styles.syncStatus, syncState === 'unavailable' && styles.syncStatusError]}>
            {syncCopy} · {runtimeConfig.apiBaseUrl.replace(/^https:\/\//, '')}
          </Text>
        </View>

        <View style={styles.authCard}>
          <View style={styles.authCopy}>
            <Text style={styles.itemTitle}>{authState === 'signed_in' ? 'Account plans' : 'Sign in to load your plans'}</Text>
            <Text style={styles.itemNotes}>{message}</Text>
          </View>
          {authState === 'signed_in' ? (
            <Pressable style={styles.secondaryButton} onPress={signOut}>
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          ) : (
            <View style={styles.loginButtons}>
              <Pressable disabled={!providers.google.configured} style={[styles.secondaryButton, !providers.google.configured && styles.disabledButton]} onPress={() => startLogin('google')}>
                <Text style={styles.secondaryButtonText}>Google</Text>
              </Pressable>
              <Pressable disabled={!providers.apple.configured} style={[styles.secondaryButton, !providers.apple.configured && styles.disabledButton]} onPress={() => startLogin('apple')}>
                <Text style={styles.secondaryButtonText}>Apple</Text>
              </Pressable>
            </View>
          )}
        </View>

        {authState === 'signed_in' && trips.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripStrip}>
            {trips.map((summary) => (
              <Pressable key={summary.id} style={[styles.tripChip, summary.id === trip.id && styles.tripChipActive]} onPress={() => loadTrip(summary.id)}>
                <Text style={[styles.tripChipTitle, summary.id === trip.id && styles.tripChipTitleActive]}>{summary.title}</Text>
                <Text style={styles.tripChipMeta}>{summary.destination}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {activeTab === 'Today' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.eyebrow}>{formatDayLabel(today)}</Text>
                <Text style={styles.sectionTitle}>{today.title}</Text>
              </View>
              <View style={styles.weatherPill}>
                <Text style={styles.weatherTemp}>{todayWeather?.temperatureMinC ?? '--'}/{todayWeather?.temperatureMaxC ?? '--'} C</Text>
                <Text style={styles.weatherCopy}>{todayWeather?.summary ?? 'No forecast cached'}</Text>
              </View>
            </View>
            {today.items.map((item) => {
              const place = getPlaceForItem(item, trip.places);
              return (
                <View key={item.id} style={styles.timelineItem}>
                  <Text style={styles.time}>{item.startTime ?? 'Anytime'}</Text>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemNotes}>{item.notes ?? place?.address ?? ''}</Text>
                  </View>
                </View>
              );
            })}
            <Pressable style={styles.primaryButton} onPress={() => openNavigation()}>
              <Text style={styles.primaryButtonText}>Navigate to next stop</Text>
            </Pressable>
          </View>
        )}

        {activeTab === 'Itinerary' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Full itinerary</Text>
            {trip.days.map((day) => (
              <View key={day.id} style={styles.dayBlock}>
                <Text style={styles.dayTitle}>{day.title}</Text>
                <Text style={styles.itemNotes}>{day.date} · {day.items.length || 'No'} items</Text>
                {day.items.map((item) => <Text key={item.id} style={styles.dayItem}>{item.startTime ?? '--:--'} · {item.title}</Text>)}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Places' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Saved places</Text>
            {trip.places.map((place) => (
              <Pressable key={place.id} style={styles.placeRow} onPress={() => openNavigation(place)}>
                <View>
                  <Text style={styles.itemTitle}>{place.name}{activePlaceIds.has(place.id) ? ' · Today' : ''}</Text>
                  <Text style={styles.itemNotes}>{place.category} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</Text>
                  <Text style={styles.placeNote}>{place.notes ?? place.address}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {activeTab === 'Map' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Route map</Text>
            <View style={styles.mapPreview}>
              {trip.places.map((place, index) => (
                <View key={place.id} style={[styles.mapPin, index === 1 && styles.mapPinBlue, index === 2 && styles.mapPinMoss, pinPosition(place, trip.places)]} />
              ))}
              <Text style={styles.mapLabel}>{trip.destination} route cluster</Text>
            </View>
            {trip.places.map((place) => (
              <Pressable key={place.id} style={styles.compactRow} onPress={() => openNavigation(place)}>
                <Text style={styles.itemTitle}>{place.name}</Text>
                <Text style={styles.itemNotes}>Open in Google Maps</Text>
              </Pressable>
            ))}
          </View>
        )}

        {activeTab === 'Bookings' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Bookings & files</Text>
            {trip.bookings.map((booking) => (
              <View key={booking.id} style={styles.bookingRow}>
                <Text style={styles.itemTitle}>{booking.title}</Text>
                <Text style={styles.itemNotes}>{booking.type} · {booking.status} · {booking.confirmationCode ?? 'No code'}</Text>
                {booking.notes ? <Text style={styles.placeNote}>{booking.notes}</Text> : null}
                {booking.segments?.map((segment) => (
                  <Text key={segment.id} style={styles.segmentText}>
                    {segment.mode} · {segment.carrier}{segment.serviceNumber} {segment.departureCode ?? ''}{segment.arrivalCode ? ` to ${segment.arrivalCode}` : ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Files' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Files</Text>
            {trip.attachments.length === 0 ? <Text style={styles.itemNotes}>No documents cached yet.</Text> : null}
            {trip.attachments.map((attachment) => (
              <View key={attachment.id} style={styles.bookingRow}>
                <View style={styles.fileHeader}>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.itemTitle}>{attachment.title ?? attachment.storagePath}</Text>
                    <Text style={styles.itemNotes}>{attachment.category ?? 'other'} · {attachment.linkedType ?? 'trip'} · {cachedFiles[attachment.id] ? 'offline' : 'not cached'}</Text>
                  </View>
                  <Pressable
                    disabled={Boolean(fileBusy[attachment.id]) || (!sessionToken && !cachedFiles[attachment.id])}
                    style={[styles.fileButton, (fileBusy[attachment.id] || (!sessionToken && !cachedFiles[attachment.id])) && styles.disabledButton]}
                    onPress={() => openAttachment(attachment)}
                  >
                    <Text style={styles.fileButtonText}>{cachedFiles[attachment.id] ? 'Open' : fileBusy[attachment.id] ? 'Saving' : 'Download'}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === 'Packing' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Packing checklist</Text>
            {trip.packingItems.map((item) => (
              <Pressable key={item.id} style={styles.packingRow} onPress={() => setPacked((current) => ({ ...current, [item.id]: !current[item.id] }))}>
                <View style={[styles.checkbox, packed[item.id] && styles.checkboxDone]} />
                <View style={styles.timelineCopy}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemNotes}>{item.category} · x{item.quantity}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {activeTab === 'Budget' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Shared bills</Text>
            {trip.budgetItems.map((item) => (
              <View key={item.id} style={styles.bookingRow}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemNotes}>{item.category} · {item.amount.toFixed(2)} {item.currency}</Text>
              </View>
            ))}
            <Text style={styles.dayTitle}>Settle up</Text>
            {calculateBudgetSettlements(trip.budgetMembers, trip.budgetItems).map((settlement, index) => (
              <Text key={`${settlement.from}-${settlement.to}-${index}`} style={styles.segmentText}>
                {trip.budgetMembers.find((member) => member.id === settlement.from)?.name} pays {trip.budgetMembers.find((member) => member.id === settlement.to)?.name}: {settlement.amount.toFixed(2)} {settlement.currency}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.tabs}>
        {tabs.map((tab) => (
          <Pressable key={tab} style={[styles.tab, activeTab === tab && styles.activeTab]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function hydrateTrip(input: Partial<Trip>): RoutebookTrip {
  const fallback = demoTrip;
  const id = input.id ?? fallback.id;
  const days = (input.days?.length ? input.days : fallback.days).map((day) => ({ ...day, items: day.items ?? [] }));
  const places = (input.places ?? []).map((place) => ({ ...place, tripId: place.tripId || id, tags: place.tags ?? [], isFavorite: place.isFavorite ?? false }));

  return {
    ...fallback,
    ...input,
    id,
    ownerId: input.ownerId ?? 'account',
    timezone: input.timezone ?? 'Etc/UTC',
    days,
    places,
    bookings: (input.bookings ?? []).map((booking) => ({ ...booking, tripId: booking.tripId || id, status: booking.status ?? 'todo', attachmentIds: booking.attachmentIds ?? [] })),
    attachments: input.attachments ?? [],
    packingItems: (input.packingItems ?? []).map((item) => ({ ...item, tripId: item.tripId || id, quantity: item.quantity ?? 1, packed: item.packed ?? false })),
    weather: input.weather ?? [],
    budgetMembers: (input.budgetMembers ?? []).map((member) => ({ ...member, tripId: member.tripId || id })),
    budgetItems: (input.budgetItems ?? []).map((item) => ({ ...item, tripId: item.tripId || id, currency: item.currency ?? 'USD', paidByMemberIds: item.paidByMemberIds ?? [], splitWithMemberIds: item.splitWithMemberIds ?? [] }))
  };
}

function createDemoTrip(): RoutebookTrip {
  const id = 'trip_kyoto';
  const demoDays = createTripDays(id, '2026-10-12', '2026-10-16').map((day) => ({
    ...day,
    title: day.sortOrder === 1 ? 'Southern & Western Kyoto' : day.title,
    items:
      day.sortOrder === 1
        ? sortItineraryItems([
            {
              id: 'fushimi',
              dayId: day.id,
              type: 'place',
              placeId: 'place_fushimi',
              title: 'Fushimi Inari before the crowds',
              startTime: '08:00',
              locationName: 'Fushimi Inari Taisha',
              latitude: 34.9671,
              longitude: 135.7727,
              sortOrder: 0,
              notes: 'Lower gates, coffee stop, then train across town.'
            },
            {
              id: 'lunch',
              dayId: day.id,
              type: 'food',
              placeId: 'place_arashiyama',
              title: 'Soba lunch near Arashiyama',
              startTime: '12:30',
              locationName: 'Arashiyama',
              latitude: 35.0094,
              longitude: 135.6668,
              sortOrder: 1,
              notes: 'Reservation code saved in Bookings.'
            },
            {
              id: 'ticket',
              dayId: day.id,
              type: 'booking',
              bookingId: 'booking_tenryuji',
              title: 'Tenryu-ji ticket PDF cached',
              sortOrder: 2,
              notes: 'Available offline in airplane mode.'
            }
          ])
        : []
  }));

  const demoPlaces: Place[] = [
    {
      id: 'place_fushimi',
      tripId: id,
      name: 'Fushimi Inari Taisha',
      category: 'culture',
      latitude: 34.9671,
      longitude: 135.7727,
      address: '68 Fukakusa Yabunouchicho',
      notes: 'Use the station-side entrance early.',
      tags: ['morning', 'shrine'],
      isFavorite: true
    },
    {
      id: 'place_arashiyama',
      tripId: id,
      name: 'Arashiyama Bamboo Grove',
      category: 'nature',
      latitude: 35.0094,
      longitude: 135.6668,
      address: 'Sagaogurayama Tabuchiyamacho',
      notes: 'Pair with Tenryu-ji ticket.',
      tags: ['walk'],
      isFavorite: false
    },
    {
      id: 'place_nishiki',
      tripId: id,
      name: 'Nishiki Market',
      category: 'food',
      latitude: 35.0049,
      longitude: 135.764,
      address: 'Nakagyo Ward',
      notes: 'Backup lunch if the west side runs late.',
      tags: ['food'],
      isFavorite: false
    }
  ];

  const demoBookings: Booking[] = [
    { id: 'booking_jr', tripId: id, type: 'train', title: 'JR pass PDF', confirmationCode: 'Cached file', provider: 'JR West', status: 'confirmed', attachmentIds: [] },
    {
      id: 'booking_tenryuji',
      tripId: id,
      dayId: demoDays[1]!.id,
      placeId: 'place_arashiyama',
      type: 'ticket',
      title: 'Tenryu-ji entry',
      confirmationCode: 'Check email',
      status: 'todo',
      notes: 'Add PDF after booking.',
      attachmentIds: []
    }
  ];

  const demoPacking: PackingItem[] = [
    { id: 'pack_passport', tripId: id, title: 'Passport and visa screenshots', category: 'documents', quantity: 1, packed: true },
    { id: 'pack_esim', tripId: id, title: 'Install eSIM before departure', category: 'electronics', quantity: 1, packed: false },
    { id: 'pack_umbrella', tripId: id, title: 'Compact umbrella', category: 'clothing', quantity: 1, packed: false }
  ];

  const demoWeather: WeatherForecast[] = demoDays.map((day) => ({
    dayId: day.id,
    date: day.date,
    locationName: 'Kyoto',
    temperatureMinC: day.sortOrder === 1 ? 15 : 14,
    temperatureMaxC: day.sortOrder === 1 ? 22 : 21,
    precipitationProbability: day.sortOrder === 1 ? 30 : 20,
    summary: day.sortOrder === 1 ? 'Light jacket, no rain plan needed' : 'Mild autumn day'
  }));

  return {
    id,
    ownerId: 'demo',
    title: 'Kyoto Autumn Routebook',
    destination: 'Kyoto, Japan',
    startDate: '2026-10-12',
    endDate: '2026-10-16',
    timezone: 'Asia/Tokyo',
    status: 'draft',
    days: demoDays,
    places: demoPlaces,
    bookings: demoBookings,
    attachments: [],
    packingItems: demoPacking,
    weather: demoWeather,
    budgetMembers: [
      { id: 'member_you', tripId: id, name: 'You' },
      { id: 'member_friend', tripId: id, name: 'Travel partner' }
    ],
    budgetItems: [
      {
        id: 'budget_hotel',
        tripId: id,
        title: 'Hotel deposit',
        category: 'accommodation',
        amount: 320,
        currency: 'USD',
        paidByMemberIds: ['member_you'],
        splitWithMemberIds: ['member_you', 'member_friend']
      }
    ]
  };
}

function getBestTravelDay(days: TripDay[]): TripDay {
  return days.find((day) => day.items.length > 0) ?? days[0] ?? demoTrip.days[0]!;
}

function getPlaceForItem(item: ItineraryItem, places: Place[]): Place | undefined {
  return item.placeId ? places.find((place) => place.id === item.placeId) : undefined;
}

function calculateBudgetSettlements(members: BudgetMember[], items: BudgetItem[]): Array<{ from: string; to: string; amount: number; currency: string }> {
  const balanceByCurrency = new Map<string, Map<string, number>>();
  items.forEach((item) => {
    const currency = item.currency || 'USD';
    if (!balanceByCurrency.has(currency)) balanceByCurrency.set(currency, new Map());
    const balances = balanceByCurrency.get(currency)!;
    const payers = item.paidByMemberIds?.length ? item.paidByMemberIds : [];
    const splitters = item.splitWithMemberIds?.length ? item.splitWithMemberIds : members.map((member) => member.id);
    if (!payers.length || !splitters.length || !item.amount) return;
    payers.forEach((id) => balances.set(id, (balances.get(id) ?? 0) + item.amount / payers.length));
    splitters.forEach((id) => balances.set(id, (balances.get(id) ?? 0) - item.amount / splitters.length));
  });

  const settlements: Array<{ from: string; to: string; amount: number; currency: string }> = [];
  balanceByCurrency.forEach((balances, currency) => {
    const debtors = Array.from(balances.entries()).filter(([, amount]) => amount < -0.01).map(([id, amount]) => ({ id, amount: -amount }));
    const creditors = Array.from(balances.entries()).filter(([, amount]) => amount > 0.01).map(([id, amount]) => ({ id, amount }));
    let debtorIndex = 0;
    let creditorIndex = 0;
    while (debtors[debtorIndex] && creditors[creditorIndex]) {
      const debtor = debtors[debtorIndex]!;
      const creditor = creditors[creditorIndex]!;
      const amount = Math.min(debtor.amount, creditor.amount);
      settlements.push({ from: debtor.id, to: creditor.id, amount: Math.round(amount * 100) / 100, currency });
      debtor.amount -= amount;
      creditor.amount -= amount;
      if (debtor.amount <= 0.01) debtorIndex += 1;
      if (creditor.amount <= 0.01) creditorIndex += 1;
    }
  });
  return settlements;
}

function getNavigationTarget(item: ItineraryItem | undefined, places: Place[]): NavigationItem | undefined {
  if (!item) return undefined;
  const place = getPlaceForItem(item, places);
  if (place) return place;
  return item;
}

function formatDayLabel(day: TripDay): string {
  return `${day.title.startsWith('Day') ? day.title : `Day ${day.sortOrder + 1}`} · ${day.date}`;
}

function pinPosition(place: Place, places: Place[]) {
  const minLat = Math.min(...places.map((item) => item.latitude));
  const maxLat = Math.max(...places.map((item) => item.latitude));
  const minLng = Math.min(...places.map((item) => item.longitude));
  const maxLng = Math.max(...places.map((item) => item.longitude));
  return {
    left: `${maxLng === minLng ? 50 : 14 + ((place.longitude - minLng) / (maxLng - minLng)) * 72}%` as DimensionValue,
    top: `${maxLat === minLat ? 50 : 14 + ((maxLat - place.latitude) / (maxLat - minLat)) * 72}%` as DimensionValue
  };
}

function sanitizeFileName(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+/, '');
  return cleaned || 'wanderlust-file';
}

function getAttachmentMimeType(attachment: Attachment): string {
  if (attachment.type === 'pdf' || attachment.type === 'ticket') return 'application/pdf';
  if (attachment.type === 'image') return 'image/*';
  return 'application/octet-stream';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F3EA'
  },
  scroll: {
    flex: 1
  },
  content: {
    padding: 18,
    paddingTop: 56,
    paddingBottom: 18,
    gap: 16
  },
  hero: {
    minHeight: 220,
    justifyContent: 'flex-end',
    borderRadius: 8,
    padding: 20,
    backgroundColor: '#24211D'
  },
  heroTop: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  eyebrow: {
    color: '#9B744E',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 7
  },
  title: {
    color: '#FFF8EE',
    fontSize: 38,
    lineHeight: 40,
    fontWeight: '800'
  },
  subtitle: {
    color: '#DFD2C3',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10
  },
  syncStatus: {
    color: '#B9C7B2',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 14
  },
  syncStatusError: {
    color: '#E1AA92'
  },
  offlineBadge: {
    backgroundColor: '#63745C',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8
  },
  offlineText: {
    color: '#FFF8EE',
    fontSize: 12,
    fontWeight: '800'
  },
  authCard: {
    minHeight: 82,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD0BD',
    backgroundColor: '#FFFCF6',
    padding: 14,
    gap: 12
  },
  authCopy: {
    gap: 2
  },
  loginButtons: {
    flexDirection: 'row',
    gap: 8
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEE5D7'
  },
  secondaryButtonText: {
    color: '#27231F',
    fontWeight: '900'
  },
  disabledButton: {
    opacity: 0.42
  },
  tripStrip: {
    gap: 8,
    paddingRight: 18
  },
  tripChip: {
    width: 190,
    minHeight: 74,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD0BD',
    backgroundColor: '#FFFCF6',
    padding: 12
  },
  tripChipActive: {
    backgroundColor: '#27231F',
    borderColor: '#27231F'
  },
  tripChipTitle: {
    color: '#27231F',
    fontWeight: '900'
  },
  tripChipTitleActive: {
    color: '#FFF8EE'
  },
  tripChipMeta: {
    color: '#8B735B',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 5
  },
  card: {
    backgroundColor: '#FFFCF6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD0BD',
    padding: 16,
    gap: 14
  },
  cardHeader: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12
  },
  sectionTitle: {
    color: '#27231F',
    fontSize: 25,
    fontWeight: '800',
    lineHeight: 30
  },
  weatherPill: {
    backgroundColor: '#EEF2ED',
    borderRadius: 8,
    padding: 10
  },
  weatherTemp: {
    color: '#566D55',
    fontWeight: '900'
  },
  weatherCopy: {
    color: '#746E66',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 3
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: '#E8DDCD'
  },
  time: {
    width: 64,
    color: '#476878',
    fontWeight: '900'
  },
  timelineCopy: {
    flex: 1
  },
  itemTitle: {
    color: '#27231F',
    fontSize: 16,
    fontWeight: '800'
  },
  itemNotes: {
    color: '#746E66',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  placeNote: {
    color: '#8B735B',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 5
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: '#27231F',
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButtonText: {
    color: '#FFF8EE',
    fontSize: 15,
    fontWeight: '900'
  },
  dayBlock: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DDCD'
  },
  dayTitle: {
    color: '#27231F',
    fontSize: 18,
    fontWeight: '900'
  },
  dayItem: {
    color: '#476878',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 8
  },
  placeRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DDCD'
  },
  compactRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8DDCD'
  },
  bookingRow: {
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E8DDCD',
    backgroundColor: '#FBF8F1'
  },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  fileButton: {
    minWidth: 92,
    minHeight: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27231F'
  },
  fileButtonText: {
    color: '#FFF8EE',
    fontSize: 12,
    fontWeight: '900'
  },
  segmentText: {
    color: '#476878',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 8
  },
  packingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DDCD'
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#8B735B'
  },
  checkboxDone: {
    backgroundColor: '#63745C',
    borderColor: '#63745C'
  },
  mapPreview: {
    height: 260,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#E9DFCF',
    position: 'relative'
  },
  mapPin: {
    width: 18,
    height: 18,
    borderRadius: 18,
    position: 'absolute',
    backgroundColor: '#8B735B',
    borderWidth: 4,
    borderColor: 'rgba(255,248,238,0.84)'
  },
  mapPinBlue: {
    backgroundColor: '#476878'
  },
  mapPinMoss: {
    backgroundColor: '#63745C'
  },
  mapLabel: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    color: '#27231F',
    fontWeight: '900'
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    paddingBottom: 22,
    gap: 6,
    backgroundColor: 'rgba(247,243,234,0.97)',
    borderTopWidth: 1,
    borderTopColor: '#DDD0BD'
  },
  tab: {
    flexGrow: 1,
    minWidth: '23%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    borderRadius: 8
  },
  activeTab: {
    backgroundColor: '#27231F'
  },
  tabText: {
    color: '#746E66',
    fontSize: 11,
    fontWeight: '900'
  },
  activeTabText: {
    color: '#FFF8EE'
  }
});
