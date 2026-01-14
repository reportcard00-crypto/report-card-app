import { store } from "@/utils";
import axios from "axios";

export const baseUrl = "https://api.msnacademy.in";
console.log(baseUrl);
const apiClient = axios.create({
    baseURL: baseUrl,
});

apiClient.interceptors.request.use(async (config: any) => {
    const authToken = await store.get("token");
    if (authToken) {
        config.headers.Authorization = `Bearer ${authToken}`;
    }

    // Add ngrok bypass header to skip the warning page
    // This is needed when using ngrok's free tier
    config.headers['ngrok-skip-browser-warning'] = 'true';

    return config;
});

export default apiClient;

// Log responses globally
apiClient.interceptors.response.use(
    (response) => {
        try {
            console.log("API Response:", response?.data);
        } catch {}
        return response;
    },
    (error) => {
        try {
            if (error?.response) {
                console.log("API Error Response:", error.response.data);
            } else {
                console.log("API Error:", error?.message || error?.toString());
            }
        } catch {}
        return Promise.reject(error);
    }
);