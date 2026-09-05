import { Routes, Route } from "react-router-dom";
import { CaptureAuthProvider } from "@contexts/CaptureAuthContext";
import { RequireCaptureAuth } from "@components/RequireCaptureAuth";
import { CaptureLayout } from "@layouts/CaptureLayout";
import { CaptureLogin } from "@pages/CaptureLogin";
import { CaptureHome } from "@pages/CaptureHome";
import { CaptureRegister } from "@pages/CaptureRegister";
import { CaptureAssessment } from "@pages/CaptureAssessment";
import { CaptureSyncStatus } from "@pages/CaptureSyncStatus";

export default function App() {
  return (
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
          <Route path="/sync" element={<CaptureSyncStatus />} />
        </Route>
      </Routes>
    </CaptureAuthProvider>
  );
}
