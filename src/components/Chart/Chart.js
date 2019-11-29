/* eslint-disable no-unused-vars */
import React from 'react'
import ClassNames from 'classnames'
import _last from 'lodash/last'
import _isEmpty from 'lodash/isEmpty'
import _isEqual from 'lodash/isEqual'
import RandomColor from 'randomcolor'
import { TIME_FRAME_WIDTHS } from 'bfx-hf-util'
import { nonce } from 'bfx-api-node-util'
import Indicators from 'bfx-hf-indicators'
import TradingViewWidget, { Themes } from 'react-tradingview-widget'

import IndicatorSettingsModal from './IndicatorSettingsModal'
import Panel from '../../ui/Panel'
import Spinner from '../../ui/Spinner'

import {
  genChartData,
  restoreIndicators,
  defaultRangeForTF,
  renderMarketDropdown,
  renderExchangeDropdown,
  renderTimeFrameDropdown,
  renderAddIndicatorDropdown,
  renderRemoveIndicatorDropdown,
  calcIndicatorValuesForCandles,
  getDerivedStateFromProps,
} from './helpers'

import { getSyncRanges, getLastCandleUpdate } from '../../redux/selectors/ws'
import { getMarketsForExchange } from '../../redux/selectors/meta'
import nearestMarket from '../../util/nearest_market'

import { propTypes, defaultProps } from './Chart.props'
import './style.css'

const HEIGHT_STEP_PX = 20
const MIN_HEIGHT_PX = 250

// TODO: Extract into open source component
class Chart extends React.Component {
  static propTypes = propTypes
  static defaultProps = defaultProps
  static getDerivedStateFromProps = getDerivedStateFromProps

  state = {
    candles: [],
    lastCandleUpdate: null,
    lastInternalCandleUpdate: 0,
    marketDirty: false, // if false, we update w/ saved state
    exchangeDirty: false,

    focus: null,
    prevFocusMTS: null,
    lastDomain: null,

    indicators: [],
    indicatorData: {},

    settingsModalOpen: false,
    settingsModalProps: {},
    settingsModalType: null,
  }

  constructor(props) {
    super(props)

    const {
      savedState = {}, candleData = {}, reduxState, defaultHeight = 350,
      activeMarket,
    } = props

    const {
      currentExchange, currentMarket = activeMarket, currentTF = '1m', marketDirty, exchangeDirty,
      indicatorIDs = props.indicatorIDs, indicatorArgs = props.indicatorArgs,
      height = defaultHeight,
    } = savedState

    // NOTE: We don't restore the saved range, as it can be very large depending
    //       on the previous user pans
    const currentRange = defaultRangeForTF(currentTF)
    const start = currentRange[0]
    const candleKey = `${currentTF}:${currentMarket.uiID}`
    const allCandles = Object.values((candleData[currentExchange] || {})[candleKey] || {})
    const candles = allCandles.filter(({ mts }) => mts >= start)

    this.state = {
      ...this.state,

      currentExchange,
      currentMarket,
      currentRange,
      currentTF,
      height,

      marketDirty,
      exchangeDirty,

      lastCandleUpdate: getLastCandleUpdate(reduxState, {
        exID: currentExchange,
        symbol: currentMarket.restID,
        tf: currentTF,
      }),

      ...restoreIndicators(indicatorIDs, indicatorArgs, candles),
      ...genChartData(candles),
    }

    const { onRangeChange, onTFChange } = props

    if (onRangeChange) {
      onRangeChange(currentRange)
    }

    if (onTFChange) {
      onTFChange(currentTF)
    }

    this.onChangeTF = this.onChangeTF.bind(this)
    this.onChangeMarket = this.onChangeMarket.bind(this)
    this.onChangeExchange = this.onChangeExchange.bind(this)
    this.onLoadMore = this.onLoadMore.bind(this)
    this.onChartEvent = this.onChartEvent.bind(this)
    this.onAddIndicator = this.onAddIndicator.bind(this)
    this.onRemoveIndicator = this.onRemoveIndicator.bind(this)
    this.onOpenSettingsModal = this.onOpenSettingsModal.bind(this)
    this.onCloseSettingsModal = this.onCloseSettingsModal.bind(this)
    this.onSaveSettingsModalSettings = this.onSaveSettingsModalSettings.bind(this)
    this.onIncreaseHeight = this.onIncreaseHeight.bind(this)
    this.onDecreaseHeight = this.onDecreaseHeight.bind(this)
    this.chartRef = null
  }

