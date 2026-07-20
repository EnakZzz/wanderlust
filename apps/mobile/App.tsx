import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { buildApiUrl, parseClientRuntimeConfig, parseHealthResponse } from '@wanderlust/api';
import { buildMapsUrl, createTripDays, sortItineraryItems } from '@wanderlust/domain';

type Tab = 'Today' | 'Itinerary' | 'Places' | 'Map' | 'Checklist' | 'Journal';
type SyncState = 'checking' | 'online' | 'unavailable';

const tabs: Tab[] = ['Today', 'Itinerary', 'Places', 'Map', 'Checklist', 'Journal'];

const places = [
  { name: 'Fushimi Inari Taisha', category: 'Culture', latitude: 34.9671, longitude: 135.7727 },
  { name: 'Arashiyama Bamboo Grove', category: 'Nature', latitude: 35.0094, longitude: 135.6668 },
  { name: 'Nishiki Market', category: 'Food', latitude: 35.0049, longitude: 135.7640 }
];

const runtimeConfig = parseClientRuntimeConfig(Constants.expoConfig?.extra ?? {});

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('Today');
  const [syncState, setSyncState] = useState<SyncState>('checking');
  const days = useMemo(() => createTripDays('trip_kyoto', '2026-10-12', '2026-10-16'), []);
  const items = useMemo(
    () =>
      sortItineraryItems([
        {
          id: 'fushimi',
          dayId: days[1]!.id,
          type: 'place',
          title: 'Fushimi Inari before the crowds',
          startTime: '08:00',
          sortOrder: 0,
          notes: 'Lower gates, coffee stop, then train across town.'
        },
        {
          id: 'lunch',
          dayId: days[1]!.id,
          type: 'food',
          title: 'Soba lunch near Arashiyama',
          startTime: '12:30',
          sortOrder: 1,
          notes: 'Reservation code saved in Tickets.'
        },
        {
          id: 'ticket',
          dayId: days[1]!.id,
          type: 'booking',
          title: 'Tenryu-ji ticket PDF cached',
          sortOrder: 2,
          notes: 'Available offline in airplane mode.'
        }
      ]),
    [days]
  );

  const openNavigation = () => {
    const url = buildMapsUrl({ latitude: 34.9671, longitude: 135.7727, label: 'Fushimi Inari Taisha' }, 'google');
    void Linking.openURL(url);
  };

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

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const syncCopy =
    syncState === 'online'
      ? 'Cloudflare sync online'
      : syncState === 'checking'
        ? 'Checking Cloudflare sync'
        : 'Cloudflare sync unavailable';

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Travel mode</Text>
          <Text style={styles.title}>Kyoto Autumn Routebook</Text>
          <Text style={styles.subtitle}>Offline-ready itinerary, tickets, places, notes, and navigation for the road.</Text>
          <Text style={[styles.syncStatus, syncState === 'unavailable' && styles.syncStatusError]}>
            {syncCopy} · {runtimeConfig.apiBaseUrl.replace(/^https:\/\//, '')}
          </Text>
        </View>

        {activeTab === 'Today' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.eyebrow}>Day 2 · Oct 13</Text>
                <Text style={styles.sectionTitle}>Southern & Western Kyoto</Text>
              </View>
              <View style={styles.offlineBadge}><Text style={styles.offlineText}>Cached</Text></View>
            </View>
            {items.map((item) => (
              <View key={item.id} style={styles.timelineItem}>
                <Text style={styles.time}>{item.startTime ?? 'Anytime'}</Text>
                <View style={styles.timelineCopy}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemNotes}>{item.notes}</Text>
                </View>
              </View>
            ))}
            <Pressable style={styles.primaryButton} onPress={openNavigation}>
              <Text style={styles.primaryButtonText}>Navigate to next stop</Text>
            </Pressable>
          </View>
        )}

        {activeTab === 'Places' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Saved places</Text>
            {places.map((place) => (
              <View key={place.name} style={styles.placeRow}>
                <View>
                  <Text style={styles.itemTitle}>{place.name}</Text>
                  <Text style={styles.itemNotes}>{place.category} · {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {activeTab !== 'Today' && activeTab !== 'Places' && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{activeTab}</Text>
            <Text style={styles.itemNotes}>
              This section is wired into the product shell and ready for synced data, offline cache, and subscription entitlements.
            </Text>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FBF8F1'
  },
  content: {
    padding: 22,
    paddingTop: 64,
    paddingBottom: 118,
    gap: 18
  },
  hero: {
    minHeight: 220,
    justifyContent: 'flex-end',
    borderRadius: 8,
    padding: 22,
    backgroundColor: '#27231F'
  },
  eyebrow: {
    color: '#946F47',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 7
  },
  title: {
    color: '#FFF8EE',
    fontSize: 40,
    lineHeight: 42,
    fontWeight: '800'
  },
  subtitle: {
    color: '#DFD2C3',
    fontSize: 16,
    lineHeight: 22,
    marginTop: 12
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
  card: {
    backgroundColor: '#FFFCF6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD0BD',
    padding: 18,
    gap: 14
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12
  },
  sectionTitle: {
    color: '#27231F',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30
  },
  offlineBadge: {
    backgroundColor: '#64715D',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999
  },
  offlineText: {
    color: '#FFF8EE',
    fontSize: 12,
    fontWeight: '800'
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
    fontSize: 17,
    fontWeight: '800'
  },
  itemNotes: {
    color: '#746E66',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4
  },
  placeRow: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8DDCD'
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
  tabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    paddingBottom: 24,
    gap: 6,
    backgroundColor: 'rgba(251,248,241,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#DDD0BD'
  },
  tab: {
    flexGrow: 1,
    minWidth: '30%',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    borderRadius: 8
  },
  activeTab: {
    backgroundColor: '#27231F'
  },
  tabText: {
    color: '#746E66',
    fontSize: 12,
    fontWeight: '900'
  },
  activeTabText: {
    color: '#FFF8EE'
  },
});

