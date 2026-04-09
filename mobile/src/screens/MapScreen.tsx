import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import MapView, { Circle, Marker, Polygon, PROVIDER_GOOGLE, LatLng } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, borderRadius } from '../theme';
import { useLocation } from '../hooks/useLocation';
import { fetchGeofenceZones } from '../services/api';
import type { GeofenceZone } from '../types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  onBack: () => void;
}

const MAKKAH_CENTER = { latitude: 21.4225, longitude: 39.8262 };

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isPointInPolygon(lat: number, lng: number, polygon: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export default function MapScreen({ onBack }: Props) {
  const [zones, setZones] = useState<GeofenceZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState<GeofenceZone | null>(null);
  const location = useLocation();

  useEffect(() => {
    loadZones();
  }, []);

  const loadZones = async (): Promise<void> => {
    try {
      const data = await fetchGeofenceZones();
      const active = data.filter((z) => z.isActive);
      setZones(active);
    } catch {
      Alert.alert('Offline', 'Could not load zone data. Using cached zones if available.');
    } finally {
      setLoading(false);
    }
  };

  const userInZone = (zone: GeofenceZone): boolean => {
    if (!location.latitude || !location.longitude) return false;

    if (zone.polygon && zone.polygon.length >= 3) {
      return isPointInPolygon(location.latitude, location.longitude, zone.polygon);
    }

    const dist = haversineDistance(
      location.latitude, location.longitude,
      parseFloat(zone.centerLat), parseFloat(zone.centerLng)
    );
    return dist <= zone.radiusMeters;
  };

  const getDistanceToZone = (zone: GeofenceZone): number | null => {
    if (!location.latitude || !location.longitude) return null;
    return haversineDistance(
      location.latitude, location.longitude,
      parseFloat(zone.centerLat), parseFloat(zone.centerLng)
    );
  };

  const initialRegion = zones.length > 0
    ? {
        latitude: parseFloat(zones[0].centerLat),
        longitude: parseFloat(zones[0].centerLng),
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : {
        ...MAKKAH_CENTER,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Loading geofence zones...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} testID="button-back-map">
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Attendance Zones</Text>
        <Text style={styles.zoneCount}>{zones.length} zone{zones.length !== 1 ? 's' : ''}</Text>
      </View>

      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton
          mapType="hybrid"
        >
          {zones.map(zone => {
            const inside = userInZone(zone);
            const polygonCoords: LatLng[] | null = zone.polygon && zone.polygon.length >= 3
              ? zone.polygon.map(p => ({ latitude: p.lat, longitude: p.lng }))
              : null;

            return (
              <React.Fragment key={zone.id}>
                {polygonCoords ? (
                  <Polygon
                    coordinates={polygonCoords}
                    strokeColor={inside ? 'rgba(34, 197, 94, 0.8)' : 'rgba(45, 138, 94, 0.6)'}
                    fillColor={inside ? 'rgba(34, 197, 94, 0.15)' : 'rgba(45, 138, 94, 0.1)'}
                    strokeWidth={2}
                  />
                ) : (
                  <Circle
                    center={{
                      latitude: parseFloat(zone.centerLat),
                      longitude: parseFloat(zone.centerLng),
                    }}
                    radius={zone.radiusMeters}
                    strokeColor={inside ? 'rgba(34, 197, 94, 0.8)' : 'rgba(45, 138, 94, 0.6)'}
                    fillColor={inside ? 'rgba(34, 197, 94, 0.15)' : 'rgba(45, 138, 94, 0.1)'}
                    strokeWidth={2}
                  />
                )}
                <Marker
                  coordinate={{
                    latitude: parseFloat(zone.centerLat),
                    longitude: parseFloat(zone.centerLng),
                  }}
                  title={zone.name}
                  description={`Radius: ${zone.radiusMeters}m`}
                  onPress={() => setSelectedZone(zone)}
                />
              </React.Fragment>
            );
          })}
        </MapView>
      </View>

      {selectedZone && (
        <View style={styles.zoneCard}>
          <View style={styles.zoneCardHeader}>
            <Text style={styles.zoneName} testID="text-zone-name">{selectedZone.name}</Text>
            <TouchableOpacity onPress={() => setSelectedZone(null)}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={styles.zoneDetails}>
            <View style={styles.zoneDetail}>
              <Ionicons name="resize-outline" size={14} color={colors.textMuted} />
              <Text style={styles.zoneDetailText}>
                {selectedZone.polygon && selectedZone.polygon.length >= 3
                  ? `Polygon (${selectedZone.polygon.length} points)`
                  : `Radius: ${selectedZone.radiusMeters}m`}
              </Text>
            </View>
            <View style={styles.zoneDetail}>
              <Ionicons
                name={userInZone(selectedZone) ? 'checkmark-circle' : 'close-circle'}
                size={14}
                color={userInZone(selectedZone) ? colors.success : colors.error}
              />
              <Text style={[styles.zoneDetailText, {
                color: userInZone(selectedZone) ? colors.success : colors.error,
              }]}>
                {userInZone(selectedZone) ? 'You are inside this zone' : 'You are outside this zone'}
              </Text>
            </View>
            {!userInZone(selectedZone) && (() => {
              const dist = getDistanceToZone(selectedZone);
              if (dist === null) return null;
              return (
                <View style={styles.zoneDetail}>
                  <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.zoneDetailText}>
                    {dist < 1000 ? `${Math.round(dist)}m away` : `${(dist / 1000).toFixed(1)}km away`}
                  </Text>
                </View>
              );
            })()}
          </View>
        </View>
      )}

      {zones.length === 0 && (
        <View style={styles.noZones}>
          <Ionicons name="map-outline" size={32} color={colors.textMuted} />
          <Text style={styles.noZonesText}>No attendance zones configured</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center',
  },
  loadingText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: spacing.lg },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingTop: 50, paddingHorizontal: spacing.xl, paddingBottom: spacing.lg,
    backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, flex: 1 },
  zoneCount: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  mapContainer: { flex: 1 },
  map: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT - 100 },
  zoneCard: {
    position: 'absolute', bottom: spacing.xxxl, left: spacing.xl, right: spacing.xl,
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.lg,
  },
  zoneCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.md,
  },
  zoneName: { fontFamily: fonts.heading, fontSize: 16, color: colors.text },
  zoneDetails: { gap: spacing.sm },
  zoneDetail: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  zoneDetailText: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  noZones: {
    position: 'absolute', bottom: spacing.xxxl, left: spacing.xl, right: spacing.xl,
    backgroundColor: colors.card, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.cardBorder, padding: spacing.xl,
    alignItems: 'center', gap: spacing.sm,
  },
  noZonesText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
});
