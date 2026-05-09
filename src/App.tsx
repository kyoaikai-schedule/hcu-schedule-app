import { useState } from 'react'
import HcuScheduleSystem from './HcuScheduleSystem'

// 共愛会勤務表管理ポータル (admin-portal) URL
// VITE_PORTAL_URL で上書き可能 (Vercel 環境変数で部署別ステージングなどに対応)
// admin-portal の URL が変わったらここ 1 行を更新するだけで OK
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://admin-portal-five-psi.vercel.app'

const goToPortal = () => {
  window.location.href = PORTAL_URL
}

function App() {
  const [department, setDepartment] = useState<'HCU' | 'ER' | null>(null)

  if (!department) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">勤務表管理システム</h1>
          <p className="text-gray-500 mb-10">部門を選択してください</p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <button
              onClick={() => setDepartment('HCU')}
              className="group w-64 h-40 bg-white rounded-2xl shadow-lg hover:shadow-xl border-2 border-blue-200 hover:border-blue-400 transition-all flex flex-col items-center justify-center gap-3"
            >
              <div className="w-16 h-16 bg-blue-100 group-hover:bg-blue-200 rounded-xl flex items-center justify-center transition-colors">
                <span className="text-3xl font-bold text-blue-600">H</span>
              </div>
              <span className="text-xl font-bold text-gray-800">HCU</span>
              <span className="text-sm text-gray-400">高度治療室</span>
            </button>
            <button
              onClick={() => setDepartment('ER')}
              className="group w-64 h-40 bg-white rounded-2xl shadow-lg hover:shadow-xl border-2 border-rose-200 hover:border-rose-400 transition-all flex flex-col items-center justify-center gap-3"
            >
              <div className="w-16 h-16 bg-rose-100 group-hover:bg-rose-200 rounded-xl flex items-center justify-center transition-colors">
                <span className="text-3xl font-bold text-rose-600">ER</span>
              </div>
              <span className="text-xl font-bold text-gray-800">救急外来</span>
              <span className="text-sm text-gray-400">Emergency Room</span>
            </button>
          </div>
          <button
            onClick={goToPortal}
            className="mt-10 text-gray-500 hover:text-gray-700 text-sm underline transition-colors"
          >
            ← 共愛会勤務表管理ポータルに戻る
          </button>
        </div>
      </div>
    )
  }

  return <HcuScheduleSystem department={department} onBack={goToPortal} />
}

export default App

