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

type Tab = '今天' | '行程' | '地点' | '地图' | '预订' | '文件' | '打包' | '预算';
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

const tabs: Tab[] = ['今天', '行程', '地点', '地图', '预订', '文件', '打包', '预算'];
const bookingTypeLabels: Record<Booking['type'], string> = { flight: '航班', hotel: '酒店', train: '火车', restaurant: '餐厅', ticket: '门票', car: '租车', other: '其他' };
const bookingStatusLabels: Record<NonNullable<Booking['status']>, string> = { todo: '待处理', confirmed: '已确认', checked_in: '已值机', cancelled: '已取消' };
const attachmentCategoryLabels: Record<NonNullable<Attachment['category']>, string> = { passport: '护照', visa: '签证', hotel: '酒店', ticket: '票券', transport: '交通', insurance: '保险', receipt: '收据', other: '其他' };
const attachmentLinkedTypeLabels: Record<NonNullable<Attachment['linkedType']>, string> = { trip: '整趟旅行', place: '地点', booking: '预订' };
const packingCategoryLabels: Record<NonNullable<PackingItem['category']>, string> = { documents: '证件', clothing: '衣物', electronics: '电子设备', health: '健康用品', money: '现金卡券', toiletries: '洗漱用品', other: '其他' };
const budgetCategoryLabels: Record<NonNullable<BudgetItem['category']>, string> = { accommodation: '住宿', transport: '交通', food: '餐饮', tickets: '票券', shopping: '购物', other: '其他' };

const runtimeConfig = parseClientRuntimeConfig(Constants.expoConfig?.extra ?? {});
const sessionStorageKey = 'wanderlust.mobileSession.v1';
const offlineTripStorageKey = 'wanderlust.mobileOfflineTrip.v1';
const offlineFilesStorageKey = 'wanderlust.mobileOfflineFiles.v1';
const authCallbackUrl = 'wanderlust://auth';

