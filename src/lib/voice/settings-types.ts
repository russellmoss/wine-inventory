import type { VoiceFocusMode, VoiceProfileState } from "@/lib/voice/focus";

export type VoiceSettingsView = {
  available: boolean;
  unavailableReason: string | null;
  profile: {
    state: VoiceProfileState;
    enrolledAt: string | null;
    qualityLabel: "Good" | "Fair" | "Needs work" | null;
  };
  preference: {
    defaultFocusMode: VoiceFocusMode;
    audioIsolationEnabled: boolean;
    wakeWordEnabled: boolean;
  };
};
