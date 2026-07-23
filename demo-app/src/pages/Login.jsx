import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { demoUser } from '../data/seed'
import './Login.css'

export default function Login() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (username === demoUser.username && password === demoUser.password) {
      localStorage.setItem('auth-token', 'demo-session-token')
      navigate('/dashboard')
    } else {
      setError('Invalid username or password.')
    }
  }

  return (
    <main className="login-page">
      <div className="login-card">
        <h1>Sign in</h1>
        <p className="login-subtitle">Demo account: demo / demo-pass</p>

        {error && <div className="login-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary">Sign in</button>
        </form>
      </div>
    </main>
  )
}
