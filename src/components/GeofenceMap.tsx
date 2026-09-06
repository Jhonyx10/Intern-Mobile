import React from 'react';
import { View, Text } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
// @ts-ignore (TypeScript handles this in env.d.ts but just in case)
import { MapBox_Token } from '@env';

if (MapBox_Token) {
    MapboxGL.setAccessToken(MapBox_Token);
}

interface GeofenceMapProps {
    polygonCoords: number[][][];
    centerCoordinate: [number, number];
    isInGeofence: boolean;
    onLocationUpdate: (location: [number, number]) => void;
}

export default function GeofenceMap({ polygonCoords, centerCoordinate, isInGeofence, onLocationUpdate }: GeofenceMapProps) {
    return (
        <View style={{ height: 260, width: '100%', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden' }}>
            <MapboxGL.MapView style={{ flex: 1 }} logoEnabled={false} attributionEnabled={false}>
                <MapboxGL.Camera
                    zoomLevel={18}
                    centerCoordinate={centerCoordinate}
                />
                <MapboxGL.ShapeSource id="geofence" shape={{ type: 'Polygon', coordinates: polygonCoords } as any}>
                    <MapboxGL.FillLayer id="geofenceFill" style={{ fillColor: 'rgba(29, 78, 216, 0.15)' }} />
                    <MapboxGL.LineLayer id="geofenceLine" style={{ lineColor: '#1D4ED8', lineWidth: 2 }} />
                </MapboxGL.ShapeSource>
                <MapboxGL.UserLocation
                    visible={true}
                    onUpdate={(location) => {
                        if (location?.coords) {
                            onLocationUpdate([location.coords.longitude, location.coords.latitude]);
                        }
                    }}
                />
            </MapboxGL.MapView>

            <View className="absolute bottom-3 inset-x-0 items-center justify-center pointer-events-none">
                <View className={`px-4 py-2 rounded-full ${isInGeofence ? 'bg-green-500' : 'bg-red-500'} shadow-lg`} style={{ shadowOpacity: 0.2, shadowRadius: 8 }}>
                    <Text className="text-white text-[11px] font-bold uppercase tracking-widest">
                        {isInGeofence ? '✔ Inside Geofence' : '✖ Outside Geofence'}
                    </Text>
                </View>
            </View>
        </View>
    );
}