  componentDidMount() {
    const { addCandlesRequirement, addTradesRequirement } = this.props
    const { currentExchange, currentMarket, currentTF } = this.state

    this.syncData()
    addCandlesRequirement(currentExchange, currentMarket, currentTF)
    addTradesRequirement(currentExchange, currentMarket)
  }

  shouldComponentUpdate(nextProps, nextState) {
    const {
      indicators, indicatorData, trades, focusMTS, positions, exchanges, orders,
    } = this.props

    const {
      currentTF, currentExchange, currentMarket, indicators: stateIndicators,
      settingsModalOpen, height, lastDomain, lastInternalCandleUpdate,
    } = this.state

    if (
      !_isEqual(nextProps.indicators, indicators)
      || !_isEqual(nextProps.indicatorData, indicatorData)
      || !_isEqual(nextProps.trades, trades)
      || (nextProps.focusMTS !== focusMTS)
      || (nextState.currentTF !== currentTF)
      || (nextState.currentExchange !== currentExchange)
      || !_isEqual(nextState.currentMarket, currentMarket)
      || !_isEqual(nextProps.positions, positions)
      || !_isEqual(nextState.indicators, stateIndicators)
      || (nextState.settingsModalOpen !== settingsModalOpen)
      || !_isEqual(nextProps.exchanges, exchanges)
      || !_isEqual(nextProps.orders, orders)
      || (nextState.height !== height)
    ) {
      return true
    }

    if (nextState.lastDomain !== lastDomain) {
      return false // don't re-render on domain update (pan)
    } if (nextState.lastInternalCandleUpdate === lastInternalCandleUpdate) {
      return false
    }
    return true
  }

  componentDidUpdate() {
    this.deferSaveState()
  }

  componentWillUnmount() {
    const { removeCandlesRequirement, removeTradesRequirement } = this.props
    const { currentExchange, currentMarket, currentTF } = this.state

    if (this.chartRef && this.chartRef.unsubscribe) {
      this.chartRef.unsubscribe('chart-events')
    }

    removeCandlesRequirement(currentExchange, currentMarket, currentTF)
    removeTradesRequirement(currentExchange, currentMarket)
  }

  onIncreaseHeight() {
    this.setState(({ height }) => ({
      height: height + HEIGHT_STEP_PX,
    }))

    this.deferSaveState()
  }

  onDecreaseHeight() {
    this.setState(({ height }) => ({
      height: Math.max(height - HEIGHT_STEP_PX, MIN_HEIGHT_PX),
    }))

    this.deferSaveState()
  }

  onAddIndicator(v) {
    const I = Object.values(Indicators).find(i => i.id === v.value)
    const i = new I(I.args.map(arg => arg.default))

    // Copy metadata
    i.id = I.id
    i.ui = I.ui
    i.key = `${I.id}-${nonce()}`
    i.args = I.args.map(arg => arg.default)
    i.color = RandomColor({ luminosity: 'bright' })

    this.setState(({ indicators, indicatorData, candles }) => ({
      indicators: [
        ...indicators,
        i,
      ],

      indicatorData: {
        ...indicatorData,
        [i.key]: calcIndicatorValuesForCandles(i, candles),
      },
    }))

    setTimeout(() => { this.saveState() }, 0)
  }

  onRemoveIndicator(option) {
    const { value } = option

    this.setState(({ indicators, indicatorData }) => {
      const newIndicators = [...indicators]
      const index = newIndicators.findIndex(i => i.key === value)

      if (index < 0) {
        return {}
      }

      newIndicators.splice(index, 1)

      const { [value]: _, ...newIndicatorData } = indicatorData

      return {
        indicators: newIndicators,
        indicatorData: newIndicatorData,
      }
    })

    setTimeout(() => { this.saveState() }, 0)
  }

  onCandleSelectionChange() {
    setTimeout(() => {
      this.syncData()
      this.saveState()
    }, 0)
  }

  onChangeTF(tf) {
    const { currentExchange, currentMarket, currentTF } = this.state
    const {
      addCandlesRequirement, removeCandlesRequirement, onTFChange,
    } = this.props

    if (tf === currentTF) {
      return
    }

    this.setState(() => ({
      currentTF: tf,
      currentRange: defaultRangeForTF(tf),
    }))

    removeCandlesRequirement(currentExchange, currentMarket, currentTF)
    addCandlesRequirement(currentExchange, currentMarket, tf)
    this.onCandleSelectionChange()

    if (onTFChange) {
      onTFChange(tf)
    }
  }

