import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { CaptureAuthProvider } from "@contexts/CaptureAuthContext";
import { ThemeProvider } from "@contexts/ThemeContext";
import { RequireCaptureAuth } from "@components/RequireCaptureAuth";
import { CaptureLayout } from "@layouts/CaptureLayout";
import { CaptureLogin } from "@pages/CaptureLogin";
import { CaptureHome } from "@pages/CaptureHome";
import { CaptureRegister } from "@pages/CaptureRegister";
import { CaptureAssessment } from "@pages/CaptureAssessment";
import { CaptureRemarksAttendance } from "@pages/CaptureRemarksAttendance";
import { CaptureFees } from "@pages/CaptureFees";
import { CaptureProgress } from "@pages/CaptureProgress";
import { CaptureSyncStatus } from "@pages/CaptureSyncStatus";
import { runOutboxMaintenance } from "@/services/OutboxMaintenance";

export default function App() {
  // Tidy the on-phone sync history each time the app opens (and clear the
  // leftover testing history once).
  useEffect(() => {
    void runOutboxMaintenance();
  }, []);

  return (
    <ThemeProvider>
      <CaptureAuthProvider>
        <Routes>
          <Route path="/login" element={<CaptureLogin />} />
          <Route
            element={
              <RequireCaptureAuth>
                <CaptureLayout />
              </RequireCaptureAuth>
            }
          >
            <Route path="/" element={<CaptureHome />} />
            <Route path="/register" element={<CaptureRegister />} />
            <Route path="/assessment" element={<CaptureAssessment />} />
            <Route path="/remarks" element={<CaptureRemarksAttendance />} />
            <Route path="/fees" element={<CaptureFees />} />
            <Route path="/progress" element={<CaptureProgress />} />
            <Route path="/sync" element={<CaptureSyncStatus />} />
          </Route>
        </Routes>
      </CaptureAuthProvider>
    </ThemeProvider>
  );
}
