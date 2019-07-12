import React from 'react'

import Panel from '../../ui/Panel'
import Table from '../../ui/Table'
import AlgoOrderTableColumns from './AlgoOrderTable.columns'
import { propTypes, defaultProps } from './AlgoOrderTable.props'

const ALGO_NAMES = {
  'bfx-accumulate_distribute': 'Accumulate/Distribute',
  'bfx-ping_pong': 'Ping/Pong',
  'bfx-iceberg': 'Iceberg',
  'bfx-twap': 'TWAP'
}

export default class AlgoOrderTable extends React.PureComponent {
  static propTypes = propTypes

  static defaultProps = defaultProps

  constructor(props) {
    super(props)
    this.onRowClick = this.onRowClick.bind(this)
  }

  onRowClick ({ index } = {}) {
    const { onSelect, algoOrders } = this.props
    onSelect(algoOrders[index])
  }

  render () {
    const { algoOrders } = this.props
    const orderObjects = algoOrders.map(ao => ({
      gid: ao[0],
      name: ALGO_NAMES[ao[1]],
      mts: ao[4],
      status: ao[2] ? 'ACTIVE' : 'STOPPED'
    }))

    return (
      <Panel label='Order definitions' contentClassName='table__wrapper'>
        <Table
          data={orderObjects}
          columns={AlgoOrderTableColumns}
          onRowClick={this.onRowClick}
          maxWidth={850}
          defaultSortDirection='ASC'
        />
      </Panel>
    )
  }
}
