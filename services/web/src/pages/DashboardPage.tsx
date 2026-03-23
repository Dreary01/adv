import WidgetGrid from '../components/widgets/WidgetGrid'

export default function DashboardPage() {
  return (
    <div className="page-wide space-y-5">
      <div>
        <h1 className="page-title">Рабочий стол</h1>
        <p className="page-subtitle">Обзор текущей активности</p>
      </div>
      <WidgetGrid pageType="dashboard" />
    </div>
  )
}
