import { useState, useEffect, useCallback } from 'react';
import * as Location from 'expo-location';

interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  isLoading: boolean;
  error: string | null;
  hasPermission: boolean;
}

export function useLocation() {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    isLoading: false,
    error: null,
    hasPermission: false,
  });

  const requestPermission = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    const granted = status === 'granted';
    setState(prev => ({ ...prev, hasPermission: granted }));
    return granted;
  }, []);

  const getCurrentLocation = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Location permission not granted',
        }));
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const result = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
      };

      setState(prev => ({
        ...prev,
        ...result,
        isLoading: false,
        error: null,
      }));

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setState(prev => ({ ...prev, isLoading: false, error: message }));
      return null;
    }
  }, [requestPermission]);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  return { ...state, getCurrentLocation, requestPermission };
}
