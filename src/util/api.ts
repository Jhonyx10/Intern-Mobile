import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use process.env.URL if provided by a packager/plugin plugin, otherwise fallback to the value in .env
// @ts-ignore
const baseURL = process.env.URL || 'http://10.255.42.34:8000/api';

export const api = axios.create({
    baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(async (config) => {
    const token = await AsyncStorage.getItem('token');
    if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
