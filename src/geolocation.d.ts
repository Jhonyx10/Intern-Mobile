declare module '@react-native-community/geolocation' {
    export interface GeoPosition {
        coords: {
            latitude: number;
            longitude: number;
            altitude: number | null;
            accuracy: number;
            altitudeAccuracy: number | null;
            heading: number | null;
            speed: number | null;
        };
        timestamp: number;
    }

    export interface GeoError {
        code: number;
        message: string;
    }

    export interface GeoOptions {
        enableHighAccuracy?: boolean;
        timeout?: number;
        maximumAge?: number;
        distanceFilter?: number;
    }

    const Geolocation: {
        setRNConfiguration(config: any): void;
        requestAuthorization(success?: () => void, error?: (error: GeoError) => void): void;
        getCurrentPosition(
            success: (position: GeoPosition) => void,
            error?: (error: GeoError) => void,
            options?: GeoOptions
        ): void;
        watchPosition(
            success: (position: GeoPosition) => void,
            error?: (error: GeoError) => void,
            options?: GeoOptions
        ): number;
        clearWatch(watchID: number): void;
        stopObserving(): void;
    };

    export default Geolocation;
}