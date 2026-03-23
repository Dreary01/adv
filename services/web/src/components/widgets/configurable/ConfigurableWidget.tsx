import type { WidgetProps } from '../../../lib/widget-types'
import NumberWidget from './NumberWidget'
import GaugeWidget from './GaugeWidget'
import TextWidget from './TextWidget'
import TableWidget from './TableWidget'
import ListWidget from './ListWidget'
import ChartWidget from './ChartWidget'

export default function ConfigurableWidget(props: WidgetProps) {
  const { config } = props
  if (!config) return <EmptyConfig />

  switch (config.type) {
    case 'number': return <NumberWidget {...props} />
    case 'gauge': return <GaugeWidget {...props} />
    case 'text': return <TextWidget {...props} />
    case 'table': return <TableWidget {...props} />
    case 'list': return <ListWidget {...props} />
    case 'chart': return <ChartWidget {...props} />
    default: return <EmptyConfig />
  }
}

function EmptyConfig() {
  return (
    <div className="card h-full">
      <div className="card-body flex items-center justify-center py-8">
        <p className="text-sm text-gray-400">Нажмите ⚙️ для настройки виджета</p>
      </div>
    </div>
  )
}
