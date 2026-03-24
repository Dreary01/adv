import { Grid, Willow } from '@svar-ui/react-grid'
import '@svar-ui/react-grid/style.css'

export default function SvarGrid(props: any) {
  return (
    <div style={{ minHeight: 200 }}>
      <Willow>
        <Grid
          sizes={{ rowHeight: 40, headerHeight: 36 }}
          header
          {...props}
        />
      </Willow>
    </div>
  )
}
