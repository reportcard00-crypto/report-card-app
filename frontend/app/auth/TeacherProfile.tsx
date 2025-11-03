import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import apiClient from "@/api/client";
import { useAuthStore, type AuthState, type AuthUser } from "@/store/auth";
import type { CompleteProfileResponse, ProfileStatusResponse } from "@/types/api";

export default function TeacherProfile() {
  const router = useRouter();
  const user = useAuthStore((s: AuthState) => s.user) as AuthUser | null;
  const setUser = useAuthStore((s: AuthState) => s.setUser);
  const setProfileStatus = useAuthStore((s: AuthState) => (s as any).setProfileStatus);

  const [name, setName] = useState(user?.name || "");
  const [subject, setSubject] = useState("");
  const [experience, setExperience] = useState("");
  const [school, setSchool] = useState("");
  const [bio, setBio] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subjectOpen, setSubjectOpen] = useState(false);

  const subjectOptions = useMemo(
    () => [
      "Mathematics",
      "Science",
      "Physics",
      "Chemistry",
      "Biology",
      "English",
      "History",
      "Geography",
      "Computer Science",
      "Economics",
    ],
    []
  );

  const isValid = (() => {
    const exp = Number(experience);
    return (
      (name || "").toString().trim() &&
      subject.trim() &&
      school.trim() &&
      bio.trim() &&
      !Number.isNaN(exp) && exp >= 0
    );
  })();

  const handleSubmit = async () => {
    if (!isValid || submitting) return;
    try {
      setSubmitting(true);
      const payload = { name, subject, experience: Number(experience), school, bio };
      const response = await apiClient.post<CompleteProfileResponse>("/api/user/complete-teacher-profile", payload);
      try { console.log("Complete teacher profile response:", response?.data); } catch {}
      if (response?.data?.success) {
        try {
          const profileRes = await apiClient.get<ProfileStatusResponse>("/api/user/profile-status");
          if (profileRes?.data?.success) setProfileStatus(profileRes.data);
        } catch {}
        if (user && (name || "").trim()) {
          setUser({ ...user, name } as AuthUser);
        }
        Alert.alert("Saved", "Teacher profile saved successfully.");
        router.replace("/");
      } else {
        Alert.alert("Error", response?.data?.message || "Failed to save profile");
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || "Failed to save profile";
      Alert.alert("Error", message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarIcon}>🎓</Text>
          </View>
          <Text style={styles.title}>Set up your teacher profile</Text>
          <Text style={styles.subtitle}>We need a few teaching details</Text>
        </View>

        <View style={styles.form}>
          <LabeledInput label="Full name" value={name} onChangeText={setName} placeholder="John Doe" />

          <Dropdown
            label="Subject"
            value={subject}
            onSelect={(v: string) => { setSubject(v); setSubjectOpen(false); }}
            options={subjectOptions}
            open={subjectOpen}
            setOpen={setSubjectOpen}
            placeholder="Select subject"
          />

          <LabeledInput
            label="Years of experience"
            value={experience}
            onChangeText={(v: string) => setExperience(v.replace(/[^0-9.]/g, ""))}
            placeholder="e.g. 5"
            keyboardType="numeric"
          />

          <LabeledInput label="School" value={school} onChangeText={setSchool} placeholder="Springfield High" />

          <LabeledInput
            label="Bio"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell students about yourself"
            multiline
          />


          <TouchableOpacity
            onPress={handleSubmit}
            activeOpacity={0.8}
            style={[styles.button, (!isValid || submitting) && styles.buttonDisabled]}
            disabled={!isValid || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({ label, multiline, keyboardType, ...rest }: any) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        multiline={multiline}
        keyboardType={keyboardType}
        {...rest}
      />
    </View>
  );
}

function Dropdown({ label, value, onSelect, options, open, setOpen, placeholder }: any) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => setOpen(!open)}
        style={[styles.input, { justifyContent: "center" }]}
      >
        <Text style={{ color: value ? "#111827" : "#9ca3af" }}>{value || placeholder}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.dropdownPanel}>
          {options.map((opt: string) => (
            <TouchableOpacity key={opt} style={styles.dropdownItem} onPress={() => onSelect(opt)}>
              <Text style={styles.dropdownText}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f9fafb" },
  container: { padding: 24, alignItems: "center", justifyContent: "center", flexGrow: 1, minHeight: "100%" },
  header: { alignItems: "center", marginTop: 12, marginBottom: 4 },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarIcon: { fontSize: 36 },
  title: { fontSize: 22, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 4, fontSize: 14, color: "#6b7280" },
  form: { marginTop: 16, width: "100%", maxWidth: 520 },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 14, color: "#374151", marginBottom: 6 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    color: "#111827",
  },
  inputMultiline: { height: 90, textAlignVertical: "top", paddingTop: 12 },
  dropdownPanel: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#fff",
    marginTop: 6,
  },
  dropdownItem: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  dropdownText: { color: "#111827", fontSize: 16 },
  button: {
    marginTop: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { backgroundColor: "#93c5fd" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});