  onChangeMarket(market) {
    const { currentExchange, currentMarket, currentTF } = this.state
    const {
      addCandlesRequirement, removeCandlesRequirement, addTradesRequirement,
      removeTradesRequirement,
    } = this.props

    if (market.uiID === currentMarket.uiID) {
      return
    }

    this.setState(() => {
      this.onCandleSelectionChange()

      return {
        currentMarket: market,
        marketDirty: true,
      }
    })

    removeCandlesRequirement(currentExchange, currentMarket, currentTF)
    removeTradesRequirement(currentExchange, currentMarket)
    addCandlesRequirement(currentExchange, market, currentTF)
    addTradesRequirement(currentExchange, market)
  }

  onChangeExchange(option) {
    const { value: exchange } = option
    const { currentExchange, currentMarket, currentTF } = this.state
    const {
      addCandlesRequirement, removeCandlesRequirement, reduxState,
      addTradesRequirement, removeTradesRequirement,
    } = this.props

    if (exchange === currentExchange) {
      return
    }

    const markets = getMarketsForExchange(reduxState, exchange)
    const newMarket = nearestMarket(currentMarket, markets)

    this.setState(() => {
      this.onCandleSelectionChange()

      return {
        currentMarket: newMarket,
        currentExchange: exchange,
        exchangeDirty: true,
        marketDirty: true,
      }
    })

    removeCandlesRequirement(currentExchange, currentMarket, currentTF)
    removeTradesRequirement(currentExchange, currentMarket)
    addCandlesRequirement(exchange, newMarket, currentTF)
    addTradesRequirement(exchange, newMarket)
  }

  onChartEvent(type, moreProps) {
    if (type !== 'pan') {
      return
    }

    const { xScale } = moreProps

    this.setState(() => ({
      lastDomain: xScale.domain(),
    }))

    this.deferSaveState()
  }

  onLoadMore(start, end) {
    const { currentTF, currentRange } = this.state

    if (Math.ceil(start) === end) {
      return
    }

    const rowsToDownload = 1000 // end - Math.ceil(start)
    const cWidth = TIME_FRAME_WIDTHS[currentTF]

    if (!cWidth) {
      console.error(`unknown candle TF width, cannot sync: ${currentTF}`)
      return
    }

    const newRange = [
      currentRange[0] - (cWidth * rowsToDownload),
      currentRange[0],
    ]

    this.setState(() => ({ currentRange: newRange }))

    setTimeout(() => {
      this.onCandleSelectionChange()
    })
  }

  onCloseSettingsModal() {
    this.setState(() => ({ settingsModalOpen: false }))
  }

  onSaveSettingsModalSettings(argValues) {
    const { settingsModalType, settingsModalProps } = this.state

    if (settingsModalType !== 'indicator') {
      console.error(`save unknown settings modal type: ${settingsModalType}`)
      return
    }

    const { i } = settingsModalProps

    this.deferSaveState()
    this.setState(({ indicators, indicatorData, candles }) => {
      const iIndex = indicators.findIndex(ind => ind.key === i.key)
      const nextIndicators = [...indicators]
      const nextIndicatorData = { ...indicatorData }

      if (iIndex < 0) {
        console.error(`could not save indicator, not found: ${i.key}`)
        return {}
      }

      const I = Object.values(Indicators).find(ind => ind.id === i._id)
      const args = I.args.map(arg => argValues[arg.label])
      const ind = new I(args)

      // Copy metadata
      ind.id = I.id
      ind.ui = I.ui
      ind.key = `${I.id}-${nonce()}`
      ind.args = args
      ind.color = indicators[iIndex].color

      nextIndicators[iIndex] = ind
      nextIndicatorData[ind.key] = calcIndicatorValuesForCandles(ind, candles)

      return {
        indicators: nextIndicators,
        indicatorData: nextIndicatorData,
        settingsModalOpen: false,
      }
    })
  }

  onOpenSettingsModal({ type, ...args }) {
    if (type !== 'indicator') {
      console.error(`open unknown settings modal type: ${type}`)
      return
    }

    this.setState(() => ({
      settingsModalOpen: true,
      settingsModalProps: args,
      settingsModalType: 'indicator',
    }))
  }


  syncData() {
    const { syncCandles } = this.props
    const {
      currentExchange, currentMarket, currentTF, currentRange,
    } = this.state

    syncCandles(currentExchange, currentMarket, currentTF, currentRange)
  }

  deferSaveState() {
    setTimeout(() => {
      this.saveState()
    }, 0)
  }

