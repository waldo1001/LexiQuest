import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import UserPicker from "./screens/UserPicker.jsx";
import Login from "./screens/Login.jsx";
import Home from "./screens/Home.jsx";
import Settings from "./screens/Settings.jsx";
import AdminRoute from "./screens/AdminRoute.jsx";
import AdminPanel from "./screens/AdminPanel.jsx";
import CourseList from "./screens/CourseList.jsx";
import CardManager from "./screens/CardManager.jsx";
import StudySession from "./screens/StudySession.jsx";
import SessionResults from "./screens/SessionResults.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import PhotoImport from "./screens/PhotoImport.jsx";
import ImportReview from "./screens/ImportReview.jsx";
import FamilyDashboard from "./screens/FamilyDashboard.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import { createTts } from "./lib/tts.js";

// Module-level singleton — the only place the real browser speechSynthesis is
// touched. In jsdom (tests that import App) this resolves to createTts(undefined)
// which returns a no-op, so existing App-level tests are unaffected.
const _tts = createTts(typeof window !== "undefined" ? window.speechSynthesis : null);

export default function App({ tts = _tts }) {
  return (
    <AppProvider tts={tts}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UserPicker />} />
          <Route path="/login/:userId" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/courses" element={<CourseList />} />
          <Route path="/courses/:courseId/cards" element={<CardManager />} />
          <Route path="/courses/:courseId/import" element={<PhotoImport />} />
          <Route path="/courses/:courseId/import/review" element={<ImportReview />} />
          <Route path="/courses/:courseId/study" element={<StudySession />} />
          <Route path="/courses/:courseId/results" element={<SessionResults />} />
          <Route path="/family" element={<FamilyDashboard />} />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                {(user) => <AdminPanel currentUserId={user?.id} />}
              </AdminRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
