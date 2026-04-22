import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import UserPicker from "./screens/UserPicker.jsx";
import Login from "./screens/Login.jsx";
import Home from "./screens/Home.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<UserPicker />} />
        <Route path="/login/:userId" element={<Login />} />
        <Route path="/home" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
