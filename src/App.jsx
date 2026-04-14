import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import TodayPage from './pages/TodayPage';
import ChatPage from './pages/ChatPage';
import GoalsPage from './pages/GoalsPage';
import TimePage from './pages/TimePage';
import FinancePage from './pages/FinancePage';
import MemoryPage from './pages/MemoryPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<TodayPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/goals" element={<GoalsPage />} />
        <Route path="/time" element={<TimePage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
