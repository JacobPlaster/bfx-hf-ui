import PropTypes from 'prop-types'

export const propTypes = {
  defaultLayoutID: PropTypes.string.isRequired,
  layouts: PropTypes.object.isRequired,
  tradingEnabled: PropTypes.bool,
  darkPanels: PropTypes.bool,
  autoSave: PropTypes.bool,
}

export const defaultProps = {
  tradingEnabled: false,
  darkPanels: false,
  showToolbar: true,
  autoSave: false,
}
