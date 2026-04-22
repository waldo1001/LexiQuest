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
import { AppProvider } from "./context/AppContext.jsx";

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<UserPicker />} />
          <Route path="/login/:userId" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/courses" element={<CourseList />} />
          <Route path="/courses/:courseId/cards" element={<CardManager />} />
          <Route path="/courses/:courseId/study" element={<StudySession />} />
          <Route path="/courses/:courseId/results" element={<div>Session Results (Phase 9)</div>} />
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
