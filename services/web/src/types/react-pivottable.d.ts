declare module 'react-pivottable/PivotTableUI' {
  import { Component } from 'react'
  interface PivotTableUIProps {
    data: Record<string, any>[]
    onChange: (state: any) => void
    renderers?: Record<string, any>
    aggregators?: Record<string, any>
    [key: string]: any
  }
  export default class PivotTableUI extends Component<PivotTableUIProps> {}
}

declare module 'react-pivottable/TableRenderers' {
  const TableRenderers: Record<string, any>
  export default TableRenderers
}

declare module 'react-pivottable/PivotTable' {
  import { Component } from 'react'
  export default class PivotTable extends Component<any> {}
}