const demoTrip = createDemoTrip();

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('今天');
  const [syncState, setSyncState] = useState<SyncState>('checking');
  const [authState, setAuthState] = useState<AuthState>('checking');
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [providers, setProviders] = useState<OAuthProviderStatus>({ google: { configured: false }, apple: { configured: false } });
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [trip, setTrip] = useState<RoutebookTrip>(demoTrip);
  const [message, setMessage] = useState('正在打开演示路书');
  const [packed, setPacked] = useState<Record<string, boolean>>({});
  const [cachedFiles, setCachedFiles] = useState<Record<string, string>>({});
  const [fileBusy, set文件Busy] = useState<Record<string, boolean>>({});

  const today = useMemo(() => getBestTravelDay(trip.days), [trip.days]);
  const todayWeather = trip.weather.find((item) => item.dayId === today.id);
  const nextStop = useMemo(() => today.items.find((item) => getNavigationTarget(item, trip.places)), [today.items, trip.places]);
  const todayBooking = useMemo(() => trip.bookings.filter((booking) => booking.dayId === today.id), [today.id, trip.bookings]);
  const nextStopBooking = useMemo(() => getBookingForItem(nextStop, todayBooking), [nextStop, todayBooking]);
  const nextStopAttachment = useMemo(() => getFirstLinkedAttachment(nextStop, nextStopBooking, trip.attachments), [nextStop, nextStopBooking, trip.attachments]);
  const leaveAtCopy = getLeaveAtCopy(nextStop);
  const activePlaceIds = new Set(today.items.map((item) => item.placeId).filter(Boolean));

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(buildApiUrl(runtimeConfig, '/health'), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`健康检查失败：${response.status}`);
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
        setMessage('无法读取已保存的会话');
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
      setMessage('登录返回但没有会话');
      return;
    }

    await SecureStore.setItemAsync(sessionStorageKey, token);
    setSessionToken(token);
    setAuthState('signed_in');
    setMessage('已登录，正在加载路书...');
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
    setMessage('已登出，显示演示路书。');
  }

  async function loadTrips(token: string) {
    try {
      const response = await fetch(buildApiUrl(runtimeConfig, '/api/trips'), {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`无法加载路书：${response.status}`);
      const payload = (await response.json()) as { trips: TripSummary[] };
      setTrips(payload.trips);
      if (payload.trips[0]) {
        await loadTrip(payload.trips[0].id, token);
      } else {
        setTrip(demoTrip);
        setMessage('账号里还没有路书，先显示演示路书。');
      }
    } catch (error) {
      setAuthState('signed_out');
      setMessage(error instanceof Error ? error.message : '无法加载路书');
    }
  }

  async function loadTrip(tripId: string, token = sessionToken) {
    if (!token) return;
    try {
      const response = await fetch(buildApiUrl(runtimeConfig, `/api/trips/${encodeURIComponent(tripId)}`), {
        headers: { authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`无法打开路书：${response.status}`);
      const payload = (await response.json()) as { trip: Partial<Trip> };
      const hydrated = hydrateTrip(payload.trip);
      setTrip(hydrated);
      await SecureStore.setItemAsync(offlineTripStorageKey, JSON.stringify(hydrated));
      await pruneCached文件Index(hydrated.attachments);
      setMessage('已从账号同步并缓存供离线使用');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法打开路书');
    }
  }

  async function loadOfflineTrip() {
    const saved = await SecureStore.getItemAsync(offlineTripStorageKey);
    if (!saved) {
      setTrip(demoTrip);
      setMessage('显示演示路书');
      return;
    }

    try {
      setTrip(hydrateTrip(JSON.parse(saved) as Partial<Trip>));
      setMessage('已加载缓存路书');
    } catch {
      setTrip(demoTrip);
      setMessage('缓存路书无效，改为显示演示内容。');
    }
  }

  const openNavigation = (item: NavigationItem | undefined = getNavigationTarget(nextStop, trip.places)) => {
    if (typeof item?.latitude !== 'number' || typeof item.longitude !== 'number') return;
    const url = buildMapsUrl({ latitude: item.latitude, longitude: item.longitude, label: item.locationName ?? item.title ?? item.name }, 'google');
    void Linking.openURL(url);
  };

  async function openAttachment(attachment: Attachment) {
    if (!sessionToken && !cachedFiles[attachment.id]) {
      setMessage('下载账号文件前请先登录');
      return;
    }

    set文件Busy((current) => ({ ...current, [attachment.id]: true }));
    try {
      const localUri = cachedFiles[attachment.id] ?? (await downloadAttachment(attachment));
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(localUri, {
          dialogTitle: attachment.title ?? '打开文件',
          mimeType: getAttachmentMimeType(attachment)
        });
      } else {
        await Linking.openURL(localUri);
      }
      setMessage(`${attachment.title ?? '文件'} 可离线使用`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法打开文件');
    } finally {
      set文件Busy((current) => ({ ...current, [attachment.id]: false }));
    }
  }

  async function downloadAttachment(attachment: Attachment): Promise<string> {
    if (!sessionToken) throw new Error('下载账号文件前请先登录');
    const root = FileSystem.documentDirectory;
    if (!root) throw new Error('本地文件存储不可用');

    const directory = `${root}wanderlust-files/${trip.id}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const localUri = `${directory}${attachment.id}-${sanitize文件Name(attachment.title ?? attachment.storagePath)}`;
    const existing = await FileSystem.getInfoAsync(localUri);
    if (!existing.exists) {
      const response = await FileSystem.downloadAsync(
        buildApiUrl(runtimeConfig, `/api/attachments/${encodeURIComponent(attachment.storagePath)}`),
        localUri,
        { headers: { authorization: `Bearer ${sessionToken}` } }
      );
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`无法下载文件：${response.status}`);
      }
    }

    const next = { ...cachedFiles, [attachment.id]: localUri };
    setCachedFiles(next);
    await SecureStore.setItemAsync(offlineFilesStorageKey, JSON.stringify(next));
    return localUri;
  }

  async function pruneCached文件Index(attachments: Attachment[]) {
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
        ? 'Cloudflare 同步在线'
        : '在线 · 登录后可同步路书'
      : syncState === 'checking'
        ? '正在检查 Cloudflare 同步'
        : '离线包已就绪';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.eyebrow}>{authState === 'signed_in' ? '旅行模式' : '路书预览'}</Text>
            <View style={styles.offlineBadge}><Text style={styles.offlineText}>已缓存</Text></View>
          </View>
          <Text style={styles.title}>{trip.title}</Text>
          <Text style={styles.subtitle}>{trip.destination} · {trip.startDate} 至 {trip.endDate}</Text>
          <Text style={[styles.syncStatus, syncState === 'unavailable' && styles.syncStatusError]}>
            {syncCopy} · {runtimeConfig.apiBaseUrl.replace(/^https:\/\//, '')}
          </Text>
        </View>

        <View style={styles.authCard}>
          <View style={styles.authCopy}>
            <Text style={styles.itemTitle}>{authState === 'signed_in' ? '账号路书' : '登录后加载你的路书'}</Text>
            <Text style={styles.itemNotes}>{message}</Text>
          </View>
          {authState === 'signed_in' ? (
            <Pressable style={styles.secondaryButton} onPress={signOut}>
              <Text style={styles.secondaryButtonText}>退出登录</Text>
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

        {activeTab === '今天' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.eyebrow}>{formatDayLabel(today)}</Text>
                <Text style={styles.sectionTitle}>{today.title}</Text>
              </View>
              <View style={styles.weatherPill}>
                <Text style={styles.weatherTemp}>{todayWeather?.temperatureMinC ?? '--'}/{todayWeather?.temperatureMaxC ?? '--'} C</Text>
                <Text style={styles.weatherCopy}>{todayWeather?.summary ?? '没有缓存天气预报'}</Text>
              </View>
            </View>
            <View style={styles.nextStopCard}>
              <View style={styles.nextStopTop}>
                <View style={styles.timelineCopy}>
                  <Text style={styles.eyebrow}>下一站</Text>
                  <Text style={styles.nextStopTitle}>{nextStop?.title ?? '还没有设置下一站'}</Text>
                  <Text style={styles.itemNotes}>{nextStop?.locationName ?? (nextStop ? getPlaceForItem(nextStop, trip.places)?.address : undefined) ?? '出发前请先添加一个带坐标的地点。'}</Text>
                </View>
                <View style={styles.leaveBox}>
                  <Text style={styles.leaveLabel}>出发</Text>
                  <Text style={styles.leaveTime}>{leaveAtCopy}</Text>
                </View>
              </View>
              {nextStop?.reason ? <Text style={[styles.reasonText, styles.darkReasonText]}>{nextStop.reason}</Text> : null}
              <View style={styles.tripModeGrid}>
                <View style={styles.tripModeTile}>
                  <Text style={styles.tileLabel}>票券</Text>
                  <Text style={styles.tileValue}>{nextStopAttachment?.title ?? nextStopBooking?.confirmationCode ?? '未关联'}</Text>
                </View>
                <View style={styles.tripModeTile}>
                  <Text style={styles.tileLabel}>预订</Text>
                  <Text style={styles.tileValue}>{nextStopBooking?.title ?? '没有固定预订'}</Text>
                </View>
              </View>
              <Pressable style={styles.primaryButton} onPress={() => openNavigation()}>
                <Text style={styles.primaryButtonText}>导航到下一站</Text>
              </Pressable>
            </View>
            {today.items.map((item) => {
              const place = getPlaceForItem(item, trip.places);
              return (
                <View key={item.id} style={styles.timelineItem}>
                  <Text style={styles.time}>{item.startTime ?? '任意时间'}</Text>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    {item.reason ? <Text style={styles.reasonText}>{item.reason}</Text> : null}
                    <Text style={styles.itemNotes}>{item.notes ?? place?.address ?? ''}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {activeTab === '行程' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>完整行程</Text>
            {trip.days.map((day) => (
              <View key={day.id} style={styles.dayBlock}>
                <Text style={styles.dayTitle}>{day.title}</Text>
                <Text style={styles.itemNotes}>{day.date} · {day.items.length || '无'} 项</Text>
                {day.items.map((item) => <Text key={item.id} style={styles.dayItem}>{item.startTime ?? '--:--'} · {item.title}</Text>)}
              </View>
            ))}
          </View>
        )}

        {activeTab === '地点' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>已保存地点</Text>
            {trip.places.map((place) => (
              <Pressable key={place.id} style={styles.placeRow} onPress={() => openNavigation(place)}>
                <View>
                  <Text style={styles.itemTitle}>{place.name}{activePlaceIds.has(place.id) ? ' · 今天' : ''}</Text>
                  <Text style={styles.itemNotes}>{place.category} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</Text>
                  <Text style={styles.placeNote}>{place.notes ?? place.address}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {activeTab === '地图' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>路线图</Text>
            <View style={styles.mapPreview}>
              {trip.places.map((place, index) => (
                <View key={place.id} style={[styles.mapPin, index === 1 && styles.mapPinBlue, index === 2 && styles.mapPinMoss, pinPosition(place, trip.places)]} />
              ))}
              <Text style={styles.mapLabel}>{trip.destination} 路线分布</Text>
            </View>
            {trip.places.map((place) => (
              <Pressable key={place.id} style={styles.compactRow} onPress={() => openNavigation(place)}>
                <Text style={styles.itemTitle}>{place.name}</Text>
                <Text style={styles.itemNotes}>在 Google Maps 中打开</Text>
              </Pressable>
            ))}
          </View>
        )}

        {activeTab === '预订' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>预订与文件</Text>
            {trip.bookings.map((booking) => (
              <View key={booking.id} style={styles.bookingRow}>
                <Text style={styles.itemTitle}>{booking.title}</Text>
                <Text style={styles.itemNotes}>{bookingTypeLabels[booking.type]} · {bookingStatusLabels[booking.status ?? 'todo']} · {booking.confirmationCode ?? '无编号'}</Text>
                {booking.notes ? <Text style={styles.placeNote}>{booking.notes}</Text> : null}
                {booking.segments?.map((segment) => (
                  <Text key={segment.id} style={styles.segmentText}>
                    {segment.mode} · {segment.carrier}{segment.serviceNumber} {segment.departureCode ?? ''}{segment.arrivalCode ? ` 至 ${segment.arrivalCode}` : ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {activeTab === '文件' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>文件</Text>
            {trip.attachments.length === 0 ? <Text style={styles.itemNotes}>还没有缓存任何文件。</Text> : null}
            {trip.attachments.map((attachment) => (
              <View key={attachment.id} style={styles.bookingRow}>
                <View style={styles.fileHeader}>
                  <View style={styles.timelineCopy}>
                    <Text style={styles.itemTitle}>{attachment.title ?? attachment.storagePath}</Text>
                    <Text style={styles.itemNotes}>{attachmentCategoryLabels[attachment.category ?? 'other']} · {attachmentLinkedTypeLabels[attachment.linkedType ?? 'trip']} · {cachedFiles[attachment.id] ? '离线' : '未缓存'}</Text>
                  </View>
                  <Pressable
                    disabled={Boolean(fileBusy[attachment.id]) || (!sessionToken && !cachedFiles[attachment.id])}
                    style={[styles.fileButton, (fileBusy[attachment.id] || (!sessionToken && !cachedFiles[attachment.id])) && styles.disabledButton]}
                    onPress={() => openAttachment(attachment)}
                  >
                    <Text style={styles.fileButtonText}>{cachedFiles[attachment.id] ? '打开' : fileBusy[attachment.id] ? '保存中' : '下载'}</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab === '打包' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>打包清单</Text>
            {trip.packingItems.map((item) => (
              <Pressable key={item.id} style={styles.packingRow} onPress={() => setPacked((current) => ({ ...current, [item.id]: !current[item.id] }))}>
                <View style={[styles.checkbox, packed[item.id] && styles.checkboxDone]} />
                <View style={styles.timelineCopy}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemNotes}>{packingCategoryLabels[item.category ?? 'other']} · x{item.quantity}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {activeTab === '预算' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>共同账单</Text>
            {trip.budgetItems.map((item) => (
              <View key={item.id} style={styles.bookingRow}>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemNotes}>{budgetCategoryLabels[item.category ?? 'other']} · {item.amount.toFixed(2)} {item.currency}</Text>
              </View>
            ))}
            <Text style={styles.dayTitle}>结算</Text>
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
    title: day.sortOrder === 1 ? '京都南部与西部' : day.title,
    items:
      day.sortOrder === 1
        ? sortItineraryItems([
            {
              id: 'fushimi',
              dayId: day.id,
              type: 'place',
              placeId: 'place_fushimi',
              title: '趁人少先去伏见稻荷',
              startTime: '08:00',
              locationName: '伏见稻荷大社',
              latitude: 34.9671,
              longitude: 135.7727,
              sortOrder: 0,
              reason: '这是当天最适合提前去的户外点，可以在午餐前避开鸟居人潮。',
              notes: '走下段鸟居，喝杯咖啡，然后坐车横跨市区。'
            },
            {
              id: 'lunch',
              dayId: day.id,
              type: 'food',
              placeId: 'place_arashiyama',
              title: '岚山附近荞麦面午餐',
              startTime: '12:30',
              locationName: '岚山',
              latitude: 35.0094,
              longitude: 135.6668,
              sortOrder: 1,
              reason: '把午餐和西侧步行安排在一起，去天龙寺前少走回头路。',
              notes: '预订确认号已保存。'
            },
            {
              id: 'ticket',
              dayId: day.id,
              type: 'booking',
              bookingId: 'booking_tenryuji',
              title: '天龙寺门票 PDF 已缓存',
              sortOrder: 2,
              reason: '门票安排在午餐后，因为天龙寺靠近岚山，并且可离线打开。',
              notes: '飞行模式下也可离线查看。'
            }
          ])
        : []
  }));

  const demoPlaces: Place[] = [
    {
      id: 'place_fushimi',
      tripId: id,
      name: '伏见稻荷大社',
      category: 'culture',
      latitude: 34.9671,
      longitude: 135.7727,
      address: '68 Fukakusa Yabunouchicho',
      notes: '早点从车站侧入口进入。',
      tags: ['上午', '神社'],
      isFavorite: true
    },
    {
      id: 'place_arashiyama',
      tripId: id,
      name: '岚山竹林',
      category: 'nature',
      latitude: 35.0094,
      longitude: 135.6668,
      address: 'Sagaogurayama Tabuchiyamacho',
      notes: '和天龙寺门票安排在一起。',
      tags: ['散步'],
      isFavorite: false
    },
    {
      id: 'place_nishiki',
      tripId: id,
      name: '锦市场',
      category: 'food',
      latitude: 35.0049,
      longitude: 135.764,
      address: '中京区',
      notes: '如果西侧行程延后，可作为备用午餐点。',
      tags: ['美食'],
      isFavorite: false
    }
  ];

  const demoBookings: Booking[] = [
    { id: 'booking_jr', tripId: id, type: 'train', title: 'JR 通票 PDF', confirmationCode: '已缓存文件', provider: 'JR West', status: 'confirmed', attachmentIds: [] },
    {
      id: 'booking_tenryuji',
      tripId: id,
      dayId: demoDays[1]!.id,
      placeId: 'place_arashiyama',
      type: 'ticket',
      title: '天龙寺入场',
      confirmationCode: '查看邮件',
      status: 'todo',
      notes: '预订后添加 PDF。',
      attachmentIds: []
    }
  ];

  const demoPacking: PackingItem[] = [
    { id: 'pack_passport', tripId: id, title: '护照和签证截图', category: 'documents', quantity: 1, packed: true },
    { id: 'pack_esim', tripId: id, title: '出发前安装 eSIM', category: 'electronics', quantity: 1, packed: false },
    { id: 'pack_umbrella', tripId: id, title: '折叠伞', category: 'clothing', quantity: 1, packed: false }
  ];

  const demoWeather: WeatherForecast[] = demoDays.map((day) => ({
    dayId: day.id,
    date: day.date,
    locationName: '京都',
    temperatureMinC: day.sortOrder === 1 ? 15 : 14,
    temperatureMaxC: day.sortOrder === 1 ? 22 : 21,
    precipitationProbability: day.sortOrder === 1 ? 30 : 20,
    summary: day.sortOrder === 1 ? '薄外套即可，暂不需要雨天方案' : '温和的秋日天气'
  }));

  return {
    id,
    ownerId: 'demo',
    title: '京都秋日路书',
    destination: '日本京都',
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
      { id: 'member_you', tripId: id, name: '我' },
      { id: 'member_friend', tripId: id, name: '旅伴' }
    ],
    budgetItems: [
      {
        id: 'budget_hotel',
        tripId: id,
        title: '酒店订金',
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

function getBookingForItem(item: ItineraryItem | undefined, bookings: Booking[]): Booking | undefined {
  if (!item) return bookings[0];
  if (item.bookingId) return bookings.find((booking) => booking.id === item.bookingId);
  return bookings.find((booking) => booking.placeId && booking.placeId === item.placeId) ?? bookings[0];
}

function getFirstLinkedAttachment(item: ItineraryItem | undefined, booking: Booking | undefined, attachments: Attachment[]): Attachment | undefined {
  const linkedBookingAttachment = booking?.attachmentIds?.[0] ? attachments.find((attachment) => attachment.id === booking.attachmentIds![0]) : undefined;
  if (linkedBookingAttachment) return linkedBookingAttachment;
  if (item?.attachmentIds?.[0]) return attachments.find((attachment) => attachment.id === item.attachmentIds![0]);
  return undefined;
}

function getLeaveAtCopy(item: ItineraryItem | undefined): string {
  if (!item?.startTime) return '--:--';
  const [hourText, minuteText] = item.startTime.split(':');
  const minutes = Number(hourText) * 60 + Number(minuteText) - 30;
  if (!Number.isFinite(minutes)) return item.startTime;
  const normalized = (minutes + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60).toString().padStart(2, '0');
  const mins = (normalized % 60).toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

function formatDayLabel(day: TripDay): string {
  return `${day.title.startsWith('第') ? day.title : `第 ${day.sortOrder + 1} 天`} · ${day.date}`;
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

function sanitize文件Name(value: string): string {
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
  nextStopCard: {
    borderRadius: 8,
    backgroundColor: '#27231F',
    padding: 14,
    gap: 12
  },
  nextStopTop: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start'
  },
  nextStopTitle: {
    color: '#FFF8EE',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '900'
  },
  leaveBox: {
    minWidth: 78,
    borderRadius: 8,
    backgroundColor: '#FFF8EE',
    padding: 10,
    alignItems: 'center'
  },
  leaveLabel: {
    color: '#8B735B',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  leaveTime: {
    color: '#27231F',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 3
  },
  tripModeGrid: {
    flexDirection: 'row',
    gap: 8
  },
  tripModeTile: {
    flex: 1,
    minHeight: 62,
    borderRadius: 8,
    backgroundColor: '#3A342D',
    padding: 10
  },
  tileLabel: {
    color: '#DCC5A6',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase'
  },
  tileValue: {
    color: '#FFF8EE',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    marginTop: 5
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
  reasonText: {
    color: '#476878',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    marginTop: 6
  },
  darkReasonText: {
    color: '#DCC5A6'
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
