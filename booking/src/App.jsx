import React from 'react';
import { Routes, Route } from 'react-router-dom';
import BookingPage from './BookingPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/:token" element={<BookingPage />} />
      <Route
        path="*"
        element={
          <div className="shell">
            <div className="body-content">
              <div className="empty-state">This link is missing a booking code.</div>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
