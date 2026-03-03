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

export type UserRole = "student" | "teacher";

export default function Auth() {
  const [phone, setPhone] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("student");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const setPhoneInStore = useAuthStore((s) => s.setPhone);
  const setUserIdInStore = useAuthStore((s) => s.setUserId);
  const setSelectedRoleInStore = useAuthStore((s) => s.setSelectedRole);

  const isValidPhone = phone.replace(/\D/g, "").length >= 10;

  const handleGetOtp = async () => {
    if (!isValidPhone || submitting) return;
    try {
      setSubmitting(true);
      const payload = { phone: phone.trim(), role: selectedRole };
      const response = await apiClient.post<OnboardingResponse>("/api/user/onboarding", payload);
      try { console.log("Onboarding response:", response?.data); } catch {}
      if (response?.data.success) {
        setPhoneInStore(payload.phone);
        setSelectedRoleInStore(selectedRole);
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
        <Text style={styles.subtitle}>Sign in or create your account</Text>

        {/* Role Selection */}
        <View style={styles.roleSection}>
          <Text style={styles.roleLabel}>I am a</Text>
          <View style={styles.roleRow}>
            <TouchableOpacity
              style={[styles.roleCard, selectedRole === "student" && styles.roleCardActive]}
              onPress={() => setSelectedRole("student")}
              activeOpacity={0.8}
            >
              <Text style={styles.roleEmoji}>🎓</Text>
              <Text style={[styles.roleText, selectedRole === "student" && styles.roleTextActive]}>
                Student
              </Text>
              <Text style={[styles.roleDesc, selectedRole === "student" && styles.roleDescActive]}>
                Take tests & track progress
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, selectedRole === "teacher" && styles.roleCardActive]}
              onPress={() => setSelectedRole("teacher")}
              activeOpacity={0.8}
            >
              <Text style={styles.roleEmoji}>📚</Text>
              <Text style={[styles.roleText, selectedRole === "teacher" && styles.roleTextActive]}>
                Teacher
              </Text>
              <Text style={[styles.roleDesc, selectedRole === "teacher" && styles.roleDescActive]}>
                Create classrooms & assign tests
              </Text>
            </TouchableOpacity>
          </View>
        </View>

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
    marginBottom: 4,
  },
  roleSection: {
    marginTop: 20,
    marginBottom: 4,
  },
  roleLabel: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
    marginBottom: 10,
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
  },
  roleCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  roleCardActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  roleEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  roleText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 4,
  },
  roleTextActive: {
    color: "#2563eb",
  },
  roleDesc: {
    fontSize: 11,
    color: "#9ca3af",
    textAlign: "center",
  },
  roleDescActive: {
    color: "#3b82f6",
  },
  inputGroup: {
    marginTop: 20,
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
