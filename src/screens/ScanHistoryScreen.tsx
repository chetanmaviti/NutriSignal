import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../context/AuthContext';

type Signal = 'Green' | 'Yellow' | 'Red';

type FoodScan = {
  id?: string;
  signal?: Signal | null;
  food_label?: string | null;
  score?: number | null;
  timestamp?: string | null;
  created_at?: string | null;
  scoring_logged_at?: string | null;
};

type DaySummary = {
  key: string;
  label: string;
  dateNumber: string;
  isToday: boolean;
  count: number;
  green: number;
  yellow: number;
  red: number;
  dominantSignal: Signal | null;
};

type WeekSummary = {
  key: string;
  title: string;
  subtitle: string;
  total: number;
  green: number;
  yellow: number;
  red: number;
  dominantSignal: Signal | null;
  days: DaySummary[];
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SIGNAL_COLORS: Record<Signal, string> = {
  Green: '#34C759',
  Yellow: '#FFCC00',
  Red: '#FF3B30',
};
const SIGNAL_TINTS: Record<Signal, string> = {
  Green: '#ECF9F0',
  Yellow: '#FFF8DB',
  Red: '#FDECEA',
};

const startOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getStartOfWeek = (date: Date) => {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
};

const formatDayNumber = (date: Date) => `${date.getDate()}`;

const formatWeekRange = (start: Date, end: Date) => {
  const startMonth = MONTH_LABELS[start.getMonth()];
  const endMonth = MONTH_LABELS[end.getMonth()];

  if (start.getFullYear() !== end.getFullYear()) {
    return `${startMonth} ${start.getDate()}, ${start.getFullYear()} - ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }

  if (start.getMonth() === end.getMonth()) {
    return `${startMonth} ${start.getDate()}-${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${startMonth} ${start.getDate()} - ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
};

const parseScanDate = (scan: FoodScan) => {
  const rawDate = scan.scoring_logged_at || scan.timestamp || scan.created_at;
  if (!rawDate) return null;

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getDominantSignal = (green: number, yellow: number, red: number): Signal | null => {
  const ordered: Array<{ signal: Signal; value: number }> = [
    { signal: 'Red', value: red },
    { signal: 'Yellow', value: yellow },
    { signal: 'Green', value: green },
  ];

  ordered.sort((a, b) => {
    if (b.value !== a.value) return b.value - a.value;

    const severityRank: Record<Signal, number> = {
      Red: 3,
      Yellow: 2,
      Green: 1,
    };
    return severityRank[b.signal] - severityRank[a.signal];
  });

  return ordered[0].value > 0 ? ordered[0].signal : null;
};

const buildWeekSummaries = (scans: FoodScan[]) => {
  const today = startOfDay(new Date());
  const scansByDay = new Map<string, FoodScan[]>();
  let earliestWeek = getStartOfWeek(today);

  scans.forEach((scan) => {
    const parsedDate = parseScanDate(scan);
    if (!parsedDate) return;

    const day = startOfDay(parsedDate);
    const dayKey = day.toISOString().slice(0, 10);
    const currentScans = scansByDay.get(dayKey) || [];
    currentScans.push(scan);
    scansByDay.set(dayKey, currentScans);

    const weekStart = getStartOfWeek(day);
    if (weekStart.getTime() < earliestWeek.getTime()) {
      earliestWeek = weekStart;
    }
  });

  const summaries: WeekSummary[] = [];
  for (
    let cursor = getStartOfWeek(today);
    cursor.getTime() >= earliestWeek.getTime();
    cursor = addDays(cursor, -7)
  ) {
    const weekStart = startOfDay(cursor);
    const weekEnd = addDays(weekStart, 6);

    let green = 0;
    let yellow = 0;
    let red = 0;

    const days = DAY_LABELS.map((label, index) => {
      const date = addDays(weekStart, index);
      const dayKey = date.toISOString().slice(0, 10);
      const dayScans = scansByDay.get(dayKey) || [];

      const greenCount = dayScans.filter((scan) => scan.signal === 'Green').length;
      const yellowCount = dayScans.filter((scan) => scan.signal === 'Yellow').length;
      const redCount = dayScans.filter((scan) => scan.signal === 'Red').length;

      green += greenCount;
      yellow += yellowCount;
      red += redCount;

      return {
        key: dayKey,
        label,
        dateNumber: formatDayNumber(date),
        isToday: date.getTime() === today.getTime(),
        count: dayScans.length,
        green: greenCount,
        yellow: yellowCount,
        red: redCount,
        dominantSignal: getDominantSignal(greenCount, yellowCount, redCount),
      };
    });

    const total = green + yellow + red;
    const dominantSignal = getDominantSignal(green, yellow, red);

    summaries.push({
      key: weekStart.toISOString(),
      title: formatWeekRange(weekStart, weekEnd),
      subtitle: total === 0 ? 'No scans this week yet' : `${total} scans tracked this week`,
      total,
      green,
      yellow,
      red,
      dominantSignal,
      days,
    });
  }

  return summaries;
};

const SummaryPill = ({ label, count, color }: { label: string; count: number; color: string }) => (
  <View style={[styles.summaryPill, { backgroundColor: color }]}>
    <Text style={styles.summaryPillCount}>{count}</Text>
    <Text style={styles.summaryPillLabel}>{label}</Text>
  </View>
);

const DayTile = ({ day }: { day: DaySummary }) => {
  const backgroundColor = day.dominantSignal ? SIGNAL_TINTS[day.dominantSignal] : '#F5F7FA';
  const borderColor = day.isToday ? '#111827' : day.dominantSignal ? SIGNAL_COLORS[day.dominantSignal] : '#E4E8EE';

  return (
    <View style={styles.dayColumn}>
      <Text style={styles.dayLabel}>{day.label}</Text>
      <View style={[styles.dayTile, { backgroundColor, borderColor }]}>
        {day.count > 0 ? (
          <View style={styles.scanCountBadge}>
            <Text style={styles.scanCountText}>{day.count}</Text>
          </View>
        ) : null}
        <Text style={[styles.dayNumber, day.isToday && styles.todayNumber]}>{day.dateNumber}</Text>
        <View style={styles.dayBar}>
          {day.count > 0 ? (
            <>
              {day.green > 0 ? (
                <View style={[styles.dayBarSegment, { flex: day.green, backgroundColor: SIGNAL_COLORS.Green }]} />
              ) : null}
              {day.yellow > 0 ? (
                <View style={[styles.dayBarSegment, { flex: day.yellow, backgroundColor: SIGNAL_COLORS.Yellow }]} />
              ) : null}
              {day.red > 0 ? (
                <View style={[styles.dayBarSegment, { flex: day.red, backgroundColor: SIGNAL_COLORS.Red }]} />
              ) : null}
            </>
          ) : (
            <View style={[styles.dayBarSegment, styles.dayBarEmpty]} />
          )}
        </View>
      </View>
    </View>
  );
};

export default function ScanHistoryScreen({ onBack }: { onBack: () => void }) {
  const { fetchFoodScans } = useAuth();
  const [scans, setScans] = useState<FoodScan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      try {
        setLoading(true);
        const data = await fetchFoodScans();
        if (isMounted) {
          setScans(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (isMounted) {
          setScans([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [fetchFoodScans]);

  const weeklyHistory = useMemo(() => buildWeekSummaries(scans), [scans]);
  const totalTracked = useMemo(() => scans.length, [scans]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan History</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Weekly habit calendar</Text>
          <Text style={styles.heroSubtitle}>
            Scroll week by week to see how your scans trend across green, yellow, and red foods.
          </Text>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SIGNAL_COLORS.Green }]} />
              <Text style={styles.legendText}>Green</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SIGNAL_COLORS.Yellow }]} />
              <Text style={styles.legendText}>Yellow</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SIGNAL_COLORS.Red }]} />
              <Text style={styles.legendText}>Red</Text>
            </View>
          </View>
          <Text style={styles.legendHint}>
            Each day tile shows scan count, and the bottom strip shows that day’s color mix.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
          </View>
        ) : totalTracked === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptyText}>
              Your weekly calendar will fill in automatically after you save your first few food scans.
            </Text>
          </View>
        ) : (
          weeklyHistory.map((week) => (
            <View key={week.key} style={styles.weekCard}>
              <View style={styles.weekHeader}>
                <View style={styles.weekHeaderText}>
                  <Text style={styles.weekTitle}>{week.title}</Text>
                  <Text style={styles.weekSubtitle}>{week.subtitle}</Text>
                </View>
                <View
                  style={[
                    styles.weekToneBadge,
                    {
                      backgroundColor: week.dominantSignal
                        ? SIGNAL_TINTS[week.dominantSignal]
                        : '#F3F4F6',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.weekToneText,
                      { color: week.dominantSignal ? SIGNAL_COLORS[week.dominantSignal] : '#6B7280' },
                    ]}
                  >
                    {week.dominantSignal ? `Mostly ${week.dominantSignal}` : 'Quiet week'}
                  </Text>
                </View>
              </View>

              <View style={styles.summaryRow}>
                <SummaryPill label="Green" count={week.green} color="#EAF8EF" />
                <SummaryPill label="Yellow" count={week.yellow} color="#FFF8DB" />
                <SummaryPill label="Red" count={week.red} color="#FDECEA" />
              </View>

              <View style={styles.weekGrid}>
                {week.days.map((day) => (
                  <DayTile key={day.key} day={day} />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FB',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9EDF3',
  },
  backButton: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
  },
  topTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  topSpacer: {
    width: 54,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 2,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4B5563',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 14,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  legendHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  weekCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 2,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
    gap: 12,
  },
  weekHeaderText: {
    flex: 1,
  },
  weekTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  weekSubtitle: {
    fontSize: 13,
    color: '#6B7280',
  },
  weekToneBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  weekToneText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryPill: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  summaryPillCount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  summaryPillLabel: {
    marginTop: 2,
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  weekGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayColumn: {
    width: '13.2%',
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '600',
  },
  dayTile: {
    width: '100%',
    aspectRatio: 0.72,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 5,
    paddingTop: 8,
    paddingBottom: 6,
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  scanCountBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  scanCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  dayNumber: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  todayNumber: {
    color: '#007AFF',
  },
  dayBar: {
    width: '100%',
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
  },
  dayBarSegment: {
    height: '100%',
  },
  dayBarEmpty: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
});
