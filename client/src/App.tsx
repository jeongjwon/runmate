import { Routes, Route } from 'react-router-dom'
import Layout from '@/components/Layout'
import MarathonsPage from '@/pages/MarathonsPage'
import ParticipationsPage from '@/pages/ParticipationsPage'
import ActivityPage from '@/pages/ActivityPage'
import LoginPage from '@/pages/LoginPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"               element={<MarathonsPage />} />
        <Route path="/participations" element={<ParticipationsPage />} />
        <Route path="/activity"       element={<ActivityPage />} />
        <Route path="/login"          element={<LoginPage />} />
      </Routes>
    </Layout>
  )
}
