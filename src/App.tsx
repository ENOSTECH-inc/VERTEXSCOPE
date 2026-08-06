import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom'

import { Layout } from '@/components/Layout'
import { DataStoreDetailPage } from '@/pages/DataStoreDetailPage'
import { DataStoresPage } from '@/pages/DataStoresPage'
import { HistoryPage } from '@/pages/HistoryPage'
import { SearchPage } from '@/pages/SearchPage'

export function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DataStoresPage />} />
          <Route path="datastores/:id" element={<DataStoreDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Router>
  )
}
