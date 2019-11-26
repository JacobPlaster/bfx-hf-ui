process.env.DEBUG = 'bfx:hf:*'

require('dotenv').config()
require('bfx-hf-util/lib/catch_uncaught_errors')

const startHFServer = require('bfx-hf-server')

const ALGO_SERVER_PORT = 9999
// const HF_BFX_DATASERVER_PORT = 8899
// const WS_SERVER_PORT = 7799

startHFServer({
  uiDBPath: `${__dirname}/db/ui.json`,
  algoDBPath: `${__dirname}/db/algos.json`,

  // Data servers are started by individual scripts
  hfBitfinexDBPath: `${__dirname}/db/hf-bitfinex.json`,
  // hfBinanceDBPath: `${__dirname}/db/hf-binance.json`,
  algoServerPort: ALGO_SERVER_PORT,
  // hfDSBitfinexPort: HF_BFX_DATASERVER_PORT,
  // wsServerPort: WS_SERVER_PORT,
})
