import axios from 'axios'

const base =
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8000'

const api = axios.create({
  baseURL: base,
  timeout: 15000,
})

export default api