  saveState() {
    const {
      currentExchange, currentMarket, currentTF, currentRange, indicators,
      marketDirty, exchangeDirty, height,
    } = this.state

    const {
      saveState, layoutID, layoutI, onRangeChange,
    } = this.props

    saveState(layoutID, layoutI, {
      marketDirty,
      exchangeDirty,
      currentExchange,
      currentMarket,
      currentRange,
      currentTF,
      height,
      indicatorIDs: indicators.map(i => i.id),
      indicatorArgs: indicators.map(i => i._args),
    })

    if (onRangeChange) {
      onRangeChange(currentRange)
    }
  }

  renderPanel(contents) {
    const {
      onChangeTF, onChangeMarket, onAddIndicator, onRemoveIndicator,
      onChangeExchange,
    } = this

    const {
      currentMarket, currentTF, indicators, marketDirty, settingsModalOpen,
      currentExchange, exchangeDirty, height,
    } = this.state

    const {
      label, onRemove, showIndicatorControls, reduxState, moveable,
      removeable, canChangeMarket, canChangeExchange, exchanges, className,
      showMarket, showExchange, dark,
    } = this.props

    const hasIndicators = !_isEmpty(indicators)
    const syncRanges = getSyncRanges(reduxState, currentExchange, currentMarket.restID, currentTF)
    const headerComponents = [
      showExchange && renderExchangeDropdown({
        disabled: !canChangeExchange,
        onChangeExchange,
        currentExchange,
        exchangeDirty,
        exchanges,
      }),

      showMarket && renderMarketDropdown({
        disabled: !canChangeMarket,
        onChangeMarket,
        currentMarket,
        marketDirty,
        markets: getMarketsForExchange(reduxState, currentExchange),
      }),
    ]

    const secondaryHeaderComponents = [
      renderTimeFrameDropdown({
        currentExchange,
        currentTF,
        onChangeTF,
      }),
    ]

    if (showIndicatorControls) {
      secondaryHeaderComponents.push(renderAddIndicatorDropdown({ onAddIndicator }))

      if (hasIndicators) {
        secondaryHeaderComponents.push(renderRemoveIndicatorDropdown({
          indicators,
          onRemoveIndicator,
        }))
      }
    }

    return (
      <Panel
        className={ClassNames('hfui-chart__wrapper', className)}
        moveable={moveable}
        removeable={removeable}
        onRemove={onRemove}
        label={label}
        darkHeader={dark}
        dark={dark}

        extraIcons={[
          <i
            role='button'
            tabIndex={0}
            key='increase-height'
            className='icon-distribute-down-active high-contrast small'
            onClick={this.onIncreaseHeight}
          />,

          <i
            role='button'
            tabIndex={0}
            key='decrease-height'
            onClick={this.onDecreaseHeight}
            className={ClassNames('icon-distribute-up-active high-contrast no-margin small', {
              disabled: height === MIN_HEIGHT_PX,
            })}
          />,

          !_isEmpty(syncRanges) && (
            <i key='sync' className='fas fa-circle-notch' />
          ),
        ]}

        modal={settingsModalOpen && this.renderSettingsModal()}
        headerComponents={headerComponents}
        secondaryHeaderComponents={secondaryHeaderComponents}
        secondaryHeaderReverse
      >
        {contents || <Spinner />}
      </Panel>
    )
  }

  // TODO: Extract
  renderSettingsModal() {
    const { settingsModalProps, settingsModalType } = this.state

    if (settingsModalType !== 'indicator') {
      console.error(`render unknown settings modal type: ${settingsModalType}`)
      return null
    }

    return (
      <IndicatorSettingsModal
        {...settingsModalProps}

        onClose={this.onCloseSettingsModal}
        onSave={this.onSaveSettingsModalSettings}
        onRemove={(key) => { this.onRemoveIndicator({ value: key }) }}
      />
    )
  }

  render() {
    const { activeMarket } = this.props
    const { base, quote } = activeMarket
    const { currentExchange } = this.state
    return (
      <div style={{
        display: 'flex',
        flex: 1,
        backgroundColor: '#131722',
        height: '100%',
      }}
      >
        <TradingViewWidget
          symbol={`${currentExchange.toUpperCase()}:${base}${quote}`}
          theme={Themes.DARK}
          autosize
          allow_symbol_change={false}
          enable_publishing={false}
          hideideas
          save_image={false}
          toolbar_bg='#fff'
        />
      </div>
    )
  }
}

export default Chart
