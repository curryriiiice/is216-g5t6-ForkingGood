import axios from 'axios';
// Import the token from our single source of truth
import { activeToken } from './useAuthUser'; // <-- Adjust this path if needed

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (import.meta.env.PROD ? '/api' : 'http://localhost:8000');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  }
});

api.interceptors.request.use((config) => {
  if (activeToken.value) {
    config.headers.Authorization = `Bearer ${activeToken.value}`;
  }
  
  return config;
});

export default api;