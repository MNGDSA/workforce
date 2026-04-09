import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, borderRadius, spacing } from '../theme';
import type { AttendanceStatus } from '../types';

const STATUS_CONFIG: Record<AttendanceStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = {
  not_marked: {
    label: 'Not Marked',
    color: colors.textMuted,
    bgColor: 'rgba(107, 138, 122, 0.15)',
    icon: 'ellipse-outline',
  },
  pending: {
    label: 'Pending Sync',
    color: colors.warning,
    bgColor: 'rgba(245, 158, 11, 0.15)',
    icon: 'time-outline',
  },
  syncing: {
    label: 'Syncing...',
    color: colors.info,
    bgColor: 'rgba(59, 130, 246, 0.15)',
    icon: 'sync-outline',
  },
  synced: {
    label: 'Synced',
    color: colors.info,
    bgColor: 'rgba(59, 130, 246, 0.15)',
    icon: 'checkmark-circle-outline',
  },
  verified: {
    label: 'Verified',
    color: colors.success,
    bgColor: 'rgba(34, 197, 94, 0.15)',
    icon: 'shield-checkmark',
  },
  flagged: {
    label: 'Flagged',
    color: colors.error,
    bgColor: 'rgba(239, 68, 68, 0.15)',
    icon: 'alert-circle',
  },
};

interface Props {
  status: AttendanceStatus;
  size?: 'sm' | 'md' | 'lg';
}

export default function StatusBadge({ status, size = 'md' }: Props) {
  const config = STATUS_CONFIG[status];
  const iconSize = size === 'sm' ? 12 : size === 'lg' ? 18 : 14;
  const fontSize = size === 'sm' ? 10 : size === 'lg' ? 14 : 12;
  const paddingH = size === 'sm' ? spacing.sm : size === 'lg' ? spacing.lg : spacing.md;
  const paddingV = size === 'sm' ? 2 : size === 'lg' ? spacing.sm : 4;

  return (
    <View style={[styles.badge, {
      backgroundColor: config.bgColor,
      paddingHorizontal: paddingH,
      paddingVertical: paddingV,
    }]}>
      <Ionicons name={config.icon} size={iconSize} color={config.color} />
      <Text style={[styles.text, { color: config.color, fontSize }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontFamily: fonts.bodySemiBold,
    letterSpacing: 0.3,
  },
});
