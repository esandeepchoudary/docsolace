import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { demoUser, kpis, activity } from '../data/seed'
import './Dashboard.css'

export default function Dashboard() {
  const navigate = useNavigate()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [exported, setExported] = useState(false)

  function handleLogout() {
    localStorage.removeItem('auth-token')
    navigate('/login')
  }

  const rows = activity.filter(
    (row) => statusFilter === 'all' || row.status === statusFilter,
  )

  return (
    <main className="dashboard-page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div>
          <span>{demoUser.displayName}</span>{' '}
          <button type="button" className="logout-link" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <section className="kpi-row" aria-label="Key metrics">
        {kpis.map((kpi) => (
          <div className="kpi-card" key={kpi.id}>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
          </div>
        ))}
      </section>

      <div className="toolbar">
        <button
          type="button"
          className="filters-toggle"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="filters-panel"
        >
          Filters
        </button>
        <button type="button" className="export-button" onClick={() => setExported(true)}>
          Export CSV
        </button>
        {exported && (
          <span className="export-confirmation" role="status">
            Exported {rows.length} rows
          </span>
        )}
      </div>

      {filtersOpen && (
        <section id="filters-panel" className="filters-panel" aria-label="Filters">
          <div className="field">
            <label htmlFor="status-filter">Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="done">Done</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </section>
      )}

      <table className="activity-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Action</th>
            <th>Status</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <div className="user-cell">
                  <span className="user-avatar" aria-hidden="true">
                    {row.name.split(' ').map((part) => part[0]).join('')}
                  </span>
                  <span>{row.name}</span>
                </div>
              </td>
              <td>{row.action}</td>
              <td>
                <span className={`status-badge ${row.status}`}>{row.status}</span>
              </td>
              <td>
                <time className="timestamp" dateTime={row.timestamp}>
                  {new Date(row.timestamp).toLocaleString()}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
