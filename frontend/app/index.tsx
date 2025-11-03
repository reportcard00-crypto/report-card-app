import React, { useEffect, useState } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import apiClient from "@/api/client";
import { useAuthStore, type AuthState, type AuthUser } from "../store/auth";
import type { ProfileStatusResponse } from "@/types/api";

const Index = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const setUser = useAuthStore((state: AuthState) => state.setUser);
  const setProfileStatus = useAuthStore((state: AuthState) => (state as any).setProfileStatus);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiClient.get("/api/user/user");
        if (response.data) {
          setUser(response.data as AuthUser);
        }
        // Fetch profile status after user
        try {
          const profileRes = await apiClient.get<ProfileStatusResponse>("/api/user/profile-status");
          if (profileRes?.data?.success) {
            setProfileStatus(profileRes.data);
            if (!profileRes.data.hasProfile) {
              if (profileRes.data.profileType === "teacher") {
                router.replace("/auth/TeacherProfile");
              } else {
                router.replace("/auth/InitialProfile");
              }
              return;
            }
          }
        } catch {}
        setLoading(false);
      } catch {
        router.replace("/auth/Auth");
      }
    };
    checkAuth();
  }, [router, setUser, setProfileStatus]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>Welcome</Text>
    </View>
  );
};

export default Index;

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  loadingText: {
    marginTop: 12,
    color: "#6b7280",
    fontSize: 16,
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  welcome: {
    fontSize: 24,
    fontWeight: "600",
    color: "#111827",
  },
});