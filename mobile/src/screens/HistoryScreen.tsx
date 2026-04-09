import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';
import StatusBadge from '../components/StatusBadge';
import { getAllSubmissions } from '../services/database';
import { addSyncListener } from '../services/sync';
import type { AttendanceSubmission, AttendanceStatus } from '../types';
import { format } from 'date-fns';

interface Props {
  workforceId: string;
  onBack: () => void;
}

export default function HistoryScreen({ workforceId, onBack }: Props) {
  const [submissions, setSubmissions] = useState<AttendanceSubmission[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<AttendanceSubmission | null>(null);

  const loadData = useCallback(async () => {
    const data = await getAllSubmissions(workforceId, 100);
    setSubmissions(data);
  }, [workforceId]);

  useEffect(() => {
    loadData();
    const unsub = addSyncListener(loadData);
    return unsub;
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: AttendanceSubmission }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
      testID={`history-item-${item.id}`}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemLeft}>
          <Text style={styles.itemDate}>
            {format(new Date(item.timestamp), 'EEEE, MMM d, yyyy')}
          </Text>
          <Text style={styles.itemTime}>
            {format(new Date(item.timestamp), 'h:mm:ss a')}
          </Text>
        </View>
        <StatusBadge status={item.syncStatus as AttendanceStatus} size="sm" />
      </View>

      {selectedItem?.id === item.id && (
        <View style={styles.itemDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>GPS Location</Text>
            <Text style={styles.detailValue}>
              {item.gpsLat.toFixed(6)}, {item.gpsLng.toFixed(6)}
            </Text>
          </View>
          {item.gpsAccuracy !== null && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Accuracy</Text>
              <Text style={styles.detailValue}>±{Math.round(item.gpsAccuracy)}m</Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Sync Status</Text>
            <Text style={styles.detailValue}>{item.syncStatus}</Text>
          </View>
          {item.serverId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Server ID</Text>
              <Text style={[styles.detailValue, styles.mono]}>{item.serverId}</Text>
            </View>
          )}
          {item.flagReason && (
            <View style={[styles.detailRow, styles.flagRow]}>
              <Text style={styles.detailLabel}>Flag Reason</Text>
              <Text style={[styles.detailValue, { color: colors.error }]}>{item.flagReason}</Text>
            </View>
          )}
          {item.retryCount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Retry Count</Text>
              <Text style={styles.detailValue}>{item.retryCount}</Text>
            </View>
          )}
          {item.photoPath && (
            <Image
              source={{ uri: item.photoPath }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} testID="button-back-history">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Attendance History</Text>
        <Text style={styles.count}>{submissions.length} records</Text>
      </View>

      <FlatList
        data={submissions}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>No attendance records yet</Text>
            <Text style={styles.emptySubtext}>Your check-in history will appear here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingTop: 50, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, flex: 1 },
  count: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  list: { padding: spacing.xl, gap: spacing.md },
  item: {
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden',
  },
  itemHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.lg,
  },
  itemLeft: {},
  itemDate: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  itemTime: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  itemDetails: {
    borderTopWidth: 1, borderTopColor: colors.border,
    padding: spacing.lg, gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  detailLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  detailValue: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.textSecondary },
  mono: { fontFamily: fonts.mono, fontSize: 10 },
  flagRow: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: spacing.sm, borderRadius: borderRadius.sm, marginTop: spacing.xs,
  },
  thumbnail: {
    width: '100%', height: 200, borderRadius: borderRadius.md, marginTop: spacing.sm,
  },
  empty: {
    alignItems: 'center', paddingVertical: spacing.xxxl * 2, gap: spacing.md,
  },
  emptyText: { fontFamily: fonts.heading, fontSize: 16, color: colors.textMuted },
  emptySubtext: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
});
