import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import UserPicker from "./screens/UserPicker.jsx";
import Login from "./screens/Login.jsx";
import Home from "./screens/Home.jsx";
import Settings from "./screens/Settings.jsx";
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
