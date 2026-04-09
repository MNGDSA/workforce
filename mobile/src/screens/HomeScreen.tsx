import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';
import StatusBadge from '../components/StatusBadge';
import { getTodaySubmission, getPendingCount, getAllSubmissions } from '../services/database';
import { syncPendingSubmissions, addSyncListener, isOnline } from '../services/sync';
import type { User, WorkforceRecord, AttendanceSubmission, AttendanceStatus } from '../types';
import { format } from 'date-fns';

interface Props {
  user: User;
  workforceRecord: WorkforceRecord | null;
  onCheckIn: () => void;
  onViewHistory: () => void;
  onViewMap: () => void;
  onLogout: () => void;
  onPrivacyPolicy: () => void;
}

export default function HomeScreen({
  user, workforceRecord, onCheckIn, onViewHistory, onViewMap, onLogout, onPrivacyPolicy,
}: Props) {
  const [todaySubmission, setTodaySubmission] = useState<AttendanceSubmission | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentSubmissions, setRecentSubmissions] = useState<AttendanceSubmission[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(false);

  const loadData = useCallback(async () => {
    if (workforceRecord?.id) {
      const [today, pending, recent] = await Promise.all([
        getTodaySubmission(workforceRecord.id),
        getPendingCount(),
        getAllSubmissions(workforceRecord.id, 5),
      ]);
      setTodaySubmission(today);
      setPendingCount(pending);
      setRecentSubmissions(recent);
    }
    setOnline(await isOnline());
  }, [workforceRecord?.id]);

  useEffect(() => {
    loadData();
    const unsub = addSyncListener(loadData);
    return unsub;
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncPendingSubmissions();
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const todayStatus: AttendanceStatus = todaySubmission
    ? todaySubmission.syncStatus as AttendanceStatus
    : 'not_marked';

  const displayName = user.fullName || user.username || 'Worker';
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.logoSmall}>
              <View style={styles.miniStripes}>
                <View style={[styles.miniStripe, { width: 16 }]} />
                <View style={[styles.miniStripe, { width: 12, alignSelf: 'center' }]} />
                <View style={[styles.miniStripe, { width: 8, alignSelf: 'flex-end' }]} />
              </View>
            </View>
            <View>
              <Text style={styles.headerTitle}>WORKFORCE</Text>
              <Text style={styles.headerSubtitle}>Attendance</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.onlineIndicator, { backgroundColor: online ? colors.success : colors.error }]} />
            <TouchableOpacity onPress={onLogout} style={styles.logoutButton} testID="button-logout">
              <Ionicons name="log-out-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.greetingCard}>
          <View style={styles.avatarContainer}>
            <Ionicons name="person" size={28} color={colors.primary} />
          </View>
          <View style={styles.greetingText}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.name}>{displayName}</Text>
            {workforceRecord && (
              <Text style={styles.empNumber}>EMP #{workforceRecord.employeeNumber}</Text>
            )}
          </View>
        </View>

        <View style={styles.dateCard}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.dateText}>{today}</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Today's Attendance</Text>
          <StatusBadge status={todayStatus} size="lg" />
          {todaySubmission && (
            <Text style={styles.statusTime}>
              Marked at {format(new Date(todaySubmission.timestamp), 'h:mm a')}
            </Text>
          )}
        </View>

        {pendingCount > 0 && (
          <View style={styles.syncBanner}>
            <Ionicons name="cloud-upload-outline" size={20} color={colors.warning} />
            <View style={styles.syncBannerText}>
              <Text style={styles.syncTitle}>{pendingCount} pending submission{pendingCount !== 1 ? 's' : ''}</Text>
              <Text style={styles.syncSubtext}>Will auto-sync when online</Text>
            </View>
            <TouchableOpacity
              style={styles.syncNowButton}
              onPress={async () => {
                const result = await syncPendingSubmissions();
                if (result.synced > 0) {
                  Alert.alert('Sync Complete', `${result.synced} submission(s) synced successfully.`);
                } else if (!online) {
                  Alert.alert('Offline', 'No internet connection. Will retry when online.');
                }
              }}
            >
              <Text style={styles.syncNowText}>Sync Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {!todaySubmission && workforceRecord && (
          <TouchableOpacity style={styles.checkInButton} onPress={onCheckIn} testID="button-check-in">
            <Ionicons name="camera" size={24} color={colors.text} />
            <Text style={styles.checkInText}>Check In Now</Text>
          </TouchableOpacity>
        )}

        {todaySubmission && workforceRecord && (
          <View style={styles.alreadyCheckedIn}>
            <Ionicons name="checkmark-circle" size={20} color={colors.success} />
            <Text style={styles.alreadyCheckedInText}>Attendance marked for today</Text>
          </View>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionCard} onPress={onViewMap} testID="button-view-map">
            <Ionicons name="map-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>Zone Map</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCard} onPress={onViewHistory} testID="button-view-history">
            <Ionicons name="time-outline" size={28} color={colors.primary} />
            <Text style={styles.actionLabel}>History</Text>
          </TouchableOpacity>
        </View>

        {recentSubmissions.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Recent Submissions</Text>
            {recentSubmissions.slice(0, 3).map(sub => (
              <View key={sub.id} style={styles.recentItem}>
                <View style={styles.recentLeft}>
                  <Text style={styles.recentDate}>{format(new Date(sub.timestamp), 'MMM d, yyyy')}</Text>
                  <Text style={styles.recentTime}>{format(new Date(sub.timestamp), 'h:mm a')}</Text>
                </View>
                <StatusBadge status={sub.syncStatus as AttendanceStatus} size="sm" />
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.privacyLink} onPress={onPrivacyPolicy}>
          <Ionicons name="shield-outline" size={14} color={colors.textMuted} />
          <Text style={styles.privacyLinkText}>Privacy Policy & Data Rights</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingTop: 50,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logoSmall: {
    width: 36, height: 36, borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceElevated, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  miniStripes: { width: 16, gap: 2 },
  miniStripe: { height: 2, borderRadius: 1, backgroundColor: colors.primary },
  headerTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.text, letterSpacing: 2 },
  headerSubtitle: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  onlineIndicator: { width: 8, height: 8, borderRadius: 4 },
  logoutButton: { padding: spacing.xs },
  content: { flex: 1 },
  contentContainer: { padding: spacing.xl, gap: spacing.lg },
  greetingCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.lg,
    backgroundColor: colors.card, padding: spacing.lg,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.cardBorder,
  },
  avatarContainer: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(45, 138, 94, 0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  greetingText: { flex: 1 },
  greeting: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  name: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, marginTop: 2 },
  empNumber: { fontFamily: fonts.mono, fontSize: 11, color: colors.primary, marginTop: 2 },
  dateCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, padding: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
  },
  dateText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textSecondary },
  statusCard: {
    backgroundColor: colors.card, padding: spacing.xl,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.cardBorder,
    gap: spacing.md, alignItems: 'center',
  },
  statusLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  statusTime: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  syncBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: spacing.lg,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.25)',
  },
  syncBannerText: { flex: 1 },
  syncTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.warning },
  syncSubtext: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  syncNowButton: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: borderRadius.sm, backgroundColor: 'rgba(245, 158, 11, 0.2)' },
  syncNowText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.warning },
  checkInButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.md, backgroundColor: colors.primary,
    paddingVertical: spacing.lg, borderRadius: borderRadius.lg,
  },
  checkInText: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, letterSpacing: 0.5 },
  alreadyCheckedIn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.sm, paddingVertical: spacing.md,
  },
  alreadyCheckedInText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.success },
  actionsRow: { flexDirection: 'row', gap: spacing.lg },
  actionCard: {
    flex: 1, backgroundColor: colors.card, padding: spacing.xl,
    borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.cardBorder,
    alignItems: 'center', gap: spacing.sm,
  },
  actionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.textSecondary },
  recentSection: { gap: spacing.md },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  recentItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, padding: spacing.lg,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.cardBorder,
  },
  recentLeft: {},
  recentDate: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  recentTime: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  privacyLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, paddingVertical: spacing.lg, marginTop: spacing.lg,
  },
  privacyLinkText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});
