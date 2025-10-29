import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import apiClient from "@/api/client";
import type { OnboardingResponse } from "@/types/api";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/store/auth";

export default function Auth() {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const setPhoneInStore = useAuthStore((s) => s.setPhone);
  const setUserIdInStore = useAuthStore((s) => s.setUserId);

  const isValidPhone = phone.replace(/\D/g, "").length >= 10;

  const handleGetOtp = async () => {
    if (!isValidPhone || submitting) return;
    try {
      setSubmitting(true);
      const payload = { phone: phone.trim() };
      const response = await apiClient.post<OnboardingResponse>("/api/user/onboarding", payload);
      try { console.log("Onboarding response:", response?.data); } catch {}
      if (response?.data.success) {
        setPhoneInStore(payload.phone);
        if (response?.data.userId) setUserIdInStore(response.data.userId);
        router.replace("/auth/Otp");
      } else {
        Alert.alert("Error", response?.data.message || "Failed to send OTP");
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to send OTP";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>Sign in with your phone number</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter phone number"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            style={styles.input}
            maxLength={16}
            placeholderTextColor="#9ca3af"
          />
        </View>

        <TouchableOpacity
          onPress={handleGetOtp}
          activeOpacity={0.8}
          style={[styles.button, (!isValidPhone || submitting) && styles.buttonDisabled]}
          disabled={!isValidPhone || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>Get OTP</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#6b7280",
  },
  inputGroup: {
    marginTop: 24,
  },
  label: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    color: "#111827",
  },
  button: {
    marginTop: 20,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    backgroundColor: "#93c5fd",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});

