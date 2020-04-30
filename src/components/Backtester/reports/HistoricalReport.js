import React from 'react'

import { AutoSizer } from 'react-virtualized'
import BFXChart from 'bfx-hf-chart'
import Results from '../Results'

import StrategyTradesTable from '../../StrategyTradesTable'

export default (opts, results, backtestData) => {
  const { trades = [] } = results
  const { indicators } = opts
  const { candles = [] } = backtestData

  // convert candles to array for the chart
  const candleArr = Object.values(candles).map(c => (
    [
      c.mts,
      c.open,
      c.close,
      c.high,
      c.low,
      c.volume,
    ]
  ))

  console.log(candles)
  return (
    <div className='hfui-backtester__candlechart'>
      <AutoSizer>
        {({ width, height }) => width > 0 && height > 0 && (
          <BFXChart
            indicators={indicators}
            candles={candleArr}
            trades={trades}
            width={width}
            height={400}
            isSyncing={false}
            candleLoadingThreshold={3} // we always get 1 candle when sub'ing
            // bgColor='#111'
            bgColor='#102331'
            config={{
              AXIS_COLOR: '#444',
              AXIS_TICK_COLOR: '#00000000',
            }}
            candleWidth='1m'
            disableToolbar
            disableIndicatorSettings
            showMarketLabel={false}
          />
        )}
      </AutoSizer>
      <StrategyTradesTable
        trades={trades}
        onTradeClick={() => {}}
      />
      <Results
        results={results}
        execRunning={false}
        currentTick={results.currentTick}
        totalTicks={results.totalTicks}
      />
    </div>
  )
}
