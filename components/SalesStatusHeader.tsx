/**
 * Sales Status Header
 *
 * Persistent status header showing register, cashier, sale state, totals, and sync status.
 * Implements Sales UX spec §2.1 (Sales Status Header).
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { lightColors, spacing, typography, borderRadius } from '../utils/theme';
import { formatMoney } from '../utils/money';
import { getSaleStateInfo, getSaleStateIcon, type UserFacingSaleState } from '../utils/orderStateMapper';

export interface SalesStatusHeaderProps {
  registerName?: string;
  cashierName: string;
  saleMode?: 'counter' | 'delivery' | 'pickup';
  saleState: UserFacingSaleState;
  itemCount: number;
  total: number;
  currency?: string;
  unsyncedCount?: number;
  isSyncing?: boolean;
  onSyncPress?: () => void;
}

export const SalesStatusHeader: React.FC<SalesStatusHeaderProps> = ({
  registerName = 'Register',
  cashierName,
  saleMode = 'counter',
  saleState,
  itemCount,
  total,
  currency = 'USD',
  unsyncedCount = 0,
  isSyncing = false,
  onSyncPress,
}) => {
  const stateInfo = getSaleStateInfo(saleState);
  const stateIcon = getSaleStateIcon(saleState);

  // Pulse animation for sync badge
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    if (unsyncedCount > 0 && !isSyncing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [unsyncedCount, isSyncing, pulseAnim]);

  const saleModeIcon = {
    counter: 'point-of-sale',
    delivery: 'local-shipping',
    pickup: 'shopping-bag',
  }[saleMode];

  const saleModeLabel = {
    counter: 'Counter',
    delivery: 'Delivery',
    pickup: 'Pickup',
  }[saleMode];

  return (
    <View style={styles.container}>
      {/* Left: Register & Cashier */}
      <View style={styles.section}>
        <View style={styles.infoRow}>
          <MaterialIcons name="store" size={14} color={lightColors.textSecondary} />
          <Text style={styles.infoLabel}>{registerName}</Text>
        </View>
        <View style={styles.infoRow}>
          <MaterialIcons name="person" size={14} color={lightColors.textSecondary} />
          <Text style={styles.infoLabel}>{cashierName}</Text>
        </View>
      </View>

      {/* Center: Sale Mode & ENHANCED State Badge */}
      <View style={styles.centerSection}>
        <View style={styles.infoRow}>
          <MaterialIcons name={saleModeIcon as keyof typeof MaterialIcons.glyphMap} size={14} color={lightColors.textSecondary} />
          <Text style={styles.infoLabel}>{saleModeLabel}</Text>
        </View>
        {/* ENHANCED: Larger, more prominent state badge */}
        <View style={[styles.stateBadgeLarge, { backgroundColor: stateInfo.bgColor, borderColor: stateInfo.color }]}>
          <Text style={styles.stateIconLarge}>{stateIcon}</Text>
          <Text style={[styles.stateTextLarge, { color: stateInfo.color }]}>{stateInfo.label.toUpperCase()}</Text>
        </View>
      </View>

      {/* Right: Totals & Sync */}
      <View style={styles.rightSection}>
        <View style={styles.totalsRow}>
          <View style={styles.totalItem}>
            <Text style={styles.totalLabel}>Items</Text>
            <Text style={styles.totalValue}>{itemCount}</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatMoney(total, currency)}</Text>
          </View>
        </View>

        {/* ENHANCED: Animated Sync Badge */}
        {unsyncedCount > 0 && (
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={styles.syncBadge}
              onPress={onSyncPress}
              disabled={isSyncing}
              accessibilityLabel={`${unsyncedCount} orders pending sync`}
              accessibilityRole="button"
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={lightColors.warning} />
              ) : (
                <>
                  <MaterialIcons name="sync-problem" size={16} color={lightColors.warning} />
                  <Text style={styles.syncBadgeText}>{unsyncedCount}</Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 48,
  },
  section: {
    flex: 1,
    gap: spacing.xs,
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  rightSection: {
    flex: 1,
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoLabel: {
    fontSize: typography.fontSize.xs,
    color: lightColors.textSecondary,
    fontWeight: '500',
  },
  // ENHANCED: Larger, more prominent state badge
  stateBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    minWidth: 120,
    justifyContent: 'center',
  },
  stateIconLarge: {
    fontSize: 18,
  },
  stateTextLarge: {
    fontSize: typography.fontSize.sm,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  totalItem: {
    alignItems: 'flex-end',
  },
  totalLabel: {
    fontSize: typography.fontSize.xs,
    color: lightColors.textSecondary,
    marginBottom: 2,
  },
  totalValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: lightColors.textPrimary,
  },
  totalDivider: {
    width: 1,
    height: 24,
    backgroundColor: lightColors.divider,
  },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: lightColors.warning + '15',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.round,
    minWidth: 40,
    justifyContent: 'center',
  },
  syncBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: lightColors.warning,
  },
});
