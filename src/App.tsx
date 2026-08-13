import { Navigate, Route, Routes } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { NewRepair } from "./pages/NewRepair";
import { RepairDetail } from "./pages/RepairDetail";
import { Settings } from "./pages/Settings";
import { Knowledge } from "./pages/Knowledge";
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./auth/ProtectedRoute";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/repairs/new" element={<ProtectedRoute><NewRepair /></ProtectedRoute>} />
      <Route path="/repairs/:id" element={<ProtectedRoute><RepairDetail /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="/knowledge" element={<ProtectedRoute><Knowledge /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
