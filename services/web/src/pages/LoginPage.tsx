import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuthStore } from '../lib/store'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('admin@adv.local')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await api.login(email, password)
      setAuth(data.user, data.token)
      navigate('/')
    } catch (err: any) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-bg relative">
      <div className="w-full max-w-sm px-4">
        {/* Brand */}
        <div className="text-center mb-8 relative z-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-600 shadow-lg shadow-primary-600/30 mb-4">
            <span className="text-white font-bold text-xl">A</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            ADV
          </h1>
          <p className="text-gray-500 mt-1 text-sm tracking-wide">Система управления проектами</p>
        </div>

        {/* Card */}
        <div className="login-card space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm rounded-lg px-4 py-3 border border-red-100 animate-slide-down">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="input" required autoFocus
              />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="input" required
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full py-2.5">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Вход...</> : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
